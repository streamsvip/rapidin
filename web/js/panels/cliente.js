/* RAPIDIN · Panel del cliente: Market, pedido libre, pedidos, billetera y perfil */
import * as api from "../demo/api.js";
import { roadKm, MAP, isOpen as storeOpen, statusLabel, hoursLabel, is24h } from "../demo/store.js";
import { $, $$, esc, sol, fmtPhone, normPhone, waLink, toast, run, modal, closeModal, confirmModal, formData, num, chip, payChip, left, ago, empty, avatar, stars, firstName, payLogo, payTag, fixBrokenLogos } from "../ui.js";
import { createPicker } from "../map.js";
import { timeline, orderMap, courierMini, orderSummaryRows, itemsList, catOf, catIcon, productThumb } from "./common.js";
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

/* ---------- Pasos compartidos: entrega y pago ---------- */
function deliveryStep(ctx, n) {
  const dirs = ctx.user.direcciones || [];
  return `<section class="card step-card">
    <div class="step-h"><span class="step-n">${n}</span><div><h2 class="card-t">¿Dónde lo recibes?</h2><p class="hint-s">Elige una dirección guardada o toca el mapa.</p></div></div>
    ${dirs.length ? `<div class="addr-chips" role="group" aria-label="Direcciones guardadas">${dirs.map(d => `<button type="button" class="addr" data-act="addr" data-id="${d.id}" aria-pressed="${deliv.addrId === d.id}"><b>${esc(d.nombre)}</b><span>${esc(d.referencia || "Sin referencia")}</span></button>`).join("")}
      <button type="button" class="addr" data-act="addr" data-id="" aria-pressed="${!deliv.addrId}"><b>Otra ubicación</b><span>Marcar en el mapa</span></button></div>` : ""}
    <div class="map" id="dMap" style="height:300px" role="img" aria-label="Mapa de Camaná: toca para marcar el punto de entrega"></div>
    <p class="hint-s" id="dHint" style="margin-top:8px"></p>
    <div class="f" style="margin-top:12px"><label for="dRef">Referencia</label><input class="in" id="dRef" value="${esc(deliv.referencia)}" data-input="dref" placeholder="Casa verde, 2.º piso, frente al parque"></div>
    <div id="saveBox" ${deliv.addrId ? "hidden" : ""}>
      <label class="check"><input type="checkbox" id="dSave" data-change="dsave" ${deliv.guardar ? "checked" : ""}> <span>Guardar esta dirección</span></label>
      <div class="f" id="dNameBox" ${deliv.guardar ? "" : "hidden"}><label for="dName">Nombre</label><input class="in" id="dName" value="${esc(deliv.nombreDir)}" data-input="dname" placeholder="Casa, Trabajo, Casa de mi mamá…"></div>
    </div>
  </section>`;
}
function paymentStep(ctx, n, montoRef) {
  const db = ctx.db, w = db.wallets[ctx.uid] || { saldo: 0, retenido: 0 };
  const opciones = PAGOS.filter(p => p.id !== "Saldo RAPIDIN" || db.config.saldoClienteHabilitado);
  if (!opciones.some(p => p.id === deliv.pago)) deliv.pago = "Efectivo";
  const disp = api.saldoDisponible(w);
  return `<section class="card step-card">
    <div class="step-h"><span class="step-n">${n}</span><div><h2 class="card-t">¿Cómo pagas?</h2><p class="hint-s">Pagas cuando aceptes una oferta. Nunca antes.</p></div></div>
    <div class="pay-grid" role="radiogroup" aria-label="Medio de pago">${opciones.map(p => `
      <label class="pay-opt"><input type="radio" name="pago" value="${p.id}" data-change="pago" ${deliv.pago === p.id ? "checked" : ""}>
        ${payLogo(p.id)}
        <span class="po-t"><b>${p.id === "Saldo RAPIDIN" ? "Saldo" : p.id}</b><small>${p.id === "Saldo RAPIDIN" ? `Disponible ${sol(disp)}` : p.d}</small></span></label>`).join("")}</div>
    ${deliv.pago === "Saldo RAPIDIN" && montoRef != null && disp < montoRef ? `<p class="banner warn" style="margin:12px 0 0">Tu saldo (${sol(disp)}) no alcanza para los productos. Recarga o elige otro medio.</p>` : ""}
  </section>`;
}
function mountDelivery(root, ctx, onChange) {
  const el = $("#dMap", root); if (!el) return;
  const db = ctx.db;
  const extra = () => {
    const m = [];
    const shop = onChange?.shop?.();
    if (shop) m.push({ pos: shop, type: "tienda", label: onChange.shopLabel?.() });
    if (deliv.pos) m.push({ pos: deliv.pos, type: "entrega", label: "Entrega" });
    return { markers: m, route: shop && deliv.pos ? [shop, deliv.pos] : null, plaza: db.config.puntoEstrategico.pos };
  };
  const hint = () => { const h = $("#dHint", root); if (h) h.textContent = deliv.pos ? "Punto de entrega marcado. Toca el mapa para moverlo." : "Toca el mapa para marcar dónde recibes tu pedido."; };
  const picker = createPicker(el, extra, (p, eng) => {
    if (!p || (eng === "canvas" && p.x < MAP.mar + 0.03)) { toast(p ? "Ese punto cae en el mar. Toca una calle de Camaná." : "Ese punto está fuera de la zona de cobertura de Camaná.", "bad"); return; }
    if (onChange?.picking?.() === "tienda") { onChange.pickShop(p); }
    else { deliv.pos = p; if (deliv.addrId) { deliv.addrId = null; $$("[data-act=addr]", root).forEach(b => b.setAttribute("aria-pressed", String(!b.dataset.id))); $("#saveBox", root).hidden = false; } }
    picker.redraw(); hint(); onChange?.changed?.();
  });
  hint();
  return picker;
}
const delivActions = {
  addr(b, ctx) {
    const d = (ctx.user.direcciones || []).find(x => x.id === b.dataset.id);
    if (d) Object.assign(deliv, { pos: d.pos, referencia: d.referencia, addrId: d.id }); else deliv.addrId = null;
    $$("[data-act=addr]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    $("#dRef").value = deliv.referencia; $("#saveBox").hidden = !!deliv.addrId;
    currentPicker?.redraw(); const h = $("#dHint"); if (h) h.textContent = deliv.pos ? "Punto de entrega marcado. Toca el mapa para moverlo." : "Toca el mapa para marcar dónde recibes tu pedido.";
  },
};
const delivChanges = {
  dsave(el) { deliv.guardar = el.checked; $("#dNameBox").hidden = !el.checked; },
  pago(el, ctx) { deliv.pago = el.value; },
};
const delivInputs = { dref(el) { deliv.referencia = el.value; }, dname(el) { deliv.nombreDir = el.value; } };
let currentPicker = null;
function validateDelivery(errEl) {
  if (!deliv.pos) { errEl.textContent = "Marca en el mapa dónde recibes tu pedido."; $("#dMap")?.scrollIntoView({ behavior: "smooth", block: "center" }); return false; }
  if (deliv.guardar && deliv.nombreDir.trim().length < 2) { errEl.textContent = "Escribe un nombre para guardar la dirección, por ejemplo «Casa»."; return false; }
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
    const cats = ["Todas", ...new Set(Object.values(ctx.db.establishments).filter(e => e.activo && e.tiendaVirtual).map(e => e.categoria))];
    const c = ctx.state.mcat || "Todas";
    return `<section class="mk-hero">
        <div><span class="mk-eyebrow">Market RAPIDIN · Camaná</span><h2>¿Qué se te antoja hoy?</h2><p>Precios del propio local. Los repartidores solo ofertan el envío.</p></div>
        <label class="mk-search"><span class="sr-only">Buscar</span><input class="in" type="search" placeholder="Busca un local o producto" value="${esc(ctx.state.mq || "")}" data-input="mq"></label>
      </section>
      <div class="chips-filter" style="margin-bottom:18px">${cats.map(k => `<button type="button" data-act="mcat" data-c="${esc(k)}" aria-pressed="${c === k}">${esc(k)}</button>`).join("")}</div>
      ${ctx.live("mk", () => storesGrid(ctx))}
      <a class="free-banner" href="#cliente-nuevo"><div><b>¿No encuentras lo que buscas?</b><span>Pide lo que quieras con Compra libre o desde cualquier tienda de Camaná.</span></div><span class="btn small">Pedido libre</span></a>`;
  },
  actions: { mcat(b, ctx) { ctx.state.mcat = b.dataset.c; ctx.rerender(); }, store(b, ctx) { ctx.go("#cliente-tienda", { ...ctx.state, store: b.dataset.id }); } },
  inputs: { mq(el, ctx) { ctx.state.mq = el.value; ctx.refresh(); } },
};
function storesGrid(ctx) {
  const db = ctx.db, q = (ctx.state.mq || "").trim().toLowerCase(), c = ctx.state.mcat || "Todas";
  const prods = Object.values(db.products);
  let list = Object.values(db.establishments).filter(e => e.activo && e.tiendaVirtual && (c === "Todas" || e.categoria === c));
  if (q) list = list.filter(e => e.nombre.toLowerCase().includes(q) || e.categoria.toLowerCase().includes(q) || prods.some(p => p.tiendaId === e.id && p.nombre.toLowerCase().includes(q)));
  list.sort((a, b) => storeOpen(b) - storeOpen(a) || a.nombre.localeCompare(b.nombre));
  if (!list.length) return empty("No encontramos locales", q ? `Nada coincide con «${q}». Prueba otra palabra o usa Compra libre.` : "Aún no hay locales en esta categoría.");
  return `<div class="store-grid">${list.map(e => {
    const open = storeOpen(e), n = prods.filter(p => p.tiendaId === e.id && p.disponible).length;
    const hit = q ? prods.filter(p => p.tiendaId === e.id && p.nombre.toLowerCase().includes(q)).slice(0, 2).map(p => p.nombre) : [];
    return `<button type="button" class="store-card${open ? "" : " closed"}" data-act="store" data-id="${e.id}">
      <span class="sc-cover" style="--cat:${catOf(e.categoria).c}">${catIcon(e.categoria, "xl")}<span class="sc-status ${open ? "on" : ""}">${esc(statusLabel(e))}</span></span>
      <span class="sc-body"><b>${esc(e.nombre)}</b><span class="sc-meta">${esc(e.categoria)} · ${n} productos${e.tiempoPrep ? ` · prep. ${e.tiempoPrep} min` : ""}</span>
      <span class="sc-addr">${esc(e.direccion)}</span>${hit.length ? `<span class="sc-hit">Tiene: ${hit.map(esc).join(", ")}</span>` : ""}</span>
    </button>`;
  }).join("")}</div>`;
}

