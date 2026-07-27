/**
 * Interattività minima delle sottopagine statiche (zone, servizi, informative).
 * Nessun cookie, nessun tracciamento, nessun innerHTML: compatibile con la CSP
 * del sito (script-src 'self', require-trusted-types-for 'script').
 */
(() => {
  "use strict";
  const $ = (sel, root = document) => root.querySelector(sel);

  // Anno corrente nel footer.
  const yearEl = $("#year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Ombra header allo scroll (stesso comportamento della landing).
  const header = $("#siteHeader");
  const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 30);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Menu mobile.
  const navToggle = $("#navToggle");
  const mainNav = $("#mainNav");
  if (navToggle && mainNav) {
    navToggle.addEventListener("click", () => {
      const open = mainNav.classList.toggle("open");
      navToggle.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Chiudi menu" : "Apri menu");
    });
    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        mainNav.classList.remove("open");
        navToggle.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Apri menu");
      });
    });
  }
})();
