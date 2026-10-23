/* PumaCraft -- a sheet of the game's own, dressed as canon's (games-meta
 * STANDARD.md §11: no native dialogs). PC.Sheet(title, html, onClick)
 * shows one over everything; onClick(button, sheet) hears every button;
 * sheet.close(), sheet.refresh(html). Esc or a click outside closes it. */
"use strict";
(() => {
  PC.Sheet = (title, html, onClick, onClose) => {
    const back = document.activeElement, el = document.createElement("div");
    el.className = "gk-sheet pc-sheet";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", title);
    const draw = h => { el.innerHTML = `<div class="gk-box"><div class="gk-head"><h2>${title}</h2><button data-x aria-label="Close">&times;</button></div><div class="gk-body">${h}</div></div>`; };
    draw(html);
    const api = {
      el,
      close() { document.removeEventListener("keydown", onKey, true); el.remove(); if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); if (onClose) onClose(); },
      refresh(h) { draw(h); },
    };
    const onKey = ev => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); api.close(); } else ev.stopPropagation(); };
    el.addEventListener("click", ev => {
      if (ev.target === el) return api.close();
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-x")) return api.close();
      onClick(b, api);
    });
    el.addEventListener("change", ev => onClick(ev.target, api));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(el);
    const f = el.querySelector("[data-primary]") || el.querySelector("[data-x]");
    if (f) f.focus();
    return api;
  };
})();
