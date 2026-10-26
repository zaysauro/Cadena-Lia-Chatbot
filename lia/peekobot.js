/*
 * Motor da Lia — Cadena Imóveis
 * Baseado no Peekobot (https://github.com/Peekobot/peekobot, licença MIT, © 2019 Peekobot).
 *
 * Do Peekobot original ficam: a marcação #peekobot-container / #peekobot-inner / #peekobot,
 * as bolhas .chat-response / .chat-ask, as escolhas em botões (.choices / .choice),
 * a ativação animada (.activated) e o botão de recomeçar.
 *
 * O que foi acrescentado para a Lia (skill lia-cadena-primeiro-atendimento):
 * - entrada de texto livre com entendimento por palavras-chave (lia-nlu.js) além dos botões;
 * - máquina de estados ABERTURA → INTENCAO → QUALIFICACAO → CONSULTA → ENCAMINHAMENTO → ENCERRAMENTO;
 * - preferências guardadas por sessão, sem perguntar de novo o que o cliente já disse;
 * - pedido de humano, opt-out, aviso de dados sensíveis e transparência sobre ser assistente virtual;
 * - integrações opcionais (catálogo, lead, encaminhamento) que só são anunciadas como feitas
 *   quando a ferramenta responde com sucesso;
 * - todo texto do cliente é renderizado como texto (textContent), nunca como HTML.
 */
