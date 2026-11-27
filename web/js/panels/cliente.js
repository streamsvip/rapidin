/* RAPIDIN · Panel del cliente: Market, pedido libre, pedidos, billetera y perfil */
import * as api from "../demo/api.js";
import { roadKm, MAP, isOpen as storeOpen, statusLabel, hoursLabel, is24h, ESPECIALIDADES, espIcon } from "../demo/store.js";
import { $, $$, esc, sol, fmtPhone, normPhone, waLink, toast, run, modal, closeModal, confirmModal, formData, num, chip, payChip, left, ago, empty, avatar, stars, firstName, payLogo, payTag, fixBrokenLogos, contactButtons, shrinkImage } from "../ui.js";
import { createPicker, latLngToPos, inZone } from "../map.js";
import { timeline, orderMap, courierMini, orderSummaryRows, itemsList, catOf, catIcon, productThumb, coverStyle, chatShell, chatHandlers, openChat, ratingTag, tagsLine, storeLogo, catBar, switchCtl } from "./common.js";
import { initHScroll } from "../hscroll.js";
import { openAuth } from "../auth.js";

const mine = (db, uid) => Object.values(db.orders).filter(o => o.clienteId === uid).sort((a, b) => b.creado - a.creado);
const isOpen = o => !["entregado", "cancelado"].includes(o.estado);
const PAGOS = [
  { id: "Efectivo", d: "Pagas al recibir" },
  { id: "Yape", d: "Directo al repartidor" },
  { id: "Plin", d: "Directo al repartidor" },
  { id: "Lemon", d: "Directo al repartidor" },
  { id: "Saldo RAPIDIN", d: "Se descuenta al entregar" },
];

/* =========================================================
   Estado local: carrito del Market y datos de entrega
   ========================================================= */
const CART_KEY = "rapidin.cart";
let cart = (() => { try { return JSON.parse(sessionStorage.getItem(CART_KEY)) || null; } catch (e) { return null; } })() || { tiendaId: null, items: {}, nota: "" };
const saveCart = () => { try { sessionStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* solo en memoria */ } };
const cartCount = () => Object.values(cart.items).reduce((s, n) => s + n, 0);
const cartLines = db => Object.entries(cart.items).map(([pid, q]) => ({ p: db.products[pid], q })).filter(l => l.p);
const cartSubtotal = db => cartLines(db).reduce((s, l) => s + l.p.precio * l.q, 0);
function setQty(pid, q) { if (q <= 0) delete cart.items[pid]; else cart.items[pid] = Math.min(30, q); if (!cartCount()) cart.tiendaId = null; saveCart(); }

/** Entrega y pago: compartidos entre el Market y el pedido libre. */
const deliv = { pos: null, referencia: "", addrId: null, pago: "Efectivo", guardar: false, nombreDir: "" };
function initDeliv(user) {
  if (deliv.pos || deliv._init) return;
  deliv._init = true;
  const d = (user.direcciones || [])[0];
  if (d) Object.assign(deliv, { pos: d.pos, referencia: d.referencia, addrId: d.id });
}

/* ---------- Bloques compartidos (compactos): entrega, pago y barra fija ---------- */
const PIN = '<svg class="ic sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';
const SHORT = { "Saldo RAPIDIN": "Saldo" };
function deliveryBlock(ctx) {
  const dirs = ctx.user.direcciones || [], open = !deliv.addrId;
  return `<section class="qa-card">
    <div class="qa-h"><h3>Entregar en</h3><span class="hint-s" id="dHint"></span></div>
    ${dirs.length ? `<div class="pill-scroll" role="group" aria-label="Direcciones guardadas">${dirs.map(d => `<button type="button" class="addr-pill" data-act="addr" data-id="${d.id}" aria-pressed="${deliv.addrId === d.id}">${PIN}<span><b>${esc(d.nombre)}</b><small>${esc(d.referencia || "Sin referencia")}</small></span></button>`).join("")}
      <button type="button" class="addr-pill add" data-act="addr" data-id="" aria-pressed="${open}"><span class="plus">+</span><span><b>Otra ubicación</b><small>Marcar en el mapa</small></span></button></div>` : ""}
    <div id="dlBox" class="dl-box" ${open ? "" : "hidden"}>
      <div class="dl-tools"><button type="button" class="loc-chip" data-act="gps">${PIN} Usar mi ubicación</button><span class="hint-s">o toca el mapa</span></div>
      <div class="map" id="dMap" style="height:230px" role="img" aria-label="Mapa de Camaná: toca para marcar el punto de entrega"></div>
      <div id="saveBox" class="save-row"><label class="check"><input type="checkbox" id="dSave" data-change="dsave" ${deliv.guardar ? "checked" : ""}> <span>Guardar como</span></label>
        <input class="in sm" id="dName" value="${esc(deliv.nombreDir)}" data-input="dname" placeholder="Casa, Trabajo…" ${deliv.guardar ? "" : "disabled"} aria-label="Nombre de la dirección"></div>
    </div>
    <input class="in sm qa-ref" id="dRef" value="${esc(deliv.referencia)}" data-input="dref" placeholder="Referencia: casa verde, 2.º piso, frente al parque" aria-label="Referencia de la dirección">
  </section>`;
}
function paymentBlock(ctx, montoRef) {
  const db = ctx.db, w = db.wallets[ctx.uid] || { saldo: 0, retenido: 0 };
  const opciones = PAGOS.filter(p => p.id !== "Saldo RAPIDIN" || db.config.saldoClienteHabilitado);
  if (!opciones.some(p => p.id === deliv.pago)) deliv.pago = "Efectivo";
  const disp = api.saldoDisponible(w);
  return `<section class="qa-card">
    <div class="qa-h"><h3>Pago</h3><span class="hint-s">Pagas recién al aceptar una oferta</span></div>
    <div class="pay-pills" role="radiogroup" aria-label="Medio de pago">${opciones.map(p => `
      <label class="pay-pill"><input type="radio" name="pago" value="${p.id}" data-change="pago" ${deliv.pago === p.id ? "checked" : ""}>${payLogo(p.id, "xs")}<span>${SHORT[p.id] || p.id}${p.id === "Saldo RAPIDIN" ? ` <small>${sol(disp)}</small>` : ""}</span></label>`).join("")}</div>
    <p class="banner warn" id="saldoWarn" style="margin:10px 0 0" ${deliv.pago === "Saldo RAPIDIN" && montoRef != null && disp < montoRef ? "" : "hidden"}>Tu saldo (${sol(disp)}) no alcanza para los productos. Recarga o elige otro medio.</p>
  </section>`;
}
/** Barra fija inferior con el resumen y el botón principal: siempre a la vista. */
function actionBar(label, disabled) {
  return `<div class="qa-bar"><div class="qa-bar-in"><div class="qa-sum" id="qaSum"></div><button class="btn" type="submit" ${disabled ? "disabled" : ""}>${esc(label)}</button></div><p class="err qa-err" id="qaErr" role="alert"></p></div>`;
}
function delivLabel(ctx) {
  const d = (ctx.user.direcciones || []).find(x => x.id === deliv.addrId);
  return d ? d.nombre : deliv.pos ? "Punto en el mapa" : `<span class="warn-t">Falta la entrega</span>`;
}
function setHint() { const h = $("#dHint"); if (h) h.textContent = draft.pickMode === "tienda" ? "Toca el mapa donde está el local" : deliv.pos ? "" : "Marca dónde lo recibes"; }
function mountDelivery(root, ctx, onChange) {
  const el = $("#dMap", root); if (!el) return;
  const db = ctx.db;
  const extra = () => {
    const m = [], shop = onChange?.shop?.();
    if (shop) m.push({ pos: shop, type: "tienda", label: onChange.shopLabel?.() });
    if (deliv.pos) m.push({ pos: deliv.pos, type: "entrega", label: "Entrega" });
    return { markers: m, route: shop && deliv.pos ? [shop, deliv.pos] : null, plaza: db.config.puntoEstrategico.pos };
  };
  const picker = createPicker(el, extra, (p, eng) => {
    if (!p || (eng === "canvas" && p.x < MAP.mar + 0.03)) { toast(p ? "Ese punto cae en el mar. Toca una calle de Camaná." : "Ese punto está fuera de la zona de cobertura de Camaná.", "bad"); return; }
    if (onChange?.picking?.() === "tienda") onChange.pickShop(p);
    else { deliv.pos = p; if (deliv.addrId) { deliv.addrId = null; $$("[data-act=addr]", root).forEach(b => b.setAttribute("aria-pressed", String(!b.dataset.id))); } }
    picker.redraw(); setHint(); onChange?.changed?.();
  });
  if (deliv.pos) picker.focus(deliv.pos, 16);
  setHint();
  return picker;
}
function showMapBox(show) { const box = $("#dlBox"); if (!box) return; box.hidden = !show; if (show) requestAnimationFrame(() => currentPicker?.redraw()); }
const delivActions = {
  addr(b, ctx) {
    const d = (ctx.user.direcciones || []).find(x => x.id === b.dataset.id);
    if (d) Object.assign(deliv, { pos: d.pos, referencia: d.referencia, addrId: d.id }); else Object.assign(deliv, { addrId: null, referencia: "" });
    $$("[data-act=addr]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#dRef").value = deliv.referencia;
    showMapBox(!d || draft.pickMode === "tienda"); currentPicker?.redraw(); if (!d && deliv.pos) currentPicker?.focus(deliv.pos, 16);
    setHint(); barRefresh?.(ctx);
  },
  gps(b, ctx) {
    if (!navigator.geolocation) return toast("Este navegador no permite usar tu ubicación.", "bad");
    b.disabled = true;
    navigator.geolocation.getCurrentPosition(g => {
      b.disabled = false;
      const p = latLngToPos({ lat: g.coords.latitude, lng: g.coords.longitude });
      if (!inZone(p)) return toast("Tu ubicación está fuera de la zona de cobertura de Camaná.", "bad");
      Object.assign(deliv, { pos: p, addrId: null }); currentPicker?.redraw(); currentPicker?.focus(p, 17); setHint(); barRefresh?.(ctx);
    }, e => { b.disabled = false; toast(e.code === 1 ? "No diste permiso de ubicación. Toca el mapa para marcar el punto." : "No pudimos obtener tu ubicación. Toca el mapa.", "bad"); }, { enableHighAccuracy: true, timeout: 12000 });
  },
};
const delivChanges = {
  dsave(el) { deliv.guardar = el.checked; const n = $("#dName"); n.disabled = !el.checked; if (el.checked) n.focus(); },
  pago(el, ctx) { deliv.pago = el.value; barRefresh?.(ctx); },
};
const delivInputs = { dref(el) { deliv.referencia = el.value; }, dname(el) { deliv.nombreDir = el.value; } };
let currentPicker = null, barRefresh = null;
function validateDelivery(errEl) {
  if (!deliv.pos) { errEl.textContent = "Marca dónde recibes tu pedido."; showMapBox(true); $("#dlBox")?.scrollIntoView({ behavior: "smooth", block: "center" }); return false; }
  if (deliv.guardar && deliv.nombreDir.trim().length < 2) { errEl.textContent = "Escribe un nombre para guardar la dirección, por ejemplo «Casa»."; $("#dName")?.focus(); return false; }
  return true;
}
function maybeSaveAddress(ctx) {
  if (!deliv.guardar || deliv.addrId) return;
  const id = run(() => api.saveAddress(ctx.uid, { nombre: deliv.nombreDir, pos: deliv.pos, referencia: deliv.referencia }));
  if (id) Object.assign(deliv, { addrId: id, guardar: false, nombreDir: "" });
}

