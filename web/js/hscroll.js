/* =========================================================
   RAPIDIN · Filas horizontales con flechas (categorías)
   Las flechas aparecen solo si hay más contenido hacia ese lado.
   En celular se desliza con el dedo; en computador, con flechas o rueda.
   ========================================================= */
function update(w) {
  const t = w?.querySelector(".hs-track"); if (!t) return;
  const max = t.scrollWidth - t.clientWidth;
  w.classList.toggle("can-prev", t.scrollLeft > 4);
  w.classList.toggle("can-next", t.scrollLeft < max - 4);
}
export function initHScroll(root = document) {
  root.querySelectorAll(".hs").forEach(w => {
    const t = w.querySelector(".hs-track");
    if (t && w.dataset.keep) t.scrollLeft = +w.dataset.keep || 0;
    // Lleva a la vista la categoría activa.
    const on = t?.querySelector("[aria-pressed=true]");
    if (on && !w.dataset.keep && (on.offsetLeft + on.offsetWidth > t.clientWidth)) t.scrollLeft = on.offsetLeft - 40;
    update(w);
  });
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-hs-dir]"); if (!b) return;
  const t = b.closest(".hs").querySelector(".hs-track");
  t.scrollBy({ left: +b.dataset.hsDir * t.clientWidth * 0.75, behavior: "smooth" });
});
document.addEventListener("scroll", e => { if (e.target.classList?.contains("hs-track")) update(e.target.closest(".hs")); }, true);
document.addEventListener("wheel", e => {
  const t = e.target.closest?.(".hs-track"); if (!t || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  if (t.scrollWidth <= t.clientWidth) return;
  e.preventDefault(); t.scrollLeft += e.deltaY;
}, { passive: false });
window.addEventListener("resize", () => initHScroll());
