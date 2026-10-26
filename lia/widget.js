/* Abre e fecha o widget da Lia. Abre sozinho no computador (ou com ?open=1). */
(function () {
  "use strict";
  const widget = document.querySelector(".lia-widget");
  if (!widget) return;
  const toggle = widget.querySelector("[data-lia-toggle]");
  const input = document.getElementById("lia-input");
  const inner = document.getElementById("peekobot-inner");

  function setOpen(open, focus) {
    widget.dataset.state = open ? "open" : "closed";
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
    document.documentElement.classList.toggle("lia-lock", open && window.matchMedia("(max-width: 640px)").matches);
    if (open) {
      if (inner) inner.scrollTop = inner.scrollHeight;
      if (focus && input) setTimeout(() => input.focus({ preventScroll: true }), 200);
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

  // link da política de privacidade no rodapé, se configurado
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

  const params = new URLSearchParams(location.search);
  const wide = window.matchMedia("(min-width: 900px)").matches;
  setOpen(params.get("open") === "1" || (wide && params.get("open") !== "0"), false);
})();
