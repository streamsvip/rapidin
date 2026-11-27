/* =========================================================
   RAPIDIN · Tienda del inicio
   Cualquiera puede ver locales y productos sin ingresar.
   El pedido se arma aquí y, al confirmarlo, se pide ingresar.
   Solo atiende en Camaná.
   ========================================================= */
import { load, subscribe, isOpen, statusLabel, hoursLabel, ESPECIALIDADES, espIcon } from "./core/store.js";
import { goPanel } from "./app.js";
import { shopCart } from "./panels/cliente.js";
import { storeLogo, coverStyle, ratingTag, tagsLine } from "./panels/common.js";
import { initHScroll } from "./hscroll.js";
import { fixBrokenLogos } from "./ui.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sol = n => "S/ " + (Math.round((+n || 0) * 100) / 100).toFixed(2);
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ARROWS = `<button type="button" class="hs-arrow prev" data-hs-dir="-1" aria-label="Anteriores" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>`;
const ARROWN = `<button type="button" class="hs-arrow next" data-hs-dir="1" aria-label="Siguientes" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>`;
const CHECKOUT_MSG = "Tu pedido está listo. Ingresa o crea tu cuenta para confirmarlo.";

const st = { q: "", cat: "", sheet: null, qty: 1, swap: null };

/* ---------- Datos ---------- */
function data() {
  const db = load();
  const stores = Object.values(db.establishments || {}).filter(e => e.activo && e.tiendaVirtual);
  const ids = new Set(stores.map(e => e.id));
  const prods = Object.values(db.products || {}).filter(p => ids.has(p.tiendaId)).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  return { db, stores, prods };
}
const storeOf = (db, p) => db.establishments?.[p.tiendaId];
const byOpen = (a, b) => isOpen(b) - isOpen(a) || (b.rating || 0) - (a.rating || 0) || a.nombre.localeCompare(b.nombre);

/** Ilustración del producto: su foto o un emoji según el nombre. */
const EMO = [[/alita/, "🍖"], [/salchi|hot ?dog/, "🌭"], [/combo|familiar|especial|promo/, "🍱"], [/chancho|cerdo|parrill|carne|lomo|costilla/, "🥩"], [/broaster/, "🍗"], [/pollo|brasa|cilindro/, "🍗"], [/papa|frita/, "🍟"],
  [/hambur/, "🍔"], [/pizza/, "🍕"], [/ceviche|pescado|marisc/, "🐟"], [/chifa|arroz|tallar|aeropuerto/, "🍜"], [/sandw|pan\b|butifarra/, "🥪"],
  [/gaseosa|cola|inca|bebida|chicha|jugo|limonada/, "🥤"], [/agua/, "💧"], [/cerveza/, "🍺"], [/torta|postre|helado/, "🍰"], [/cafe/, "☕"], [/ensalada/, "🥗"]];
function prodEmo(p, e) { const hit = t => EMO.find(([r]) => r.test(norm(t))); return (hit(p.nombre) || hit(p.seccion) || [, (e?.etiquetas || []).length ? espIcon(e.etiquetas[0]) : "🛍️"])[1]; }
const prodImg = (p, e, cls = "") => p.img ? `<span class="pi ${cls}"><img src="${p.img}" alt="" loading="lazy"></span>` : `<span class="pi ph ${cls}" aria-hidden="true">${prodEmo(p, e)}</span>`;

/* ---------- Vista principal ---------- */
function prodCard(p, e) {
  const open = isOpen(e), q = shopCart.qty(p.id, e.id), can = open && p.disponible;
  return `<article class="pc${p.disponible ? "" : " off"}">
    <button type="button" class="pc-open" data-prod="${p.id}" aria-label="Ver ${esc(p.nombre)}">${prodImg(p, e)}</button>
    ${can ? (q ? `<span class="pc-q">${q}</span>` : `<button type="button" class="pc-add" data-add="${p.id}" aria-label="Agregar ${esc(p.nombre)}">+</button>`) : ""}
    <button type="button" class="pc-info" data-prod="${p.id}"><b>${sol(p.precio)}</b><span>${esc(p.nombre)}</span><small>${esc(e.nombre)}${open ? "" : " · cerrado"}</small></button>
  </article>`;
}
const rail = (title, sub, items, more = "") => items ? `<section class="rail"><div class="rail-h"><h2>${title}</h2>${sub ? `<span>${sub}</span>` : ""}${more}</div>
  <div class="hs"><div class="hs-track">${items}</div>${ARROWS.replace("hs-arrow prev", "hs-arrow prev")}${ARROWN}</div></section>` : "";
