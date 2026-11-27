/* RAPIDIN · Panel administrativo (en producción será un sitio aparte) */
import * as api from "../demo/api.js";
import { MAP, roadKm, isOpen, statusLabel, hoursLabel, ESPECIALIDADES, initialData } from "../demo/store.js";
import { $, $$, esc, sol, fmtPhone, normPhone, fmtDate, run, modal, closeModal, confirmModal, num, chip, payChip, ago, empty, avatar, stars, shortName, waLink, telLink, imageField, bindImageFields, shrinkImage, IMG } from "../ui.js";
import { locationField } from "../location.js";
import { mapBox, createPicker } from "../map.js";
import { timeline, orderMap, orderSummaryRows, courierMini, vehLabel, itemsList, catIcon, catOf, productThumb, storeLogo, coverStyle, ratingTag, tagsLine } from "./common.js";

const real = (db, id) => !db.users[id]?.bot;
const counts = db => {
  const o = Object.values(db.orders);
  return {
    apps: Object.values(db.courierApplications).filter(a => a.estado === "pendiente").length,
    biz: Object.values(db.businessApplications || {}).filter(a => a.estado === "pendiente").length,
    tops: Object.values(db.topups).filter(t => t.estado === "pendiente").length,
    wds: Object.values(db.withdrawals).filter(t => t.estado === "pendiente").length,
    rev: o.filter(x => x.estadoPago === "en_revision" || x.estado === "en_revision").length,
    reps: o.reduce((s, x) => s + (x.reportes || []).filter(r => r.estado === "abierto").length, 0),
    act: o.filter(x => api.ACTIVE_STATES.includes(x.estado)).length,
    open: o.filter(x => api.OPEN_STATES.includes(x.estado)).length,
  };
};
const userName = (db, id) => esc(db.users[id]?.nombre || "—");
const botTag = (db, id) => (db.users[id]?.bot ? ` <span class="chip muted sm">simulado</span>` : "");

/* ---------- Resumen ---------- */
const resumen = {
  title: "Resumen",
  actions: {
    seed(b, ctx) {
      b.disabled = true; b.textContent = "Cargando…";
      if (run(() => api.seedInitialData(ctx.uid, initialData()), "Listo: configuración, comisiones y Puerto en Llamas cargados.")) return;
      b.disabled = false; b.textContent = "Cargar datos iniciales";
    },
  },
  render(ctx) {
    return ctx.live("seed", () => ctx.db.isFb && !ctx.db.metaLoaded ? `<section class="card seed-card"><div><h2 class="card-t">Bienvenido a RAPIDIN</h2>
      <p class="muted">Tu base de datos está vacía. Carga la configuración inicial: tabla de comisiones, zona de Camaná y <b>Puerto en Llamas by Ala Ruta</b> con su carta completa. Solo se hace una vez.</p></div>
      <button class="btn" type="button" data-act="seed">Cargar datos iniciales</button></section>` : "") + ctx.live("res", () => {
      const db = ctx.db, c = counts(db), t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const fees = db.walletLedger.filter(l => l.tipo === "cobro_comision");
      const feeHoy = fees.filter(l => l.t >= t0).reduce((s, l) => s - l.monto, 0), feeTot = fees.reduce((s, l) => s - l.monto, 0);
      const entregadosHoy = Object.values(db.orders).filter(o => o.estado === "entregado" && o.actualizado >= t0).length;
      const activos = Object.values(db.couriers).filter(x => x.disponible && db.users[x.uid]?.roles.repartidor === "aprobado").length;
      const custody = Object.values(db.wallets).reduce((s, w) => s + w.saldo + w.recargas + w.ganancias, 0);
      const att = [
        c.biz && [`${c.biz} negocio${c.biz > 1 ? "s" : ""} por registrar`, "#admin-negocios"],
        c.apps && [`${c.apps} postulación${c.apps > 1 ? "es" : ""} por revisar`, "#admin-postulaciones"],
        c.tops && [`${c.tops} recarga${c.tops > 1 ? "s" : ""} por verificar`, "#admin-recargas"],
        c.wds && [`${c.wds} retiro${c.wds > 1 ? "s" : ""} por aprobar`, "#admin-retiros"],
        c.rev && [`${c.rev} pago${c.rev > 1 ? "s" : ""} en revisión`, "#admin-pedidos"],
        c.reps && [`${c.reps} reclamo${c.reps > 1 ? "s" : ""} abierto${c.reps > 1 ? "s" : ""}`, "#admin-reclamos"],
      ].filter(Boolean);
      const recent = Object.values(db.orders).sort((a, b) => b.actualizado - a.actualizado).slice(0, 8);
      const byState = {}; Object.values(db.orders).forEach(o => { const k = api.OPEN_STATES.includes(o.estado) ? "Abiertos" : api.ACTIVE_STATES.includes(o.estado) ? "En curso" : o.estado === "entregado" ? "Entregados" : "Cancelados"; byState[k] = (byState[k] || 0) + 1; });
      const max = Math.max(1, ...Object.values(byState));
      return `<div class="kpis four">
        <div class="kpi"><small>Pedidos en curso</small><b>${c.act}</b><span class="muted">${c.open} buscando repartidor</span></div>
        <div class="kpi"><small>Entregados hoy</small><b>${entregadosHoy}</b><span class="muted">${Object.values(db.orders).filter(o => o.estado === "entregado").length} en total</span></div>
        <div class="kpi"><small>Comisiones cobradas hoy</small><b class="pos">${sol(feeHoy)}</b><span class="muted">${sol(feeTot)} acumulado · ingreso RAPIDIN</span></div>
        <div class="kpi"><small>Repartidores disponibles</small><b>${activos}</b><span class="muted">${Object.keys(db.couriers).length} aprobados</span></div>
      </div>
      <div class="grid-2 wide-left">
        <section class="card"><div class="card-head"><h2 class="card-t">Pedidos recientes</h2><a class="link" href="#admin-pedidos">Ver todos</a></div>${ordersTable(db, recent)}</section>
        <div class="stack">
          <section class="card"><h2 class="card-t">Requiere atención</h2>${att.length ? `<ul class="att">${att.map(([t, h]) => `<li><a href="${h}">${esc(t)}<span>→</span></a></li>`).join("")}</ul>` : `<p class="muted">Todo al día.</p>`}</section>
          <section class="card"><h2 class="card-t">Pedidos por estado</h2><div class="bars">${["Abiertos", "En curso", "Entregados", "Cancelados"].map(k => `<div class="bar-row"><span>${k}</span><div class="bar"><i style="width:${((byState[k] || 0) / max) * 100}%"></i></div><b>${byState[k] || 0}</b></div>`).join("")}</div></section>
          <section class="card soft"><h2 class="card-t">Saldos de terceros en custodia</h2><b class="big-num">${sol(custody)}</b><p class="hint-s">Recargas y ganancias de usuarios. No son ingresos de RAPIDIN. Consulta a un contador antes de activar el saldo en producción.</p></section>
        </div>
      </div>`;
    });
  },
  actions: { open(b, ctx) { ctx.go("#admin-pedido", { id: b.dataset.id }); } },
};
function ordersTable(db, list) {
  if (!list.length) return `<p class="muted">Sin pedidos.</p>`;
  return `<div class="table-wrap"><table class="table click"><thead><tr><th>Pedido</th><th>Cliente</th><th>Repartidor</th><th>Total</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody>
    ${list.map(o => `<tr data-act="open" data-id="${o.id}" tabindex="0"><td><b>${o.codigo}</b><small>${api.MODALIDAD[o.modalidad]}${o.tienda ? ` · ${esc(o.tienda.nombre)}` : ""}</small></td><td>${userName(db, o.clienteId)}${botTag(db, o.clienteId)}</td><td>${o.courierId ? userName(db, o.courierId) + botTag(db, o.courierId) : `<span class="muted">—</span>`}</td><td>${o.precioTotal != null ? sol(o.precioTotal) : "—"}<small>${esc(o.pago)}</small></td><td>${chip(o.estado)}${o.estadoPago === "en_revision" ? payChip("en_revision") : ""}</td><td>${ago(o.actualizado)}</td></tr>`).join("")}
  </tbody></table></div>`;
}

/* ---------- Pedidos ---------- */
const FILTERS = { todos: "Todos", abiertos: "Abiertos", curso: "En curso", entregados: "Entregados", cancelados: "Cancelados", revision: "Pago en revisión" };
const pedidos = {
  title: "Pedidos",
  render(ctx) {
    const f = ctx.state.filter || "todos";
    return `<div class="toolbar"><div class="chips-filter">${Object.entries(FILTERS).map(([k, v]) => `<button type="button" data-act="filter" data-f="${k}" aria-pressed="${f === k}">${v}</button>`).join("")}</div>
      <input class="in search" type="search" placeholder="Buscar código o cliente" value="${esc(ctx.state.q || "")}" data-input="q" aria-label="Buscar pedido"></div>
      ${ctx.live("ped", () => {
        const db = ctx.db, q = (ctx.state.q || "").toLowerCase();
        const list = Object.values(db.orders).filter(o =>
          (f === "todos" || (f === "abiertos" && api.OPEN_STATES.includes(o.estado)) || (f === "curso" && api.ACTIVE_STATES.includes(o.estado)) || (f === "entregados" && o.estado === "entregado") || (f === "cancelados" && o.estado === "cancelado") || (f === "revision" && o.estadoPago === "en_revision"))
          && (!q || o.codigo.toLowerCase().includes(q) || (db.users[o.clienteId]?.nombre || "").toLowerCase().includes(q))).sort((a, b) => b.creado - a.creado);
        return `<section class="card">${ordersTable(db, list)}</section>`;
      })}`;
  },
  actions: { filter(b, ctx) { ctx.state.filter = b.dataset.f; ctx.rerender(); }, open(b, ctx) { ctx.go("#admin-pedido", { id: b.dataset.id }); } },
  inputs: { q(el, ctx) { ctx.state.q = el.value; ctx.refresh(); } },
};

