/*
 * Lia — entendimento de texto livre (modo sem IA, seção 13 da skill).
 * Regras e palavras-chave determinísticas: identifica intenção e extrai preferências
 * (tipo, bairro, quartos, vaga, valor) para a Lia nunca perguntar o que já foi dito.
 */
(function (root) {
  "use strict";

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const hasWord = (text, words) =>
    words.some((w) => new RegExp("(^|[^a-z0-9])" + w + "($|[^a-z0-9])").test(text));

  // 75 bairros oficiais de Curitiba + cidades da Região Metropolitana mais citadas.
  const PLACES = [
    "Abranches", "Água Verde", "Ahú", "Alto Boqueirão", "Alto da Glória", "Alto da Rua XV", "Atuba",
    "Augusta", "Bacacheri", "Bairro Alto", "Barreirinha", "Batel", "Bigorrilho", "Boa Vista", "Bom Retiro",
    "Boqueirão", "Butiatuvinha", "Cabral", "Cachoeira", "Cajuru", "Campina do Siqueira", "Campo Comprido",
    "Campo de Santana", "Capão da Imbuia", "Capão Raso", "Cascatinha", "Caximba", "Centro", "Centro Cívico",
    "Cidade Industrial", "CIC", "Cristo Rei", "Ecoville", "Fanny", "Fazendinha", "Ganchinho", "Guabirotuba", "Guaíra",
    "Hauer", "Hugo Lange", "Jardim Botânico", "Jardim das Américas", "Jardim Social", "Juvevê", "Lamenha Pequena",
    "Lindóia", "Mercês", "Mossunguê", "Novo Mundo", "Orleans", "Parolin", "Pilarzinho", "Pinheirinho",
    "Portão", "Prado Velho", "Rebouças", "Riviera", "Santa Cândida", "Santa Felicidade", "Santa Quitéria",
    "Santo Inácio", "São Braz", "São Francisco", "São João", "São Lourenço", "São Miguel", "Seminário",
    "Sítio Cercado", "Taboão", "Tarumã", "Tatuquara", "Tingui", "Uberaba", "Umbará", "Vila Izabel",
    "Vista Alegre", "Xaxim",
    "São José dos Pinhais", "Colombo", "Pinhais", "Araucária", "Fazenda Rio Grande", "Almirante Tamandaré",
    "Campo Largo", "Piraquara", "Quatro Barras", "Campina Grande do Sul"
  ];
  // Mais longos primeiro para "Centro Cívico" vencer "Centro", "São José dos Pinhais" vencer "Pinhais".
  const PLACE_INDEX = PLACES.map((p) => ({ name: p, key: norm(p) })).sort((a, b) => b.key.length - a.key.length);

  const NUM_WORDS = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };

  const INTENT_RULES = {
    human: [
      "atendente", "humano", "humana", "uma pessoa", "alguma pessoa", "falar com alguem", "falar com alguem da equipe",
      "pessoa de verdade", "corretor de verdade", "corretora de verdade", "nao quero falar com robo",
      "nao quero falar com bot", "nao quero robo", "falar com um corretor", "falar com uma corretora", "falar com corretor"
    ],
    optout: [
      "pare", "parar de me mandar", "nao me contate", "nao me contatem", "nao quero ser contatado",
      "nao quero ser contatada", "exclua meus dados", "excluir meus dados", "apague meus dados", "apagar meus dados",
      "descadastrar", "remover meus dados", "nao me ligue", "nao me liguem"
    ],
    mcmv: ["minha casa minha vida", "mcmv", "subsidio", "programa habitacional", "casa verde e amarela"],
    support: [
      "andamento", "minha visita", "minha proposta", "meu contrato", "contrato", "boleto", "cobranca", "segunda via",
      "manutencao", "conserto", "vazamento", "repasse", "vistoria", "status do meu", "acompanhar"
    ],
    owner: [
      "anunciar", "proprietario", "proprietaria", "meu imovel", "minha casa", "meu apartamento", "meu apto", "meu ape",
      "minha sala", "meu terreno", "meu lote", "tenho um", "tenho uma", "colocar pra", "colocar para", "colocar a venda",
      "por pra alugar", "botar pra alugar", "avaliar meu", "avaliacao do meu", "captar"
    ],
    sell: ["vender", "venda do meu", "vendo", "avaliar", "avaliacao"],
    rent: ["alugar", "aluguel", "locacao", "locar", "alugo", "arrendar"],
    // "quero um apê" não diz se é compra ou aluguel: a Lia pergunta (exemplo da seção 14)
    buy: ["comprar", "compra", "adquirir", "investir", "investimento"],
    financing: ["financiamento", "financiar", "fgts", "financiado", "credito imobiliario"]
  };

  function detectIntent(raw) {
    const t = norm(raw);
    if (!t) return null;
    if (hasWord(t, INTENT_RULES.optout)) return "optout";
    if (hasWord(t, INTENT_RULES.human)) return "human";
    if (hasWord(t, INTENT_RULES.mcmv)) return "mcmv";
    const owner = hasWord(t, INTENT_RULES.owner);
    if (owner && hasWord(t, INTENT_RULES.rent)) return "list_rent";
    if (owner && hasWord(t, INTENT_RULES.sell)) return "sell";
    if (owner) return "owner"; // proprietário sem dizer se vende ou aluga
    if (hasWord(t, INTENT_RULES.sell)) return "sell";
    if (hasWord(t, INTENT_RULES.support)) return "support";
    if (hasWord(t, INTENT_RULES.rent)) return "rent";
    if (hasWord(t, INTENT_RULES.buy)) return "buy";
    // só "financiamento/FGTS", sem comprar/MCMV explícito: o motor decide pelo contexto
    if (hasWord(t, INTENT_RULES.financing)) return "financing";
    return null;
  }

  function detectPropertyType(t) {
    if (/\bcobertura\b/.test(t)) return "cobertura";
    if (/\b(kitnet|kitinete|quitinete|studio|estudio|loft)\b/.test(t)) return "studio/kitnet";
    if (/\b(apartamento|apartamentos|apto|aptos|ape|apes|ap)\b/.test(t)) return "apartamento";
    if (/\b(sobrado|sobrados)\b/.test(t)) return "sobrado";
    if (/\b(casa|casas)\b/.test(t) && !/minha casa minha vida/.test(t)) return "casa";
    if (/\b(terreno|terrenos|lote|lotes)\b/.test(t)) return "terreno";
    if (/\b(sala comercial|sala|salas|loja|lojas|comercial|ponto comercial|galpao|barracao|escritorio)\b/.test(t)) return "comercial";
    return null;
  }

  function detectPlaces(t) {
    const found = [];
    let rest = " " + t + " ";
    for (const p of PLACE_INDEX) {
      const re = new RegExp("(^|[^a-z0-9])" + p.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z0-9])");
      if (re.test(rest)) {
        found.push(p.name === "CIC" ? "Cidade Industrial" : p.name);
        rest = rest.replace(re, " ");
      }
    }
    return [...new Set(found)];
  }

  function detectFlexibleRegion(t) {
    return /\b(tanto faz|qualquer (bairro|regiao|lugar)|sou flexivel|flexivel|sem preferencia|nao tenho preferencia|em qualquer)\b/.test(t);
  }

  function detectBedrooms(t) {
    let m = t.match(/\b(\d)\s*(quartos?|dormitorios?|dorms?|q)\b/);
    if (m) return parseInt(m[1], 10);
    m = t.match(/\b(um|uma|dois|duas|tres|quatro|cinco|seis)\s+(quartos?|dormitorios?)\b/);
    if (m) return NUM_WORDS[m[1]];
    if (/\b(studio|kitnet|loft)\b/.test(t)) return null;
    return null;
  }

  function detectParking(t) {
    if (/\b(sem (vaga|garagem)|nao preciso de (vaga|garagem)|vaga nao|garagem nao|nao precisa de (vaga|garagem)|dispenso)\b/.test(t)) return 0;
    let m = t.match(/\b(\d)\s*vagas?\b/);
    if (m) return parseInt(m[1], 10);
    m = t.match(/\b(uma|duas|tres)\s+vagas?\b/);
    if (m) return NUM_WORDS[m[1]];
    if (/\b(com (vaga|garagem)|precisa de (vaga|garagem)|preciso de (vaga|garagem)|tenha (vaga|garagem))\b/.test(t)) return 1;
    return null;
  }

  // Converte "450 mil", "1,2 milhão", "R$ 2.500", "450k" em número de reais.
  function parseMoneyToken(numStr, unit) {
    let s = numStr.replace(/\s/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    let v = parseFloat(s);
    if (isNaN(v)) return null;
    if (unit) {
      if (/^(mil|k)$/.test(unit)) v *= 1e3;
      else if (/^(milhao|milhoes|mi|mm)$/.test(unit)) v *= 1e6;
    }
    return Math.round(v);
  }

  function detectBudget(raw) {
    const t = norm(raw)
      .replace(/\b(\d+)\s*quartos?\b/g, " ")
      .replace(/\b(\d+)\s*(dormitorios?|vagas?|q|m2|metros?)\b/g, " ");
    const re = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(mil|k|milhao|milhoes|mi|mm|reais)?\b/g;
    const values = [];
    let m;
    while ((m = re.exec(t)) !== null) {
      const unit = m[2] && m[2] !== "reais" ? m[2] : null;
      const hadCurrency = /r\$\s*$/.test(t.slice(Math.max(0, m.index - 3), m.index + 2)) || /^r\$/.test(m[0]);
      const v = parseMoneyToken(m[1], unit);
      if (v == null) continue;
      // número solto pequeno sem unidade nem R$ não é valor (ex.: "2" de "2 banheiros")
      if (!unit && !hadCurrency && m[2] !== "reais" && v < 300) continue;
      values.push(v);
    }
    if (!values.length) return null;
    const between = /\bentre\b/.test(t) || /\b(de)\b.*\b(a|ate)\b/.test(t);
    if (values.length >= 2 && between) {
      // "entre 300 e 400 mil": a unidade costuma vir só no segundo número
      let [a, b] = values;
      if (a < 1000 && b >= 1000) a = a * (b >= 1e6 ? 1e6 : 1e3);
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
    const v = values[values.length - 1];
    if (/\b(a partir de|acima de|mais de|minimo)\b/.test(t)) return { min: v, max: null };
    return { min: null, max: v };
  }

  function detectTimeline(t) {
    if (/\b(urgente|imediato|imediatamente|o quanto antes|ja|agora|esse mes|este mes)\b/.test(t)) return "o quanto antes";
    let m = t.match(/\b(em|daqui a|ate)\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\s+(mes|meses|semanas?)\b/);
    if (m) return m[0];
    if (/\b(sem pressa|nao tenho pressa|sem prazo|ano que vem|proximo ano)\b/.test(t)) return t.match(/\b(sem pressa|nao tenho pressa|sem prazo|ano que vem|proximo ano)\b/)[0];
    const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    for (const mo of months) if (new RegExp("\\b" + mo + "\\b").test(t)) return mo;
    return null;
  }

  function isYes(t) {
    return /^(sim|s|claro|pode|pode ser|isso|exato|com certeza|quero|ok|okay|beleza|blz|uhum|aham|positivo|indispensavel|preciso|e sim|sim,?.*)$/.test(t) || /^sim\b/.test(t);
  }
  function isNo(t) {
    return /^(nao|n|nem|negativo|dispenso|tanto faz|nao precisa|nao e necessario|nao preciso|prefiro nao|nao,?.*)$/.test(t) || /^nao\b/.test(t);
  }
  function isUnsure(t) {
    return /\b(nao sei|ainda nao sei|talvez|depende|nao tenho certeza|sei la)\b/.test(t);
  }
  function isDecline(t) {
    return /\b(prefiro nao (informar|dizer|falar)|nao quero (informar|dizer)|nao vou informar|pular|sem informar)\b/.test(t);
  }

  function isGreeting(t) {
    return /^(oi+|ola|ole|opa|e ai|eai|bom dia|boa tarde|boa noite|hey|hello|oi lia|ola lia|tudo bem\??|oi,? tudo bem\??)[!. ?]*$/.test(t);
  }
  function isThanks(t) {
    return /\b(obrigad[oa]|valeu|vlw|agradeco|brigad[oa])\b/.test(t);
  }
  function asksIfBot(t) {
    return /(^|\b)((voce|vc|tu) e (um |uma )?(robo|bot|ia|inteligencia artificial|humana?|pessoa|de verdade|real|gente)|e (um |uma )?(robo|bot|ia)|estou falando com (um |uma )?(robo|bot|ia|pessoa|humano|humana))\b/.test(t);
  }
  function isHostile(t) {
    return /\b(idiota|burra|burro|lixo|merda|porcaria|inutil|imbecil|estupida|estupido|ridicula|ridiculo|droga de)\b/.test(t);
  }
  // Dados que NÃO devem ser trocados no chat aberto (seção 6.4 e 9).
  function hasSensitiveData(raw) {
    const t = norm(raw);
    if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(raw)) return "cpf";
    if (/\b(cpf|rg)\b[^a-z]*\d{5,}/.test(t)) return "documento";
    if (/\b(senha|password)\b/.test(t)) return "senha";
    if (/\b(\d{4}[ .-]?){3}\d{4}\b/.test(raw)) return "cartao";
    if (/\b(agencia|conta corrente|conta poupanca|pix)\b[^a-z]*\d{3,}/.test(t)) return "bancario";
    return null;
  }

  function parseContact(raw) {
    const email = (raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0];
    if (email) return { type: "email", value: email.toLowerCase() };
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 13) return { type: "phone", value: digits };
    return null;
  }

  function parseFirstName(raw) {
    let s = String(raw || "").trim()
      .replace(/^(meu nome e|meu nome é|me chamo|sou o|sou a|sou|eu sou o|eu sou a|eu sou|pode me chamar de|é|e)\s+/i, "")
      .replace(/[.,!?;:].*$/, "")
      .trim();
    const first = s.split(/\s+/)[0] || "";
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'-]{2,30}$/.test(first)) return null;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }

  // Extrai tudo o que der de uma mensagem livre, sem inventar nada.
  function extract(raw) {
    const t = norm(raw);
    const out = {};
    const type = detectPropertyType(t);
    if (type) out.property_type = type;
    const places = detectPlaces(t);
    if (places.length) out.neighborhoods = places;
    else if (detectFlexibleRegion(t)) out.region_flexible = true;
    const bed = detectBedrooms(t);
    if (bed != null) out.bedrooms_min = bed;
    const park = detectParking(t);
    if (park != null) out.parking_min = park;
    const budget = detectBudget(raw);
    if (budget) out.budget = budget;
    const tl = detectTimeline(t);
    if (tl) out.timeline = tl;
    if (hasWord(t, INTENT_RULES.financing)) out.wants_financing = "sim";
    return out;
  }

  const api = {
    norm, detectIntent, extract, detectPropertyType, detectPlaces, detectFlexibleRegion, detectBedrooms,
    detectParking, detectBudget, detectTimeline, isYes, isNo, isUnsure, isDecline, isGreeting, isThanks,
    asksIfBot, isHostile, hasSensitiveData, parseContact, parseFirstName, PLACES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LiaNLU = api;
})(typeof window !== "undefined" ? window : globalThis);
