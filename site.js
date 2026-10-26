/*
 * Site demo da Cadena: destaques, busca, favoritos.
 * Também publica os destaques em window.LIA_CATALOG para a Lia buscar neles
 * (lia.config.js usa catalog_provider: "local").
 */
(function () {
  "use strict";

  // Destaques desta demonstração (os mesmos anúncios do site oficial)
  const IMO = [
    { id: "5783", mode: "venda", name: "Apartamento 2 Quartos", bairro: "Centro", q: 2, price: 850000, type: "Apartamento", url: "https://cadenaimoveis.com.br/imovel/5783/venda/apartamento-2-quartos-the-five-east-batel-centro-curitiba/" },
    { id: "5811", mode: "venda", name: "Apartamento 1 Quarto", bairro: "Centro", q: 1, price: 475000, type: "Apartamento", url: "https://cadenaimoveis.com.br/imovel/5811/venda/apartamento-1-quarto-the-five-east-batel-centro-curitiba/" },
    { id: "5604", mode: "venda", name: "Cobertura 3 Quartos", bairro: "Água Verde", q: 3, price: 1690000, type: "Cobertura", url: "https://cadenaimoveis.com.br/imovel/5604/venda/cobertura-3-quartos-rossi-vanguarda-agua-verde-curitiba/" },
    { id: "7941", mode: "aluguel", name: "Studio 1 Quarto", bairro: "Centro", q: 1, price: 2700, type: "Studio", url: "https://cadenaimoveis.com.br/imovel/7941/aluguel/studio-1-quarto-bf2211-centro-curitiba/" },
    { id: "8204", mode: "aluguel", name: "Apartamento 1 Quarto", bairro: "Centro", q: 1, price: 2600, type: "Apartamento", url: "https://cadenaimoveis.com.br/imovel/8204/aluguel/apartamento-1-quarto-the-five-east-batel-centro-curitiba/" },
    { id: "8070", mode: "aluguel", name: "Apartamento 1 Quarto", bairro: "Centro", q: 1, price: 2300, type: "Apartamento", url: "https://cadenaimoveis.com.br/imovel/8070/aluguel/apartamento-1-quarto-seventh-avenue-centro-curitiba/" },
    { id: "8149", mode: "aluguel", name: "Apartamento 1 Quarto", bairro: "Centro", q: 1, price: 3900, type: "Apartamento", url: "https://cadenaimoveis.com.br/imovel/8149/aluguel/apartamento-1-quarto-seventh-avenue-centro-curitiba/" }
  ];

  // Formato que a Lia entende (ver README: contrato do catálogo)
  window.LIA_CATALOG = IMO.map((i) => ({
    id: i.id,
    mode: i.mode === "aluguel" ? "rent" : "buy",
    title: i.name,
    type: i.type,
    neighborhood: i.bairro,
    price: i.price,
    bedrooms: i.q,
    url: i.url
  }));

  const money = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const fold = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const byId = (id) => IMO.find((i) => i.id === id) || null;

  // ───── favoritos (só neste navegador) ─────
  let FAV = [];
  try { FAV = JSON.parse(localStorage.getItem("cadena_fav") || "[]"); } catch (e) { FAV = []; }
  const saveFav = () => { try { localStorage.setItem("cadena_fav", JSON.stringify(FAV)); } catch (e) { /* ok */ } };
  const isFav = (id) => FAV.includes(id);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function card(i) {
    const art = el("article", "card");
    art.id = "c" + i.id;
    const media = el("div", "media" + (i.type === "Cobertura" ? " k2" : i.type === "Studio" ? " k3" : ""));
    media.appendChild(el("span", "badge", i.mode === "aluguel" ? "Locação" : "Venda"));
    const fav = el("button", "fav", isFav(i.id) ? "♥" : "♡");
    fav.type = "button";
    fav.dataset.fav = i.id;
    fav.setAttribute("aria-label", isFav(i.id) ? "Remover dos favoritos" : "Favoritar");
    fav.setAttribute("aria-pressed", String(isFav(i.id)));
    media.appendChild(fav);
    const body = el("div", "body");
    body.appendChild(el("p", "meta", i.type + " · " + i.bairro + ", Curitiba · cód. " + i.id));
    body.appendChild(el("h3", null, i.name));
    const price = el("p", "price", money(i.price));
    if (i.mode === "aluguel") price.appendChild(el("small", null, " /mês"));
    body.appendChild(price);
    const a = el("a", "btn o", "Ver anúncio");
    a.href = i.url;
    a.target = "_blank";
    a.rel = "noopener";
    body.appendChild(a);
    art.append(media, body);
    return art;
  }

  const S = { mode: "venda", bairro: "", max: null };
  const filt = (o) => IMO.filter((l) => (!o.mode || l.mode === o.mode) && (!o.bairro || fold(l.bairro) === fold(o.bairro)) && (!o.max || l.price <= o.max));

  function grid(container, mode) {
    const items = filt({ mode, bairro: S.bairro, max: S.max });
    container.replaceChildren(...(items.length ? items.map(card) : [el("p", "empty", "Nenhum imóvel com esses filtros na demonstração.")]));
  }
  function renderGrids() {
    grid(document.getElementById("gv"), "venda");
    grid(document.getElementById("gl"), "aluguel");
  }

  function highlight(id) {
    const c = document.getElementById("c" + id);
    if (!c) return;
    c.scrollIntoView({ behavior: "smooth", block: "center" });
    c.classList.remove("flash");
    void c.offsetWidth;
    c.classList.add("flash");
  }
  window.CadenaSite = { highlight };

  document.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fav]");
    if (f) {
      const id = f.dataset.fav;
      const k = FAV.indexOf(id);
      if (k > -1) FAV.splice(k, 1); else FAV.push(id);
      saveFav();
      renderGrids();
      return;
    }
    // "Mostrar no site" dentro do chat da Lia
    const h = e.target.closest("[data-hl]");
    if (h) {
      e.preventDefault();
      const id = h.dataset.hl;
      const item = byId(id);
      if (item && (S.bairro || S.max)) { S.bairro = ""; S.max = null; renderGrids(); }
      if (window.matchMedia("(max-width: 640px)").matches) document.dispatchEvent(new CustomEvent("lia:close"));
      setTimeout(() => highlight(id), 50);
    }
  });

  document.querySelectorAll(".tab").forEach((t) => {
    t.addEventListener("click", () => {
      S.mode = t.dataset.m;
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === t));
    });
  });

  document.getElementById("sf").addEventListener("submit", (e) => {
    e.preventDefault();
    const cod = document.getElementById("cod").value.trim();
    const item = cod ? byId(cod) : null;
    if (item) { S.mode = item.mode; S.bairro = ""; S.max = null; renderGrids(); highlight(item.id); return; }
    S.bairro = document.getElementById("bairro").value;
    const pv = document.getElementById("preco").value;
    S.max = pv ? Number(pv) : null;
    renderGrids();
    document.getElementById(S.mode === "venda" ? "venda" : "locacao").scrollIntoView({ behavior: "smooth" });
  });

  renderGrids();
})();