/* =========================================================
   Market: locales con catálogo
   ========================================================= */
const market = {
  title: "Market",
  render(ctx) {
    const live = Object.values(ctx.db.establishments).filter(e => e.activo && e.tiendaVirtual);
    const counts = {}; live.forEach(e => (e.etiquetas || []).forEach(t => (counts[t] = (counts[t] || 0) + 1)));
    const cats = ESPECIALIDADES.filter(([n]) => counts[n]);
    const c = ctx.state.mcat || "", sort = ctx.state.msort || "rec";
    return `<section class="mk-hero">
        <div><span class="mk-eyebrow">Market RAPIDIN · Camaná</span><h2>¿Qué se te antoja hoy?</h2><p>Precios del propio local. Los repartidores solo ofertan el envío.</p></div>
        <label class="mk-search"><span class="sr-only">Buscar</span><input class="in" type="search" placeholder="Busca pollo, pizza, un local o producto" value="${esc(ctx.state.mq || "")}" data-input="mq"></label>
      </section>
      ${catBar(cats.map(([n, ic]) => [n, ic, counts[n]]), c, "mcat", { keep: ctx.state.catScroll })}
      <div class="mk-tools">
        <div class="seg-pro" role="group" aria-label="Ordenar">${[["rec", "Recomendados"], ["rating", "Mejor calificados"], ["rapido", "Más rápidos"]].map(([k, l]) => `<button type="button" data-act="msort" data-s="${k}" aria-pressed="${sort === k}">${l}</button>`).join("")}</div>
        ${switchCtl("mopen", ctx.state.mopen, "Abiertos ahora", live.filter(e => storeOpen(e)).length)}
      </div>
      ${ctx.live("mk", () => storesGrid(ctx))}
      <p class="mk-foot">¿No encuentras lo que buscas? <a class="link" href="#cliente-nuevo">Pide lo que quieras</a> y los repartidores te ofertan.</p>`;
  },
  actions: {
    mcat(b, ctx) { ctx.state.mcat = b.dataset.c; ctx.state.catScroll = b.closest(".hs-track").scrollLeft; ctx.rerender(); },
    msort(b, ctx) { ctx.state.msort = b.dataset.s; ctx.rerender(); },
    store(b, ctx) { ctx.go("#cliente-tienda", { ...ctx.state, store: b.dataset.id }); },
  },
  mount() { initHScroll(); },
  changes: { mopen(el, ctx) { ctx.state.mopen = el.checked; ctx.refresh(); } },
  inputs: { mq(el, ctx) { ctx.state.mq = el.value; ctx.refresh(); } },
};
const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Puntaje para «Recomendados»: abierto, calificación con suficientes reseñas y algo de cercanía al centro. */
const recScore = (e, db) => (storeOpen(e) ? 10 : 0) + (e.rating || 0) * Math.min(1, (e.ratingCount || 0) / 30) - roadKm(db.config.puntoEstrategico.pos, e.pos) * 0.15;
function storeCard(e, db, hit = []) {
  const open = storeOpen(e), n = Object.values(db.products).filter(p => p.tiendaId === e.id && p.disponible).length;
  return `<button type="button" class="store-card${open ? "" : " closed"}" data-act="store" data-id="${e.id}">
    <span class="sc-cover${e.portada ? " photo" : ""}" style="${coverStyle(e)}">${e.portada ? "" : `<span class="sc-emoji">${espIcon((e.etiquetas || [])[0])}</span>`}<span class="sc-status ${open ? "on" : ""}">${esc(statusLabel(e))}</span>${e.logo ? `<span class="sc-logo"><img src="${e.logo}" alt="" loading="lazy"></span>` : ""}</span>
    <span class="sc-body${e.logo ? " with-logo" : ""}"><span class="sc-top"><b>${esc(e.nombre)}</b>${ratingTag(e)}</span>
    <span class="sc-meta">${tagsLine(e)}</span>
    <span class="sc-addr">${e.tiempoPrep ? `${e.tiempoPrep}–${e.tiempoPrep + 15} min · ` : ""}${n} productos</span>${hit.length ? `<span class="sc-hit">Tiene: ${hit.map(esc).join(", ")}</span>` : ""}</span>
  </button>`;
}
function storesGrid(ctx) {
  const db = ctx.db, q = norm((ctx.state.mq || "").trim()), c = ctx.state.mcat || "", sort = ctx.state.msort || "rec";
  const prods = Object.values(db.products);
  let list = Object.values(db.establishments).filter(e => e.activo && e.tiendaVirtual && (!c || (e.etiquetas || []).includes(c)) && (!ctx.state.mopen || storeOpen(e)));
  const hits = e => q ? prods.filter(p => p.tiendaId === e.id && norm(p.nombre).includes(q)).slice(0, 2).map(p => p.nombre) : [];
  if (q) list = list.filter(e => norm(`${e.nombre} ${e.categoria} ${(e.etiquetas || []).join(" ")} ${e.descripcion}`).includes(q) || hits(e).length);
  const by = { rec: (a, b) => recScore(b, db) - recScore(a, db), rating: (a, b) => storeOpen(b) - storeOpen(a) || (b.rating || 0) - (a.rating || 0) || b.ratingCount - a.ratingCount, rapido: (a, b) => storeOpen(b) - storeOpen(a) || (a.tiempoPrep || 99) - (b.tiempoPrep || 99) };
  list.sort(by[sort]);
  if (!list.length) return empty("No encontramos locales", q ? `Nada coincide con «${ctx.state.mq}». Prueba otra palabra o usa Compra libre.` : "Aún no hay locales en esta categoría.");
  const top = !q && !c && sort === "rec" ? [...list].filter(e => e.ratingCount >= 20).sort((a, b) => b.rating - a.rating).slice(0, 3) : [];
  return `${top.length ? `<section class="mk-sec"><div class="mk-sec-h"><h3>⭐ Mejor calificados en Camaná</h3><button class="link" type="button" data-act="msort" data-s="rating">Ver ranking</button></div>
      <div class="top-grid">${top.map((e, i) => `<button type="button" class="top-card" data-act="store" data-id="${e.id}"><span class="tc-rank">${i + 1}</span>${storeLogo(e, "lg")}<span class="tc-t"><b>${esc(e.nombre)}</b><small>${tagsLine(e)}</small>${ratingTag(e)}<span class="sc-status ${storeOpen(e) ? "on" : ""}">${esc(statusLabel(e))}</span></span></button>`).join("")}</div></section>` : ""}
    <section class="mk-sec"><div class="mk-sec-h"><h3>${c ? `${espIcon(c)} ${esc(c)}` : q ? "Resultados" : "Todos los locales"} <small>${list.length}</small></h3></div>
    <div class="store-grid">${list.map(e => storeCard(e, db, hits(e))).join("")}</div></section>`;
}