const pedido = {
  title: "Detalle del pedido", parent: "pedidos",
  render(ctx) {
    const o = ctx.db.orders[ctx.state.id];
    if (!o) return empty("No encontramos este pedido", "Vuelve a la lista de pedidos.", `<a class="btn small" href="#admin-pedidos">Pedidos</a>`);
    return `<a class="back" href="#admin-pedidos">← Pedidos</a>${ctx.live("ap", () => adminOrder(ctx))}`;
  },
  actions: {
    cancel(b, ctx) {
      const o = ctx.db.orders[ctx.state.id];
      modal(`Cancelar ${o.codigo}`, `<form data-mform="c" novalidate><p class="m-text">Se liberan todas las reservas de comisión y cualquier saldo retenido del cliente. Queda registrado en auditoría.</p>
        <div class="f"><label for="acM">Motivo</label><input class="in" id="acM" name="m" placeholder="Ej.: Cliente no responde, repartidor con incidente"></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn danger" type="submit">Cancelar pedido</button></div></form>`,
        { c: f => { if (!f.m.value.trim()) return; if (run(() => api.cancelOrder(ctx.uid, o.id, f.m.value.trim()), "Pedido cancelado.")) closeModal(); } });
    },
    pay(b, ctx) { run(() => api.resolvePayment(ctx.uid, ctx.state.id, b.dataset.d), "Pago resuelto."); },
    delivOk(b, ctx) { run(() => api.resolveDelivery(ctx.uid, ctx.state.id, true), "Entrega confirmada. Se cobró la comisión."); },
    delivNo(b, ctx) { confirmModal("Cancelar pedido", "El pedido se cancela y no se cobra comisión al repartidor. ¿Continuar?", "Sí, cancelar", () => run(() => api.resolveDelivery(ctx.uid, ctx.state.id, false), "Pedido cancelado.")); },
    reply(b, ctx) { replyModal(ctx, ctx.state.id, b.dataset.r); },
  },
};
function adminOrder(ctx) {
  const db = ctx.db, o = db.orders[ctx.state.id]; if (!o) return "";
  const offers = Object.values(o.offers).sort((a, b) => a.creado - b.creado);
  const L = { activa: ["Activa", "warn"], aceptada: ["Aceptada", "ok"], rechazada: ["No elegida", "muted"], vencida: ["Vencida", "muted"], retirada: ["Retirada", "muted"] };
  return `<div class="det-head"><div><span class="muted">${o.codigo} · ${api.MODALIDAD[o.modalidad]} · creado ${ago(o.creado)}</span><h2>${o.modalidad === "catalogo" ? `Pedido del Market · ${esc(o.tienda.nombre)}` : esc(o.descripcion)}</h2></div><div class="row-btns">${chip(o.estado)}${payChip(o.estadoPago)}</div></div>
  <div class="grid-2">
    <div class="stack">
      ${o.estado === "en_revision" && o.entregaMarcada ? `<section class="card action-card"><small>Entrega en disputa</small><p>El repartidor marcó la entrega ${fmtDate(o.entregaMarcada)} y el cliente dice que no la recibió. Lee el chat, llama a ambos y decide.</p><div class="row-btns"><button class="btn small danger" type="button" data-act="delivNo">No se entregó · cancelar</button><button class="btn small teal" type="button" data-act="delivOk">Sí se entregó · cerrar</button></div></section>` : ""}
      ${o.estadoPago === "en_revision" ? `<section class="card action-card"><small>Pago en revisión</small><p>El cliente avisó que pagó por ${esc(o.pago)} y el repartidor dice que aún no le llega. Revisa el chat del pedido, llama a ambos y decide.</p><div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="pay" data-d="rechazar">Pago no válido</button><button class="btn small teal" type="button" data-act="pay" data-d="confirmar">Confirmar pago</button></div></section>` : ""}
      <section class="card"><h2 class="card-t">Participantes</h2>
        <div class="person">${avatar(o.clienteId, db.users[o.clienteId].nombre)}<div><b>${userName(db, o.clienteId)}${botTag(db, o.clienteId)}</b><span>Cliente · ${telLink(db.users[o.clienteId].telefono)}</span></div></div>
        ${o.courierId ? courierMini(db, o.courierId, `<span class="adm-tel">${telLink(db.users[o.courierId].telefono)}</span>`) : `<p class="muted" style="margin-top:10px">Sin repartidor asignado.</p>`}
      </section>
      ${(o.chat || []).length ? `<section class="card"><h2 class="card-t">Chat del pedido (${o.chat.length})</h2><div class="chat-log">${o.chat.map(m => `<div class="msg ${m.por === o.courierId ? "me" : "them"}"><small>${m.por === o.courierId ? "Repartidor" : "Cliente"} · ${fmtDate(m.t)}</small><p>${esc(m.texto)}</p></div>`).join("")}</div></section>` : ""}
      <section class="card"><h2 class="card-t">Ofertas (${offers.length})</h2>${offers.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Repartidor</th><th>Total</th><th>Comisión</th><th>Estado</th></tr></thead><tbody>${offers.map(of => `<tr><td>${userName(db, of.courierId)}<small>${of.tiempo} min · ${ago(of.creado)}</small></td><td>${sol(of.total)}<small>Envío ${sol(of.tarifa)}</small></td><td>${sol(of.comision)}</td><td><span class="chip ${L[of.estado][1]}">${L[of.estado][0]}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Sin ofertas todavía.</p>`}</section>
      ${o.items ? `<section class="card"><h2 class="card-t">Productos</h2>${itemsList(o)}</section>` : ""}
      <section class="card"><h2 class="card-t">Detalle</h2>${orderSummaryRows(o)}${o.comision != null ? `<p class="hint-s" style="margin-top:10px">Comisión de la plataforma: ${sol(o.comision)} (${o.estado === "entregado" ? "cobrada" : o.estado === "cancelado" ? "liberada" : "reservada"}).</p>` : ""}${o.evidencia ? `<p class="hint-s">Evidencia de entrega: ${esc(o.evidencia)}</p>` : ""}</section>
      ${(o.reportes || []).length ? `<section class="card"><h2 class="card-t">Reclamos</h2><ul class="rows">${o.reportes.map(r => `<li><div><b>${userName(db, r.por)}</b><small>${esc(r.texto)}</small>${r.respuesta ? `<small>Respuesta: ${esc(r.respuesta)}</small>` : ""}</div>${r.estado === "abierto" ? `<button class="btn small" type="button" data-act="reply" data-r="${r.id}">Responder</button>` : `<span class="chip ok">Resuelto</span>`}</li>`).join("")}</ul></section>` : ""}
      ${!["entregado", "cancelado"].includes(o.estado) ? `<div class="row-btns"><button class="btn small danger" type="button" data-act="cancel">Cancelar pedido</button></div>` : ""}
    </div>
    <div class="stack"><section class="card">${orderMap(o, db)}</section><section class="card"><h2 class="card-t">Historial de estados</h2>${timeline(o)}</section></div>
  </div>`;
}
function replyModal(ctx, orderId, reportId) {
  modal("Responder reclamo", `<form data-mform="r" novalidate><div class="f"><label for="rr">Respuesta para el usuario</label><textarea class="in" id="rr" name="r" rows="4" placeholder="Ej.: Hablamos con el repartidor y te devolveremos S/ 3.00 a tu saldo."></textarea></div>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Marcar como resuelto</button></div></form>`,
    { r: f => { if (run(() => api.resolveReport(ctx.uid, orderId, reportId, f.r.value), "Reclamo resuelto.")) closeModal(); } });
}