function storeCard(e, n) {
  const open = isOpen(e);
  return `<button type="button" class="sc2${open ? "" : " closed"}" data-store="${e.id}">
    <span class="sc2-cover${e.portada ? " photo" : ""}" style="${coverStyle(e)}"><span class="sc2-st${open ? " on" : ""}">${esc(statusLabel(e))}</span></span>
    <span class="sc2-row">${storeLogo(e)}<span class="sc2-t"><b>${esc(e.nombre)}</b><small>${tagsLine(e)}</small><small>${e.tiempoPrep ? `${e.tiempoPrep}–${e.tiempoPrep + 15} min · ` : ""}${n} productos ${ratingTag(e)}</small></span></span>
  </button>`;
}

function renderCats() {
  const { stores } = data(), used = new Set(stores.flatMap(e => e.etiquetas || []));
  const cats = ESPECIALIDADES.filter(([n]) => used.has(n));
  const box = $("#shopCats"); if (!box) return;
  box.hidden = !cats.length;
  box.innerHTML = cats.length ? `<div class="hs-track"><button type="button" class="sc-chip" data-cat="" aria-pressed="${!st.cat}"><span>✨</span>Todo</button>${cats.map(([n, i]) => `<button type="button" class="sc-chip" data-cat="${esc(n)}" aria-pressed="${st.cat === n}"><span>${i}</span>${esc(n)}</button>`).join("")}</div>${ARROWS}${ARROWN}` : "";
}

export function renderShop() {
  const body = $("#shopBody"); if (!body) return;
  renderCats();
  const { db, stores, prods } = data();
  const count = id => prods.filter(p => p.tiendaId === id && p.disponible).length;
  if (!stores.length) {
    body.innerHTML = `<div class="shop-empty"><span>🛵</span><b>Muy pronto verás aquí los locales de Camaná.</b><p>Mientras tanto, pide lo que necesites y un repartidor te lo lleva.</p><button class="btn small" type="button" data-go="libre">Pedir algo</button></div>`;
    return;
  }
  const q = norm(st.q.trim());
  if (q) {
    const ps = prods.filter(p => norm(`${p.nombre} ${p.descripcion} ${p.seccion} ${storeOf(db, p)?.nombre}`).includes(q)).slice(0, 30);
    const ss = stores.filter(e => norm(`${e.nombre} ${(e.etiquetas || []).join(" ")} ${e.categoria} ${e.descripcion}`).includes(q)).sort(byOpen);
    body.innerHTML = `<div class="res-h"><h2>Resultados para «${esc(st.q.trim())}»</h2><button type="button" class="link" data-clear>Borrar búsqueda</button></div>
      ${ps.length ? `<div class="pc-grid">${ps.map(p => prodCard(p, storeOf(db, p))).join("")}</div>` : ""}
      ${ss.length ? `<h3 class="res-sub">Locales</h3><div class="sc2-grid">${ss.map(e => storeCard(e, count(e.id))).join("")}</div>` : ""}
      ${ps.length || ss.length ? "" : `<div class="shop-empty"><span>🔎</span><b>No encontramos «${esc(st.q.trim())}» en los locales.</b><p>Pídelo igual: describe lo que necesitas y un repartidor lo consigue en Camaná.</p><button class="btn small" type="button" data-go="libre">Pedir «${esc(st.q.trim())}»</button></div>`}`;
    return finish(body);
  }
  const vis = stores.filter(e => !st.cat || (e.etiquetas || []).includes(st.cat)).sort(byOpen);
  const visIds = new Set(vis.map(e => e.id));
  const pv = prods.filter(p => visIds.has(p.tiendaId) && p.disponible);
  // Destacados: lo primero de cada carta, intercalando locales y primero los abiertos.
  const per = vis.map(e => pv.filter(p => p.tiendaId === e.id));
  const top = []; for (let i = 0; top.length < 14 && per.some(l => l[i]); i++) per.forEach(l => l[i] && top.length < 14 && top.push(l[i]));
  body.innerHTML = rail(st.cat ? `${espIcon(st.cat)} ${esc(st.cat)}` : "Recomendados en Camaná", "Precios del local", top.map(p => prodCard(p, storeOf(db, p))).join(""))
    + vis.filter(e => count(e.id)).slice(0, 4).map(e => rail(`${esc(e.nombre)}`, `<span class="rail-st${isOpen(e) ? " on" : ""}">${esc(statusLabel(e))}</span>`, pv.filter(p => p.tiendaId === e.id).slice(0, 12).map(p => prodCard(p, e)).join(""), `<button type="button" class="link rail-more" data-store="${e.id}">Ver todo</button>`)).join("")
    + `<section class="rail" id="locales"><div class="rail-h"><h2>${st.cat ? "Locales" : "Locales en Camaná"}</h2><span>${vis.length}</span></div>
      ${vis.length ? `<div class="sc2-grid">${vis.map(e => storeCard(e, count(e.id))).join("")}</div>` : `<p class="muted-p">Aún no hay locales de ${esc(st.cat)}.</p>`}</section>
      <button type="button" class="libre-cta" data-go="libre"><span>🛵</span><span><b>¿No encuentras lo que buscas?</b><small>Pide lo que quieras y los repartidores te ofertan el envío.</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>`;
  finish(body);
}
function finish(root) { fixBrokenLogos(root); initHScroll(document); renderBar(); }

