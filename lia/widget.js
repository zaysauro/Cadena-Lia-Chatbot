/* Abre e fecha o widget da Lia. Começa fechado (use ?open=1 para abrir direto). */
(function () {
  "use strict";
  const widget = document.querySelector(".lia-widget");
  if (!widget) return;
  const toggle = widget.querySelector("[data-lia-toggle]");
  const input = document.getElementById("lia-input");
  const inner = document.getElementById("peekobot-inner");
  const hint = document.getElementById("lia-hint");

  function setOpen(open, focus) {
    widget.dataset.state = open ? "open" : "closed";
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Minimizar o chat com a Lia" : "Abrir chat com a Lia");
    }
    document.documentElement.classList.toggle("lia-lock", open && window.matchMedia("(max-width: 640px)").matches);
    if (open) {
      if (inner) inner.scrollTop = inner.scrollHeight;
      if (focus && input && !window.matchMedia("(max-width: 640px)").matches) setTimeout(() => input.focus({ preventScroll: true }), 200);
    } else if (focus && toggle) toggle.focus();
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-lia-toggle]")) setOpen(widget.dataset.state !== "open", true);
    else if (e.target.closest("[data-lia-open]")) setOpen(true, true);
    else if (e.target.closest("[data-lia-close]")) setOpen(false, true);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && widget.dataset.state === "open") setOpen(false, true);
  });
  document.addEventListener("lia:close", () => setOpen(false, false));

  // dicas que se alternam no balão enquanto o chat está fechado
  const HINTS = ["Oi! Posso te ajudar a encontrar um imóvel?", "Quer comprar ou alugar? Me conta o que procura.", "Tem um imóvel para vender ou anunciar? Eu te ajudo."];
  let hi = 0;
  if (hint && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      if (widget.dataset.state === "open") return;
      hi = (hi + 1) % HINTS.length;
      hint.textContent = HINTS[hi];
    }, 7000);
  }

  // link da política de privacidade no rodapé do chat, se configurado
  const cfg = window.LIA_CONFIG || {};
  const disc = document.getElementById("lia-disclaimer");
  if (disc && cfg.privacy_policy_url && /^https?:\/\//.test(cfg.privacy_policy_url)) {
    const a = document.createElement("a");
    a.href = cfg.privacy_policy_url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Política de privacidade";
    disc.append(" ", a);
  }

  setOpen(new URLSearchParams(location.search).get("open") === "1", false);
})();