/* ---------- Postulaciones ---------- */
const postulaciones = {
  title: "Solicitudes de repartidores",
  render(ctx) {
    return ctx.live("apps", () => {
      const db = ctx.db, list = Object.values(db.courierApplications).sort((a, b) => (a.estado === "pendiente" ? -1 : 1) - (b.estado === "pendiente" ? -1 : 1) || b.creado - a.creado);
      if (!list.length) return empty("Sin postulaciones", "Las solicitudes de nuevos repartidores aparecerán aquí.");
      return `<div class="cards">${list.map(a => `<article class="order-card static">
        <div class="oc-top">${avatar(a.uid, a.nombre)}<span class="chip ${a.estado === "pendiente" ? "warn" : a.estado === "aprobada" ? "ok" : "bad"}">${a.estado === "pendiente" ? "Pendiente" : a.estado === "aprobada" ? "Aprobada" : "Rechazada"}</span></div>
        <b>${esc(a.nombre)}</b>
        <dl class="kv sm"><div><dt>DNI</dt><dd>${esc(a.dni)}</dd></div><div><dt>Celular</dt><dd>${telLink(a.celular)}</dd></div><div><dt>Vehículo</dt><dd>${vehLabel(a.vehiculo)}</dd></div><div><dt>Yape</dt><dd>${fmtPhone(a.yape || a.celular)}</dd></div>
        <div><dt>Documentos</dt><dd>${a.docs.map(d => `<span class="doc">${esc(d)}</span>`).join(" ")}</dd></div><div><dt>Enviada</dt><dd>${ago(a.creado)}</dd></div>${a.nota ? `<div><dt>Nota</dt><dd>${esc(a.nota)}</dd></div>` : ""}</dl>
        ${a.estado === "pendiente" ? `<div class="oc-foot"><button class="btn small ghost-dark" type="button" data-act="reject" data-id="${a.id}">Rechazar</button><button class="btn small teal" type="button" data-act="approve" data-id="${a.id}">Aprobar</button></div>` : ""}
      </article>`).join("")}</div>`;
    });
  },
  actions: {
    approve(b, ctx) { const a = ctx.db.courierApplications[b.dataset.id]; confirmModal("Aprobar repartidor", `${a.nombre} podrá ver pedidos de Camaná y ofertar. Sus cuentas de cobro quedan verificadas.`, "Aprobar", () => run(() => api.approveCourier(ctx.uid, a.id, true), "Repartidor aprobado."), "teal"); },
    reject(b, ctx) {
      modal("Rechazar postulación", `<form data-mform="r" novalidate><div class="f"><label for="rjN">Motivo (lo verá el postulante)</label><input class="in" id="rjN" name="n" placeholder="Ej.: La foto del DNI no se lee bien"></div>
        <p class="err" id="rjErr" role="alert"></p><div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn danger" type="submit">Rechazar</button></div></form>`,
        { r: f => { if (f.n.value.trim().length < 5) return ($("#rjErr").textContent = "Explica el motivo para que pueda corregirlo."); if (run(() => api.approveCourier(ctx.uid, b.dataset.id, false, f.n.value.trim()), "Postulación rechazada.")) closeModal(); } });
    },
  },
};

/* ---------- Usuarios ---------- */
const usuarios = {
  title: "Usuarios",
  render(ctx) {
    const f = ctx.state.ufilter || "todos";
    return `<div class="toolbar"><div class="chips-filter">${[["todos", "Todos"], ["clientes", "Clientes"], ["repartidores", "Repartidores"], ["suspendidos", "Suspendidos"]].map(([k, v]) => `<button type="button" data-act="uf" data-f="${k}" aria-pressed="${f === k}">${v}</button>`).join("")}</div>
      <label class="check inline"><input type="checkbox" data-change="bots" ${ctx.state.bots ? "checked" : ""}> <span>Mostrar cuentas simuladas</span></label></div>
      ${ctx.live("us", () => {
        const db = ctx.db;
        const list = Object.values(db.users).filter(u => (ctx.state.bots || !u.bot) && (f === "todos" || (f === "clientes" && u.roles.cliente) || (f === "repartidores" && u.roles.repartidor) || (f === "suspendidos" && u.estado === "suspendido"))).sort((a, b) => b.creado - a.creado);
        return `<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Contacto</th><th>Roles</th><th>Billetera</th><th>Estado</th><th></th></tr></thead><tbody>
        ${list.map(u => { const w = db.wallets[u.uid] || {}; return `<tr><td><div class="person sm">${avatar(u.uid, u.nombre)}<div><b>${esc(u.nombre)}${u.bot ? ` <span class="chip muted sm">simulado</span>` : ""}</b><span>${esc(u.correo)}</span></div></div></td>
          <td>${telLink(u.telefono)}<small>${u.telefonoVerificado ? "Verificado" : "Sin verificar"}</small></td>
          <td>${[u.roles.admin && "Admin", u.roles.cliente && "Cliente", u.roles.repartidor && `Repartidor (${u.roles.repartidor})`].filter(Boolean).join(" · ")}</td>
          <td>${u.roles.repartidor === "aprobado" ? `Comisiones ${sol(w.recargas)}<small>Ganancias ${sol(w.ganancias)}</small>` : `Saldo ${sol(w.saldo)}`}</td>
          <td><span class="chip ${u.estado === "activo" ? "ok" : "bad"}">${u.estado === "activo" ? "Activo" : "Suspendido"}</span></td>
          <td class="t-actions">${u.uid !== ctx.uid ? `${api.nameLocked(u) ? `<button class="link" type="button" data-act="nombre" data-id="${u.uid}">Corregir nombre</button> ` : ""}<button class="link" type="button" data-act="adj" data-id="${u.uid}">Ajustar saldo</button> <button class="link ${u.estado === "activo" ? "danger-t" : ""}" type="button" data-act="susp" data-id="${u.uid}">${u.estado === "activo" ? "Suspender" : "Reactivar"}</button>` : `<span class="muted">Tú</span>`}</td></tr>`; }).join("")}
        </tbody></table></div></section>`;
      })}`;
  },
  changes: { bots(el, ctx) { ctx.state.bots = el.checked; ctx.rerender(); } },
  actions: {
    uf(b, ctx) { ctx.state.ufilter = b.dataset.f; ctx.rerender(); },
    susp(b, ctx) { const u = ctx.db.users[b.dataset.id], s = u.estado === "activo"; confirmModal(s ? "Suspender cuenta" : "Reactivar cuenta", s ? `${u.nombre} no podrá ingresar ni recibir pedidos hasta que lo reactives.` : `${u.nombre} podrá volver a usar RAPIDIN.`, s ? "Suspender" : "Reactivar", () => run(() => api.suspendAccount(ctx.uid, u.uid, s), s ? "Cuenta suspendida." : "Cuenta reactivada."), s ? "danger" : "teal"); },
    nombre(b, ctx) {
      const u = ctx.db.users[b.dataset.id];
      modal("Corregir nombre verificado", `<form data-mform="n" novalidate>
        <p class="m-text">El repartidor no puede cambiar su nombre. Corrígelo solo si no coincide con su DNI. El cambio queda en la auditoría y se le notifica.</p>
        <div class="f"><label for="nmA">Nombre actual</label><input class="in" id="nmA" value="${esc(u.nombre)}" disabled></div>
        <div class="f"><label for="nmN">Nombre según DNI</label><input class="in" id="nmN" name="n" value="${esc(u.nombre)}"></div>
        <div class="f"><label for="nmM">Motivo</label><input class="in" id="nmM" name="m" placeholder="Ej.: Error de tipeo en el segundo apellido"></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Guardar corrección</button></div></form>`,
        { n: f => { if (run(() => api.adminSetName(ctx.uid, u.uid, f.n.value, f.m.value), "Nombre corregido y registrado.")) closeModal(); } });
    },
    adj(b, ctx) {
      const u = ctx.db.users[b.dataset.id], rep = u.roles.repartidor === "aprobado";
      modal(`Ajustar billetera de ${shortName(u.nombre)}`, `<form data-mform="a" novalidate>
        <div class="two"><div class="f"><label for="ajC">Saldo</label><select class="in" id="ajC" name="c">${rep ? `<option value="recargas">Saldo para comisiones</option><option value="ganancias">Ganancias</option>` : `<option value="saldo">Saldo del cliente</option>`}</select></div>
        <div class="f"><label for="ajM">Monto (+ o −)</label><input class="in" id="ajM" name="m" inputmode="decimal" placeholder="Ej.: 5 o -3"></div></div>
        <div class="f"><label for="ajN">Motivo</label><input class="in" id="ajN" name="n" placeholder="Ej.: Devolución por pedido incompleto RP-1004"></div>
        <p class="err" id="ajErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Aplicar ajuste</button></div></form>`,
        { a: f => { const m = num(f.m.value); if (isNaN(m)) return ($("#ajErr").textContent = "Escribe un monto válido."); if (run(() => api.adjustWallet(ctx.uid, u.uid, f.c.value, m, f.n.value), "Ajuste aplicado y registrado.")) closeModal(); } });
    },
  },
};