/* ---------- Barra «Ver mi pedido» ---------- */
function renderBar() {
  const { db } = data(), n = shopCart.count(), bar = $("#shopBar");
  const cn = $("#navCartN"); if (cn) { cn.hidden = !n; cn.textContent = n; }
  if (!bar) return;
  const e = db.establishments?.[shopCart.store()];
  bar.hidden = !n || !!st.sheet || document.body.classList.contains("in-app");
  if (n) bar.innerHTML = `<button type="button" class="sb-btn" data-checkout><span class="sb-n">${n}</span><span class="sb-t">Ver mi pedido<small>${esc(e?.nombre || "")}</small></span><b>${sol(shopCart.subtotal(db))}</b></button>`;
}
function checkout() { closeSheet(); goPanel("#cliente-checkout", CHECKOUT_MSG); }

/* ---------- Hoja: producto y local ---------- */
function openSheet(view) {
  st.sheet = view; st.swap = null;
  let el = $("#shopSheet");
  if (!el) {
    el = document.createElement("div"); el.id = "shopSheet"; el.className = "ss-wrap";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    document.body.appendChild(el);
  }
  document.body.classList.add("shop-lock");
  renderSheet(true);
}
function closeSheet() {
  st.sheet = null; $("#shopSheet")?.remove(); document.body.classList.remove("shop-lock"); renderBar();
}
function addToCart(p, q, done) {
  const cur = shopCart.store();
  if (cur && cur !== p.tiendaId && shopCart.count()) { st.swap = { pid: p.id, q, done }; return renderSheet(); }
  shopCart.set(p.id, p.tiendaId, q); done?.(); renderShop(); renderSheet();
}
function renderSheet(first = false) {
  const el = $("#shopSheet"); if (!el || !st.sheet) return;
  const { db, prods } = data();
  const keepScroll = !first ? $(".ss-body", el)?.scrollTop : 0;
  let html = "";
  if (st.sheet.t === "prod") {
    const p = db.products?.[st.sheet.id], e = p && storeOf(db, p);
    if (!p || !e) return closeSheet();
    const open = isOpen(e), can = open && p.disponible, inCart = shopCart.qty(p.id, e.id);
    const more = prods.filter(x => x.tiendaId === e.id && x.id !== p.id && x.disponible && x.seccion === p.seccion).concat(prods.filter(x => x.tiendaId === e.id && x.id !== p.id && x.disponible && x.seccion !== p.seccion)).slice(0, 10);
    el.setAttribute("aria-label", p.nombre);
    html = `<div class="ss" data-kind="prod">
      <div class="ss-head"><button type="button" class="ss-x" data-close-sheet aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="ss-body">
        <div class="pd">
          ${prodImg(p, e, "pd-img")}
          <div class="pd-main">
            <h2>${esc(p.nombre)}</h2>
            <strong class="pd-price">${sol(p.precio)}</strong>
            ${p.descripcion ? `<p class="pd-desc">${esc(p.descripcion)}</p>` : ""}
            <button type="button" class="pd-store" data-store="${e.id}">${storeLogo(e)}<span><b>${esc(e.nombre)}</b><small class="${open ? "on" : ""}">${esc(statusLabel(e))}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
            ${open ? "" : `<p class="pd-note">Puedes ver el menú, pero solo se pide dentro de su horario: ${esc(hoursLabel(e))}.</p>`}
            ${!p.disponible ? `<p class="pd-note">Este producto está agotado por ahora.</p>` : ""}
            ${inCart ? `<p class="pd-in">Ya tienes ${inCart} en tu pedido.</p>` : ""}
          </div>
        </div>
        ${more.length ? `<section class="rail in-sheet"><div class="rail-h"><h2>Más de ${esc(e.nombre)}</h2></div><div class="hs"><div class="hs-track">${more.map(x => prodCard(x, e)).join("")}</div>${ARROWS}${ARROWN}</div></section>` : ""}
      </div>
      <div class="ss-foot">${swapHtml(db) || (can ? `<div class="qty"><button type="button" data-q="-1" aria-label="Uno menos">−</button><b>${st.qty}</b><button type="button" data-q="1" aria-label="Uno más">+</button></div>
        <button type="button" class="btn ss-main" data-add-main>Agregar ${sol(p.precio * st.qty)}</button>` : `<button type="button" class="btn ss-main" disabled>${p.disponible ? `Cerrado · ${esc(statusLabel(e))}` : "Agotado"}</button>`)}</div>
    </div>`;
  } else {
    const e = db.establishments?.[st.sheet.id]; if (!e) return closeSheet();
    const open = isOpen(e), list = prods.filter(p => p.tiendaId === e.id), secs = [...new Set(list.map(p => p.seccion || "Carta"))];
    const n = shopCart.store() === e.id ? shopCart.count() : 0;
    el.setAttribute("aria-label", e.nombre);
    html = `<div class="ss" data-kind="store">
      <div class="ss-head"><span class="ss-ht">${esc(e.nombre)}</span><button type="button" class="ss-x" data-close-sheet aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="ss-body">
        <div class="st-cover${e.portada ? " photo" : ""}" style="${coverStyle(e)}"></div>
        <div class="st-id">${storeLogo(e, "lg")}<div><h2>${esc(e.nombre)}</h2><p><span class="st-st${open ? " on" : ""}">${esc(statusLabel(e))}</span> ${ratingTag(e)}</p><small>${esc(e.direccion || "")} · ${esc(hoursLabel(e))}</small></div></div>
        ${open ? "" : `<p class="pd-note st-note">Ahora está cerrado. Mira su menú y pide dentro de su horario.</p>`}
        ${secs.length > 1 ? `<div class="hs st-nav"><div class="hs-track">${secs.map((s, i) => `<button type="button" class="sc-chip sm" data-jump="${i}">${esc(s)}</button>`).join("")}</div>${ARROWS}${ARROWN}</div>` : ""}
        ${secs.map((s, i) => `<div class="st-sec" id="stsec-${i}"><h3>${esc(s)}</h3>${list.filter(p => (p.seccion || "Carta") === s).map(p => { const q = shopCart.qty(p.id, e.id), can = open && p.disponible; return `
          <div class="st-p${p.disponible ? "" : " off"}"><button type="button" class="st-pi" data-prod="${p.id}">${prodImg(p, e, "sm")}<span><b>${esc(p.nombre)}</b>${p.descripcion ? `<small>${esc(p.descripcion)}</small>` : ""}<strong>${sol(p.precio)}</strong></span></button>
            ${!p.disponible ? `<span class="st-off">Agotado</span>` : !can ? "" : q ? `<div class="qty sm"><button type="button" data-dec="${p.id}" aria-label="Uno menos">−</button><b>${q}</b><button type="button" data-inc="${p.id}" aria-label="Uno más">+</button></div>` : `<button type="button" class="pc-add static" data-add="${p.id}" aria-label="Agregar ${esc(p.nombre)}">+</button>`}</div>`; }).join("")}</div>`).join("") || `<p class="muted-p">Este local todavía no publicó su menú.</p>`}
      </div>
      <div class="ss-foot">${swapHtml(db) || (n ? `<button type="button" class="btn ss-main wide" data-checkout><span class="sb-n">${n}</span>Ver mi pedido<b>${sol(shopCart.subtotal(db))}</b></button>` : `<p class="ss-hint">${open ? "Toca + para agregar productos a tu pedido." : `Abre ${esc(hoursLabel(e))}.`}</p>`)}</div>
    </div>`;
  }
  el.innerHTML = html;
  fixBrokenLogos(el); initHScroll(el);
  const body = $(".ss-body", el); if (body && keepScroll) body.scrollTop = keepScroll;
  if (first) $(".ss-x", el)?.focus({ preventScroll: true });
}
function swapHtml(db) {
  if (!st.swap) return "";
  const other = db.establishments?.[shopCart.store()]?.nombre || "otro local";
  return `<div class="swap"><p>Tu pedido tiene productos de <b>${esc(other)}</b>. Cada pedido es de un solo local.</p><div><button type="button" class="btn small ghost-dark" data-swap="no">Mantener</button><button type="button" class="btn small" data-swap="yes">Empezar uno nuevo</button></div></div>`;
}