/* ---------- Página del local ---------- */
const tienda = {
  title: "Local", parent: "market", static: true,
  mount() { initHScroll(); },
  render(ctx) {
    const db = ctx.db, e = db.establishments[ctx.state.store];
    if (!e || !e.activo || !e.tiendaVirtual) return empty("Este local no está disponible", "Vuelve al Market para ver los locales abiertos.", `<a class="btn small" href="#cliente-market">Ir al Market</a>`);
    const open = storeOpen(e);
    const prods = Object.values(db.products).filter(p => p.tiendaId === e.id).sort((a, b) => a.orden - b.orden);
    const secciones = [...new Set(prods.map(p => p.seccion))];
    return `<a class="back" href="#cliente-market">← Market</a>
    <section class="store-head${e.portada ? " photo" : ""}" style="${coverStyle(e)}">
      ${e.logo ? `<span class="sh-ic logo"><img src="${e.logo}" alt="Logo de ${esc(e.nombre)}"></span>` : `<span class="sh-ic">${(e.etiquetas || []).length ? `<span class="sh-emo">${espIcon(e.etiquetas[0])}</span>` : catIcon(e.categoria, "xl")}</span>`}
      <div class="sh-main"><span class="sh-badges"><span class="sc-status ${open ? "on" : ""}">${esc(statusLabel(e))}</span>${ratingTag(e)}</span><h2>${esc(e.nombre)}</h2><p>${esc(e.descripcion || e.categoria)}</p>
        <div class="sh-meta">${(e.etiquetas || []).length ? `<span>${tagsLine(e)}</span>` : ""}<span>${esc(e.direccion)}</span><span>${esc(hoursLabel(e))}</span>${e.tiempoPrep ? `<span>Preparación ~${e.tiempoPrep} min</span>` : ""}</div></div>
    </section>
    ${open ? "" : `<div class="banner warn">Este local está cerrado ahora. Puedes ver el catálogo, pero solo podrás pedir dentro de su horario (${esc(hoursLabel(e))}).</div>`}
    <div class="grid-2 wide-left store-body">
      <div class="stack">
        ${secciones.length > 1 ? `<nav class="hs sec-nav" aria-label="Secciones del catálogo">
          <button type="button" class="hs-arrow prev" data-hs-dir="-1" aria-label="Secciones anteriores" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
          <div class="hs-track">${secciones.map((s, i) => `<a href="#cliente-tienda" data-act="jump" data-s="${i}">${esc(s)}</a>`).join("")}</div>
          <button type="button" class="hs-arrow next" data-hs-dir="1" aria-label="Más secciones" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button></nav>` : ""}
        ${secciones.map((s, i) => `<section class="card" id="sec-${i}"><h2 class="card-t">${esc(s)}</h2><div class="prod-list">${prods.filter(p => p.seccion === s).map(p => `
          <article class="prod${p.disponible ? "" : " off"}">${productThumb(p, e.categoria)}
            <div class="pr-main"><b>${esc(p.nombre)}</b>${p.descripcion ? `<span>${esc(p.descripcion)}</span>` : ""}<strong>${sol(p.precio)}</strong></div>
            <div class="pr-ctl" data-ctl="${p.id}">${ctlHtml(p, open && p.disponible, e.id)}</div>
          </article>`).join("")}</div></section>`).join("") || empty("Catálogo vacío", "Este local todavía no publicó productos.")}
        <section class="card"><div class="card-head"><h2 class="card-t">Opiniones</h2>${ratingTag(e)}</div>
          ${(e.resenas || []).length ? `<ul class="reviews">${e.resenas.slice(0, 6).map(r => `<li><div><b>${esc(r.por)}</b><span class="rv-st">${"★".repeat(r.estrellas)}<i>${"★".repeat(5 - r.estrellas)}</i></span><small>${ago(r.t)}</small></div><p>${esc(r.texto)}</p></li>`).join("")}</ul>` : `<p class="muted">Aún no hay opiniones escritas. Después de recibir tu pedido podrás calificar este local.</p>`}</section>
      </div>
      <aside class="cart-aside"><section class="card" id="cartBox">${cartHtml(ctx)}</section></aside>
    </div>
    <div class="cart-bar" id="cartBar">${cartBarHtml(ctx)}</div>`;
  },
  actions: {
    add(b, ctx) {
      const pid = b.dataset.id, sid = b.dataset.s;
      const go = () => { if (cart.tiendaId !== sid) { cart = { tiendaId: sid, items: {}, nota: "" }; } setQty(pid, (cart.items[pid] || 0) + 1); refreshCart(ctx); };
      if (cart.tiendaId && cart.tiendaId !== sid && cartCount()) {
        const other = ctx.db.establishments[cart.tiendaId]?.nombre || "otro local";
        return confirmModal("¿Empezar un carrito nuevo?", `Tu carrito tiene productos de ${other}. Cada pedido del Market es de un solo local.`, "Vaciar y agregar", go);
      }
      go();
    },
    inc(b, ctx) { setQty(b.dataset.id, (cart.items[b.dataset.id] || 0) + 1); refreshCart(ctx); },
    dec(b, ctx) { setQty(b.dataset.id, (cart.items[b.dataset.id] || 0) - 1); refreshCart(ctx); },
    checkout(b, ctx) { ctx.go("#cliente-checkout", { ...ctx.state }); },
    jump(b, ev) { document.getElementById(`sec-${b.dataset.s}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); },
  },
};
function ctlHtml(p, canBuy, sid) {
  if (!p.disponible) return `<span class="chip muted">Agotado</span>`;
  const q = cart.tiendaId === sid ? cart.items[p.id] || 0 : 0;
  if (!q) return `<button class="add-btn" type="button" data-act="add" data-id="${p.id}" data-s="${sid}" ${canBuy ? "" : "disabled"} aria-label="Agregar ${esc(p.nombre)}">+</button>`;
  return `<div class="stepper"><button type="button" data-act="dec" data-id="${p.id}" aria-label="Quitar uno">−</button><b>${q}</b><button type="button" data-act="inc" data-id="${p.id}" aria-label="Agregar uno">+</button></div>`;
}
function cartHtml(ctx) {
  const db = ctx.db, lines = cartLines(db), e = db.establishments[cart.tiendaId];
  if (!lines.length) return `<h2 class="card-t">Tu carrito</h2><p class="muted">Agrega productos para armar tu pedido.</p>`;
  return `<h2 class="card-t">Tu carrito</h2><p class="hint-s" style="margin:-8px 0 10px">${esc(e?.nombre || "")}</p>
    <ul class="items">${lines.map(l => `<li><span class="qty">${l.q}×</span><span class="it-name">${esc(l.p.nombre)}</span><b>${sol(l.p.precio * l.q)}</b></li>`).join("")}</ul>
    <div class="items-total"><span>Subtotal</span><b>${sol(cartSubtotal(db))}</b></div>
    <p class="hint-s" style="margin:6px 0 14px">El envío lo ofertan los repartidores. Tú eliges la mejor oferta.</p>
    <button class="btn" type="button" data-act="checkout" style="width:100%;justify-content:center" ${e && storeOpen(e) ? "" : "disabled"}>Continuar</button>`;
}
function cartBarHtml(ctx) {
  const n = cartCount(); if (!n) return "";
  return `<button type="button" class="cart-bar-btn" data-act="checkout"><span class="cb-n">${n}</span><span>Ver carrito</span><b>${sol(cartSubtotal(ctx.db))}</b></button>`;
}
function refreshCart(ctx) {
  const db = ctx.db, e = db.establishments[ctx.state.store];
  $$("[data-ctl]").forEach(el => { const p = db.products[el.dataset.ctl]; if (p) el.innerHTML = ctlHtml(p, storeOpen(e) && p.disponible, e.id); });
  const box = $("#cartBox"); if (box) box.innerHTML = cartHtml(ctx);
  const bar = $("#cartBar"); if (bar) bar.innerHTML = cartBarHtml(ctx);
}

/* ---------- Confirmar pedido del Market ---------- */
const checkout = {
  title: "Confirmar pedido", parent: "market", static: true,
  render(ctx) {
    initDeliv(ctx.user);
    const db = ctx.db, e = db.establishments[cart.tiendaId], lines = cartLines(db);
    if (!e || !lines.length) return empty("Tu carrito está vacío", "Elige un local del Market y agrega productos.", `<a class="btn small" href="#cliente-market">Ir al Market</a>`);
    const open = storeOpen(e);
    return `<form class="qa" data-form="confirm" novalidate>
      <a class="back" href="#cliente-tienda" data-act="backStore">← Seguir comprando</a>
      <section class="qa-card">
        <div class="co-store">${storeLogoMini(e)}<div><b>${esc(e.nombre)}</b><small class="${open ? "pos" : "warn-t"}">${esc(statusLabel(e))}</small></div></div>
        <div id="coItems">${coItemsHtml(ctx)}</div>
        ${cart.nota ? "" : `<button type="button" class="link add-note" data-act="note">+ Agregar indicaciones</button>`}
        <textarea class="in sm" id="coNota" rows="2" data-input="nota" placeholder="Ej.: Pollo con ají aparte." maxlength="200" ${cart.nota ? "" : "hidden"} aria-label="Indicaciones para el local">${esc(cart.nota || "")}</textarea>
      </section>
      ${deliveryBlock(ctx)}
      ${paymentBlock(ctx, cartSubtotal(db))}
      <p class="qa-foot">El envío lo ofertan los repartidores en segundos. Eliges uno y recién ahí pagas. Solo él verá tu WhatsApp.</p>
      ${actionBar(open ? "Pedir ahora" : "Local cerrado", !open)}
    </form>`;
  },
  mount(root, ctx) {
    const e = ctx.db.establishments[cart.tiendaId]; if (!e) return;
    draft.pickMode = "entrega";
    currentPicker = mountDelivery(root, ctx, { shop: () => e.pos, shopLabel: () => e.nombre, changed: () => barRefresh(ctx) });
    barRefresh = c => { const el = $("#qaSum"); if (!el) return; el.innerHTML = `<b>${sol(cartSubtotal(c.db))} <small>+ envío</small></b><span>${cartCount()} producto${cartCount() === 1 ? "" : "s"} · ${delivLabel(c)} · ${esc(SHORT[deliv.pago] || deliv.pago)}</span>`; const w = $("#saldoWarn"); if (w) w.hidden = !(deliv.pago === "Saldo RAPIDIN" && api.saldoDisponible(c.db.wallets[c.uid] || {}) < cartSubtotal(c.db)); };
    barRefresh(ctx);
  },
  actions: {
    ...delivActions,
    backStore(b, ctx) { ctx.go("#cliente-tienda", { ...ctx.state, store: cart.tiendaId }); },
    note(b) { b.remove(); const t = $("#coNota"); t.hidden = false; t.focus(); },
    inc(b, ctx) { setQty(b.dataset.id, (cart.items[b.dataset.id] || 0) + 1); refreshCheckout(ctx); },
    dec(b, ctx) { setQty(b.dataset.id, (cart.items[b.dataset.id] || 0) - 1); if (!cartCount()) return ctx.rerender(); refreshCheckout(ctx); },
  },
  changes: { ...delivChanges },
  inputs: { ...delivInputs, nota(el) { cart.nota = el.value; saveCart(); } },
  forms: {
    confirm(f, ctx) {
      const err = $("#qaErr"); err.textContent = "";
      if (!validateDelivery(err)) return;
      const items = Object.entries(cart.items).map(([productId, cantidad]) => ({ productId, cantidad }));
      const id = run(() => api.createOrder(ctx.uid, { modalidad: "catalogo", tiendaId: cart.tiendaId, items, nota: cart.nota, entrega: { pos: deliv.pos, referencia: deliv.referencia.trim() }, pago: deliv.pago }), "Pedido publicado. Ya estamos buscando repartidores.");
      if (!id) return;
      maybeSaveAddress(ctx);
      cart = { tiendaId: null, items: {}, nota: "" }; saveCart();
      ctx.go("#cliente-pedido", { id });
    },
  },
};
const storeLogoMini = e => storeLogo(e);
function coItemsHtml(ctx) {
  return `<ul class="items editable">${cartLines(ctx.db).map(l => `<li><span class="it-name">${esc(l.p.nombre)}<small>${sol(l.p.precio)} c/u</small></span>
    <div class="stepper sm"><button type="button" data-act="dec" data-id="${l.p.id}" aria-label="Quitar uno">−</button><b>${l.q}</b><button type="button" data-act="inc" data-id="${l.p.id}" aria-label="Agregar uno">+</button></div><b>${sol(l.p.precio * l.q)}</b></li>`).join("")}</ul>`;
}
function refreshCheckout(ctx) { $("#coItems").innerHTML = coItemsHtml(ctx); barRefresh?.(ctx); }

/* =========================================================
   Pedido libre o en un local: una sola pantalla corta
   ========================================================= */
const SUGS = [
  ["Bebidas y hielo", "2 gaseosas de 3 L y una bolsa de hielo"],
  ["Farmacia", "De la farmacia: "],
  ["Bodega", "De la bodega: 1 kg de arroz, 1 L de aceite y "],
  ["Llevar un paquete", "Recoger un paquete en  y llevarlo a mi dirección"],
  ["Menú del día", "Un menú del día con "],
];
const draft = { shopq: "", shopCat: "", shopAll: false, modalidad: "libre", tiendaId: "", otra: { nombre: "", direccion: "", pos: null }, pickMode: "entrega", descripcion: "" };
const nuevo = {
  title: "Pedir", static: true,
  render(ctx) {
    initDeliv(ctx.user);
    const { db } = ctx;
    const zonaOk = db.zones.camana.activa;
    return `${zonaOk ? "" : `<div class="banner bad">Por ahora RAPIDIN no está recibiendo pedidos en Camaná. Vuelve a intentarlo más tarde.</div>`}
    <form class="qa" data-form="crear" novalidate>
      <section class="qa-card qa-main">
        <h2 class="qa-title">¿Qué te traemos?</h2>
        <p class="qa-sub">Escríbelo como se lo dirías a alguien. Los repartidores te mandan su precio y tú eliges.</p>
        <textarea class="in qa-text" id="nDesc" rows="3" data-input="desc" maxlength="500" placeholder="Ej.: 2 gaseosas de 3 L, una bolsa de hielo y vasos" aria-label="Qué necesitas">${esc(draft.descripcion)}</textarea>
        <div class="sug-row" aria-label="Ideas rápidas">${SUGS.map(([t, v], i) => `<button type="button" class="sug" data-act="sug" data-i="${i}">${esc(t)}</button>`).join("")}</div>
        <div class="seg2" role="radiogroup" aria-label="Dónde comprar">
          <label><input type="radio" name="modalidad" value="libre" data-change="mod" ${draft.modalidad === "libre" ? "checked" : ""}><span><b>Donde convenga</b><small>El repartidor elige dónde comprar</small></span></label>
          <label><input type="radio" name="modalidad" value="tienda" data-change="mod" ${draft.modalidad === "tienda" ? "checked" : ""}><span><b>En un local</b><small>Tú eliges el local</small></span></label>
        </div>
        <div id="tiendaBox" ${draft.modalidad === "tienda" ? "" : "hidden"}>
          ${(() => { const cnt = {}; Object.values(ctx.db.establishments).filter(e => e.activo).forEach(e => (e.etiquetas || []).forEach(t => (cnt[t] = (cnt[t] || 0) + 1))); const items = ESPECIALIDADES.filter(([n]) => cnt[n]).map(([n, ic]) => [n, ic]); return items.length ? catBar(items, draft.shopCat || "", "shopCat", { all: "Todos", label: "Categorías de locales" }) : ""; })()}
          <input class="in sm" type="search" id="shopQ" value="${esc(draft.shopq || "")}" data-input="shopq" placeholder="Busca un local: pollería, chifa, farmacia…" aria-label="Buscar local">
          <div class="shop-list" id="shopList" role="radiogroup" aria-label="Local">${shopListHtml(ctx)}</div>
          <div id="otraBox" ${draft.tiendaId === "otra" ? "" : "hidden"}>
            <div class="two"><input class="in sm" id="nOtraN" value="${esc(draft.otra.nombre)}" data-input="otra" placeholder="Nombre del local" aria-label="Nombre del local">
            <input class="in sm" id="nOtraD" value="${esc(draft.otra.direccion)}" data-input="otra" placeholder="Dirección o referencia" aria-label="Dirección del local"></div>
            <button type="button" class="loc-chip" data-act="pickShop">${PIN} <span id="pickTxt">${draft.otra.pos ? "Local marcado · mover" : "Marcar el local en el mapa"}</span></button>
          </div>
        </div>
      </section>
      ${deliveryBlock(ctx)}
      ${paymentBlock(ctx, null)}
      <p class="qa-foot">Si algo cambia en tu pedido, el repartidor te pide autorización. ¿Quieres precios fijos? Compra en el <a class="link" href="#cliente-market">Market</a>.</p>
      ${actionBar("Publicar pedido", !zonaOk)}
    </form>`;
  },
  mount(root, ctx) {
    currentPicker = mountDelivery(root, ctx, {
      shop: () => shopPos(ctx.db), shopLabel: () => (draft.tiendaId === "otra" ? draft.otra.nombre || "Local" : ctx.db.establishments[draft.tiendaId]?.nombre),
      picking: () => draft.pickMode, pickShop: p => { draft.otra.pos = p; setPick("entrega"); },
      changed: () => barRefresh(ctx),
    });
    barRefresh = c => {
      const el = $("#qaSum"); if (!el) return;
      const t = draft.modalidad === "tienda" ? (draft.tiendaId === "otra" ? draft.otra.nombre || "Otro local" : c.db.establishments[draft.tiendaId]?.nombre || `<span class="warn-t">Elige el local</span>`) : "Donde convenga";
      el.innerHTML = `<b>Precio por ofertas</b><span>${t} · ${delivLabel(c)} · ${esc(SHORT[deliv.pago] || deliv.pago)}</span>`;
    };
    barRefresh(ctx);
    if (!draft.descripcion) setTimeout(() => $("#nDesc")?.focus({ preventScroll: true }), 60);
    initHScroll(root);
  },
  changes: {
    ...delivChanges,
    mod(el, ctx) { draft.modalidad = el.value; $("#tiendaBox").hidden = el.value !== "tienda"; requestAnimationFrame(() => initHScroll()); if (el.value !== "tienda") setPick("entrega"); currentPicker?.redraw(); barRefresh(ctx); },
  },
  inputs: { ...delivInputs, desc(el) { draft.descripcion = el.value; }, shopq(el, ctx) { draft.shopq = el.value; draft.shopAll = false; $("#shopList").innerHTML = shopListHtml(ctx); }, otra(el, ctx) { draft.otra.nombre = $("#nOtraN").value; draft.otra.direccion = $("#nOtraD").value; barRefresh(ctx); } },
  actions: {
    ...delivActions,
    sug(b) { const t = $("#nDesc"), v = SUGS[+b.dataset.i][1]; t.value = t.value.trim() ? `${t.value.trim()}\n${v}` : v; draft.descripcion = t.value; t.focus(); const k = v.indexOf("  "); const pos = t.value.length - (k >= 0 ? v.length - k - 1 : 0); t.setSelectionRange(pos, pos); },
    shopAll(b, ctx) { draft.shopAll = true; $("#shopList").innerHTML = shopListHtml(ctx); },
    shopCat(b, ctx) { draft.shopCat = b.dataset.c; draft.shopAll = false; b.closest(".hs-track").querySelectorAll(".cat-chip").forEach(x => x.setAttribute("aria-pressed", String(x === b))); $("#shopList").innerHTML = shopListHtml(ctx); },
    shop(b, ctx) {
      draft.tiendaId = b.dataset.id;
      $("#shopList").innerHTML = shopListHtml(ctx);
      $("#otraBox").hidden = draft.tiendaId !== "otra";
      if (draft.tiendaId === "otra") { if (!draft.otra.pos) setPick("tienda"); $("#nOtraN").focus(); } else setPick("entrega");
      currentPicker?.redraw(); barRefresh(ctx);
    },
    pickShop() { setPick(draft.pickMode === "tienda" ? "entrega" : "tienda"); },
    goStore(b, ctx) { ctx.go("#cliente-tienda", { store: b.dataset.id }); },
  },
  forms: {
    crear(f, ctx) {
      const err = $("#qaErr"); err.textContent = "";
      const db = ctx.db;
      if (draft.descripcion.trim().length < 6) { $("#nDesc").focus(); return (err.textContent = "Cuéntanos qué necesitas con un poco más de detalle."); }
      let tienda = null;
      if (draft.modalidad === "tienda") {
        if (!draft.tiendaId) { $("#tiendaBox").scrollIntoView({ behavior: "smooth", block: "center" }); return (err.textContent = "Elige el local donde compramos."); }
        if (draft.tiendaId === "otra") {
          if (draft.otra.nombre.trim().length < 3 || draft.otra.direccion.trim().length < 4) { $("#nOtraN").focus(); return (err.textContent = "Escribe el nombre y la dirección del local."); }
          if (!draft.otra.pos) { setPick("tienda"); return (err.textContent = "Marca en el mapa dónde está el local."); }
          tienda = { id: null, nombre: draft.otra.nombre.trim(), direccion: draft.otra.direccion.trim(), pos: draft.otra.pos };
        } else { const e = db.establishments[draft.tiendaId]; tienda = { id: e.id, nombre: e.nombre, direccion: e.direccion, pos: e.pos }; }
      }
      if (!validateDelivery(err)) return;
      const id = run(() => api.createOrder(ctx.uid, { modalidad: draft.modalidad, descripcion: draft.descripcion, tienda, entrega: { pos: deliv.pos, referencia: deliv.referencia.trim() }, pago: deliv.pago }), "Pedido publicado. Ya estamos buscando repartidores.");
      if (!id) return;
      maybeSaveAddress(ctx);
      Object.assign(draft, { shopq: "", shopCat: "", shopAll: false, modalidad: "libre", descripcion: "", tiendaId: "", otra: { nombre: "", direccion: "", pos: null }, pickMode: "entrega" });
      ctx.go("#cliente-pedido", { id });
    },
  },
};
/** Lista vertical de locales para «En un local»: abiertos y mejor calificados primero, con buscador. */
function shopListHtml(ctx) {
  const db = ctx.db, q = norm((draft.shopq || "").trim());
  let list = Object.values(db.establishments).filter(e => e.activo && (!draft.shopCat || (e.etiquetas || []).includes(draft.shopCat)));
  if (q) list = list.filter(e => norm(`${e.nombre} ${e.categoria} ${(e.etiquetas || []).join(" ")} ${e.descripcion || ""}`).includes(q));
  list.sort((a, b) => (b.id === draft.tiendaId) - (a.id === draft.tiendaId) || storeOpen(b) - storeOpen(a) || (b.rating || 0) - (a.rating || 0));
  const max = draft.shopAll || q ? 99 : 5, more = list.length - max;
  const row = e => { const o = storeOpen(e), sel = draft.tiendaId === e.id;
    return `<button type="button" class="shop-row${sel ? " sel" : ""}${o ? "" : " off"}" data-act="shop" data-id="${e.id}" role="radio" aria-checked="${sel}" ${o ? "" : "disabled"}>
      ${storeLogo(e)}<span class="sr-main"><span class="sr-top"><b>${esc(e.nombre)}</b>${ratingTag(e)}</span><small>${tagsLine(e)}</small><small class="${o ? "pos" : ""}">${esc(statusLabel(e))}${e.tiendaVirtual ? " · Tiene catálogo" : ""}</small></span><span class="sr-radio" aria-hidden="true"></span></button>`; };
  const sel = db.establishments[draft.tiendaId];
  return `${list.slice(0, max).map(row).join("") || `<p class="muted" style="padding:8px 4px">No encontramos «${esc(draft.shopq)}». Usa «Otro local» y escribe cuál.</p>`}
    ${more > 0 ? `<button type="button" class="link shop-more" data-act="shopAll">Ver ${more} local${more > 1 ? "es" : ""} más</button>` : ""}
    <button type="button" class="shop-row add${draft.tiendaId === "otra" ? " sel" : ""}" data-act="shop" data-id="otra" role="radio" aria-checked="${draft.tiendaId === "otra"}"><span class="cat-badge plus">+</span><span class="sr-main"><b>Otro local</b><small>No está en la lista: escribe cuál y márcalo en el mapa</small></span><span class="sr-radio" aria-hidden="true"></span></button>
    ${sel?.tiendaVirtual && sel.activo ? `<a class="cat-hint" href="#cliente-tienda" data-act="goStore" data-id="${sel.id}">🛍️ ${esc(sel.nombre)} tiene catálogo con precios fijos. <b>Ver catálogo →</b></a>` : ""}`;
}
function shopPos(db) {
  if (draft.modalidad !== "tienda") return null;
  if (draft.tiendaId === "otra") return draft.otra.pos;
  return db.establishments[draft.tiendaId]?.pos || null;
}
function setPick(mode) {
  draft.pickMode = mode;
  const t = $("#pickTxt"); if (t) t.textContent = mode === "tienda" ? "Toca el mapa donde está el local" : draft.otra.pos ? "Local marcado · mover" : "Marcar el local en el mapa";
  $("[data-act=pickShop]")?.setAttribute("aria-pressed", String(mode === "tienda"));
  if (mode === "tienda") { showMapBox(true); $("#dlBox")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  else if (deliv.addrId) showMapBox(false);
  setHint(); currentPicker?.redraw();
}

const pedidos = {
  title: "Mis pedidos",
  render(ctx) {
    const tab = ctx.state.tab || "curso";
    return `<div class="toolbar">
      <div class="seg-sm" role="tablist">
        <button type="button" role="tab" data-act="tab" data-tab="curso" aria-selected="${tab === "curso"}">En curso</button>
        <button type="button" role="tab" data-act="tab" data-tab="historial" aria-selected="${tab === "historial"}">Historial</button>
      </div>
      <div class="row-btns"><a class="btn small ghost-dark" href="#cliente-nuevo">Pedido libre</a><a class="btn small" href="#cliente-market">Ir al Market</a></div></div>
      ${ctx.live("lista", () => list(ctx, tab))}`;
  },
  actions: { tab(b, ctx) { ctx.state.tab = b.dataset.tab; ctx.rerender(); }, open(b, ctx) { ctx.go("#cliente-pedido", { id: b.dataset.id }); } },
};
function list(ctx, tab) {
  const db = ctx.db, all = mine(db, ctx.uid).filter(o => (tab === "curso" ? isOpen(o) : !isOpen(o)));
  if (!all.length) return tab === "curso" ? empty("No tienes pedidos en curso", "Compra en el Market o haz un pedido libre y recibe ofertas de repartidores de Camaná.", `<a class="btn small" href="#cliente-market">Ir al Market</a>`) : empty("Aún no tienes historial", "Aquí verás tus pedidos entregados y cancelados.");
  return `<div class="cards">${all.map(o => {
    const act = Object.values(o.offers).filter(x => x.estado === "activa").length;
    return `<button type="button" class="order-card" data-act="open" data-id="${o.id}">
      <div class="oc-top"><b>${o.codigo}</b>${chip(o.estado)}</div>
      <p class="oc-desc">${esc(o.descripcion)}</p>
      <div class="oc-meta"><span>${esc(api.MODALIDAD[o.modalidad])}${o.tienda ? ` · ${esc(o.tienda.nombre)}` : ""}</span><span>${ago(o.creado)}</span></div>
      <div class="oc-foot">${o.precioTotal != null ? `<b>${sol(o.precioTotal)}</b>` : act ? `<b class="accent">${act} ${act === 1 ? "oferta" : "ofertas"} para elegir</b>` : `<span class="muted">Esperando ofertas…</span>`}<span class="muted">${esc(o.pago)}</span></div>
    </button>`;
  }).join("")}</div>`;
}

/* ---------- Detalle del pedido ---------- */
const CHAT_C = chatHandlers("cliente");
const pedido = {
  title: "Detalle del pedido", parent: "pedidos",
  render(ctx) {
    const o = ctx.db.orders[ctx.state.id];
    if (!o || o.clienteId !== ctx.uid) return empty("No encontramos este pedido", "Vuelve a tu lista de pedidos.", `<a class="btn small" href="#cliente-pedidos">Mis pedidos</a>`);
    return `<a class="back" href="#cliente-pedidos">← Mis pedidos</a>${ctx.live("det", () => detail(ctx))}${chatShell(ctx, "cliente")}`;
  },
  afterLive: CHAT_C.afterLive,
  forms: CHAT_C.forms,
  actions: {
    ...CHAT_C.actions,
    copy(b) { navigator.clipboard?.writeText(b.dataset.n).then(() => toast("Número copiado. Pégalo en tu app de pago."), () => toast(b.dataset.n)); },
    sort(b, ctx) { ctx.state.sort = b.dataset.sort; ctx.rerender(); },
    accept(b, ctx) {
      const o = ctx.db.orders[ctx.state.id], of = o.offers[b.dataset.id], u = ctx.db.users[of.courierId];
      modal("Aceptar oferta", `
        ${courierMini(ctx.db, of.courierId)}
        <dl class="kv" style="margin-top:14px">
          ${of.costoProductos ? `<div><dt>${o.modalidad === "catalogo" ? "Productos (precio del local)" : "Productos (estimado)"}</dt><dd>${sol(of.costoProductos)}</dd></div>` : ""}
          <div><dt>Envío</dt><dd>${sol(of.tarifa)}</dd></div>
          <div><dt>Precio total</dt><dd><b>${sol(of.total)}</b></dd></div>
          <div><dt>Tiempo estimado</dt><dd>${of.tiempo} min</dd></div>
          <div><dt>Pago</dt><dd>${esc(o.pago)}</dd></div>
        </dl>
        <p class="m-text">${o.pago === "Saldo RAPIDIN" ? `Retendremos ${sol(of.total)} de tu saldo y se descontarán al confirmar la entrega.` : api.METODOS_DIRECTOS.includes(o.pago) ? `Después de aceptar verás el ${esc(o.pago)} de ${esc(firstName(u.nombre))} para pagarle directamente.` : `Pagarás ${sol(of.total)} en efectivo al recibir.`} Las demás ofertas se cerrarán.</p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn teal" type="button" data-mact="ok">Aceptar oferta</button></div>`,
        { ok: () => { if (run(() => api.acceptOffer(ctx.uid, o.id, of.id), `Aceptaste la oferta de ${firstName(u.nombre)}.`)) closeModal(); } });
    },
    paid(b, ctx) { run(() => api.markOrderPaid(ctx.uid, ctx.state.id), "Listo. Avisamos al repartidor para que confirme tu pago."); },
    cancel(b, ctx) {
      const o = ctx.db.orders[ctx.state.id];
      modal("Cancelar pedido", `<form data-mform="c" novalidate>
        <p class="m-text">${o.courierId ? "El repartidor ya fue asignado. Le avisaremos que cancelaste." : "Se cerrarán las ofertas recibidas."}${o.pago === "Saldo RAPIDIN" && o.retencion ? " Liberaremos el monto retenido de tu saldo." : ""}</p>
        <div class="f"><label for="cMot">Motivo</label><select class="in" id="cMot" name="m"><option>Ya no lo necesito</option><option>Las ofertas son muy altas</option><option>Demora demasiado</option><option>Me equivoqué en los datos</option><option>Otro motivo</option></select></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn danger" type="submit">Cancelar pedido</button></div></form>`,
        { c: f => { if (run(() => api.cancelOrder(ctx.uid, o.id, f.m.value), "Pedido cancelado.")) closeModal(); } });
    },
    recv(b, ctx) { if (run(() => api.confirmDelivery(ctx.uid, ctx.state.id, true), "¡Gracias! Pedido cerrado.")) setTimeout(() => $("[data-act=rate]")?.click(), 400); },
    notRecv(b, ctx) {
      modal("¿No recibiste tu pedido?", `<form data-mform="nr" novalidate><p class="m-text">Avisaremos al repartidor y un administrador revisará el caso. También puedes escribirle por el chat.</p>
        <div class="f"><label for="nrT">¿Qué pasó? <span class="opt">· opcional</span></label><textarea class="in" id="nrT" name="t" rows="2" maxlength="200" placeholder="Ej.: Nadie tocó la puerta, estoy en casa."></textarea></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn danger" type="submit">No lo recibí</button></div></form>`,
        { nr: f => { if (run(() => api.confirmDelivery(ctx.uid, ctx.state.id, false, f.t.value), "Lo revisaremos y te escribiremos.")) closeModal(); } });
    },
    rate(b, ctx) {
      const o = ctx.db.orders[ctx.state.id], local = o.tienda?.id && ctx.db.establishments[o.tienda.id];
      const stars5 = (n, id) => `<div class="rate" role="radiogroup" aria-label="Calificación">${[1, 2, 3, 4, 5].map(k => `<input type="radio" name="${n}" id="${id}${k}" value="${k}" ${k === 5 ? "checked" : ""}><label for="${id}${k}" title="${k} estrellas">★</label>`).join("")}</div>`;
      modal("Califica tu pedido", `<form data-mform="r" novalidate>
        ${!o.calificacion ? `<div class="rate-block"><div class="person sm">${avatar(o.courierId, ctx.db.users[o.courierId].nombre)}<div><b>${esc(firstName(ctx.db.users[o.courierId].nombre))}</b><span>Repartidor</span></div></div>${stars5("s", "s")}</div>` : ""}
        ${local && !o.calificacionLocal ? `<div class="rate-block"><div class="person sm">${storeLogo(local)}<div><b>${esc(local.nombre)}</b><span>Local</span></div></div>${stars5("l", "l")}</div>` : ""}
        <div class="f"><label for="rCom">Comentario <span class="opt">· opcional${local ? ", se publica en el local" : ""}</span></label><textarea class="in" id="rCom" name="c" rows="2" maxlength="200" placeholder="¿Qué tal estuvo?"></textarea></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Después</button><button class="btn" type="submit">Enviar</button></div></form>`,
        { r: f => {
          let okAll = true;
          if (f.s) okAll = !!run(() => api.rateCourier(ctx.uid, o.id, +f.querySelector("input[name=s]:checked").value, f.c.value));
          if (okAll && f.querySelector("input[name=l]")) okAll = !!run(() => api.rateStore(ctx.uid, o.id, +f.querySelector("input[name=l]:checked").value, f.c.value));
          if (okAll) { toast("¡Gracias por calificar!"); closeModal(); }
        } });
    },
    report(b, ctx) { reportModal(ctx, ctx.state.id); },
    change(b, ctx) { run(() => api.approveOrderChange(ctx.uid, ctx.state.id, b.dataset.id, b.dataset.ok === "1"), b.dataset.ok === "1" ? "Cambio aprobado." : "Cambio rechazado."); },
  },
};
export function reportModal(ctx, orderId) {
  modal("Reportar un problema", `<form data-mform="rep" novalidate>
    <p class="m-text">Un administrador revisará tu reporte y te responderá por notificación.</p>
    <div class="f"><label for="repT">¿Qué pasó?</label><textarea class="in" id="repT" name="t" rows="4" placeholder="Ej.: El pedido llegó incompleto, faltó la gaseosa."></textarea></div>
    <p class="err" id="repErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Enviar reporte</button></div></form>`,
    { rep: f => { if (run(() => api.reportProblem(ctx.uid, orderId, f.t.value), "Reporte enviado.")) closeModal(); } });
}