(function () {
  "use strict";

  const CFG = window.LIA_CONFIG || {};
  const NLU = window.LiaNLU;
  const STORE_KEY = "lia:cadena:v1";

  const peekobot = document.getElementById("peekobot");
  const container = document.getElementById("peekobot-container");
  const inner = document.getElementById("peekobot-inner");
  const form = document.getElementById("lia-form");
  const input = document.getElementById("lia-input");
  const restartButton = document.getElementById("lia-restart");
  if (!peekobot || !container || !inner || !NLU) return;

  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DELAY = reducedMotion ? 0 : (CFG.typing_delay_ms != null ? CFG.typing_delay_ms : 650);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ───────────────────────── Estado ─────────────────────────

  const newState = () => ({
    conversation_id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
    created_at: new Date().toISOString(),
    phase: "ABERTURA",
    intent: null,
    prefs: {},
    lead: { first_name: null, contact: null, contact_permission: null },
    awaiting: null,
    asked: [],
    fails: 0,
    greeted: false,
    listing_ids: [],
    handoff: { department: null, reason: null, summary: null, status: "pending" },
    optedOut: false
  });

  let state = newState();
  let log = [];

  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ state, log })); } catch (e) { /* sem storage: segue em memória */ }
  }
  function load() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.state || !Array.isArray(data.log)) return false;
      state = Object.assign(newState(), data.state);
      log = data.log;
      return true;
    } catch (e) { return false; }
  }
  function wipe() {
    try { sessionStorage.removeItem(STORE_KEY); } catch (e) { /* ok */ }
  }

  // ───────────────────────── Renderização (Peekobot) ─────────────────────────

  const scrollContainer = () => { inner.scrollTop = inner.scrollHeight; };

  const insertNewChatItem = (elem, animate) => {
    peekobot.appendChild(elem);
    scrollContainer();
    if (animate === false) elem.classList.add("activated");
    else requestAnimationFrame(() => elem.classList.add("activated"));
  };

  // Texto seguro: só **negrito** e quebras de linha; nada vira HTML.
  function richText(parent, text) {
    String(text).split("\n").forEach((line, i) => {
      if (i) parent.appendChild(document.createElement("br"));
      line.split(/(\*\*[^*]+\*\*)/g).forEach((chunk) => {
        if (/^\*\*[^*]+\*\*$/.test(chunk)) {
          const b = document.createElement("strong");
          b.textContent = chunk.slice(2, -2);
          parent.appendChild(b);
        } else if (chunk) {
          parent.appendChild(document.createTextNode(chunk));
        }
      });
    });
  }

  function renderBot(text, animate) {
    const el = document.createElement("div");
    el.className = "chat-response";
    richText(el, text);
    insertNewChatItem(el, animate);
  }
  function renderUser(text, animate) {
    const el = document.createElement("div");
    el.className = "chat-ask";
    el.textContent = text;
    insertNewChatItem(el, animate);
  }
  function renderCard(card, animate) {
    const el = document.createElement("div");
    el.className = "lia-card" + (card.variant ? " lia-card--" + card.variant : "");
    if (card.title) {
      const h = document.createElement("div");
      h.className = "lia-card__title";
      h.textContent = card.title;
      el.appendChild(h);
    }
    (card.rows || []).forEach(([k, v]) => {
      const row = document.createElement("div");
      row.className = "lia-card__row";
      const kk = document.createElement("span");
      kk.className = "lia-card__key";
      kk.textContent = k;
      const vv = document.createElement("span");
      vv.className = "lia-card__val";
      vv.textContent = v;
      row.append(kk, vv);
      el.appendChild(row);
    });
    if (card.note) {
      const n = document.createElement("div");
      n.className = "lia-card__note";
      n.textContent = card.note;
      el.appendChild(n);
    }
    const links = (card.links || (card.link ? [card.link] : [])).filter((l) => l && (/^https?:\/\//.test(l.href) || l.hl));
    if (links.length) {
      const row = document.createElement("div");
      row.className = "lia-card__links";
      links.forEach((l) => {
        const a = document.createElement("a");
        a.className = "lia-card__link";
        a.textContent = l.text;
        if (l.hl) { a.href = "#c" + l.hl; a.dataset.hl = l.hl; }   // destaca o card na própria página
        else { a.href = l.href; a.target = "_blank"; a.rel = "noopener noreferrer"; }
        row.appendChild(a);
      });
      el.appendChild(row);
    }
    insertNewChatItem(el, animate);
  }

  function renderChoices(options, animate) {
    const wrap = document.createElement("div");
    wrap.className = "choices";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Opções de resposta");
    options.forEach((opt) => {
      let el;
      if (opt.href) {
        el = document.createElement("a");
        el.href = opt.href;
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      } else {
        el = document.createElement("button");
        el.type = "button";
        el.dataset.label = opt.text;
        if (opt.value != null) el.dataset.value = opt.value;
        if (opt.action) el.dataset.action = opt.action;
      }
      el.className = "choice" + (opt.primary ? " choice--primary" : "");
      el.textContent = opt.text;
      wrap.appendChild(el);
    });
    insertNewChatItem(wrap, animate);
  }

  const disableAllChoices = () => {
    peekobot.querySelectorAll("button.choice").forEach((c) => { c.disabled = true; });
  };

  let typingEl = null;
  function showTyping() {
    if (typingEl || !DELAY) return;
    typingEl = document.createElement("div");
    typingEl.className = "lia-typing activated";
    typingEl.setAttribute("aria-label", "Lia está digitando");
    typingEl.innerHTML = "<span></span><span></span><span></span>";
    peekobot.appendChild(typingEl);
    scrollContainer();
  }
  function hideTyping() {
    if (typingEl) { typingEl.remove(); typingEl = null; }
  }

  // ───────────────────────── Fala da Lia ─────────────────────────

  async function say(text, options) {
    showTyping();
    await sleep(Math.min(DELAY + String(text).length * 6, DELAY * 2.2));
    hideTyping();
    renderBot(text);
    log.push({ who: "bot", text });
    if (options && options.length) {
      await sleep(DELAY ? 120 : 0);
      renderChoices(options);
      log.push({ who: "choices", options });
    }
    save();
  }
  async function card(c) {
    showTyping();
    await sleep(DELAY);
    hideTyping();
    renderCard(c);
    log.push({ who: "card", card: c });
    save();
  }
  function echoUser(text) {
    renderUser(text);
    log.push({ who: "user", text });
    save();
  }

  // ───────────────────────── Vocabulário ─────────────────────────

  const INTENT_LABEL = {
    buy: "Compra", rent: "Locação", sell: "Venda de imóvel (proprietário)",
    list_rent: "Anunciar imóvel para locação (proprietário)", owner: "Proprietário",
    mcmv: "Financiamento / Minha Casa Minha Vida", support: "Atendimento em andamento", other: "Outros assuntos"
  };
  const PAYLOAD_INTENT = { buy: "buy", rent: "rent", sell: "sell", list_rent: "list_rent", owner: "sell", mcmv: "mcmv", support: "support" };
  const DEPARTMENT = { buy: "sales", rent: "rentals", sell: "acquisition", list_rent: "acquisition", owner: "acquisition", mcmv: "mcmv", support: "support" };
  const DEPARTMENT_LABEL = {
    sales: "vendas", rentals: "locação", acquisition: "angariação", mcmv: "Minha Casa Minha Vida", support: "atendimento", general: "atendimento"
  };

  const brl = (v) => "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  function budgetText(b, monthly) {
    if (!b) return null;
    if (b === "declined") return "prefere não informar";
    const suf = monthly ? "/mês" : "";
    if (b.min && b.max) return brl(b.min) + " a " + brl(b.max) + suf;
    if (b.max) return "até " + brl(b.max) + suf;
    if (b.min) return "a partir de " + brl(b.min) + suf;
    return null;
  }
  function regionText(p) {
    if (p.neighborhoods && p.neighborhoods.length) return p.neighborhoods.join(", ");
    if (p.region_flexible) return "flexível";
    if (p.region_declined) return "não informada";
    return null;
  }
  const CITIES = ["São José dos Pinhais", "Colombo", "Pinhais", "Araucária", "Fazenda Rio Grande", "Almirante Tamandaré", "Campo Largo", "Piraquara", "Quatro Barras", "Campina Grande do Sul", "Curitiba"];
  // "no Portão", "no Água Verde" (como se fala em Curitiba), mas "em Colombo"
  const inPlaces = (list) => (list.length === 1 && !CITIES.includes(list[0]) ? "no " : "em ") + list.join(" ou ");
  const demonstrative = (t) => (t === "casa" || t === "cobertura" ? "essa " + t : t === "comercial" || t === "studio/kitnet" ? "esse imóvel" : "esse " + t);

  function recap() {
    const p = state.prefs;
    const parts = [];
    let s = p.property_type ? (p.property_type === "comercial" ? "imóvel comercial" : p.property_type) : "imóvel";
    if (p.bedrooms_min) s += " de " + p.bedrooms_min + (p.bedrooms_min === 1 ? " quarto" : " quartos") + (p.bedrooms_min >= 4 ? " ou mais" : "");
    if (p.neighborhoods && p.neighborhoods.length) s += " " + inPlaces(p.neighborhoods);
    parts.push(s);
    const b = budgetText(p.budget, state.intent === "rent");
    if (b && p.budget !== "declined") parts.push(b);
    if (p.parking_min === 1) parts.push("com vaga");
    if (p.parking_min > 1) parts.push("com " + p.parking_min + " vagas");
    return parts.join(", ");
  }

  // ───────────────────────── Perguntas (slots) ─────────────────────────

  const DECLINE_OPT = { text: "Prefiro não informar", value: "__decline" };

  const SLOTS = {
    property_type: {
      ask: () => ({
        text: ["sell", "list_rent", "owner"].includes(state.intent) ? "Que tipo de imóvel é o seu?" : "Que tipo de imóvel você procura?",
        options: state.intent === "rent"
          ? [{ text: "Apartamento" }, { text: "Casa" }, { text: "Kitnet / studio" }, { text: "Comercial" }]
          : [{ text: "Apartamento" }, { text: "Casa" }, { text: "Terreno" }, { text: "Comercial" }]
      }),
      parse: (raw) => {
        const v = NLU.detectPropertyType(NLU.norm(raw));
        return v ? { ok: true, value: v } : { ok: false };
      }
    },
    neighborhoods: {
      ask: () => {
        if (["sell", "list_rent", "owner"].includes(state.intent)) return { text: "Em qual bairro fica o imóvel?" };
        if (state.intent === "mcmv") return { text: "Em qual região você gostaria de morar? É opcional.", options: [{ text: "Sou flexível", value: "__flex" }, DECLINE_OPT] };
        return { text: "Tem algum bairro ou região de preferência?", options: [{ text: "Sou flexível", value: "__flex" }] };
      },
      parse: (raw, t) => {
        const places = NLU.detectPlaces(t);
        if (places.length) return { ok: true, value: places };
        if (NLU.detectFlexibleRegion(t) || t === "nao" || t === "nao tenho") return { ok: true, flex: true };
        if (NLU.isDecline(t)) return { ok: true, declined: true };
        if (NLU.isYes(t)) return { ok: false, soft: "Qual bairro ou região?" };
        // bairro/cidade fora da lista: guarda como o cliente escreveu, sem corrigir
        const clean = String(raw).trim().replace(/[<>]/g, "").slice(0, 60);
        if (clean.length >= 3 && /[a-zA-ZÀ-ÿ]/.test(clean) && clean.split(/\s+/).length <= 6) return { ok: true, value: [clean] };
        return { ok: false };
      },
      apply: (r) => {
        if (r.flex) { state.prefs.region_flexible = true; state.prefs.neighborhoods = []; }
        else if (r.declined) state.prefs.region_declined = true;
        else state.prefs.neighborhoods = r.value;
      },
      filled: (p) => (p.neighborhoods && p.neighborhoods.length) || p.region_flexible || p.region_declined
    },
    budget: {
      ask: () => {
        if (state.intent === "rent") return { text: "Qual o valor máximo de aluguel por mês que você considera? Condomínio e IPTU a gente vê à parte.", options: [DECLINE_OPT] };
        if (state.intent === "mcmv") return { text: "Tem uma faixa de valor de imóvel em mente? Também é opcional.", options: [DECLINE_OPT] };
        return { text: "Qual faixa de investimento você tem em mente? Se preferir, pode pular.", options: [{ text: "Até R$ 300 mil", value: "__max:300000" }, { text: "R$ 300 a 600 mil", value: "__range:300000:600000" }, { text: "Acima de R$ 600 mil", value: "__min:600000" }, DECLINE_OPT] };
      },
      parse: (raw, t) => {
        if (NLU.isDecline(t) || /^(nao sei|tanto faz|sem limite)$/.test(t)) return { ok: true, value: "declined" };
        const bare = t.match(/^(ate\s+)?(\d+(?:[.,]\d+)?)\s*(reais)?$/);
        if (bare) {
          let n = parseFloat(bare[2].replace(".", "").replace(",", "."));
          if (state.intent === "rent") { if (n < 50) n *= 1000; }
          else if (n < 10000) n *= 1000;
          return { ok: true, value: { min: null, max: Math.round(n) } };
        }
        const b = NLU.detectBudget(raw);
        return b ? { ok: true, value: b } : { ok: false };
      }
    },
    bedrooms_min: {
      skip: () => ["terreno", "comercial", "studio/kitnet"].includes(state.prefs.property_type),
      ask: () => ({ text: "Quantos quartos, no mínimo?", options: [{ text: "1", value: "1" }, { text: "2", value: "2" }, { text: "3", value: "3" }, { text: "4 ou mais", value: "4" }] }),
      parse: (raw, t) => {
        const d = t.match(/^(\d)\s*\+?\s*(ou mais)?$/);
        if (d) return { ok: true, value: parseInt(d[1], 10) };
        const b = NLU.detectBedrooms(t);
        if (b != null) return { ok: true, value: b };
        if (/\b(tanto faz|qualquer|nao importa)\b/.test(t)) return { ok: true, value: 0 };
        const w = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4 }[t];
        return w ? { ok: true, value: w } : { ok: false };
      }
    },
    parking_min: {
      skip: () => state.prefs.property_type === "terreno",
      ask: () => ({ text: "Ter vaga de garagem é indispensável?", options: [{ text: "Sim", value: "1" }, { text: "Não", value: "0" }] }),
      parse: (raw, t) => {
        const p = NLU.detectParking(t);
        if (p != null) return { ok: true, value: p };
        if (NLU.isYes(t)) return { ok: true, value: 1 };
        if (NLU.isNo(t)) return { ok: true, value: 0 };
        const d = t.match(/^(\d)$/);
        return d ? { ok: true, value: parseInt(d[1], 10) } : { ok: false };
      }
    },
    wants_financing: {
      ask: () => ({ text: "Você pretende usar financiamento ou FGTS na compra?", options: [{ text: "Sim", value: "sim" }, { text: "Não", value: "não" }, { text: "Ainda não sei", value: "ainda não sabe" }] }),
      parse: (raw, t) => {
        if (NLU.isUnsure(t)) return { ok: true, value: "ainda não sabe" };
        if (NLU.isYes(t) || /\b(financ|fgts)/.test(t)) return { ok: true, value: "sim" };
        if (NLU.isNo(t) || /\b(a vista|avista)\b/.test(t)) return { ok: true, value: "não" };
        return { ok: false };
      }
    },
    timeline: {
      ask: () => ({ text: "Para quando você precisa se mudar?", options: [{ text: "O quanto antes" }, { text: "Nos próximos 3 meses" }, { text: "Sem pressa" }] }),
      parse: (raw, t) => {
        const v = NLU.detectTimeline(t);
        if (v) return { ok: true, value: v };
        if (/proximos 3 meses/.test(t)) return { ok: true, value: "nos próximos 3 meses" };
        const clean = String(raw).trim().slice(0, 40);
        return clean.length >= 2 && !NLU.isYes(t) ? { ok: true, value: clean } : { ok: false };
      }
    },
    owner_mode: {
      ask: () => ({ text: "Você quer vender ou alugar o seu imóvel?", options: [{ text: "Vender", value: "sell" }, { text: "Alugar", value: "list_rent" }] }),
      parse: (raw, t) => {
        if (/\b(vend|venda)/.test(t)) return { ok: true, value: "sell" };
        if (/\b(alug|locac|locar)/.test(t)) return { ok: true, value: "list_rent" };
        return { ok: false };
      },
      apply: (r) => { state.intent = r.value; delete state.prefs.owner_mode; }
    },
    owner_role: {
      ask: () => ({ text: "Você é o proprietário ou representa o proprietário?", options: [{ text: "Sou o proprietário", value: "proprietário" }, { text: "Represento o proprietário", value: "representante autorizado" }] }),
      parse: (raw, t) => {
        if (/\b(represent|procurador|imobiliaria|corretor|filh|parente|familia)/.test(t)) return { ok: true, value: "representante: " + String(raw).trim().slice(0, 40) };
        if (/\b(proprietari|dono|dona|sou eu|meu|minha|sim)\b/.test(t)) return { ok: true, value: "proprietário" };
        return { ok: false };
      }
    },
    support_topic: {
      ask: () => ({ text: "Claro. Sobre o que é o seu atendimento?", options: [{ text: "Visita ou proposta" }, { text: "Contrato" }, { text: "Cobrança ou boleto" }, { text: "Manutenção" }] }),
      parse: (raw) => {
        const clean = String(raw).trim().slice(0, 80);
        return clean.length >= 3 ? { ok: true, value: clean } : { ok: false };
      }
    }
  };

  const FLOWS = {
    buy: ["property_type", "neighborhoods", "budget", "bedrooms_min", "parking_min", "wants_financing"],
    rent: ["property_type", "neighborhoods", "budget", "bedrooms_min", "timeline"],
    sell: ["property_type", "neighborhoods", "owner_role"],
    list_rent: ["property_type", "neighborhoods", "owner_role"],
    owner: ["owner_mode"],
    mcmv: ["neighborhoods", "budget"],
    support: ["support_topic"]
  };

  const isFilled = (key) => {
    const s = SLOTS[key];
    if (s.filled) return !!s.filled(state.prefs);
    return state.prefs[key] !== undefined && state.prefs[key] !== null;
  };
  const nextSlot = () => (FLOWS[state.intent] || []).find((k) => !isFilled(k) && !(SLOTS[k].skip && SLOTS[k].skip()));

  // Guarda o que o cliente contou espontaneamente, sem sobrescrever o que ele já tinha dito.
  function absorb(ex) {
    const p = state.prefs;
    if (ex.property_type && !p.property_type) p.property_type = ex.property_type;
    if (ex.neighborhoods && !(p.neighborhoods && p.neighborhoods.length)) { p.neighborhoods = ex.neighborhoods; delete p.region_flexible; }
    if (ex.bedrooms_min != null && p.bedrooms_min == null) p.bedrooms_min = ex.bedrooms_min;
    if (ex.parking_min != null && p.parking_min == null) p.parking_min = ex.parking_min;
    if (ex.budget && !p.budget) p.budget = ex.budget;
    if (ex.timeline && !p.timeline && state.intent === "rent") p.timeline = ex.timeline;
    if (ex.wants_financing && !p.wants_financing && state.intent === "buy") p.wants_financing = ex.wants_financing;
  }

  // ───────────────────────── Fluxo ─────────────────────────

  async function askIntent(prefix) {
    state.phase = "INTENCAO";
    state.awaiting = "__intent";
    await say(prefix || "Você está procurando comprar, alugar, vender ou anunciar um imóvel?", [
      { text: "Comprar", value: "buy" }, { text: "Alugar", value: "rent" },
      { text: "Vender ou anunciar", value: "owner" }, { text: "Outros assuntos", value: "__other" }
    ]);
  }

  async function askOther() {
    state.awaiting = "__intent";
    await say("Sem problema. Qual destes assuntos combina mais com o que você precisa?", [
      { text: "Financiamento / MCMV", value: "mcmv" }, { text: "Atendimento em andamento", value: "support" },
      { text: "Falar com uma pessoa", value: "human" }
    ]);
  }

  async function setIntent(intent) {
    const changed = state.intent && state.intent !== intent;
    state.intent = intent;
    state.fails = 0;
    if (intent === "mcmv" && !state.prefs.__mcmv_intro) {
      state.prefs.__mcmv_intro = true;
      await say("Sobre financiamento e Minha Casa Minha Vida: faixas, taxas e subsídios dependem das regras atuais do programa e da análise do banco, então eu não consigo dizer se você se enquadra. Nossa equipe especializada pode te orientar.");
      await say("Só um cuidado: não precisa me mandar CPF, documentos ou dados de renda por aqui. Se forem necessários, a equipe pede por um canal seguro.");
    }
    return changed;
  }

  async function advance() {
    if (!state.intent) return askIntent();
    // proprietário que já disse vender/alugar
    const slot = nextSlot();
    if (slot) {
      state.phase = "QUALIFICACAO";
      state.awaiting = slot;
      const q = SLOTS[slot].ask();
      await say(q.text, q.options);
      return;
    }
    state.awaiting = null;
    if (state.intent === "buy" || state.intent === "rent") return consult();
    return prepareHandoff(state.intent === "support" ? "solicitação sobre atendimento em andamento" : null);
  }

  // ───── Consulta ao catálogo (search_listings) ─────

  // Catálogo da própria página (window.LIA_CATALOG), usado quando catalog_provider é "local"
  const TYPE_MATCH = {
    apartamento: ["apartamento"], cobertura: ["cobertura"], "studio/kitnet": ["studio", "kitnet", "loft"],
    casa: ["casa", "sobrado"], sobrado: ["sobrado", "casa"], terreno: ["terreno", "lote"],
    comercial: ["comercial", "sala", "loja", "galpao"]
  };
  function searchLocal(f) {
    const list = window.LIA_CATALOG;
    if (!Array.isArray(list)) return { ok: false, reason: "no_local_catalog" };
    const types = f.property_type ? TYPE_MATCH[f.property_type] || [f.property_type] : null;
    const places = (f.neighborhoods || []).map(NLU.norm);
    const items = list.filter((it) =>
      (!it.mode || it.mode === f.intent) &&
      (!types || types.includes(NLU.norm(it.type || ""))) &&
      (!places.length || places.includes(NLU.norm(it.neighborhood || ""))) &&
      (!f.budget_max || it.price <= f.budget_max) &&
      (!f.budget_min || it.price >= f.budget_min) &&
      (!f.bedrooms_min || (it.bedrooms || 0) >= f.bedrooms_min)
    );
    return { ok: true, items, local: true };
  }

  async function searchListings(filters) {
    if (CFG.catalog_provider === "local") return searchLocal(filters);
    if (!CFG.catalog_provider) return { ok: false, reason: "not_configured" };
    try {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) qs.set(k, Array.isArray(v) ? v.join(",") : v); });
      const res = await fetch(CFG.catalog_provider + (CFG.catalog_provider.includes("?") ? "&" : "?") + qs.toString(), { headers: { Accept: "application/json" } });
      if (!res.ok) return { ok: false, reason: "http_" + res.status };
      const data = await res.json();
      if (!data || data.success === false || !Array.isArray(data.items)) return { ok: false, reason: "bad_payload" };
      return { ok: true, items: data.items };
    } catch (e) {
      return { ok: false, reason: "network" };
    }
  }

  async function consult() {
    state.phase = "CONSULTA";
    const r = recap();
    if (r) await say("Entendi: " + r + ".");
    const p = state.prefs;
    const result = await searchListings({
      intent: state.intent, property_type: p.property_type, neighborhoods: p.neighborhoods,
      budget_min: p.budget && p.budget !== "declined" ? p.budget.min : null,
      budget_max: p.budget && p.budget !== "declined" ? p.budget.max : null,
      bedrooms_min: p.bedrooms_min || null, parking_min: p.parking_min || null
    });

    if (!result.ok) {
      state.phase = "ERRO_INTEGRACAO";
      state.awaiting = "__after_search";
      await say("No momento, não consigo consultar nosso catálogo em tempo real. Posso preparar seu encaminhamento para uma pessoa da equipe confirmar as opções disponíveis.", [
        { text: "Preparar encaminhamento", value: "handoff", primary: true },
        { text: "Ajustar preferências", value: "adjust" }
      ]);
      return;
    }

    const items = result.items.filter((it) => it && it.id && (!it.status || /dispon|ativo|available/i.test(it.status))).slice(0, 3);
    if (!items.length) {
      state.phase = "SEM_RESULTADOS";
      state.awaiting = "__after_search";
      await say("Ainda não encontrei uma opção confirmada com esses critérios. Quer flexibilizar bairro ou faixa de valor, ou prefere que nossa equipe continue a busca?", [
        { text: "Flexibilizar critérios", value: "adjust" },
        { text: "Equipe continua a busca", value: "handoff", primary: true }
      ]);
      return;
    }

    state.phase = "APRESENTACAO";
    if (result.local) await say(items.length === 1 ? "Encontrei esta opção entre os imóveis do site:" : "Encontrei estas opções entre os imóveis do site:");
    else await say(items.length === 1 ? "Encontrei esta opção disponível:" : "Encontrei estas opções disponíveis:");
    for (const it of items) {
      state.listing_ids.push(String(it.id));
      const rows = [];
      if (it.neighborhood) rows.push(["Bairro", String(it.neighborhood)]);
      if (it.price != null) rows.push(["Valor", brl(it.price) + (state.intent === "rent" ? "/mês" : "")]);
      const feats = [it.bedrooms ? it.bedrooms + " quarto(s)" : null, it.parking ? it.parking + " vaga(s)" : null, it.area_m2 ? it.area_m2 + " m²" : null].filter(Boolean).join(" · ");
      if (feats) rows.push(["Características", feats]);
      rows.push(["Referência", String(it.id)]);
      await card({
        title: String(it.title || "Imóvel " + it.id),
        rows,
        note: it.updated_at
          ? "Atualizado em " + new Date(it.updated_at).toLocaleString("pt-BR")
          : (p.parking_min ? "Vagas, valores e disponibilidade a confirmar com a equipe." : "Valores e disponibilidade a confirmar com a equipe."),
        links: [
          result.local ? { href: "#c" + it.id, text: "Mostrar no site", hl: String(it.id) } : null,
          it.url ? { href: String(it.url), text: "Ver anúncio" } : null
        ].filter(Boolean)
      });
    }
    state.awaiting = "__after_search";
    await say("Gostou de alguma? Posso te encaminhar para a equipe confirmar disponibilidade e organizar os próximos passos.", [
      { text: "Quero seguir com a equipe", value: "handoff", primary: true },
      { text: "Ajustar preferências", value: "adjust" }
    ]);
  }

  async function adjustPreferences() {
    state.awaiting = "__adjust";
    const opts = [{ text: "Bairro", value: "neighborhoods" }, { text: "Faixa de valor", value: "budget" }, { text: "Tipo de imóvel", value: "property_type" }];
    if (FLOWS[state.intent] && FLOWS[state.intent].includes("bedrooms_min") && !SLOTS.bedrooms_min.skip()) opts.push({ text: "Quartos", value: "bedrooms_min" });
    await say("Claro. O que você quer mudar?", opts);
  }

  // ───── Encaminhamento humano ─────

  function department() {
    return DEPARTMENT[state.intent] || "general";
  }
  function route() {
    const d = department();
    const routes = CFG.handoff_routes || {};
    return routes[d] || (d === "general" ? (routes.support || null) : null);
  }

  function summaryRows() {
    const p = state.prefs;
    const rows = [];
    rows.push(["Intenção", INTENT_LABEL[state.intent] || "Não informada"]);
    const imovel = [p.property_type, p.bedrooms_min ? p.bedrooms_min + (p.bedrooms_min >= 4 ? "+ quartos" : " quarto(s) no mínimo") : null,
      p.parking_min === 0 ? "vaga dispensável" : p.parking_min ? p.parking_min + " vaga(s)" : null].filter(Boolean).join(" · ");
    if (imovel) rows.push(["Imóvel", imovel]);
    const reg = regionText(p);
    if (reg) rows.push([["sell", "list_rent"].includes(state.intent) ? "Bairro do imóvel" : "Região", reg]);
    const b = budgetText(p.budget, state.intent === "rent");
    if (b) rows.push([state.intent === "rent" ? "Aluguel máximo" : "Faixa de valor", b]);
    if (p.wants_financing) rows.push(["Financiamento/FGTS", p.wants_financing]);
    if (p.timeline) rows.push(["Prazo", p.timeline]);
    if (p.owner_role) rows.push(["Vínculo com o imóvel", p.owner_role]);
    if (p.support_topic) rows.push(["Assunto", p.support_topic]);
    if (state.listing_ids.length) rows.push(["Imóveis vistos", state.listing_ids.join(", ")]);
    if (state.lead.first_name) rows.push(["Nome", state.lead.first_name]);
    if (state.lead.contact) rows.push(["Contato", state.lead.contact.value + " (autorizado para retorno)"]);
    return rows;
  }
  function summaryText() {
    return "Atendimento iniciado com a Lia (assistente virtual) — " + CFG.brand + "\n" +
      summaryRows().map(([k, v]) => k + ": " + v).join("\n");
  }

  function leadPayload() {
    const p = state.prefs;
    const budget = p.budget && p.budget !== "declined" ? p.budget : {};
    return {
      source: "site_chat",
      assistant: "lia",
      conversation_id: state.conversation_id,
      created_at: state.created_at,
      intent: PAYLOAD_INTENT[state.intent] || "other",
      lead: {
        first_name: state.lead.first_name,
        contact: state.lead.contact ? state.lead.contact.value : null,
        contact_permission: state.lead.contact_permission
      },
      preferences: {
        property_type: p.property_type || null,
        neighborhoods: p.neighborhoods || [],
        budget_min: budget.min || null,
        budget_max: budget.max || null,
        bedrooms_min: p.bedrooms_min || null,
        parking_min: p.parking_min != null ? p.parking_min : null,
        move_in_or_purchase_timeline: p.timeline || null,
        notes: [p.wants_financing ? "financiamento/FGTS: " + p.wants_financing : null, p.owner_role, p.support_topic].filter(Boolean).join("; ") || null
      },
      listing_ids: state.listing_ids,
      handoff: { department: department(), reason: state.handoff.reason, summary: summaryText(), status: state.handoff.status }
    };
  }

  async function postJSON(url, body) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) return { success: false };
      const data = await res.json().catch(() => ({}));
      return data && data.success === true ? data : { success: false };
    } catch (e) { return { success: false }; }
  }

  async function prepareHandoff(reason) {
    state.phase = "ENCAMINHAMENTO";
    state.handoff.reason = reason || state.handoff.reason || "continuidade do atendimento";
    const r = route();
    // Só pede nome e contato quando há um sistema que vai receber esses dados (LGPD: mínimo necessário).
    // Por WhatsApp ou link, o próprio cliente fala com a equipe e não precisa informar nada aqui.
    const needsContact = (r && r.type === "api") || !!CFG.lead_destination;
    if (needsContact && state.lead.contact_permission == null) {
      state.awaiting = "__consent";
      await say("Para a equipe dar continuidade ao atendimento sobre imóveis, posso registrar seu nome e um telefone ou e-mail de retorno? Seus dados serão usados para essa finalidade, conforme a política de privacidade da Cadena.", [
        { text: "Sim, pode registrar", value: "yes", primary: true },
        { text: "Prefiro não informar", value: "no" }
      ]);
      return;
    }
    if (state.lead.contact_permission === true && !state.lead.first_name && !state.lead.__name_skipped) {
      state.awaiting = "__name";
      await say("Como posso te chamar?");
      return;
    }
    if (state.lead.contact_permission === true && !state.lead.contact) {
      state.awaiting = "__contact";
      await say("E qual telefone com DDD ou e-mail a equipe pode usar para o retorno?");
      return;
    }
    return finishHandoff();
  }

  async function finishHandoff() {
    state.awaiting = null;
    const r = route();
    const dept = DEPARTMENT_LABEL[department()];
    const payload = leadPayload();

    // create_or_update_lead — só conta como registrado se o backend confirmar
    let leadId = null;
    if (CFG.lead_destination) {
      const res = await postJSON(CFG.lead_destination, payload);
      if (res.success) leadId = res.lead_id || null;
    }

    if (r && r.type === "api" && r.endpoint) {
      const res = await postJSON(r.endpoint, Object.assign({}, payload, { lead_id: leadId }));
      if (res.success) {
        state.handoff.status = "routed";
        await say("Pronto! Sua solicitação foi encaminhada para a equipe de " + dept + (res.ticket_id ? " (protocolo **" + String(res.ticket_id).slice(0, 30) + "**)" : "") + ". Assim você não precisa começar do zero.");
        await hoursNote();
        return closing();
      }
      // falhou: cai para o resumo, sem fingir sucesso
    }

    if (r && (r.type === "whatsapp" || r.type === "url")) {
      const href = r.type === "whatsapp"
        ? "https://wa.me/" + String(r.number).replace(/\D/g, "") + "?text=" + encodeURIComponent(summaryText())
        : r.href;
      state.handoff.status = "ready_for_customer";
      await say("Organizei o que você me contou para a equipe de " + dept + " continuar daqui. É só tocar no botão abaixo" + (r.type === "whatsapp" ? ": o WhatsApp abre com o resumo já escrito, e você só precisa enviar." : "."), [
        { text: r.type === "whatsapp" ? "Continuar no WhatsApp" : "Falar com a equipe", href, primary: true }
      ]);
      await hoursNote();
      return closing();
    }

    // Sem rota para este setor: oferece os canais gerais da Cadena com o resumo pronto
    const general = otherChannels();
    if (!leadId && general.length) {
      state.handoff.status = "ready_for_customer";
      await say(department() === "general"
        ? "Organizei o que você me contou. É só escolher a equipe abaixo: o WhatsApp abre com o resumo já escrito, e você só precisa enviar."
        : "Ainda não tenho um canal direto da equipe de " + dept + ", então preparei o resumo abaixo. Você pode enviá-lo pelo WhatsApp da Cadena, e a equipe direciona para o setor certo.");
      if (department() !== "general") await card({ title: "Resumo para a equipe", rows: summaryRows(), variant: "summary" });
      await say("Por onde prefere falar?", general);
      await hoursNote();
      return closing();
    }

    // Sem integração nenhuma: modo de teste honesto
    state.handoff.status = leadId ? "lead_recorded" : "summary_only";
    if (leadId) {
      await say("Registrei suas preferências para a equipe de " + dept + ". A equipe vai te retornar pelo contato que você informou.");
    } else {
      await say("Esta é uma versão de teste e eu ainda não estou conectada aos canais da equipe, então não consigo enviar sozinha. Preparei o resumo abaixo para a equipe de " + dept + " dar continuidade sem você precisar repetir nada.");
    }
    await card({ title: "Resumo para a equipe", rows: summaryRows(), variant: "summary" });
    await hoursNote();
    return closing(!leadId);
  }

  // Canais de WhatsApp/link configurados para vendas e locação, usados quando o setor não tem rota própria
  function otherChannels() {
    const routes = CFG.handoff_routes || {};
    const names = { sales: "WhatsApp Vendas", rentals: "WhatsApp Locação" };
    return ["sales", "rentals"].map((k) => {
      const r = routes[k];
      if (!r) return null;
      if (r.type === "whatsapp") return { text: names[k], href: "https://wa.me/" + String(r.number).replace(/\D/g, "") + "?text=" + encodeURIComponent(summaryText()), primary: k === "sales" };
      if (r.type === "url" && /^https?:\/\//.test(r.href)) return { text: k === "sales" ? "Equipe de vendas" : "Equipe de locação", href: r.href };
      return null;
    }).filter(Boolean);
  }

  async function hoursNote() {
    if (CFG.human_service_hours) await say("A equipe atende " + CFG.human_service_hours + ".");
    else if (state.phase === "ENCAMINHAMENTO" && state.handoff.status !== "routed") {
      await say("O horário de retorno da equipe será confirmado pelo nosso canal de atendimento.");
    }
  }

  async function closing(offerCopy) {
    state.phase = "ENCERRAMENTO";
    state.awaiting = "__closing";
    const opts = [];
    if (offerCopy) opts.push({ text: "Copiar resumo", value: "copy" });
    opts.push({ text: "Ajustar preferências", value: "adjust" }, { text: "Nova conversa", value: "restart" });
    await say("Perfeito! Já organizei suas preferências para o próximo passo. Se precisar ajustar alguma coisa, é só me chamar. 💛", opts);
  }

  async function goHuman() {
    state.phase = "ATENDIMENTO_HUMANO";
    await say("Claro! Vou organizar as informações que você já me passou e te direcionar para a equipe da Cadena. Assim você não precisa começar do zero.");
    return prepareHandoff("cliente pediu atendimento humano");
  }

  async function optOut() {
    state = Object.assign(newState(), { optedOut: true, greeted: true, phase: "OPT_OUT" });
    log = [];
    wipe();
    await say("Tudo bem, vou parar por aqui e não vou continuar o atendimento. Apaguei desta conversa as informações que você me passou.");
    const policy = CFG.privacy_policy_url && /^https?:\/\//.test(CFG.privacy_policy_url)
      ? [{ text: "Política de privacidade", href: CFG.privacy_policy_url }] : null;
    await say("Se você já tinha passado dados para a Cadena por outros canais, o pedido de exclusão precisa ser confirmado pelo time responsável pelos dados. Se mudar de ideia, é só tocar em Recomeçar.", policy);
    wipe();
  }

  async function reask() {
    if (state.awaiting && SLOTS[state.awaiting]) {
      const q = SLOTS[state.awaiting].ask();
      return say(q.text, q.options);
    }
    if (state.awaiting === "__intent") return askIntent("Você está procurando comprar, alugar, vender ou anunciar um imóvel?");
    if (state.awaiting === "__consent" || state.awaiting === "__name" || state.awaiting === "__contact") return prepareHandoff();
    if (state.awaiting === "__after_search") return say("Quer que eu prepare o encaminhamento para a equipe ou prefere ajustar as preferências?", [{ text: "Preparar encaminhamento", value: "handoff", primary: true }, { text: "Ajustar preferências", value: "adjust" }]);
    if (state.awaiting === "__adjust") return adjustPreferences();
    if (state.awaiting === "__closing") return say("Se quiser, posso ajustar suas preferências ou começar uma nova conversa.", [{ text: "Ajustar preferências", value: "adjust" }, { text: "Nova conversa", value: "restart" }]);
    return advance();
  }

  async function notUnderstood() {
    state.fails += 1;
    if (state.fails >= 2) {
      state.fails = 0;
      state.awaiting_before_fallback = state.awaiting;
      state.awaiting = "__fallback";
      await say("Acho que não estou entendendo direito. Prefere falar com uma pessoa da equipe?", [
        { text: "Sim, falar com uma pessoa", value: "human", primary: true },
        { text: "Tentar de novo", value: "retry" }
      ]);
      return;
    }
    await say("Desculpa, não entendi bem.");
    return reask();
  }

  // ───────────────────────── Entrada do cliente ─────────────────────────

  let busy = Promise.resolve();
  const enqueue = (fn) => { busy = busy.then(fn).catch((e) => { console.error(e); }); return busy; };

  async function handle(raw, value) {
    const t = NLU.norm(raw);

    // 0) opt-out / sessão encerrada
    if (state.optedOut) {
      if (value === "restart") return restart();
      return say("Combinado, não vou continuar o atendimento. Se mudar de ideia, toque em Recomeçar.");
    }
    if (value == null && NLU.detectIntent(raw) === "optout") return optOut();

    // 1) dados sensíveis nunca são guardados
    if (value == null) {
      const kind = NLU.hasSensitiveData(raw);
      if (kind) {
        await say("Por segurança, não compartilhe CPF, documentos, senhas, cartão ou dados bancários por aqui. Não vou guardar essa informação. Se for necessário, a equipe pede por um canal seguro.");
        return reask();
      }
    }

    // 2) respostas por botão
    if (value != null) return handleValue(value, raw);

    // 3) atalhos que valem em qualquer etapa
    if (NLU.detectIntent(raw) === "human") return goHuman();
    if (NLU.asksIfBot(t)) {
      await say("Sou a Lia, uma assistente virtual da Cadena Imóveis: não sou uma pessoa nem corretora com CRECI. Posso seguir te ajudando por aqui ou te direcionar para alguém da equipe.", [
        { text: "Seguir com a Lia", value: "continue" }, { text: "Falar com uma pessoa", value: "human" }
      ]);
      return;
    }
    if (NLU.isHostile(t)) {
      await say("Sinto muito pela experiência. Quero te ajudar: posso continuar por aqui ou te direcionar para uma pessoa da equipe.", [
        { text: "Continuar aqui", value: "continue" }, { text: "Falar com uma pessoa", value: "human" }
      ]);
      return;
    }
    if (NLU.isGreeting(t)) {
      if (!state.greeted) { state.greeted = true; return askIntent("Oi! Eu sou a Lia, corretora virtual da Cadena Imóveis. 💛 Você está buscando comprar, alugar ou anunciar um imóvel?"); }
      const talkedBefore = log.filter((i) => i.who === "user").length > 1;
      if (!talkedBefore && state.awaiting === "__intent") return askIntent("Oi! 😊 Me conta: você quer comprar, alugar, vender ou anunciar um imóvel?");
      await say("Oi de novo! Seguindo de onde paramos:");
      return reask();
    }
    if (NLU.isThanks(t) && (state.awaiting === "__closing" || !state.awaiting)) {
      return say("Por nada! Se precisar de mais alguma coisa, é só me chamar. 💛");
    }
    const faq = (CFG.faq || []).find((f) => Array.isArray(f.keywords) && f.keywords.length && f.keywords.every((k) => t.includes(NLU.norm(k))));
    if (faq) { await say(String(faq.answer)); return reask(); }

    // 4) etapas de contato (LGPD)
    if (state.awaiting === "__consent") {
      if (NLU.isYes(t)) return handleValue("yes", raw);
      if (NLU.isNo(t) || NLU.isDecline(t)) return handleValue("no", raw);
      const c = NLU.parseContact(raw);
      if (c) { state.lead.contact_permission = true; state.lead.contact = c; return prepareHandoff(); }
      return notUnderstood();
    }
    if (state.awaiting === "__name") {
      if (NLU.isDecline(t)) { state.lead.__name_skipped = true; return prepareHandoff(); }
      const c = NLU.parseContact(raw);
      if (c) { state.lead.contact = c; state.lead.__name_skipped = true; return prepareHandoff(); }
      const name = NLU.parseFirstName(raw);
      if (name) { state.lead.first_name = name; return prepareHandoff(); }
      await say("Pode me dizer só o seu primeiro nome?", [{ text: "Prefiro não dizer", value: "skip_name" }]);
      return;
    }
    if (state.awaiting === "__contact") {
      const c = NLU.parseContact(raw);
      if (c) { state.lead.contact = c; return prepareHandoff(); }
      if (NLU.isDecline(t) || NLU.isNo(t)) { state.lead.contact_permission = false; return finishHandoff(); }
      await say("Não consegui identificar. Pode me passar um telefone com DDD ou um e-mail?", [{ text: "Prefiro não informar", value: "no_contact" }]);
      return;
    }

    // 5) intenção e preferências ditas livremente
    let intent = NLU.detectIntent(raw);
    const extracted = NLU.extract(raw);
    let progressed = false;

    // "financiamento/FGTS" sozinho: abre MCMV só se ainda não há assunto; numa compra vira preferência
    if (intent === "financing") intent = state.intent ? null : "mcmv";
    const ownerFamily = ["owner", "sell", "list_rent"];
    if (intent && state.intent && intent !== state.intent) {
      if (state.awaiting === "owner_mode") intent = null;                                  // resposta ao "vender ou alugar?"
      else if (state.intent === "owner" && (intent === "rent" || intent === "sell")) intent = intent === "rent" ? "list_rent" : "sell";
      else if (ownerFamily.includes(state.intent) && ["rent", "sell", "owner", "buy"].includes(intent)) intent = null; // proprietário falando do próprio imóvel
      else if (intent === "owner") intent = null;                                          // "tenho um orçamento..." não é proprietário
    }
    if (intent && intent !== state.intent && intent !== "optout" && intent !== "human") {
      await setIntent(intent);
      state.awaiting = null;
      progressed = true;
      // "segunda via do boleto": o próprio texto já diz o assunto
      if (intent === "support" && !state.prefs.support_topic && NLU.norm(raw).split(" ").length >= 3) {
        state.prefs.support_topic = String(raw).trim().slice(0, 80);
      }
    }
    absorb(extracted);
    if (Object.keys(extracted).length) progressed = true;

    // resposta à pergunta pendente
    if (state.awaiting && SLOTS[state.awaiting] && !isFilled(state.awaiting)) {
      const slot = SLOTS[state.awaiting];
      const r = slot.parse(raw, t);
      if (r.ok) {
        if (slot.apply) slot.apply(r);
        else state.prefs[state.awaiting] = r.value;
        state.fails = 0;
        return advance();
      }
      if (r.soft) return say(r.soft);
      if (progressed) { state.fails = 0; return advance(); }
      return notUnderstood();
    }

    if (state.awaiting === "__intent" && !state.intent) {
      // cliente falou de imóvel sem dizer compra/aluguel: guarda e pergunta só isso
      if (progressed) {
        state.fails = 0;
        const pt = state.prefs.property_type;
        const where = state.prefs.neighborhoods && state.prefs.neighborhoods.length ? " " + inPlaces(state.prefs.neighborhoods) : "";
        const text = pt
          ? "Ótimo! Você quer comprar ou alugar " + demonstrative(pt) + "?"
          : "Posso conferir as opções disponíveis" + where + ". Você procura compra ou locação?";
        await say(text, [{ text: "Comprar", value: "buy" }, { text: "Alugar", value: "rent" }, { text: "É meu imóvel", value: "owner" }]);
        return;
      }
      return notUnderstood();
    }

    if (progressed) { state.fails = 0; return advance(); }
    if (state.awaiting === "__closing" || state.awaiting === "__after_search") {
      return say("Posso te ajudar com mais alguma coisa? Se quiser, ajusto suas preferências ou começamos uma nova conversa.", [
        { text: "Ajustar preferências", value: "adjust" }, { text: "Nova conversa", value: "restart" }
      ]);
    }
    return notUnderstood();
  }

  async function handleValue(value, label) {
    // escolha de intenção
    if (["buy", "rent", "owner", "mcmv", "support"].includes(value) && (state.awaiting === "__intent" || state.awaiting === "__fallback" || !state.awaiting)) {
      await setIntent(value);
      return advance();
    }
    if (value === "__other") return askOther();
    if (value === "human") return goHuman();
    if (value === "continue") return reask();
    if (value === "retry") { state.awaiting = state.awaiting_before_fallback || null; return reask(); }
    if (value === "restart") return restart();
    if (value === "handoff") return prepareHandoff("cliente quer seguir com a equipe");
    if (value === "adjust") return adjustPreferences();
    if (value === "copy") {
      let ok = false;
      try { await navigator.clipboard.writeText(summaryText()); ok = true; } catch (e) { ok = false; }
      return say(ok ? "Copiei o resumo. É só colar onde preferir." : "Não consegui copiar automaticamente neste navegador. Você pode selecionar o texto do resumo acima.");
    }
    if (value === "yes" && state.awaiting === "__consent") { state.lead.contact_permission = true; return prepareHandoff(); }
    if (value === "no" && state.awaiting === "__consent") {
      state.lead.contact_permission = false;
      await say("Sem problema, não vou pedir seus dados.");
      return finishHandoff();
    }
    if (value === "skip_name") { state.lead.__name_skipped = true; return prepareHandoff(); }
    if (value === "no_contact") { state.lead.contact_permission = false; return finishHandoff(); }

    if (state.awaiting === "__adjust" && SLOTS[value]) {
      if (value === "neighborhoods") { state.prefs.neighborhoods = []; delete state.prefs.region_flexible; delete state.prefs.region_declined; }
      else delete state.prefs[value];
      state.listing_ids = [];
      state.awaiting = value;
      const q = SLOTS[value].ask();
      return say(q.text, q.options);
    }

    // resposta de slot por botão
    const key = state.awaiting;
    if (key && SLOTS[key]) {
      const slot = SLOTS[key];
      if (value === "__decline") {
        if (key === "budget") state.prefs.budget = "declined";
        else if (key === "neighborhoods") state.prefs.region_declined = true;
        return advance();
      }
      if (value === "__flex") { state.prefs.region_flexible = true; state.prefs.neighborhoods = []; return advance(); }
      let m;
      if ((m = /^__max:(\d+)$/.exec(value))) { state.prefs.budget = { min: null, max: +m[1] }; return advance(); }
      if ((m = /^__min:(\d+)$/.exec(value))) { state.prefs.budget = { min: +m[1], max: null }; return advance(); }
      if ((m = /^__range:(\d+):(\d+)$/.exec(value))) { state.prefs.budget = { min: +m[1], max: +m[2] }; return advance(); }
      if (["bedrooms_min", "parking_min"].includes(key)) { state.prefs[key] = parseInt(value, 10); return advance(); }
      if (slot.apply) { slot.apply({ ok: true, value }); return advance(); }
      state.prefs[key] = value;
      return advance();
    }
    // botão de texto sem valor especial: trata como se tivesse digitado
    return handle(label, null);
  }

  // ───────────────────────── Eventos ─────────────────────────

  container.addEventListener("click", (e) => {
    const button = e.target.closest("#peekobot-container button.choice");
    if (!button || button.disabled) return;
    e.preventDefault();
    disableAllChoices();
    const label = button.dataset.label || button.textContent;
    echoUser(label);
    enqueue(() => handle(label, button.dataset.value != null ? button.dataset.value : null));
  });

  if (form && input) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) return;
      input.value = "";
      disableAllChoices();
      // dado sensível aparece mascarado na tela e no histórico
      echoUser(NLU.hasSensitiveData(raw) ? raw.replace(/\d/g, "•") : raw.slice(0, 500));
      enqueue(() => handle(raw.slice(0, 500), null));
    });
  }

  function restart() {
    state = newState();
    log = [];
    wipe();
    peekobot.innerHTML = "";
    return startConversation();
  }

  if (restartButton) restartButton.addEventListener("click", () => { enqueue(restart); });

  async function startConversation() {
    state.greeted = true;
    state.phase = "ABERTURA";
    await askIntent("Oi! Eu sou a Lia, corretora virtual da Cadena Imóveis. 💛 Estou aqui para te ajudar a encontrar o imóvel ideal ou direcionar seu atendimento. Você está procurando comprar, alugar, vender ou anunciar um imóvel?");
  }

  function replay() {
    let lastChoices = null;
    log.forEach((item, i) => {
      if (item.who === "bot") renderBot(item.text, false);
      else if (item.who === "user") renderUser(item.text, false);
      else if (item.who === "card") renderCard(item.card, false);
      else if (item.who === "choices") { renderChoices(item.options, false); lastChoices = i; }
    });
    // só as escolhas da última mensagem continuam clicáveis
    const groups = peekobot.querySelectorAll(".choices");
    groups.forEach((g, idx) => {
      const isLast = idx === groups.length - 1 && lastChoices === log.length - 1;
      if (!isLast) g.querySelectorAll("button.choice").forEach((b) => { b.disabled = true; });
    });
  }

  // API mínima para a página (testes e integração)
  window.Lia = {
    restart: () => enqueue(restart),
    send: (text) => { echoUser(text); return enqueue(() => handle(text, null)); },
    state: () => JSON.parse(JSON.stringify(state)),
    lead: () => leadPayload()
  };

  if (load() && log.length && !state.optedOut) replay();
  else enqueue(startConversation);
})();