/* ---------- Eventos ---------- */
function scrollToStores() { const t = $("#locales") || $("#shopBody"); t?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function onClick(ev) {
  const t = ev.target, inSheet = t.closest("#shopSheet"), inShop = t.closest("#inicio, #shopBar, #shopSheet, .shop-nav");
  if (!inShop) return;
  const { db } = data();
  if (inSheet && (t === inSheet || t.closest("[data-close-sheet]"))) return closeSheet();
  let b;
  if ((b = t.closest("[data-checkout]"))) return checkout();
  if ((b = t.closest("[data-go]"))) { if (b.dataset.go === "libre") { closeSheet(); return goPanel("#cliente-nuevo", "Ingresa o crea tu cuenta para pedir lo que quieras."); } return scrollToStores(); }
  if ((b = t.closest("[data-cat]"))) { st.cat = b.dataset.cat; return renderShop(); }
  if (t.closest("[data-clear]")) { st.q = ""; $("#shopQ").value = ""; return renderShop(); }
  if ((b = t.closest("[data-swap]"))) {
    const s = st.swap; st.swap = null;
    if (b.dataset.swap === "yes" && s) { const p = db.products[s.pid]; shopCart.set(p.id, p.tiendaId, s.q); s.done?.(); renderShop(); }
    return renderSheet();
  }
  if ((b = t.closest("[data-add]"))) {
    const p = db.products?.[b.dataset.add]; if (!p) return;
    if (!inSheet) {
      if (shopCart.store() && shopCart.store() !== p.tiendaId && shopCart.count()) { st.qty = 1; openSheet({ t: "prod", id: p.id }); return addToCart(p, 1); }
      shopCart.set(p.id, p.tiendaId, shopCart.qty(p.id, p.tiendaId) + 1); return renderShop();
    }
    return addToCart(p, shopCart.qty(p.id, p.tiendaId) + 1);
  }
  if ((b = t.closest("[data-inc]")) || (b = t.closest("[data-dec]"))) {
    const id = b.dataset.inc || b.dataset.dec, p = db.products?.[id]; if (!p) return;
    shopCart.set(id, p.tiendaId, shopCart.qty(id, p.tiendaId) + (b.dataset.inc ? 1 : -1)); renderShop(); return renderSheet();
  }
  if ((b = t.closest("[data-q]"))) { st.qty = Math.max(1, Math.min(30, st.qty + +b.dataset.q)); return renderSheet(); }
  if (t.closest("[data-add-main]")) {
    const p = db.products?.[st.sheet?.id]; if (!p) return;
    return addToCart(p, shopCart.qty(p.id, p.tiendaId) + st.qty, () => { st.qty = 1; closeSheet(); });
  }
  if ((b = t.closest("[data-jump]"))) { $(`#stsec-${b.dataset.jump}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if ((b = t.closest("[data-prod]"))) { st.qty = 1; return openSheet({ t: "prod", id: b.dataset.prod }); }
  if ((b = t.closest("[data-store]"))) { return openSheet({ t: "store", id: b.dataset.store }); }
}

/* Carrusel de novedades (celular): se desliza solo cada 5 s y se detiene al tocarlo. */
function initPromo() {
  const tr = $("#promoTrack"), dots = [...document.querySelectorAll("#promoDots i")]; if (!tr) return;
  const idx = () => Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
  tr.addEventListener("scroll", () => { const i = idx(); dots.forEach((d, k) => d.classList.toggle("on", k === i)); }, { passive: true });
  let paused = false; ["touchstart", "pointerdown", "mouseenter"].forEach(ev => tr.addEventListener(ev, () => { paused = true; }, { passive: true }));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  setInterval(() => {
    if (paused || !tr.offsetParent || document.hidden || document.body.classList.contains("in-app")) return;
    const n = tr.children.length, i = (idx() + 1) % n;
    tr.scrollTo({ left: i * tr.clientWidth, behavior: "smooth" });
  }, 5000);
}
export function initShop() {
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && st.sheet) closeSheet(); });
  window.addEventListener("hashchange", () => { if (st.sheet) closeSheet(); renderBar(); });
  let tm = 0;
  $("#shopQ")?.addEventListener("input", e => { clearTimeout(tm); tm = setTimeout(() => { st.q = e.target.value; renderShop(); if (st.q.trim()) $("#shopBody")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 180); });
  $("#shopQ")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
  $("#navCart")?.addEventListener("click", () => { const s = shopCart.store(); if (shopCart.count() && s) return checkout(); scrollToStores(); });
  initPromo();
  renderShop();
  subscribe(() => { renderShop(); if (st.sheet) renderSheet(); });
  setInterval(() => { renderShop(); }, 60e3);
}