function detail(ctx) {
  const db = ctx.db, o = db.orders[ctx.state.id];
  if (!o) return "";
  const offers = Object.values(o.offers).filter(x => x.estado === "activa");
  const sort = ctx.state.sort || "total";
  offers.sort((a, b) => sort === "rating" ? (db.couriers[b.courierId]?.rating || 0) - (db.couriers[a.courierId]?.rating || 0) : a[sort] - b[sort]);
  const canCancel = isOpen(o) && api.ESTADOS.indexOf(o.estado) < api.ESTADOS.indexOf("pedido_recogido");
  const pendingChange = o.cambios.find(c => c.estado === "pendiente");
  const cour = o.courierId ? db.couriers[o.courierId] : null, cu = o.courierId ? db.users[o.courierId] : null;

  let main = "";
  const confirmBox = o.estado === "por_confirmar" ? `<section class="card confirm-card">
      <div class="cc-ic" aria-hidden="true">📦</div>
      <div><h2>¿Recibiste tu pedido?</h2><p>${esc(firstName(cu.nombre))} lo marcó como entregado ${ago(o.entregaMarcada)}. Confírmalo para cerrar el pedido.</p></div>
      <div class="cc-btns"><button class="btn ghost-dark" type="button" data-act="notRecv">No lo recibí</button><button class="btn teal" type="button" data-act="recv">Sí, lo recibí</button></div>
      <small class="muted">Si no respondes en ${db.config.autoConfirmarMin || 30} minutos, lo damos por recibido.</small></section>`
    : o.estado === "en_revision" && o.entregaMarcada ? `<div class="banner warn">Estamos revisando la entrega de este pedido. Te escribiremos pronto; mientras, puedes hablar con ${esc(firstName(cu.nombre))} por el chat.</div>` : "";
  if (api.OPEN_STATES.includes(o.estado)) {
    main = `<section class="card">
      <div class="card-head"><h2 class="card-t">${offers.length ? `${offers.length} ${offers.length === 1 ? "oferta recibida" : "ofertas recibidas"}` : "Buscando repartidores…"}</h2>
      ${offers.length > 1 ? `<div class="seg-sm" role="group" aria-label="Ordenar ofertas">
        <button type="button" data-act="sort" data-sort="total" aria-pressed="${sort === "total"}">Menor precio</button>
        <button type="button" data-act="sort" data-sort="tiempo" aria-pressed="${sort === "tiempo"}">Más rápido</button>
        <button type="button" data-act="sort" data-sort="rating" aria-pressed="${sort === "rating"}">Mejor calificado</button></div>` : ""}</div>
      ${offers.length ? `<div class="offers">${offers.map(of => {
        const c = db.couriers[of.courierId], u = db.users[of.courierId];
        return `<article class="offer-row">
          ${avatar(of.courierId, u.nombre)}
          <div class="or-main"><b>${esc(u.nombre.split(" ").slice(0, 2).join(" "))}</b>
            <span class="meta">${stars(c.rating, c.ratingCount)} · ${c.completados} pedidos · ${of.tiempo} min</span>
            ${of.mensaje ? `<span class="msg">«${esc(of.mensaje)}»</span>` : ""}</div>
          <div class="or-side"><b class="price">${sol(of.total)}</b>
            <span class="meta">${o.modalidad === "catalogo" ? `Local ${sol(of.costoProductos)} + envío <b>${sol(of.tarifa)}</b>` : of.costoProductos ? `Productos ${sol(of.costoProductos)} + envío ${sol(of.tarifa)}` : `Envío ${sol(of.tarifa)}`}</span>
            <span class="meta">Vence en ${left(of.vence)}</span>
            <button class="btn small teal" type="button" data-act="accept" data-id="${of.id}">Aceptar</button></div>
        </article>`;
      }).join("")}</div>` : `<div class="searching"><span class="radar"></span><div><b>Tu solicitud está publicada</b><p class="muted">Avisamos a los repartidores disponibles en Camaná. Las ofertas aparecerán aquí.</p></div></div>`}
    </section>`;
  } else if (o.courierId && o.estado !== "cancelado") {
    const cuentas = (cour?.cuentasCobro || []).filter(c => c.tipo === o.pago && c.verificada);
    let pago = "";
    if (api.METODOS_DIRECTOS.includes(o.pago)) {
      pago = `<div class="paybox">
        <small>Datos de cobro · visibles solo para ti y solo en este pedido</small>
        ${cuentas.length ? cuentas.map(c => `<div class="pb-acc">${payLogo(c.tipo)}<div><b>${esc(c.tipo)}: ${fmtPhone(c.numero)}</b><small>Titular: ${esc(c.titular)}</small></div><button class="btn small ghost-dark" type="button" data-act="copy" data-n="${esc(c.numero)}">Copiar</button></div>`).join("") : `<b>El repartidor no tiene ${esc(o.pago)} verificado. Escríbele por el chat para coordinar.</b>`}
        <div class="pb-row">${payChip(o.estadoPago)}<b class="pb-total">${sol(o.precioTotal)}</b></div>
        ${["pendiente", "en_revision"].includes(o.estadoPago) && o.estado !== "entregado" ? `<button class="btn paid-btn" type="button" data-act="paid">Ya pagué ${sol(o.precioTotal)}</button><small>Envía el monto por ${esc(o.pago)} y toca «Ya pagué». Sin captura ni código: ${esc(firstName(cu.nombre))} lo confirma.</small>` : ""}
        ${o.estadoPago === "marcado" ? `<small class="pos">Avisaste que pagaste. Esperando que ${esc(firstName(cu.nombre))} lo confirme.</small>` : ""}
        ${o.estadoPago === "en_revision" ? `<small>${esc(firstName(cu.nombre))} aún no ve tu pago. Revísalo y vuelve a tocar «Ya pagué», o escríbele por el chat.</small>` : ""}
      </div>`;
    } else if (o.pago === "Efectivo") pago = `<div class="paybox"><small>Pago en efectivo</small><b>${o.estadoPago === "confirmado" ? `Pagaste ${sol(o.precioTotal)} en efectivo` : `Paga ${sol(o.precioTotal)} al recibir`}</b><div class="pb-row">${payChip(o.estadoPago)}</div></div>`;
    else pago = `<div class="paybox"><small>Saldo RAPIDIN</small><b>${o.estadoPago === "confirmado" ? `${sol(o.precioTotal)} pagados con tu saldo` : `${sol(o.retencion || o.precioTotal)} retenidos de tu saldo`}</b><small>${o.estadoPago === "confirmado" ? "Pago completado." : "Se descuentan al confirmarse la entrega."}</small></div>`;
    main = `<section class="card">
      <h2 class="card-t">Tu repartidor</h2>
      ${courierMini(db, o.courierId)}
      ${api.chatOpen(o) ? contactButtons({ tel: o.estado !== "entregado" && cu.telefono, wa: o.estado !== "entregado" && cu.whatsapp, chat: true, nombre: firstName(cu.nombre) }) : ""}
      ${pendingChange ? `<div class="change-box"><b>${esc(firstName(cu.nombre))} propone un cambio</b><p>${esc(pendingChange.motivo)}</p><p>Nuevo total: <b>${sol(pendingChange.nuevoTotal)}</b> <span class="muted">(antes ${sol(pendingChange.anterior)})</span></p>
        <div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="change" data-id="${pendingChange.id}" data-ok="0">Rechazar</button><button class="btn small teal" type="button" data-act="change" data-id="${pendingChange.id}" data-ok="1">Aprobar cambio</button></div></div>` : ""}
      ${pago}
      ${o.estado === "entregado" ? `${o.calificacion ? `<p class="rated">Calificaste a ${esc(firstName(cu.nombre))} con ${"★".repeat(o.calificacion.estrellas)}${o.calificacion.comentario ? ` · «${esc(o.calificacion.comentario)}»` : ""}</p>` : ""}${o.calificacionLocal ? `<p class="rated">Calificaste a ${esc(o.tienda.nombre)} con ${"★".repeat(o.calificacionLocal.estrellas)}</p>` : ""}
        ${!o.calificacion || (o.tienda?.id && !o.calificacionLocal) ? `<button class="btn" type="button" data-act="rate" style="margin-top:14px">Calificar ${o.tienda?.id && !o.calificacionLocal ? (o.calificacion ? `a ${esc(o.tienda.nombre)}` : "el pedido") : `a ${esc(firstName(cu.nombre))}`}</button>` : ""}` : ""}
    </section>`;
  }
  return `
  <div class="det-head"><div><span class="muted">${o.codigo} · ${esc(api.MODALIDAD[o.modalidad])} · ${ago(o.creado)}</span><h2>${o.modalidad === "catalogo" ? `Tu pedido en ${esc(o.tienda.nombre)}` : esc(o.descripcion)}</h2></div>${chip(o.estado)}</div>
  <div class="grid-2">
    <div class="stack">
      ${confirmBox}
      ${main}
      ${o.items ? `<section class="card"><h2 class="card-t">Productos</h2>${itemsList(o)}</section>` : ""}
      <section class="card"><h2 class="card-t">Detalle</h2>${orderSummaryRows(o)}</section>
      <div class="row-btns">
        ${canCancel ? `<button class="btn small ghost-dark" type="button" data-act="cancel">Cancelar pedido</button>` : ""}
        <button class="btn small ghost-dark" type="button" data-act="report">Reportar un problema</button>
      </div>
      ${o.reportes.filter(r => r.por === ctx.uid).map(r => `<div class="banner ${r.estado === "abierto" ? "warn" : "ok"}"><b>Tu reporte:</b> ${esc(r.texto)}${r.respuesta ? `<br><b>Respuesta:</b> ${esc(r.respuesta)}` : " · En revisión"}</div>`).join("")}
    </div>
    <div class="stack">
      <section class="card">${orderMap(o, db)}</section>
      <section class="card"><h2 class="card-t">Estado</h2>${timeline(o)}</section>
    </div>
  </div>`;
}

