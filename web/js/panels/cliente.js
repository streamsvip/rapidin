/* RAPIDIN · Panel del cliente */
import * as api from "../demo/api.js";
import { load, roadKm, MAP } from "../demo/store.js";
import { $, $$, esc, sol, fmtPhone, normPhone, waLink, toast, run, modal, closeModal, confirmModal, formData, num, chip, payChip, left, ago, empty, avatar, stars, firstName } from "../ui.js";
import { drawMap, pickPos } from "../map.js";
import { timeline, orderMap, courierMini, orderSummaryRows } from "./common.js";
import { openAuth } from "../auth.js";

const draft = { modalidad: "libre", tiendaId: "", otra: { nombre: "", direccion: "", pos: null }, entrega: null, pickMode: "entrega", descripcion: "", referencia: "", pago: "Efectivo" };
const mine = (db, uid) => Object.values(db.orders).filter(o => o.clienteId === uid).sort((a, b) => b.creado - a.creado);
const isOpen = o => !["entregado", "cancelado"].includes(o.estado);

/* ---------- Nuevo pedido ---------- */
const nuevo = {
  title: "Nuevo pedido", static: true,
  render(ctx) {
    const { db, user } = ctx;
    const shops = Object.values(db.establishments).filter(e => e.activo);
    const w = db.wallets[user.uid] || { saldo: 0, retenido: 0 };
    const saldoOk = db.config.saldoClienteHabilitado;
    const zonaOk = db.zones.camana.activa;
    return `
    ${zonaOk ? "" : `<div class="banner bad">Por ahora RAPIDIN no está recibiendo pedidos en Camaná. Vuelve a intentarlo más tarde.</div>`}
    <form class="grid-2 wide-left" data-form="crear" novalidate>
      <section class="card">
        <h2 class="card-t">¿Qué necesitas?</h2>
        <div class="f"><span class="lbl">Modalidad</span>
          <div class="choice">
            <input type="radio" name="modalidad" id="mLibre" value="libre" data-change="mod" ${draft.modalidad === "libre" ? "checked" : ""}><label for="mLibre"><b>Compra libre</b><span>Describe lo que necesitas y el repartidor elige dónde comprar.</span></label>
            <input type="radio" name="modalidad" id="mTienda" value="tienda" data-change="mod" ${draft.modalidad === "tienda" ? "checked" : ""}><label for="mTienda"><b>Tienda específica</b><span>Tú eliges el establecimiento.</span></label>
          </div>
        </div>
        <div id="tiendaBox" ${draft.modalidad === "tienda" ? "" : "hidden"}>
          <div class="f"><label for="nTienda">Establecimiento</label>
            <select class="in" id="nTienda" name="tiendaId" data-change="tienda">
              <option value="">Elige un establecimiento</option>
              ${shops.map(e => `<option value="${e.id}" ${draft.tiendaId === e.id ? "selected" : ""}>${esc(e.nombre)} · ${esc(e.categoria)} · ${esc(e.horario)}</option>`).join("")}
              <option value="otra" ${draft.tiendaId === "otra" ? "selected" : ""}>Otra tienda (escribir dirección)</option>
            </select></div>
          <div id="otraBox" class="two" ${draft.tiendaId === "otra" ? "" : "hidden"}>
            <div class="f"><label for="nOtraN">Nombre de la tienda</label><input class="in" id="nOtraN" name="otraNombre" value="${esc(draft.otra.nombre)}" data-input="otra"></div>
            <div class="f"><label for="nOtraD">Dirección</label><input class="in" id="nOtraD" name="otraDireccion" value="${esc(draft.otra.direccion)}" data-input="otra"></div>
          </div>
        </div>
        <div class="f"><label for="nDesc">Detalle del pedido</label>
          <textarea class="in" id="nDesc" name="descripcion" rows="4" data-input="desc" placeholder="${draft.modalidad === "libre" ? "Ej.: 1 kg de limones, un paquete de arroz de 5 kg y una gaseosa de 1.5 L" : "Ej.: 1 pollo a la brasa entero con papas y ensalada"}">${esc(draft.descripcion)}</textarea>
          <span class="hint-s">Sé específico: marca, tamaño y cantidad ayudan a recibir ofertas más exactas.</span></div>
        <div class="f">
          <div class="map-head"><span class="lbl">Ubicaciones</span>
            <div class="seg-sm" role="group" aria-label="Qué marcar en el mapa">
              <button type="button" data-act="pick" data-mode="entrega" aria-pressed="${draft.pickMode === "entrega"}">Marcar entrega</button>
              <button type="button" data-act="pick" data-mode="tienda" aria-pressed="${draft.pickMode === "tienda"}" ${draft.tiendaId === "otra" && draft.modalidad === "tienda" ? "" : "hidden"}>Marcar tienda</button>
            </div></div>
          <canvas class="map pick" id="nMap" style="height:300px" role="img" aria-label="Mapa de Camaná: toca para marcar el punto de entrega"></canvas>
          <span class="hint-s" id="nMapHint"></span>
        </div>
        <div class="two">
          <div class="f"><label for="nRef">Referencia de entrega</label><input class="in" id="nRef" name="referencia" value="${esc(draft.referencia)}" data-input="ref" placeholder="Casa verde, 2.º piso, frente al parque"></div>
          <div class="f"><label for="nPago">Medio de pago</label>
            <select class="in" id="nPago" name="pago" data-change="pago">
              ${["Efectivo", "Yape", "Plin", "Lemon", ...(saldoOk ? ["Saldo RAPIDIN"] : [])].map(p => `<option ${draft.pago === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
            ${saldoOk ? `<span class="hint-s">Saldo disponible: ${sol(api.saldoDisponible(w))}</span>` : ""}</div>
        </div>
      </section>
      <aside class="stack">
        <section class="card">
          <h2 class="card-t">Contacto para este pedido</h2>
          ${avatar(user.uid, user.nombre, "lg")}
          <p style="margin-top:10px"><b>${esc(user.nombre)}</b><br><span class="muted">WhatsApp ${fmtPhone(user.whatsapp)}</span></p>
          <p class="hint-s" style="margin-top:8px">Solo el repartidor que aceptes verá tu número, y solo mientras dure el pedido.</p>
          <a class="link" href="#cliente-perfil">Cambiar mis datos</a>
        </section>
        <section class="card soft" id="nSummary">${summary(ctx)}</section>
        <p class="err" id="nErr" role="alert"></p>
        <button class="btn" type="submit" style="width:100%;justify-content:center" ${zonaOk ? "" : "disabled"}>Publicar solicitud</button>
        <p class="hint-s center">Los repartidores disponibles en Camaná te enviarán sus ofertas. Tú eliges.</p>
      </aside>
    </form>`;
  },
  mount(root, ctx) {
    const cv = $("#nMap", root);
    const draw = () => {
      const db = ctx.db, markers = [];
      Object.values(db.establishments).filter(e => e.activo).forEach(e => markers.push({ pos: e.pos, type: "shop" }));
      const t = shopPos(db);
      if (t) markers.push({ pos: t, type: "tienda", label: draft.modalidad === "tienda" ? "Tienda" : undefined });
      if (draft.entrega) markers.push({ pos: draft.entrega, type: "entrega", label: "Entrega" });
      drawMap(cv, { markers, route: t && draft.entrega ? [t, draft.entrega] : null, plaza: db.config.puntoEstrategico.pos });
      const hint = $("#nMapHint", root);
      hint.textContent = draft.pickMode === "tienda" ? "Toca el mapa donde está la tienda." : draft.entrega ? "Punto de entrega marcado. Toca otra vez para moverlo." : "Toca el mapa para marcar dónde recibes tu pedido.";
      $("#nSummary", root).innerHTML = summary(ctx);
    };
    nuevo._draw = draw;
    cv.addEventListener("click", e => {
      const p = pickPos(cv, e);
      if (p.x < MAP.mar + 0.03) { toast("Ese punto cae en el mar. Toca una calle de Camaná.", "bad"); return; }
      if (draft.pickMode === "tienda") { draft.otra.pos = p; draft.pickMode = "entrega"; $$("[data-act=pick]", root).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === "entrega"))); }
      else draft.entrega = p;
      draw();
    });
    draw();
  },
  changes: {
    mod(el) { draft.modalidad = el.value; $("#tiendaBox").hidden = el.value !== "tienda"; syncPickButtons(); nuevo._draw?.(); },
    tienda(el) { draft.tiendaId = el.value; $("#otraBox").hidden = el.value !== "otra"; if (el.value === "otra" && !draft.otra.pos) setPick("tienda"); syncPickButtons(); nuevo._draw?.(); },
    pago(el) { draft.pago = el.value; },
  },
  inputs: {
    desc(el) { draft.descripcion = el.value; }, ref(el) { draft.referencia = el.value; },
    otra() { draft.otra.nombre = $("#nOtraN").value; draft.otra.direccion = $("#nOtraD").value; },
  },
  actions: { pick(b) { setPick(b.dataset.mode); } },
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
      if (!draft.entrega) return (err.textContent = "Toca el mapa para marcar dónde recibes tu pedido.");
      const id = run(() => api.createOrder(ctx.uid, { modalidad: draft.modalidad, descripcion: draft.descripcion, tienda, entrega: { pos: draft.entrega, referencia: draft.referencia.trim() }, pago: draft.pago }), "Solicitud publicada. Ya estamos buscando repartidores.");
      if (id) { Object.assign(draft, { descripcion: "", referencia: "", tiendaId: "", otra: { nombre: "", direccion: "", pos: null }, pickMode: "entrega" }); ctx.go("#cliente-pedido", { id }); }
    },
  },
};
function shopPos(db) {
  if (draft.modalidad !== "tienda") return null;
  if (draft.tiendaId === "otra") return draft.otra.pos;
  return db.establishments[draft.tiendaId]?.pos || null;
}
function setPick(mode) { draft.pickMode = mode; $$("[data-act=pick]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode))); nuevo._draw?.(); }
function syncPickButtons() { const b = $('[data-act=pick][data-mode="tienda"]'); if (b) b.hidden = !(draft.modalidad === "tienda" && draft.tiendaId === "otra"); if (b?.hidden && draft.pickMode === "tienda") setPick("entrega"); }
function summary(ctx) {
  const db = ctx.db, t = shopPos(db);
  const km = t ? roadKm(db.config.puntoEstrategico.pos, t) : null;
  return `<h2 class="card-t">Resumen</h2>
    <dl class="kv">
      <div><dt>Modalidad</dt><dd>${draft.modalidad === "libre" ? "Compra libre" : "Tienda específica"}</dd></div>
      ${km != null ? `<div><dt>Distancia de la tienda al centro</dt><dd>${km.toFixed(1)} km</dd></div>` : ""}
      <div><dt>Entrega</dt><dd>${draft.entrega ? "Marcada en el mapa" : `<span class="muted">Falta marcar</span>`}</dd></div>
      <div><dt>Precio</dt><dd>Lo proponen los repartidores</dd></div>
    </dl>`;
}

/* ---------- Mis pedidos ---------- */
const pedidos = {
  title: "Mis pedidos",
  render(ctx) {
    const tab = ctx.state.tab || "curso";
    return `<div class="toolbar">
      <div class="seg-sm" role="tablist">
        <button type="button" role="tab" data-act="tab" data-tab="curso" aria-selected="${tab === "curso"}">En curso</button>
        <button type="button" role="tab" data-act="tab" data-tab="historial" aria-selected="${tab === "historial"}">Historial</button>
      </div>
      <a class="btn small" href="#cliente-nuevo">Nuevo pedido</a></div>
      ${ctx.live("lista", () => list(ctx, tab))}`;
  },
  actions: { tab(b, ctx) { ctx.state.tab = b.dataset.tab; ctx.rerender(); }, open(b, ctx) { ctx.go("#cliente-pedido", { id: b.dataset.id }); } },
};
function list(ctx, tab) {
  const db = ctx.db, all = mine(db, ctx.uid).filter(o => (tab === "curso" ? isOpen(o) : !isOpen(o)));
  if (!all.length) return tab === "curso" ? empty("No tienes pedidos en curso", "Publica una solicitud y recibe ofertas de repartidores de Camaná.", `<a class="btn small" href="#cliente-nuevo">Hacer un pedido</a>`) : empty("Aún no tienes historial", "Aquí verás tus pedidos entregados y cancelados.");
  return `<div class="cards">${all.map(o => {
    const act = Object.values(o.offers).filter(x => x.estado === "activa").length;
    return `<button type="button" class="order-card" data-act="open" data-id="${o.id}">
      <div class="oc-top"><b>${o.codigo}</b>${chip(o.estado)}</div>
      <p class="oc-desc">${esc(o.descripcion)}</p>
      <div class="oc-meta"><span>${o.tienda ? esc(o.tienda.nombre) : "Compra libre"}</span><span>${ago(o.creado)}</span></div>
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
          ${of.costoProductos ? `<div><dt>Productos (estimado)</dt><dd>${sol(of.costoProductos)}</dd></div>` : ""}
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
        <p class="m-text">${o.courierId ? "El repartidor ya fue asignado. Al cancelar no se le cobra comisión." : "Se cerrarán las ofertas recibidas."}${o.pago === "Saldo RAPIDIN" && o.retencion ? " Liberaremos el monto retenido de tu saldo." : ""}</p>
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
            <span class="meta">${of.costoProductos ? `Productos ${sol(of.costoProductos)} + envío ${sol(of.tarifa)}` : `Envío ${sol(of.tarifa)}`}</span>
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
        ${cuentas.length ? cuentas.map(c => `<b>${esc(c.tipo)}: ${fmtPhone(c.numero)}</b><small>Titular: ${esc(c.titular)}</small>`).join("") : `<b>El repartidor no tiene ${esc(o.pago)} verificado. Escríbele para coordinar.</b>`}
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
  <div class="det-head"><div><span class="muted">${o.codigo} · ${ago(o.creado)}</span><h2>${esc(o.descripcion)}</h2></div>${chip(o.estado)}</div>
  <div class="grid-2">
    <div class="stack">
      ${main}
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
        <section class="card"><h2 class="card-t">Recargas</h2>${tops.length ? `<ul class="rows">${tops.map(t => `<li><div><b>${sol(t.monto)} · ${esc(t.metodo)}</b><small>Operación ${esc(t.operacion)} · ${ago(t.creado)}</small></div><span class="chip ${t.estado === "confirmada" ? "ok" : t.estado === "rechazada" ? "bad" : "warn"}">${t.estado === "pendiente" ? "Por verificar" : t.estado === "confirmada" ? "Verificada" : "Rechazada"}</span></li>`).join("")}</ul>` : `<p class="muted">Aún no hiciste recargas.</p>`}</section>
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
    <div class="two"><div class="f"><label for="tM">Monto (S/)</label><input class="in" id="tM" name="m" inputmode="decimal" placeholder="20.00"></div>
    <div class="f"><label for="tMet">Medio</label><select class="in" id="tMet" name="met"><option>Yape</option><option>Plin</option><option>Lemon</option></select></div></div>
    <div class="f"><label for="tOp">Código de operación</label><input class="in" id="tOp" name="op" inputmode="numeric" placeholder="Ej.: 73519284"></div>
    <p class="err" id="tErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Enviar para verificar</button></div></form>`,
    { t: f => { const m = num(f.m.value); if (!(m > 0)) return ($("#tErr").textContent = "Escribe el monto."); if (run(() => api.requestTopup(ctx.uid, { monto: m, metodo: f.met.value, operacion: f.op.value.trim() }), "Recarga enviada. Te avisaremos cuando se verifique.")) closeModal(); } });
}

/* ---------- Perfil ---------- */
export const perfilView = (back) => ({
  title: "Mi perfil", static: true,
  render(ctx) {
    const u = ctx.user;
    return `<form class="card narrow" data-form="perfil" novalidate>
      <div class="person big">${avatar(u.uid, u.nombre, "lg")}<div><b>${esc(u.nombre)}</b><span>${esc(u.correo)}</span></div></div>
      <div class="f"><label for="pfN">Nombres y apellidos</label><input class="in" id="pfN" name="nombre" value="${esc(u.nombre)}" autocomplete="name"></div>
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
      const nombre = f.nombre.value.trim().replace(/\s+/g, " "), tel = normPhone(f.telefono.value), wa = normPhone(f.whatsapp.value);
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
  home: () => "#cliente-pedidos",
  defaultView: (u, db) => (mine(db, u.uid).some(isOpen) ? "pedidos" : "nuevo"),
  resolve(v, u, db) { return null; },
  nav(u, db) {
    const open = mine(db, u.uid).filter(isOpen);
    const offers = open.reduce((s, o) => s + Object.values(o.offers).filter(x => x.estado === "activa").length, 0);
    return [
      { id: "nuevo", label: "Nuevo pedido", short: "Pedir", icon: "plus" },
      { id: "pedidos", label: "Mis pedidos", short: "Pedidos", icon: "list", badge: offers || (open.length || "") },
      ...(db.config.saldoClienteHabilitado ? [{ id: "billetera", label: "Billetera", short: "Saldo", icon: "wallet" }] : []),
      { id: "perfil", label: "Mi perfil", short: "Perfil", icon: "user" },
    ];
  },
  views: { nuevo, pedidos, pedido, billetera, perfil: perfilView(`<a class="btn ghost-dark" href="#repartidor-postulacion">Quiero ser repartidor</a>`) },
};