/* ---------- Página del local ---------- */
const tienda = {
  title: "Local", parent: "market", static: true,
  render(ctx) {
    const db = ctx.db, e = db.establishments[ctx.state.store];
    if (!e || !e.activo || !e.tiendaVirtual) return empty("Este local no está disponible", "Vuelve al Market para ver los locales abiertos.", `<a class="btn small" href="#cliente-market">Ir al Market</a>`);
    const open = storeOpen(e);
    const prods = Object.values(db.products).filter(p => p.tiendaId === e.id).sort((a, b) => a.orden - b.orden);
    const secciones = [...new Set(prods.map(p => p.seccion))];
    return `<a class="back" href="#cliente-market">← Market</a>
    <section class="store-head" style="--cat:${catOf(e.categoria).c}">
      <span class="sh-ic">${catIcon(e.categoria, "xl")}</span>
      <div class="sh-main"><span class="sc-status ${open ? "on" : ""}">${esc(statusLabel(e))}</span><h2>${esc(e.nombre)}</h2><p>${esc(e.descripcion || e.categoria)}</p>
        <div class="sh-meta"><span>${esc(e.direccion)}</span><span>${esc(hoursLabel(e))}</span>${e.tiempoPrep ? `<span>Preparación ~${e.tiempoPrep} min</span>` : ""}</div></div>
    </section>
    ${open ? "" : `<div class="banner warn">Este local está cerrado ahora. Puedes ver el catálogo, pero solo podrás pedir dentro de su horario (${esc(hoursLabel(e))}).</div>`}
    <div class="grid-2 wide-left store-body">
      <div class="stack">
        ${secciones.length > 1 ? `<nav class="sec-nav" aria-label="Secciones del catálogo">${secciones.map((s, i) => `<a href="#cliente-tienda" data-act="jump" data-s="${i}">${esc(s)}</a>`).join("")}</nav>` : ""}
        ${secciones.map((s, i) => `<section class="card" id="sec-${i}"><h2 class="card-t">${esc(s)}</h2><div class="prod-list">${prods.filter(p => p.seccion === s).map(p => `
          <article class="prod${p.disponible ? "" : " off"}">${productThumb(p, e.categoria)}
            <div class="pr-main"><b>${esc(p.nombre)}</b>${p.descripcion ? `<span>${esc(p.descripcion)}</span>` : ""}<strong>${sol(p.precio)}</strong></div>
            <div class="pr-ctl" data-ctl="${p.id}">${ctlHtml(p, open && p.disponible, e.id)}</div>
          </article>`).join("")}</div></section>`).join("") || empty("Catálogo vacío", "Este local todavía no publicó productos.")}
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
    const sub = cartSubtotal(db);
    return `<a class="back" href="#cliente-tienda" data-act="backStore">← Seguir comprando en ${esc(e.nombre)}</a>
    <form class="grid-2 wide-left" data-form="confirm" novalidate>
      <div class="stack">
        <section class="card step-card">
          <div class="step-h"><span class="step-n">1</span><div><h2 class="card-t">Tu pedido en ${esc(e.nombre)}</h2><p class="hint-s">${esc(statusLabel(e))}</p></div></div>
          <div id="coItems">${coItemsHtml(ctx)}</div>
          <div class="f" style="margin-top:14px"><label for="coNota">Indicaciones <span class="opt">· opcional</span></label><textarea class="in" id="coNota" rows="2" data-input="nota" placeholder="Ej.: Pollo con ají aparte. Dedicatoria: «Feliz cumpleaños, mamá»." maxlength="200">${esc(cart.nota || "")}</textarea></div>
        </section>
        ${deliveryStep(ctx, 2)}
        ${paymentStep(ctx, 3, sub)}
      </div>
      <aside class="stack sticky-aside">
        <section class="card summary">
          <h2 class="card-t">Resumen</h2>
          <dl class="kv"><div><dt>Productos</dt><dd>${cartCount()}</dd></div><div><dt>Subtotal del local</dt><dd id="coSub">${sol(sub)}</dd></div><div><dt>Envío</dt><dd>Lo ofertan los repartidores</dd></div><div><dt>Pago</dt><dd id="coPay">${esc(deliv.pago)}</dd></div></dl>
          <div class="sum-total"><span>Total estimado</span><b id="coTot">${sol(sub)} + envío</b></div>
          <p class="err" id="coErr" role="alert"></p>
          <button class="btn" type="submit" style="width:100%;justify-content:center" ${storeOpen(e) ? "" : "disabled"}>Confirmar pedido</button>
          <p class="hint-s center" style="margin-top:10px">Recibirás ofertas de envío en segundos. Eliges una y recién ahí pagas.</p>
        </section>
        <section class="card soft contact-mini"><b>${esc(ctx.user.nombre)}</b><span>WhatsApp ${fmtPhone(ctx.user.whatsapp)}</span><small>Solo el repartidor que elijas verá tu número.</small></section>
      </aside>
    </form>`;
  },
  mount(root, ctx) {
    const e = ctx.db.establishments[cart.tiendaId]; if (!e) return;
    currentPicker = mountDelivery(root, ctx, { shop: () => e.pos, shopLabel: () => e.nombre });
  },
  actions: {
    ...delivActions,
    backStore(b, ctx) { ctx.go("#cliente-tienda", { ...ctx.state, store: cart.tiendaId }); },
    inc(b, ctx) { setQty(b.dataset.id, (cart.items[b.dataset.id] || 0) + 1); refreshCheckout(ctx); },
    dec(b, ctx) { setQty(b.dataset.id, (cart.items[b.dataset.id] || 0) - 1); if (!cartCount()) return ctx.rerender(); refreshCheckout(ctx); },
  },
  changes: { ...delivChanges, pago(el, ctx) { deliv.pago = el.value; $("#coPay").textContent = el.value; } },
  inputs: { ...delivInputs, nota(el) { cart.nota = el.value; saveCart(); } },
  forms: {
    confirm(f, ctx) {
      const err = $("#coErr"); err.textContent = "";
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
function coItemsHtml(ctx) {
  return `<ul class="items editable">${cartLines(ctx.db).map(l => `<li><span class="it-name">${esc(l.p.nombre)}<small>${sol(l.p.precio)} c/u</small></span>
    <div class="stepper sm"><button type="button" data-act="dec" data-id="${l.p.id}" aria-label="Quitar uno">−</button><b>${l.q}</b><button type="button" data-act="inc" data-id="${l.p.id}" aria-label="Agregar uno">+</button></div><b>${sol(l.p.precio * l.q)}</b></li>`).join("")}</ul>`;
}
function refreshCheckout(ctx) {
  $("#coItems").innerHTML = coItemsHtml(ctx);
  const s = sol(cartSubtotal(ctx.db)); $("#coSub").textContent = s; $("#coTot").textContent = `${s} + envío`;
}

/* =========================================================
   Pedido libre o desde una tienda específica
   ========================================================= */
const draft = { modalidad: "libre", tiendaId: "", otra: { nombre: "", direccion: "", pos: null }, pickMode: "entrega", descripcion: "" };
const nuevo = {
  title: "Pedido libre", static: true,
  render(ctx) {
    initDeliv(ctx.user);
    const { db } = ctx;
    const shops = Object.values(db.establishments).filter(e => e.activo).sort((a, b) => storeOpen(b) - storeOpen(a) || a.nombre.localeCompare(b.nombre));
    const zonaOk = db.zones.camana.activa;
    return `
    ${zonaOk ? "" : `<div class="banner bad">Por ahora RAPIDIN no está recibiendo pedidos en Camaná. Vuelve a intentarlo más tarde.</div>`}
    <form class="grid-2 wide-left" data-form="crear" novalidate>
      <div class="stack">
        <section class="card step-card">
          <div class="step-h"><span class="step-n">1</span><div><h2 class="card-t">¿Qué necesitas?</h2><p class="hint-s">Para comprar con precios fijos, usa el <a class="link" href="#cliente-market">Market</a>.</p></div></div>
          <div class="choice">
            <input type="radio" name="modalidad" id="mLibre" value="libre" data-change="mod" ${draft.modalidad === "libre" ? "checked" : ""}><label for="mLibre"><b>Compra libre</b><span>Describe lo que necesitas y el repartidor elige dónde comprar.</span></label>
            <input type="radio" name="modalidad" id="mTienda" value="tienda" data-change="mod" ${draft.modalidad === "tienda" ? "checked" : ""}><label for="mTienda"><b>Tienda específica</b><span>Tú eliges dónde comprar o qué recoger.</span></label>
          </div>
          <div id="tiendaBox" ${draft.modalidad === "tienda" ? "" : "hidden"} style="margin-top:14px">
            <div class="f"><label for="nTienda">Establecimiento</label>
              <select class="in" id="nTienda" data-change="tienda">
                <option value="">Elige un establecimiento</option>
                ${shops.map(e => { const o = storeOpen(e); return `<option value="${e.id}" ${draft.tiendaId === e.id ? "selected" : ""} ${o ? "" : "disabled"}>${esc(e.nombre)} · ${esc(e.categoria)} · ${o ? (is24h(e) ? "24 horas" : `hasta ${e.horario.cierra}`) : "cerrado"}</option>`; }).join("")}
                <option value="otra" ${draft.tiendaId === "otra" ? "selected" : ""}>Otra tienda (escribir dirección)</option>
              </select><span class="hint-s">Los locales cerrados aparecen deshabilitados.</span></div>
            <div id="otraBox" class="two" ${draft.tiendaId === "otra" ? "" : "hidden"}>
              <div class="f"><label for="nOtraN">Nombre de la tienda</label><input class="in" id="nOtraN" value="${esc(draft.otra.nombre)}" data-input="otra"></div>
              <div class="f"><label for="nOtraD">Dirección</label><input class="in" id="nOtraD" value="${esc(draft.otra.direccion)}" data-input="otra"></div>
            </div>
            <div id="otraPick" ${draft.tiendaId === "otra" ? "" : "hidden"}><button type="button" class="btn small ghost-dark" data-act="pickShop" aria-pressed="${draft.pickMode === "tienda"}">${draft.otra.pos ? "Mover la tienda en el mapa" : "Marcar la tienda en el mapa"}</button></div>
          </div>
          <div class="f" style="margin-top:14px"><label for="nDesc">Detalle del pedido</label>
            <textarea class="in" id="nDesc" rows="4" data-input="desc" placeholder="Ej.: 1 kg de limones, un paquete de arroz de 5 kg y una gaseosa de 1.5 L">${esc(draft.descripcion)}</textarea>
            <span class="hint-s">Marca, tamaño y cantidad ayudan a recibir ofertas más exactas. Si algo cambia, el repartidor te pedirá autorización.</span></div>
        </section>
        ${deliveryStep(ctx, 2)}
        ${paymentStep(ctx, 3, null)}
      </div>
      <aside class="stack sticky-aside">
        <section class="card summary" id="nSummary">${summary(ctx)}</section>
        <section class="card soft contact-mini"><b>${esc(ctx.user.nombre)}</b><span>WhatsApp ${fmtPhone(ctx.user.whatsapp)}</span><small>Solo el repartidor que elijas verá tu número.</small><a class="link" href="#cliente-perfil">Cambiar mis datos</a></section>
      </aside>
    </form>`;
  },
  mount(root, ctx) {
    currentPicker = mountDelivery(root, ctx, {
      shop: () => shopPos(ctx.db), shopLabel: () => (draft.tiendaId === "otra" ? draft.otra.nombre || "Tienda" : ctx.db.establishments[draft.tiendaId]?.nombre),
      picking: () => draft.pickMode, pickShop: p => { draft.otra.pos = p; setPick("entrega"); },
      changed: () => { $("#nSummary").innerHTML = summary(ctx); },
    });
  },
  changes: {
    ...delivChanges,
    mod(el, ctx) { draft.modalidad = el.value; $("#tiendaBox").hidden = el.value !== "tienda"; if (el.value !== "tienda") setPick("entrega"); currentPicker?.redraw(); $("#nSummary").innerHTML = summary(ctx); },
    tienda(el, ctx) { draft.tiendaId = el.value; $("#otraBox").hidden = $("#otraPick").hidden = el.value !== "otra"; if (el.value === "otra" && !draft.otra.pos) setPick("tienda"); currentPicker?.redraw(); $("#nSummary").innerHTML = summary(ctx); },
    pago(el, ctx) { deliv.pago = el.value; $("#nSummary").innerHTML = summary(ctx); },
  },
  inputs: { ...delivInputs, desc(el) { draft.descripcion = el.value; }, otra() { draft.otra.nombre = $("#nOtraN").value; draft.otra.direccion = $("#nOtraD").value; } },
  actions: { ...delivActions, pickShop() { setPick(draft.pickMode === "tienda" ? "entrega" : "tienda"); } },
  forms: {
    crear(f, ctx) {
      const err = $("#nErr"); err.textContent = "";
      const db = ctx.db;
      let tienda = null;
      if (draft.modalidad === "tienda") {
        if (!draft.tiendaId) return (err.textContent = "Elige el establecimiento.");
        if (draft.tiendaId === "otra") {
          if (draft.otra.nombre.trim().length < 3 || draft.otra.direccion.trim().length < 4) return (err.textContent = "Escribe el nombre y la dirección de la tienda.");
          if (!draft.otra.pos) { setPick("tienda"); return (err.textContent = "Marca en el mapa dónde está la tienda."); }
          tienda = { id: null, nombre: draft.otra.nombre.trim(), direccion: draft.otra.direccion.trim(), pos: draft.otra.pos };
        } else { const e = db.establishments[draft.tiendaId]; tienda = { id: e.id, nombre: e.nombre, direccion: e.direccion, pos: e.pos }; }
      }
      if (draft.descripcion.trim().length < 6) { $("#nDesc").focus(); return (err.textContent = "Cuéntanos qué necesitas con un poco más de detalle."); }
      if (!validateDelivery(err)) return;
      const id = run(() => api.createOrder(ctx.uid, { modalidad: draft.modalidad, descripcion: draft.descripcion, tienda, entrega: { pos: deliv.pos, referencia: deliv.referencia.trim() }, pago: deliv.pago }), "Solicitud publicada. Ya estamos buscando repartidores.");
      if (!id) return;
      maybeSaveAddress(ctx);
      Object.assign(draft, { descripcion: "", tiendaId: "", otra: { nombre: "", direccion: "", pos: null }, pickMode: "entrega" });
      ctx.go("#cliente-pedido", { id });
    },
  },
};
function shopPos(db) {
  if (draft.modalidad !== "tienda") return null;
  if (draft.tiendaId === "otra") return draft.otra.pos;
  return db.establishments[draft.tiendaId]?.pos || null;
}
function setPick(mode) {
  draft.pickMode = mode;
  const b = $("[data-act=pickShop]"); if (b) { b.setAttribute("aria-pressed", String(mode === "tienda")); b.textContent = mode === "tienda" ? "Toca el mapa donde está la tienda" : draft.otra.pos ? "Mover la tienda en el mapa" : "Marcar la tienda en el mapa"; }
  const h = $("#dHint"); if (h && mode === "tienda") h.textContent = "Toca el mapa donde está la tienda.";
  currentPicker?.redraw();
}
function summary(ctx) {
  const db = ctx.db, t = shopPos(db);
  const km = t ? roadKm(db.config.puntoEstrategico.pos, t) : null;
  return `<h2 class="card-t">Resumen</h2>
    <dl class="kv">
      <div><dt>Modalidad</dt><dd>${draft.modalidad === "libre" ? "Compra libre" : "Tienda específica"}</dd></div>
      ${km != null ? `<div><dt>Distancia de la tienda</dt><dd>${km.toFixed(1)} km del centro</dd></div>` : ""}
      <div><dt>Entrega</dt><dd>${deliv.pos ? "Marcada en el mapa" : `<span class="muted">Falta marcar</span>`}</dd></div>
      <div><dt>Pago</dt><dd>${esc(deliv.pago)}</dd></div>
      <div><dt>Precio</dt><dd>Lo proponen los repartidores</dd></div>
    </dl>
    <p class="err" id="nErr" role="alert"></p>
    <button class="btn" type="submit" style="width:100%;justify-content:center;margin-top:6px" ${db.zones.camana.activa ? "" : "disabled"}>Publicar solicitud</button>
    <p class="hint-s center" style="margin-top:10px">Cada repartidor envía su precio total. Tú eliges.</p>`;
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
const pedido = {
  title: "Detalle del pedido", parent: "pedidos",
  render(ctx) {
    const o = ctx.db.orders[ctx.state.id];
    if (!o || o.clienteId !== ctx.uid) return empty("No encontramos este pedido", "Vuelve a tu lista de pedidos.", `<a class="btn small" href="#cliente-pedidos">Mis pedidos</a>`);
    return `<a class="back" href="#cliente-pedidos">← Mis pedidos</a>${ctx.live("det", () => detail(ctx))}`;
  },
  actions: {
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
    paid(b, ctx) {
      const o = ctx.db.orders[ctx.state.id];
      modal("Registrar mi pago", `<form data-mform="paid" novalidate>
        <p class="m-text">Cuando hayas pagado ${sol(o.precioTotal)} por ${esc(o.pago)}, escribe el código de operación. El repartidor lo confirmará.</p>
        <div class="f"><label for="pCode">Código de operación</label><input class="in" id="pCode" name="code" inputmode="numeric" placeholder="Ej.: 48291037"></div>
        <div class="f"><label for="pFile">Captura del pago <span class="opt">· opcional</span></label><input class="in" id="pFile" type="file" accept="image/*"></div>
        <p class="err" id="pErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Ya pagué</button></div></form>`,
        { paid: f => { const code = f.code.value.trim(); if (!/^\d{4,12}$/.test(code)) return ($("#pErr").textContent = "Escribe el código de operación (solo números)."); if (run(() => api.markOrderPaid(ctx.uid, o.id, code), "Avisamos al repartidor.")) closeModal(); } });
    },
    cancel(b, ctx) {
      const o = ctx.db.orders[ctx.state.id];
      modal("Cancelar pedido", `<form data-mform="c" novalidate>
        <p class="m-text">${o.courierId ? "El repartidor ya fue asignado. Le avisaremos que cancelaste." : "Se cerrarán las ofertas recibidas."}${o.pago === "Saldo RAPIDIN" && o.retencion ? " Liberaremos el monto retenido de tu saldo." : ""}</p>
        <div class="f"><label for="cMot">Motivo</label><select class="in" id="cMot" name="m"><option>Ya no lo necesito</option><option>Las ofertas son muy altas</option><option>Demora demasiado</option><option>Me equivoqué en los datos</option><option>Otro motivo</option></select></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn danger" type="submit">Cancelar pedido</button></div></form>`,
        { c: f => { if (run(() => api.cancelOrder(ctx.uid, o.id, f.m.value), "Pedido cancelado.")) closeModal(); } });
    },
    rate(b, ctx) {
      const o = ctx.db.orders[ctx.state.id];
      modal(`Califica a ${firstName(ctx.db.users[o.courierId].nombre)}`, `<form data-mform="r" novalidate>
        <div class="rate" role="radiogroup" aria-label="Calificación">${[1, 2, 3, 4, 5].map(n => `<input type="radio" name="s" id="s${n}" value="${n}" ${n === 5 ? "checked" : ""}><label for="s${n}" title="${n} estrellas">★</label>`).join("")}</div>
        <div class="f"><label for="rCom">Comentario <span class="opt">· opcional</span></label><textarea class="in" id="rCom" name="c" rows="3" placeholder="¿Cómo te fue con tu pedido?"></textarea></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Después</button><button class="btn" type="submit">Enviar calificación</button></div></form>`,
        { r: f => { if (run(() => api.rateCourier(ctx.uid, o.id, +f.s.value, f.c.value), "¡Gracias por calificar!")) closeModal(); } });
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
            <span class="meta">${stars(c.rating)} · ${c.completados} pedidos · ${of.tiempo} min</span>
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
        ${cuentas.length ? cuentas.map(c => `<div class="pb-acc">${payLogo(c.tipo)}<div><b>${esc(c.tipo)}: ${fmtPhone(c.numero)}</b><small>Titular: ${esc(c.titular)}</small></div></div>`).join("") : `<b>El repartidor no tiene ${esc(o.pago)} verificado. Escríbele para coordinar.</b>`}
        <div class="pb-row">${payChip(o.estadoPago)}<b class="pb-total">${sol(o.precioTotal)}</b></div>
        ${["pendiente"].includes(o.estadoPago) && o.estado !== "entregado" ? `<button class="btn small" type="button" data-act="paid">Ya pagué</button>` : ""}
        ${o.estadoPago === "en_revision" ? `<small>Un administrador está revisando tu pago. Te avisaremos.</small>` : ""}
      </div>`;
    } else if (o.pago === "Efectivo") pago = `<div class="paybox"><small>Pago en efectivo</small><b>${o.estadoPago === "confirmado" ? `Pagaste ${sol(o.precioTotal)} en efectivo` : `Paga ${sol(o.precioTotal)} al recibir`}</b><div class="pb-row">${payChip(o.estadoPago)}</div></div>`;
    else pago = `<div class="paybox"><small>Saldo RAPIDIN</small><b>${o.estadoPago === "confirmado" ? `${sol(o.precioTotal)} pagados con tu saldo` : `${sol(o.retencion || o.precioTotal)} retenidos de tu saldo`}</b><small>${o.estadoPago === "confirmado" ? "Pago completado." : "Se descuentan al confirmarse la entrega."}</small></div>`;
    main = `<section class="card">
      <h2 class="card-t">Tu repartidor</h2>
      ${courierMini(db, o.courierId)}
      ${o.estado !== "entregado" ? `<div class="contact-row">
        <a class="btn small ghost-dark" href="${waLink(cu.whatsapp)}" target="_blank" rel="noopener">WhatsApp ${fmtPhone(cu.whatsapp)}</a>
        <span class="muted">Llamar: ${fmtPhone(cu.telefono)}</span></div>` : ""}
      ${pendingChange ? `<div class="change-box"><b>${esc(firstName(cu.nombre))} propone un cambio</b><p>${esc(pendingChange.motivo)}</p><p>Nuevo total: <b>${sol(pendingChange.nuevoTotal)}</b> <span class="muted">(antes ${sol(pendingChange.anterior)})</span></p>
        <div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="change" data-id="${pendingChange.id}" data-ok="0">Rechazar</button><button class="btn small teal" type="button" data-act="change" data-id="${pendingChange.id}" data-ok="1">Aprobar cambio</button></div></div>` : ""}
      ${pago}
      ${o.estado === "entregado" ? (o.calificacion ? `<p class="rated">Calificaste con ${"★".repeat(o.calificacion.estrellas)}${o.calificacion.comentario ? ` · «${esc(o.calificacion.comentario)}»` : ""}</p>` : `<button class="btn" type="button" data-act="rate" style="margin-top:14px">Calificar a ${esc(firstName(cu.nombre))}</button>`) : ""}
    </section>`;
  }
  return `
  <div class="det-head"><div><span class="muted">${o.codigo} · ${esc(api.MODALIDAD[o.modalidad])} · ${ago(o.creado)}</span><h2>${o.modalidad === "catalogo" ? `Tu pedido en ${esc(o.tienda.nombre)}` : esc(o.descripcion)}</h2></div>${chip(o.estado)}</div>
  <div class="grid-2">
    <div class="stack">
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

/* ---------- Perfil ---------- */
export const perfilView = (back) => ({
  title: "Mi perfil", static: true,
  render(ctx) {
    const u = ctx.user;
    return `<form class="card narrow" data-form="perfil" novalidate>
      <div class="person big">${avatar(u.uid, u.nombre, "lg")}<div><b>${esc(u.nombre)}</b><span>${esc(u.correo)}</span></div></div>
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
  actions: { verify(b, ctx) { openAuth("verify", { uid: ctx.uid }); } },
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
      { id: "nuevo", label: "Pedido libre", short: "Pedir", icon: "plus" },
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