/* ---------- Billetera ---------- */
const billetera = {
  title: "Billetera",
  render(ctx) {
    if (!ctx.db.config.saldoClienteHabilitado) return empty("El saldo RAPIDIN no está activo", "Por ahora paga tus pedidos en efectivo, Yape, Plin o Lemon.");
    return ctx.live("w", () => {
      const db = ctx.db, w = db.wallets[ctx.uid] || { saldo: 0, retenido: 0 };
      const tops = Object.values(db.topups).filter(t => t.uid === ctx.uid).sort((a, b) => b.creado - a.creado);
      const mov = db.walletLedger.filter(l => l.uid === ctx.uid).slice(0, 30);
      return `<div class="kpis">
        <div class="kpi kpi-main"><small>Saldo disponible</small><b>${sol(api.saldoDisponible(w))}</b><button class="btn small" type="button" data-act="topup">Recargar saldo</button></div>
        <div class="kpi"><small>Retenido en pedidos</small><b>${sol(w.retenido)}</b><span class="muted">Se descuenta al entregarse</span></div>
        <div class="kpi"><small>Recargas por verificar</small><b>${tops.filter(t => t.estado === "pendiente").length}</b><span class="muted">Un administrador las revisa</span></div>
      </div>
      <div class="grid-2">
        <section class="card"><h2 class="card-t">Recargas</h2>${tops.length ? `<ul class="rows">${tops.map(t => `<li><div class="row-logo">${payLogo(t.metodo, "sm")}<div><b>${sol(t.monto)} · ${esc(t.metodo)}</b><small>Operación ${esc(t.operacion)} · ${ago(t.creado)}</small></div></div><span class="chip ${t.estado === "confirmada" ? "ok" : t.estado === "rechazada" ? "bad" : "warn"}">${t.estado === "pendiente" ? "Por verificar" : t.estado === "confirmada" ? "Verificada" : "Rechazada"}</span></li>`).join("")}</ul>` : `<p class="muted">Aún no hiciste recargas.</p>`}</section>
        <section class="card"><h2 class="card-t">Movimientos</h2>${ledgerList(mov)}</section>
      </div>`;
    });
  },
  actions: { topup(b, ctx) { topupModal(ctx); } },
};
export function ledgerList(mov) {
  const L = { recarga: "Recarga", reserva: "Reserva de comisión", liberacion: "Liberación", cobro_comision: "Comisión cobrada", pago_pedido: "Pago de pedido", retencion: "Retención", ajuste: "Ajuste", retiro: "Retiro" };
  if (!mov.length) return `<p class="muted">Sin movimientos todavía.</p>`;
  return `<ul class="rows">${mov.map(l => `<li><div><b>${L[l.tipo] || l.tipo}</b><small>${esc(l.nota || "")} · ${ago(l.t)}</small></div><b class="${l.monto >= 0 ? "pos" : "neg"}">${l.monto >= 0 ? "+" : "−"}${sol(Math.abs(l.monto)).replace("S/ ", "S/ ")}</b></li>`).join("")}</ul>`;
}
export function topupModal(ctx, destino = "tu saldo") {
  modal("Recargar", `<form data-mform="t" novalidate>
    <p class="m-text">1. Yapea o plinea a <b>RAPIDIN · 900 000 001</b> <span class="muted">(número de demostración)</span>.<br>2. Escribe el monto y el código de operación. Un administrador lo verifica y se suma a ${destino}.</p>
    <span class="lbl">¿Con qué recargaste?</span>
    <div class="pay-grid three" role="radiogroup" aria-label="Medio de la recarga">${["Yape", "Plin", "Lemon"].map((m, i) => `<label class="pay-opt"><input type="radio" name="met" value="${m}" ${i ? "" : "checked"}>${payLogo(m)}<span class="po-t"><b>${m}</b></span></label>`).join("")}</div>
    <div class="f" style="margin-top:14px"><label for="tM">Monto (S/)</label><input class="in" id="tM" name="m" inputmode="decimal" placeholder="20.00"></div>
    <div class="f"><label for="tOp">Código de operación</label><input class="in" id="tOp" name="op" inputmode="numeric" placeholder="Ej.: 73519284"></div>
    <p class="err" id="tErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Enviar para verificar</button></div></form>`,
    { mount: b => fixBrokenLogos(b), t: f => { const m = num(f.m.value); if (!(m > 0)) return ($("#tErr").textContent = "Escribe el monto."); if (run(() => api.requestTopup(ctx.uid, { monto: m, metodo: f.querySelector("input[name=met]:checked").value, operacion: f.op.value.trim() }), "Recarga enviada. Te avisaremos cuando se verifique.")) closeModal(); } });
}