/* ---------- Recargas y retiros ---------- */
const recargas = moneyView("Recargas", "topups", "tp", (db, t) => `${sol(t.monto)} · ${esc(t.metodo)}<small>Operación ${esc(t.operacion)}</small>`, "Verificar", "Confirma que el dinero llegó a la cuenta de RAPIDIN con ese código de operación.", (ctx, id, ok) => api.confirmTopup(ctx.uid, id, ok));
const retiros = moneyView("Retiros", "withdrawals", "wd", (db, t) => `${sol(t.monto)}<small>A ${esc(t.cuenta)} · ganancias ${sol(db.wallets[t.uid]?.ganancias || 0)}</small>`, "Marcar como pagado", "Envía el dinero a la cuenta indicada y luego márcalo como pagado.", (ctx, id, ok) => api.approveWithdrawal(ctx.uid, id, ok));
function moneyView(title, col, key, line, okLabel, help, fn) {
  return {
    title,
    render(ctx) {
      return ctx.live(key, () => {
        const db = ctx.db, list = Object.values(db[col]).sort((a, b) => (a.estado === "pendiente" ? -1 : 1) - (b.estado === "pendiente" ? -1 : 1) || b.creado - a.creado);
        if (!list.length) return empty(`Sin ${title.toLowerCase()}`, "Aparecerán aquí cuando los usuarios las soliciten.");
        const pend = list.filter(t => t.estado === "pendiente").length;
        return `<p class="hint-s" style="margin-bottom:14px">${esc(help)} ${pend ? `<b>${pend} pendiente${pend > 1 ? "s" : ""}.</b>` : ""}</p>
        <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Detalle</th><th>Solicitado</th><th>Estado</th><th></th></tr></thead><tbody>
        ${list.map(t => `<tr><td>${userName(db, t.uid)}<small>${db.users[t.uid]?.roles.repartidor === "aprobado" ? "Repartidor" : "Cliente"}</small></td><td>${line(db, t)}</td><td>${ago(t.creado)}</td>
          <td><span class="chip ${t.estado === "pendiente" ? "warn" : ["confirmada", "pagado"].includes(t.estado) ? "ok" : "bad"}">${{ pendiente: "Pendiente", confirmada: "Verificada", rechazada: "Rechazada", pagado: "Pagado", rechazado: "Rechazado" }[t.estado]}</span></td>
          <td class="t-actions">${t.estado === "pendiente" ? `<button class="btn small ghost-dark" type="button" data-act="no" data-id="${t.id}">Rechazar</button> <button class="btn small teal" type="button" data-act="yes" data-id="${t.id}">${okLabel}</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div></section>`;
      });
    },
    actions: {
      yes(b, ctx) { run(() => fn(ctx, b.dataset.id, true), "Listo. Quedó registrado en auditoría."); },
      no(b, ctx) { confirmModal("Rechazar", "El usuario recibirá un aviso.", "Rechazar", () => run(() => fn(ctx, b.dataset.id, false), "Rechazado."), "danger"); },
    },
  };
}

/* ---------- Comisiones y punto estratégico ---------- */
let ruleDraft = null, puntoDraft = null;
const comisiones = {
  title: "Comisiones", static: true,
  render(ctx) {
    const db = ctx.db;
    ruleDraft = JSON.parse(JSON.stringify(db.commissionRules)); puntoDraft = { ...db.config.puntoEstrategico.pos };
    return `<div class="grid-2">
      <form class="card" data-form="rules" novalidate>
        <h2 class="card-t">Tabla de comisiones</h2>
        <p class="hint-s" style="margin-bottom:14px">Se aplica al enviar cada oferta. Los cambios no afectan ofertas ya enviadas.</p>
        <span class="lbl">Compra libre · porcentaje del total de la oferta</span>
        <div class="three"><div class="f"><label for="rLp">Porcentaje (%)</label><input class="in" id="rLp" name="lp" inputmode="decimal" value="${api.libreRule(ruleDraft).pct}"></div>
        <div class="f"><label for="rLmin">Mínimo (S/)</label><input class="in" id="rLmin" name="lmin" inputmode="decimal" value="${api.libreRule(ruleDraft).min.toFixed(2)}"></div>
        <div class="f"><label for="rLmax">Máximo (S/)</label><input class="in" id="rLmax" name="lmax" inputmode="decimal" value="${api.libreRule(ruleDraft).max.toFixed(2)}"></div></div>
        <p class="hint-s" style="margin:-4px 0 14px">Ej.: oferta de S/ 40 → ${api.libreRule(ruleDraft).pct} % = ${sol(api.commissionFor({ commissionRules: ruleDraft }, "libre", 0, 40))}. El ahorro que consiga el repartidor al comprar es suyo.</p>
        <span class="lbl">Tienda específica, según distancia por carretera desde el punto estratégico</span>
        <div id="tramos">${tramosHtml()}</div>
        <button class="link" type="button" data-act="addT" style="margin:6px 0 14px">+ Agregar tramo</button>
        <div class="f"><label for="rMas">Más allá del último tramo (S/)</label><input class="in" id="rMas" name="mas" inputmode="decimal" value="${ruleDraft.masDe10.toFixed(2)}"></div>
        <p class="err" id="rErr" role="alert"></p>
        <button class="btn" type="submit">Guardar tabla</button>
      </form>
      <form class="card" data-form="punto" novalidate>
        <h2 class="card-t">Punto estratégico de Camaná</h2>
        <p class="hint-s" style="margin-bottom:12px">Desde aquí se mide la distancia a cada tienda para calcular la comisión. Toca el mapa para moverlo.</p>
        <div class="f"><label for="pNom">Nombre</label><input class="in" id="pNom" name="nombre" value="${esc(db.config.puntoEstrategico.nombre)}"></div>
        <div id="pMap" style="height:300px" role="img" aria-label="Mapa para ubicar el punto estratégico"></div>
        <button class="btn" type="submit" style="margin-top:14px">Guardar punto</button>
      </form></div>`;
  },
  mount(root, ctx) {
    const pk = createPicker($("#pMap", root), () => ({ markers: [...Object.values(ctx.db.establishments).filter(e => e.activo).map(e => ({ pos: e.pos, type: "shop" })), { pos: puntoDraft, type: "punto", label: "Punto estratégico" }] }),
      (p, eng) => { if (!p || (eng === "canvas" && p.x < MAP.mar + 0.03)) return; puntoDraft = p; pk.redraw(); });
  },
  actions: {
    addT() { readTramos(); const last = ruleDraft.tramos[ruleDraft.tramos.length - 1]; ruleDraft.tramos.push({ hasta: (last?.hasta || 0) + 2, monto: (last?.monto || 0) + 0.6 }); $("#tramos").innerHTML = tramosHtml(); },
    delT(b) { readTramos(); ruleDraft.tramos.splice(+b.dataset.i, 1); $("#tramos").innerHTML = tramosHtml(); },
  },
  forms: {
    rules(f, ctx) {
      readTramos();
      const r = { libre: { pct: num(f.lp.value), min: num(f.lmin.value), max: num(f.lmax.value) }, tramos: ruleDraft.tramos, masDe10: num(f.mas.value) };
      if ([r.libre.pct, r.libre.min, r.libre.max, r.masDe10, ...r.tramos.flatMap(t => [t.hasta, t.monto])].some(isNaN)) return ($("#rErr").textContent = "Revisa los valores: usa solo números.");
      if (!r.tramos.length) return ($("#rErr").textContent = "Deja al menos un tramo.");
      run(() => api.updateCommissionRules(ctx.uid, r), "Tabla de comisiones guardada.");
    },
    punto(f, ctx) { if (f.nombre.value.trim().length < 3) return; run(() => api.updatePlatformConfig(ctx.uid, { puntoEstrategico: { nombre: f.nombre.value.trim(), pos: puntoDraft } }), "Punto estratégico guardado."); },
  },
};
function tramosHtml() {
  let prev = 0;
  return `<div class="tramos">${ruleDraft.tramos.map((t, i) => { const row = `<div class="tramo"><span>${prev} a</span><input class="in" inputmode="decimal" data-th="${i}" value="${t.hasta}" aria-label="Hasta km, tramo ${i + 1}"><span>km</span><span class="sol">S/</span><input class="in" inputmode="decimal" data-tm="${i}" value="${t.monto.toFixed(2)}" aria-label="Comisión tramo ${i + 1}"><button class="link danger-t" type="button" data-act="delT" data-i="${i}" aria-label="Quitar tramo ${i + 1}">Quitar</button></div>`; prev = t.hasta; return row; }).join("")}</div>`;
}
function readTramos() { ruleDraft.tramos = ruleDraft.tramos.map((t, i) => ({ hasta: num($(`[data-th="${i}"]`)?.value ?? t.hasta), monto: num($(`[data-tm="${i}"]`)?.value ?? t.monto) })); }

/* ---------- Establecimientos y catálogo del Market ---------- */
const CATS = ["Comida", "Mercado", "Farmacia", "Ferretería", "Regalos", "Mascotas", "Otros"];
const DIAS = [[1, "L"], [2, "M"], [3, "M"], [4, "J"], [5, "V"], [6, "S"], [0, "D"]];
const DIAS_N = { 1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes", 6: "sábado", 0: "domingo" };
const establecimientos = {
  title: "Establecimientos",
  render(ctx) {
    return `<div class="toolbar"><p class="hint-s">Los locales con «Market» activo venden por catálogo con su propio precio. Los demás aparecen en «Tienda específica».</p><button class="btn small" type="button" data-act="edit">Agregar establecimiento</button></div>
    ${ctx.live("est", () => {
      const db = ctx.db, list = Object.values(db.establishments).sort((a, b) => a.nombre.localeCompare(b.nombre));
      const n = id => Object.values(db.products).filter(p => p.tiendaId === id).length;
      return `<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Local</th><th>Horario</th><th>Market</th><th>Comisión</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(e => { const km = roadKm(db.config.puntoEstrategico.pos, e.pos); return `<tr><td><div class="person sm">${storeLogo(e)}<div><b>${esc(e.nombre)} ${ratingTag(e)}</b><span>${tagsLine(e)} · ${esc(e.direccion)}</span></div></div></td>
        <td>${esc(hoursLabel(e))}<small class="${isOpen(e) ? "pos" : ""}">${esc(statusLabel(e))}</small></td>
        <td>${e.tiendaVirtual ? `<span class="chip ok">Sí</span><small>${n(e.id)} productos</small>` : `<span class="chip muted">No</span>`}</td>
        <td>${sol(api.commissionFor(db, "tienda", km))}<small>${km.toFixed(1)} km del punto</small></td>
        <td><span class="chip ${e.activo ? "ok" : "muted"}">${e.activo ? "Activo" : "Inactivo"}</span></td>
        <td class="t-actions"><button class="link" type="button" data-act="cat" data-id="${e.id}">Catálogo</button><button class="link" type="button" data-act="edit" data-id="${e.id}">Editar</button><button class="link" type="button" data-act="toggle" data-id="${e.id}">${e.activo ? "Desactivar" : "Activar"}</button></td></tr>`; }).join("")}
      </tbody></table></div></section>`;
    })}`;
  },
  actions: {
    toggle(b, ctx) { run(() => api.toggleEstablishment(ctx.uid, b.dataset.id), "Establecimiento actualizado."); },
    cat(b, ctx) { ctx.go("#admin-catalogo", { ...ctx.state, store: b.dataset.id }); },
    edit(b, ctx) { storeModal(ctx, b.dataset.id); },
  },
};
function storeModal(ctx, id, preset = null) {
  const base = { nombre: "", categoria: "Comida", direccion: "", descripcion: "", tiempoPrep: 15, horario: { dias: [1, 2, 3, 4, 5, 6], abre: "08:00", cierra: "20:00" }, tiendaVirtual: true, contacto: "", pos: null, logo: null, portada: null };
  const e = id ? ctx.db.establishments[id] : { ...base, ...(preset || {}), horario: { ...base.horario, ...(preset?.horario || {}) } };
  const img = { logo: e.logo || null, portada: e.portada || null };
  let loc;
  modal(id ? "Editar establecimiento" : preset ? "Registrar negocio aprobado" : "Nuevo establecimiento", `<form data-mform="e" novalidate>
    <div class="img-pair">${imageField("portada", "portada", img.portada, "Portada", "foto del local o de sus productos, horizontal")}${imageField("logo", "logo", img.logo, "Logo", "cuadrado")}</div>
    <div class="two"><div class="f"><label for="eN">Nombre</label><input class="in" id="eN" name="n" value="${esc(e.nombre)}"></div>
    <div class="f"><label for="eC">Categoría</label><select class="in" id="eC" name="c">${CATS.map(c => `<option ${c === e.categoria ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
    <div class="f"><label for="eD">Dirección</label><input class="in" id="eD" name="d" value="${esc(e.direccion)}" placeholder="Calle, número y referencia"></div>
    <div class="f"><label for="eDes">Descripción corta <span class="opt">· la ve el cliente</span></label><input class="in" id="eDes" name="des" maxlength="90" value="${esc(e.descripcion || "")}" placeholder="Ej.: Pollo a la leña, parrillas y bebidas."></div>
    <span class="lbl">Especialidades <span class="opt">· hasta 4; son las categorías del Market (pollo a la brasa, broaster, chifa…)</span></span>
    <div class="esp-pick" role="group" aria-label="Especialidades">${ESPECIALIDADES.map(([n, ic]) => `<label><input type="checkbox" name="esp" value="${esc(n)}" ${(e.etiquetas || []).includes(n) ? "checked" : ""}><span>${ic} ${esc(n)}</span></label>`).join("")}</div>
    <span class="lbl" style="margin-top:14px">Días de atención</span>
    <div class="days" role="group" aria-label="Días de atención">${DIAS.map(([d, l]) => `<label title="${DIAS_N[d]}"><input type="checkbox" name="dia" value="${d}" ${e.horario.dias.includes(d) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
    <div class="two" style="margin-top:12px"><div class="f"><label for="eA">Abre</label><input class="in" id="eA" name="a" type="time" value="${e.horario.abre}"></div><div class="f"><label for="eCi">Cierra</label><input class="in" id="eCi" name="ci" type="time" value="${e.horario.cierra}"><span class="hint-s">Para 24 horas usa 00:00 a 23:59.</span></div></div>
    <div class="two"><div class="f"><label for="eP">Tiempo de preparación (min)</label><input class="in" id="eP" name="p" inputmode="numeric" value="${e.tiempoPrep || 0}"></div><div class="f"><label for="eT">Teléfono del local</label><div class="phone-in"><span>+51</span><input class="in" id="eT" name="t" inputmode="numeric" maxlength="9" value="${esc(e.telefono || "")}" placeholder="Para que el repartidor llame"></div></div></div>
    <label class="cfg-row"><div><b>Vende en el Market</b><span>El cliente compra del catálogo con el precio del local y el repartidor solo oferta el envío.</span></div><input type="checkbox" class="sw-in" name="tv" ${e.tiendaVirtual ? "checked" : ""}></label>
    <span class="lbl">Ubicación del local <span class="opt">· escribe la dirección, usa tu GPS, pega un enlace de Google Maps o toca el mapa</span></span>
    <div id="eLoc"></div>
    <p class="err" id="eErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Guardar</button></div></form>`,
    {
      mount(body) {
        bindImageFields(body, img, m => (body.querySelector("#eErr").textContent = m));
        requestAnimationFrame(() => { loc = locationField(body.querySelector("#eLoc"), { pos: e.pos, fuente: e.ubicacionFuente, direccion: body.querySelector("#eD"), others: () => Object.values(ctx.db.establishments).filter(x => x.activo && x.id !== id).map(x => ({ pos: x.pos, type: "shop" })) }); });
      },
      e: f => {
        const dias = [...f.querySelectorAll("input[name=dia]:checked")].map(x => +x.value);
        const etiquetas = [...f.querySelectorAll("input[name=esp]:checked")].map(x => x.value);
        if (etiquetas.length > 4) return ($("#eErr").textContent = "Elige como máximo 4 especialidades.");
        const saved = run(() => api.upsertEstablishment(ctx.uid, { etiquetas, id: id || undefined, nombre: f.n.value, categoria: f.c.value, direccion: f.d.value, descripcion: f.des.value, horario: { dias, abre: f.a.value, cierra: f.ci.value }, tiempoPrep: num(f.p.value), tiendaVirtual: f.tv.checked, telefono: f.t.value.replace(/\D/g, ""), pos: loc?.pos || null, ubicacionFuente: loc?.fuente || "", logo: img.logo, portada: img.portada, solicitudId: preset?.solicitudId }), preset ? "Negocio registrado y solicitud aprobada." : "Establecimiento guardado.");
        if (saved) closeModal();
      },
    });
}

/* ---------- Negocios nuevos (formulario «Registra tu negocio» de la web) ---------- */
const bizWa = a => `${waLink(a.celular)}?text=${encodeURIComponent(`Hola ${a.responsable.split(" ")[0]}, te escribimos de RAPIDIN por el registro de ${a.negocio}.`)}`;
const negocios = {
  title: "Negocios nuevos",
  render(ctx) {
    return `<div class="toolbar"><p class="hint-s" style="max-width:72ch">Solicitudes enviadas desde «Registra tu negocio». Al aprobar, se abre el formulario del establecimiento con los datos, el logo, la portada y la ubicación ya cargados para que solo revises y guardes.</p></div>
    ${ctx.live("biz", () => {
      const all = Object.values(ctx.db.businessApplications || {}).sort((a, b) => (a.estado === "pendiente" ? -1 : 1) - (b.estado === "pendiente" ? -1 : 1) || b.creado - a.creado);
      if (!all.length) return empty("Sin solicitudes", "Cuando un negocio se registre desde la web, aparecerá aquí y te avisaremos.");
      return `<div class="biz-list">${all.map(a => `<article class="biz-card card${a.estado === "pendiente" ? "" : " done"}">
        <div class="biz-cover" style="${coverStyle(a)}">${storeLogo({ ...a, nombre: a.negocio }, "lg")}<span class="chip ${a.estado === "pendiente" ? "warn" : a.estado === "aprobada" ? "ok" : "muted"}">${a.estado === "pendiente" ? "Por revisar" : a.estado === "aprobada" ? "Aprobado" : "Rechazado"}</span></div>
        <div class="biz-body"><h3>${esc(a.negocio)}</h3><span class="muted">${esc(a.categoria)} · ${ago(a.creado)}</span>
          <dl class="biz-dl"><div><dt>Responsable</dt><dd>${esc(a.responsable)}</dd></div><div><dt>Celular</dt><dd>${telLink(a.celular)}</dd></div>
          <div><dt>Dirección</dt><dd>${esc(a.direccion)}${a.referencia ? `<small>${esc(a.referencia)}</small>` : ""}</dd></div>
          ${a.horario ? `<div><dt>Horario</dt><dd>${esc(hoursLabel(a))}</dd></div>` : ""}${a.descripcion ? `<div><dt>Vende</dt><dd>${esc(a.descripcion)}</dd></div>` : ""}
          <div><dt>Market</dt><dd>${a.mercado ? "Quiere vender por catálogo" : "Solo como tienda específica"}</dd></div></dl>
          ${a.nota ? `<p class="hint-s">Nota: ${esc(a.nota)}</p>` : ""}
          ${a.estado === "pendiente" && Object.values(ctx.db.establishments).some(x => x.nombre.toLowerCase() === a.negocio.toLowerCase()) ? `<div class="banner warn">Ya existe un local llamado «${esc(a.negocio)}». Revisa que no sea un duplicado antes de aprobar.</div>` : ""}
          <div class="row-btns"><a class="btn small ghost-dark" href="tel:+51${a.celular}">Llamar</a><a class="btn small ghost-dark" href="${bizWa(a)}" target="_blank" rel="noopener">WhatsApp</a>
          ${a.estado === "pendiente" ? `<button class="link danger-t" type="button" data-act="reject" data-id="${a.id}">Rechazar</button><button class="btn small" type="button" data-act="approve" data-id="${a.id}">Revisar y aprobar</button>`
            : a.establishmentId ? `<button class="link" type="button" data-act="goStore" data-id="${a.establishmentId}">Ver catálogo</button>` : ""}</div>
        </div></article>`).join("")}</div>`;
    })}`;
  },
  actions: {
    approve(b, ctx) {
      const a = ctx.db.businessApplications[b.dataset.id];
      storeModal(ctx, null, { solicitudId: a.id, nombre: a.negocio, categoria: a.categoria, direccion: a.direccion + (a.referencia ? ` (${a.referencia})` : ""), descripcion: a.descripcion, telefono: a.celular, contacto: a.responsable, pos: a.pos, ubicacionFuente: a.ubicacionFuente, horario: a.horario || undefined, tiendaVirtual: a.mercado, logo: a.logo, portada: a.portada });
    },
    reject(b, ctx) {
      const a = ctx.db.businessApplications[b.dataset.id];
      modal(`Rechazar ${a.negocio}`, `<form data-mform="r" novalidate><div class="f"><label for="rzN">Motivo <span class="opt">· se lo comunicas por WhatsApp</span></label><input class="in" id="rzN" name="n" maxlength="140" placeholder="Ej.: Por ahora solo atendemos Camaná cercado."></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn danger" type="submit">Rechazar</button></div></form>`,
        { r: f => { if (run(() => api.rejectBusinessApplication(ctx.uid, a.id, f.n.value), "Solicitud rechazada.")) closeModal(); } });
    },
    goStore(b, ctx) { ctx.go("#admin-catalogo", { store: b.dataset.id }); },
  },
};

const catalogo = {
  title: "Catálogo", parent: "establecimientos",
  render(ctx) {
    const e = ctx.db.establishments[ctx.state.store];
    if (!e) return empty("Elige un establecimiento", "Abre el catálogo desde la lista de establecimientos.", `<a class="btn small" href="#admin-establecimientos">Establecimientos</a>`);
    return `<a class="back" href="#admin-establecimientos">← Establecimientos</a>
      <div class="toolbar"><div class="person">${storeLogo(e, "lg")}<div><b>${esc(e.nombre)}</b><span>${esc(hoursLabel(e))} · ${esc(statusLabel(e))}</span></div></div>
      <div class="row-btns">${e.tiendaVirtual ? `<span class="chip ok">Vende en el Market</span>` : `<span class="chip warn">No vende en el Market</span>`}<button class="btn small ghost-dark" type="button" data-act="edit">Editar local</button><button class="btn small" type="button" data-act="prod">Agregar producto</button></div></div>
      ${e.tiendaVirtual ? "" : `<div class="banner warn">Este local no aparece en el Market. Actívalo en «Editar local» → «Vende en el Market».</div>`}
      ${ctx.live("cat", () => {
        const prods = Object.values(ctx.db.products).filter(p => p.tiendaId === e.id).sort((a, b) => a.orden - b.orden);
        if (!prods.length) return empty("Catálogo vacío", "Agrega los productos con el precio del local.");
        const secs = [...new Set(prods.map(p => p.seccion))];
        return secs.map(sec => `<section class="card" style="margin-bottom:16px"><h2 class="card-t">${esc(sec)}</h2><div class="prod-list">${prods.filter(p => p.seccion === sec).map(p => `
          <article class="prod${p.disponible ? "" : " off"}">${productThumb(p, e.categoria)}
            <div class="pr-main"><b>${esc(p.nombre)}</b>${p.descripcion ? `<span>${esc(p.descripcion)}</span>` : ""}<strong>${sol(p.precio)}</strong></div>
            <div class="row-btns"><button class="switch sm" type="button" role="switch" aria-checked="${p.disponible}" data-act="avail" data-id="${p.id}" aria-label="${p.disponible ? "Disponible" : "Agotado"}: ${esc(p.nombre)}"><i></i></button>
            <button class="link" type="button" data-act="prod" data-id="${p.id}">Editar</button><button class="link danger-t" type="button" data-act="del" data-id="${p.id}">Eliminar</button></div>
          </article>`).join("")}</div></section>`).join("");
      })}`;
  },
  actions: {
    edit(b, ctx) { storeModal(ctx, ctx.state.store); },
    avail(b, ctx) { run(() => api.toggleProduct(ctx.uid, b.dataset.id)); },
    del(b, ctx) { const p = ctx.db.products[b.dataset.id]; confirmModal("Eliminar producto", `«${p.nombre}» dejará de aparecer en el Market. Los pedidos anteriores no cambian.`, "Eliminar", () => run(() => api.deleteProduct(ctx.uid, p.id), "Producto eliminado."), "danger"); },
    prod(b, ctx) {
      const e = ctx.db.establishments[ctx.state.store];
      const p = b.dataset.id ? ctx.db.products[b.dataset.id] : { nombre: "", descripcion: "", precio: "", seccion: "", img: null };
      const secs = [...new Set(Object.values(ctx.db.products).filter(x => x.tiendaId === e.id).map(x => x.seccion))];
      let img = p.img;
      modal(b.dataset.id ? "Editar producto" : `Nuevo producto · ${e.nombre}`, `<form data-mform="p" novalidate>
        <div class="two"><div class="f"><label for="pN">Nombre</label><input class="in" id="pN" name="n" value="${esc(p.nombre)}"></div>
        <div class="f"><label for="pP">Precio del local (S/)</label><input class="in" id="pP" name="p" inputmode="decimal" value="${p.precio === "" ? "" : (+p.precio).toFixed(2)}"></div></div>
        <div class="f"><label for="pS">Sección</label><input class="in" id="pS" name="s" list="pSecs" value="${esc(p.seccion)}" placeholder="Ej.: Bebidas"><datalist id="pSecs">${secs.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
        <div class="f"><label for="pD">Descripción <span class="opt">· opcional</span></label><input class="in" id="pD" name="d" maxlength="90" value="${esc(p.descripcion)}"></div>
        <div class="f"><label for="pI">Foto <span class="opt">· opcional, se reduce automáticamente</span></label><div class="img-row"><span id="pPrev">${productThumb({ img }, e.categoria)}</span><input class="in" id="pI" type="file" accept="image/*"></div></div>
        <p class="err" id="pErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Guardar producto</button></div></form>`,
        {
          mount(body) {
            body.querySelector("#pI").addEventListener("change", async ev => {
              const f = ev.target.files[0]; if (!f) return;
              try { img = await shrinkImage(f, IMG.producto); body.querySelector("#pPrev").innerHTML = productThumb({ img }, e.categoria); }
              catch (x) { body.querySelector("#pErr").textContent = "No pudimos leer esa imagen. Prueba con otra."; }
            });
          },
          p: f => {
            const precio = num(f.p.value);
            if (isNaN(precio)) return ($("#pErr").textContent = "Escribe el precio con números, por ejemplo 12.50.");
            if (run(() => api.upsertProduct(ctx.uid, { id: b.dataset.id || undefined, tiendaId: e.id, nombre: f.n.value, precio, seccion: f.s.value, descripcion: f.d.value, img }), "Producto guardado.")) closeModal();
          },
        });
    },
  },
};
/* ---------- Guía de precios para repartidores ---------- */
const agoD = t => { const d = Math.floor((Date.now() - t) / 86400e3); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };
const guia = {
  title: "Guía para repartidores",
  render(ctx) {
    return `<div class="toolbar"><p class="hint-s" style="max-width:70ch">Locales y precios de referencia que solo ven los repartidores para cotizar pedidos de compra libre, con su teléfono para pedir y pasar a recoger. Es independiente del Market.</p><button class="btn small" type="button" data-act="edit">Agregar local a la guía</button></div>
    ${ctx.live("ag", () => {
      const db = ctx.db, list = Object.values(db.proveedores).sort((a, b) => a.nombre.localeCompare(b.nombre));
      if (!list.length) return empty("La guía está vacía", "Agrega los locales donde suelen comprar los repartidores.");
      return `<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Local</th><th>Teléfono</th><th>Horario</th><th>Precios</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(pv => { const items = Object.values(db.preciosRef).filter(r => r.provId === pv.id); const old = items.length ? Math.min(...items.map(r => r.actualizado)) : 0;
        return `<tr><td><div class="person sm"><span class="cat-badge" style="--cat:${catOf(pv.categoria).c}">${catIcon(pv.categoria)}</span><div><b>${esc(pv.nombre)}</b><span>${esc(pv.categoria)} · ${esc(pv.direccion)}</span></div></div></td>
        <td>${telLink(pv.telefono)}<small>${pv.pedidosTelefono ? "Toma pedidos por teléfono" : "Solo en el local"}</small></td>
        <td>${esc(hoursLabel(pv))}<small class="${isOpen(pv) ? "pos" : ""}">${esc(statusLabel(pv))}</small></td>
        <td>${items.length}<small>${old ? `El más antiguo: ${agoD(old)}` : "Sin precios"}</small></td>
        <td><span class="chip ${pv.activo ? "ok" : "muted"}">${pv.activo ? "Visible" : "Oculto"}</span></td>
        <td class="t-actions"><button class="link" type="button" data-act="precios" data-id="${pv.id}">Precios</button><button class="link" type="button" data-act="edit" data-id="${pv.id}">Editar</button><button class="link" type="button" data-act="toggle" data-id="${pv.id}">${pv.activo ? "Ocultar" : "Mostrar"}</button></td></tr>`; }).join("")}
      </tbody></table></div></section>`;
    })}`;
  },
  actions: {
    toggle(b, ctx) { run(() => api.toggleProveedor(ctx.uid, b.dataset.id), "Guía actualizada."); },
    precios(b, ctx) { ctx.go("#admin-precios", { ...ctx.state, prov: b.dataset.id }); },
    edit(b, ctx) { provModal(ctx, b.dataset.id); },
  },
};
function provModal(ctx, id) {
  const p = id ? ctx.db.proveedores[id] : { nombre: "", categoria: "Mercado", direccion: "", telefono: "", horario: { dias: [1, 2, 3, 4, 5, 6], abre: "08:00", cierra: "20:00" }, pedidosTelefono: true, notas: "", pos: null };
  let loc;
  modal(id ? "Editar local de la guía" : "Nuevo local en la guía", `<form data-mform="g" novalidate>
    <div class="two"><div class="f"><label for="gN">Nombre</label><input class="in" id="gN" name="n" value="${esc(p.nombre)}" placeholder="Ej.: Bodega Doña Carmen"></div>
    <div class="f"><label for="gC">Categoría</label><select class="in" id="gC" name="c">${["Mercado", "Comida", "Farmacia", "Ferretería", "Regalos", "Mascotas", "Otros"].map(c => `<option ${c === p.categoria ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
    <div class="two"><div class="f"><label for="gD">Dirección</label><input class="in" id="gD" name="d" value="${esc(p.direccion)}"></div>
    <div class="f"><label for="gT">Teléfono o WhatsApp</label><div class="phone-in"><span>+51</span><input class="in" id="gT" name="t" inputmode="numeric" maxlength="9" value="${esc(p.telefono)}"></div></div></div>
    <span class="lbl">Días de atención</span>
    <div class="days" role="group" aria-label="Días de atención">${DIAS.map(([d, l]) => `<label title="${DIAS_N[d]}"><input type="checkbox" name="dia" value="${d}" ${p.horario.dias.includes(d) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
    <div class="two" style="margin-top:12px"><div class="f"><label for="gA">Abre</label><input class="in" id="gA" name="a" type="time" value="${p.horario.abre}"></div><div class="f"><label for="gCi">Cierra</label><input class="in" id="gCi" name="ci" type="time" value="${p.horario.cierra}"></div></div>
    <label class="cfg-row"><div><b>Acepta pedidos por teléfono</b><span>El repartidor puede llamar, pedir y pasar a recoger.</span></div><input type="checkbox" class="sw-in" name="pt" ${p.pedidosTelefono ? "checked" : ""}></label>
    <div class="f"><label for="gNo">Notas para repartidores <span class="opt">· opcional</span></label><input class="in" id="gNo" name="no" maxlength="140" value="${esc(p.notas || "")}" placeholder="Ej.: Si llamas antes, te separa el pedido."></div>
    <span class="lbl">Ubicación <span class="opt">· escribe la dirección, usa tu GPS, pega un enlace o toca el mapa</span></span>
    <div id="gLoc"></div>
    <p class="err" id="gErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Guardar</button></div></form>`,
    {
      mount(body) { requestAnimationFrame(() => { loc = locationField(body.querySelector("#gLoc"), { pos: p.pos, direccion: body.querySelector("#gD"), height: 220 }); }); },
      g: f => {
        const dias = [...f.querySelectorAll("input[name=dia]:checked")].map(x => +x.value);
        if (run(() => api.upsertProveedor(ctx.uid, { id: id || undefined, nombre: f.n.value, categoria: f.c.value, direccion: f.d.value, telefono: normPhone(f.t.value), horario: { dias, abre: f.a.value, cierra: f.ci.value }, pedidosTelefono: f.pt.checked, notas: f.no.value, pos: loc?.pos || null }), "Local guardado en la guía.")) closeModal();
      },
    });
}
const precios = {
  title: "Precios de referencia", parent: "guia",
  render(ctx) {
    const pv = ctx.db.proveedores[ctx.state.prov];
    if (!pv) return empty("Elige un local de la guía", "Abre sus precios desde la Guía para repartidores.", `<a class="btn small" href="#admin-guia">Guía para repartidores</a>`);
    return `<a class="back" href="#admin-guia">← Guía para repartidores</a>
      <div class="toolbar"><div class="person"><span class="cat-badge lg" style="--cat:${catOf(pv.categoria).c}">${catIcon(pv.categoria)}</span><div><b>${esc(pv.nombre)}</b><span>${fmtPhone(pv.telefono)} · ${esc(hoursLabel(pv))}</span></div></div>
      <div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="ok">Marcar todos como revisados hoy</button><button class="btn small" type="button" data-act="item">Agregar precio</button></div></div>
      ${ctx.live("pr", () => {
        const items = Object.values(ctx.db.preciosRef).filter(r => r.provId === pv.id).sort((a, b) => a.orden - b.orden);
        if (!items.length) return empty("Sin precios", "Agrega los productos que más piden los clientes, con su precio actual.");
        return [...new Set(items.map(r => r.seccion))].map(sec => `<section class="card" style="margin-bottom:16px"><h2 class="card-t">${esc(sec)}</h2><ul class="rows">${items.filter(r => r.seccion === sec).map(r => `
          <li class="${r.disponible ? "" : "off"}"><div><b>${esc(r.nombre)} · ${sol(r.precio)}</b><small>${esc(r.presentacion || "")} · actualizado ${agoD(r.actualizado)}</small></div>
          <div class="row-btns"><button class="switch sm" type="button" role="switch" aria-checked="${r.disponible}" data-act="av" data-id="${r.id}" aria-label="${r.disponible ? "Disponible" : "Agotado"}: ${esc(r.nombre)}"><i></i></button><button class="link" type="button" data-act="item" data-id="${r.id}">Editar</button><button class="link danger-t" type="button" data-act="del" data-id="${r.id}">Eliminar</button></div></li>`).join("")}</ul></section>`).join("");
      })}`;
  },
  actions: {
    ok(b, ctx) { run(() => api.confirmPreciosProveedor(ctx.uid, ctx.state.prov), "Precios marcados como revisados hoy."); },
    av(b, ctx) { run(() => api.togglePrecioRef(ctx.uid, b.dataset.id)); },
    del(b, ctx) { const r = ctx.db.preciosRef[b.dataset.id]; confirmModal("Eliminar precio", `«${r.nombre}» dejará de aparecer en la guía.`, "Eliminar", () => run(() => api.deletePrecioRef(ctx.uid, r.id), "Precio eliminado."), "danger"); },
    item(b, ctx) {
      const pv = ctx.db.proveedores[ctx.state.prov];
      const r = b.dataset.id ? ctx.db.preciosRef[b.dataset.id] : { nombre: "", presentacion: "", precio: "", seccion: "" };
      const secs = [...new Set(Object.values(ctx.db.preciosRef).filter(x => x.provId === pv.id).map(x => x.seccion))];
      modal(b.dataset.id ? "Editar precio" : `Nuevo precio · ${pv.nombre}`, `<form data-mform="r" novalidate>
        <div class="two"><div class="f"><label for="rN">Producto</label><input class="in" id="rN" name="n" value="${esc(r.nombre)}" placeholder="Ej.: Arroz extra"></div>
        <div class="f"><label for="rPr">Presentación</label><input class="in" id="rPr" name="pr" value="${esc(r.presentacion)}" placeholder="Ej.: 1 kg, 500 ml, caja x 10"></div></div>
        <div class="two"><div class="f"><label for="rP">Precio de referencia (S/)</label><input class="in" id="rP" name="p" inputmode="decimal" value="${r.precio === "" ? "" : (+r.precio).toFixed(2)}"></div>
        <div class="f"><label for="rS">Sección</label><input class="in" id="rS" name="s" list="rSecs" value="${esc(r.seccion)}" placeholder="Ej.: Abarrotes"><datalist id="rSecs">${secs.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div></div>
        <p class="hint-s">Al guardar, la fecha de actualización pasa a hoy.</p>
        <p class="err" id="rErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Guardar precio</button></div></form>`,
        { r: f => { const precio = num(f.p.value); if (isNaN(precio)) return ($("#rErr").textContent = "Escribe el precio con números, por ejemplo 4.50."); if (run(() => api.upsertPrecioRef(ctx.uid, { id: b.dataset.id || undefined, provId: pv.id, nombre: f.n.value, presentacion: f.pr.value, precio, seccion: f.s.value }), "Precio guardado.")) closeModal(); } });
    },
  },
};

/* ---------- Zonas ---------- */
const zonas = {
  title: "Zonas de cobertura",
  render(ctx) {
    return ctx.live("z", () => {
      const z = ctx.db.zones.camana;
      return `<section class="card narrow"><div class="card-head"><div><h2 class="card-t">${esc(z.nombre)}</h2><p class="muted">${esc(z.ciudad)} · única zona habilitada en esta etapa</p></div>
        <button class="switch" type="button" role="switch" aria-checked="${z.activa}" data-act="z" aria-label="Recibir pedidos en ${esc(z.nombre)}"><i></i></button></div>
        <p class="hint-s">${z.activa ? "Recibiendo pedidos. Si la pausas, nadie podrá publicar solicitudes nuevas." : "Pausada: los clientes no pueden publicar solicitudes nuevas."}</p>
        <div style="margin-top:14px">${mapBox({ markers: [{ pos: ctx.db.config.puntoEstrategico.pos, type: "punto", label: "Punto estratégico" }] }, { height: 260, key: "zona", label: "Zona de cobertura de Camaná" })}</div>
        <p class="hint-s" style="margin-top:12px">La estructura ya permite sumar ciudades, distritos y zonas. Agregar una nueva ciudad se habilitará cuando decidas expandir.</p></section>`;
    });
  },
  actions: { z(b, ctx) { const on = ctx.db.zones.camana.activa; confirmModal(on ? "Pausar Camaná" : "Reactivar Camaná", on ? "Nadie podrá publicar pedidos nuevos. Los pedidos en curso continúan." : "Los clientes podrán volver a pedir.", on ? "Pausar" : "Reactivar", () => run(() => api.setZoneActive(ctx.uid, "camana", !on), on ? "Zona pausada." : "Zona reactivada."), on ? "danger" : "teal"); } },
};

/* ---------- Configuración ---------- */
const config = {
  title: "Configuración", static: true,
  render(ctx) {
    const c = ctx.db.config;
    const sw = (name, on, title, desc) => `<label class="cfg-row"><div><b>${title}</b><span>${desc}</span></div><input type="checkbox" class="sw-in" name="${name}" ${on ? "checked" : ""}></label>`;
    return `<form class="card narrow" data-form="cfg" novalidate>
      <h2 class="card-t">Reglas de la plataforma</h2>
      <div class="two"><div class="f"><label for="cV">Vencimiento de ofertas (segundos)</label><input class="in" id="cV" name="vence" inputmode="numeric" value="${c.ofertaVenceSeg}"></div>
      <div class="f"><label for="cU">Umbral «repartidor cerca» (metros)</label><input class="in" id="cU" name="umbral" inputmode="numeric" value="${c.umbralCercaM}"></div></div>
      ${sw("saldo", c.saldoClienteHabilitado, "Pago con saldo del aplicativo", "Implica custodiar dinero de terceros: consulta con un contador o abogado antes de activarlo en producción.")}
      <div class="f"><label for="cL">Momento de pago con saldo</label><select class="in" id="cL" name="lib"><option value="al_entregar" ${c.pagoSaldoLiberacion === "al_entregar" ? "selected" : ""}>Al confirmar la entrega (recomendado)</option><option value="al_aceptar" ${c.pagoSaldoLiberacion === "al_aceptar" ? "selected" : ""}>Al aceptar la oferta</option></select></div>
      ${sw("retiros", c.retirosHabilitados, "Retiros de ganancias", "Los repartidores pueden pedir retiros manuales, que apruebas tú.")}
      ${sw("sim", c.simulacion, "Actividad simulada (solo demo)", "Repartidores y clientes de prueba envían ofertas y pedidos para probar sin otra persona.")}
      <p class="err" id="cErr" role="alert"></p>
      <button class="btn" type="submit">Guardar configuración</button>
    </form>`;
  },
  forms: {
    cfg(f, ctx) {
      const v = Math.round(num(f.vence.value)), u = Math.round(num(f.umbral.value));
      if (isNaN(v) || isNaN(u)) return ($("#cErr").textContent = "Usa solo números en los campos de tiempo y distancia.");
      run(() => api.updatePlatformConfig(ctx.uid, { ofertaVenceSeg: v, umbralCercaM: u, saldoClienteHabilitado: f.saldo.checked, pagoSaldoLiberacion: f.lib.value, retirosHabilitados: f.retiros.checked, simulacion: f.sim.checked }), "Configuración guardada.");
    },
  },
};

/* ---------- Reclamos ---------- */
const reclamos = {
  title: "Reclamos",
  render(ctx) {
    return ctx.live("rc", () => {
      const db = ctx.db, rows = [];
      Object.values(db.orders).forEach(o => (o.reportes || []).forEach(r => rows.push({ o, r })));
      rows.sort((a, b) => (a.r.estado === "abierto" ? -1 : 1) - (b.r.estado === "abierto" ? -1 : 1) || b.r.t - a.r.t);
      if (!rows.length) return empty("Sin reclamos", "Los reportes de clientes y repartidores aparecerán aquí.");
      return `<section class="card"><ul class="rows">${rows.map(({ o, r }) => `<li><div><b>${o.codigo} · ${userName(db, r.por)}</b><small>${esc(r.texto)}</small>${r.respuesta ? `<small>Respuesta: ${esc(r.respuesta)}</small>` : ""}<small>${ago(r.t)}</small></div>
        <div class="row-btns"><button class="link" type="button" data-act="open" data-id="${o.id}">Ver pedido</button>${r.estado === "abierto" ? `<button class="btn small" type="button" data-act="reply" data-o="${o.id}" data-r="${r.id}">Responder</button>` : `<span class="chip ok">Resuelto</span>`}</div></li>`).join("")}</ul></section>`;
    });
  },
  actions: { open(b, ctx) { ctx.go("#admin-pedido", { id: b.dataset.id }); }, reply(b, ctx) { replyModal(ctx, b.dataset.o, b.dataset.r); } },
};

/* ---------- Auditoría ---------- */
const auditoria = {
  title: "Auditoría",
  render(ctx) {
    return ctx.live("au", () => {
      const db = ctx.db, list = db.auditLog.slice(0, 80);
      const L = { adminSetName: "Nombre verificado", upsertProveedor: "Guía", toggleProveedor: "Guía", upsertPrecioRef: "Guía", deletePrecioRef: "Guía", confirmPreciosProveedor: "Guía", upsertProduct: "Catálogo", toggleProduct: "Catálogo", deleteProduct: "Catálogo", confirmTopup: "Recarga", approveWithdrawal: "Retiro", approveCourier: "Postulación", suspendAccount: "Cuenta", updateCommissionRules: "Comisiones", updatePlatformConfig: "Configuración", cancelOrder: "Cancelación", resolveDelivery: "Entrega en disputa", resolvePayment: "Pago", resolveReport: "Reclamo", adjustWallet: "Ajuste de saldo", upsertEstablishment: "Establecimiento", toggleEstablishment: "Establecimiento", approveBusiness: "Negocio aprobado", rejectBusiness: "Negocio rechazado", updateZone: "Zona" };
      return `<p class="hint-s" style="margin-bottom:14px">Toda acción administrativa importante queda registrada y no se puede editar.</p>
      <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th>Administrador</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
      ${list.map(a => `<tr><td>${fmtDate(a.t)}</td><td>${userName(db, a.uid)}</td><td><span class="chip info">${L[a.accion] || a.accion}</span></td><td>${esc(a.detalle)}</td></tr>`).join("")}</tbody></table></div></section>`;
    });
  },
};

export default {
  id: "admin", label: "Panel administrativo", icon: "settings",
  allowed: u => !!u.roles.admin,
  home: () => "#admin-resumen",
  defaultView: () => "resumen",
  nav(u, db) {
    const c = counts(db);
    return [
      { id: "resumen", label: "Resumen", short: "Resumen", icon: "chart" },
      { id: "pedidos", label: "Pedidos", short: "Pedidos", icon: "list", badge: c.rev || "" },
      { id: "postulaciones", label: "Postulaciones", short: "Postulan", icon: "users", badge: c.apps || "" },
      { id: "recargas", label: "Recargas", short: "Recargas", icon: "wallet", badge: c.tops || "" },
      { id: "retiros", label: "Retiros", icon: "cash", badge: c.wds || "" },
      { id: "usuarios", label: "Usuarios", icon: "user" },
      { id: "comisiones", label: "Comisiones", icon: "percent" },
      { id: "negocios", label: "Negocios nuevos", short: "Negocios", icon: "store", badge: c.biz || "" },
      { id: "establecimientos", label: "Establecimientos", icon: "store" },
      { id: "guia", label: "Guía repartidor", icon: "tag" },
      { id: "zonas", label: "Zonas", icon: "map" },
      { id: "reclamos", label: "Reclamos", icon: "alert", badge: c.reps || "" },
      { id: "config", label: "Configuración", icon: "settings" },
      { id: "auditoria", label: "Auditoría", icon: "log" },
    ];
  },
  views: { resumen, pedidos, pedido, postulaciones, usuarios, recargas, retiros, comisiones, negocios, establecimientos, catalogo, guia, precios, zonas, config, reclamos, auditoria },
};