/* ---------- Foto de perfil (se recorta cuadrada y se reduce a 320 px) ---------- */
export const photoPicker = u => `<label class="av-edit" title="Cambiar foto">${avatar(u.uid, u.nombre, "lg")}<input type="file" accept="image/*" data-photo><span class="av-cam" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4V8Z"/><circle cx="12" cy="13" r="3.5"/></svg></span><span class="sr-only">Cambiar foto de perfil</span></label>`;
export const photoBtns = u => `<span class="ph-btns"><label class="link">${u.foto ? "Cambiar foto" : "Subir foto"}<input type="file" accept="image/*" data-photo hidden></label>${u.foto ? `<button class="link danger-t" type="button" data-act="delphoto">Quitar</button>` : ""}</span>`;
export function bindPhoto(root, ctx) {
  root.querySelectorAll("[data-photo]").forEach(inp => inp.addEventListener("change", async () => {
    try { const foto = await shrinkImage(inp.files[0], { w: 320, h: 320, q: 0.82 }); if (run(() => api.updateProfile(ctx.uid, { foto }), "Foto actualizada.")) ctx.rerender(); }
    catch (e) { toast(e.message + " Prueba con otra.", "bad"); }
  }));
}

/* ---------- Perfil ---------- */
export const perfilView = (back) => ({
  title: "Mi perfil", static: true,
  render(ctx) {
    const u = ctx.user;
    return `<form class="card narrow" data-form="perfil" novalidate>
      <div class="person big">${photoPicker(u)}<div><b>${esc(u.nombre)}</b><span>${esc(u.correo)}</span>${photoBtns(u)}</div></div>
      ${api.nameLocked(u)
        ? `<div class="f"><label for="pfN">Nombres y apellidos <span class="ok-pill">Verificado con DNI</span></label><div class="locked-in"><input class="in" id="pfN" value="${esc(u.nombre)}" disabled aria-describedby="pfNh"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>
          <span class="hint-s" id="pfNh">Como repartidor, tu nombre real queda fijo para la seguridad de los clientes. Si hay un error, escríbenos y un administrador lo corrige.</span></div>`
        : `<div class="f"><label for="pfN">Nombres y apellidos</label><input class="in" id="pfN" name="nombre" value="${esc(u.nombre)}" autocomplete="name"></div>`}
      <div class="two">
        <div class="f"><label for="pfT">Celular ${u.telefonoVerificado ? `<span class="ok-pill">Verificado</span>` : `<span class="chip warn">Sin verificar</span>`}</label><div class="phone-in"><span>+51</span><input class="in" id="pfT" name="telefono" value="${esc(u.telefono)}" inputmode="numeric" maxlength="11"></div><span class="hint-s">Si lo cambias, te pediremos verificarlo por SMS.</span></div>
        <div class="f"><label for="pfW">WhatsApp</label><div class="phone-in"><span>+51</span><input class="in" id="pfW" name="whatsapp" value="${esc(u.whatsapp)}" inputmode="numeric" maxlength="11"></div></div>
      </div>
      <div class="f"><label for="pfM">Correo</label><input class="in" id="pfM" value="${esc(u.correo)}" disabled></div>
      <p class="err" id="pfErr" role="alert"></p>
      <div class="row-btns"><button class="btn" type="submit">Guardar cambios</button>
      ${!u.telefonoVerificado ? `<button class="btn ghost-dark" type="button" data-act="verify">Verificar celular</button>` : ""}
      ${back || ""}</div>
      <p class="hint-s" style="margin-top:16px">Tu número solo lo ve el repartidor cuya oferta aceptes, y solo durante ese pedido.</p>
    </form>`;
  },
  mount(root, ctx) { bindPhoto(root, ctx); },
  actions: { verify(b, ctx) { openAuth("verify", { uid: ctx.uid }); }, delphoto(b, ctx) { if (run(() => api.updateProfile(ctx.uid, { foto: null }), "Quitaste tu foto.")) ctx.rerender(); } },
  forms: {
    perfil(f, ctx) {
      const err = $("#pfErr"); err.textContent = "";
      const nombre = api.nameLocked(ctx.user) ? ctx.user.nombre : f.nombre.value.trim().replace(/\s+/g, " "), tel = normPhone(f.telefono.value), wa = normPhone(f.whatsapp.value);
      if (nombre.split(" ").length < 2) return (err.textContent = "Escribe tu nombre y al menos un apellido.");
      if (!/^9\d{8}$/.test(tel) || !/^9\d{8}$/.test(wa)) return (err.textContent = "Los números deben tener 9 dígitos y empezar con 9.");
      const changedPhone = tel !== ctx.user.telefono;
      if (run(() => api.updateProfile(ctx.uid, { nombre, telefono: tel, whatsapp: wa }), "Datos guardados.")) { if (changedPhone) openAuth("verify", { uid: ctx.uid }); else ctx.rerender(); }
    },
  },
});


export default {
  id: "cliente", label: "Panel de cliente", icon: "box",
  allowed: u => !!u.roles.cliente,
  home: () => "#cliente-market",
  defaultView: (u, db) => (mine(db, u.uid).some(isOpen) ? "pedidos" : "market"),
  resolve() { return null; },
  nav(u, db) {
    const open = mine(db, u.uid).filter(isOpen);
    const offers = open.reduce((s, o) => s + Object.values(o.offers).filter(x => x.estado === "activa").length, 0);
    return [
      { id: "market", label: "Market", short: "Market", icon: "store" },
      { id: "nuevo", label: "Pedir algo", short: "Pedir", icon: "plus" },
      { id: "pedidos", label: "Mis pedidos", short: "Pedidos", icon: "list", badge: offers || (open.length || "") },
      ...(db.config.saldoClienteHabilitado ? [{ id: "billetera", label: "Billetera", short: "Saldo", icon: "wallet" }] : []),
      { id: "perfil", label: "Mi perfil", short: "Perfil", icon: "user" },
    ];
  },
  views: { market, tienda, checkout, nuevo, pedidos, pedido, billetera, perfil: clientePerfil() },
};

/* ---------- Perfil del cliente con direcciones guardadas ---------- */
function clientePerfil() {
  const base = perfilView(`<a class="btn ghost-dark" href="#repartidor-postulacion">Quiero ser repartidor</a>`);
  return {
    ...base,
    render(ctx) {
      return `<div class="grid-2">${base.render(ctx)}
        <section class="card">${ctx.live("dirs", () => {
          const dirs = ctx.db.users[ctx.uid].direcciones || [];
          return `<h2 class="card-t">Mis direcciones</h2>${dirs.length ? `<ul class="rows">${dirs.map(d => `<li><div><b>${esc(d.nombre)}</b><small>${esc(d.referencia || "Sin referencia")}</small></div><button class="link danger-t" type="button" data-act="deldir" data-id="${d.id}">Eliminar</button></li>`).join("")}</ul>` : `<p class="muted">Aún no guardas direcciones.</p>`}
            <p class="hint-s" style="margin-top:12px">Al hacer un pedido puedes marcar «Guardar esta dirección» para usarla con un toque la próxima vez.</p>`;
        })}</section></div>`;
    },
    actions: { ...base.actions, deldir(b, ctx) { run(() => api.deleteAddress(ctx.uid, b.dataset.id), "Dirección eliminada."); if (deliv.addrId === b.dataset.id) Object.assign(deliv, { addrId: null }); } },
  };
}
