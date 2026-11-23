/* RAPIDIN · Panel administrativo (en producción será un sitio aparte) */
import * as api from "../demo/api.js";
import { MAP, roadKm } from "../demo/store.js";
import { $, $$, esc, sol, fmtPhone, fmtDate, run, modal, closeModal, confirmModal, num, chip, payChip, ago, empty, avatar, stars, shortName } from "../ui.js";
import { drawMap, pickPos, mapAttr } from "../map.js";
import { timeline, orderMap, orderSummaryRows, courierMini, vehLabel } from "./common.js";

const real = (db, id) => !db.users[id]?.bot;
const counts = db => {
  const o = Object.values(db.orders);
  return {
    apps: Object.values(db.courierApplications).filter(a => a.estado === "pendiente").length,
    tops: Object.values(db.topups).filter(t => t.estado === "pendiente").length,
    wds: Object.values(db.withdrawals).filter(t => t.estado === "pendiente").length,
    rev: o.filter(x => x.estadoPago === "en_revision").length,
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
  render(ctx) {
    return ctx.live("res", () => {
      const db = ctx.db, c = counts(db), t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const fees = db.walletLedger.filter(l => l.tipo === "cobro_comision");
      const feeHoy = fees.filter(l => l.t >= t0).reduce((s, l) => s - l.monto, 0), feeTot = fees.reduce((s, l) => s - l.monto, 0);
      const entregadosHoy = Object.values(db.orders).filter(o => o.estado === "entregado" && o.actualizado >= t0).length;
      const activos = Object.values(db.couriers).filter(x => x.disponible && db.users[x.uid]?.roles.repartidor === "aprobado").length;
      const custody = Object.values(db.wallets).reduce((s, w) => s + w.saldo + w.recargas + w.ganancias, 0);
      const att = [
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
    ${list.map(o => `<tr data-act="open" data-id="${o.id}" tabindex="0"><td><b>${o.codigo}</b><small>${o.modalidad === "libre" ? "Compra libre" : esc(o.tienda?.nombre || "Tienda")}</small></td><td>${userName(db, o.clienteId)}${botTag(db, o.clienteId)}</td><td>${o.courierId ? userName(db, o.courierId) + botTag(db, o.courierId) : `<span class="muted">—</span>`}</td><td>${o.precioTotal != null ? sol(o.precioTotal) : "—"}<small>${esc(o.pago)}</small></td><td>${chip(o.estado)}${o.estadoPago === "en_revision" ? payChip("en_revision") : ""}</td><td>${ago(o.actualizado)}</td></tr>`).join("")}
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
    reply(b, ctx) { replyModal(ctx, ctx.state.id, b.dataset.r); },
  },
};
function adminOrder(ctx) {
  const db = ctx.db, o = db.orders[ctx.state.id]; if (!o) return "";
  const offers = Object.values(o.offers).sort((a, b) => a.creado - b.creado);
  const L = { activa: ["Activa", "warn"], aceptada: ["Aceptada", "ok"], rechazada: ["No elegida", "muted"], vencida: ["Vencida", "muted"], retirada: ["Retirada", "muted"] };
  return `<div class="det-head"><div><span class="muted">${o.codigo} · creado ${ago(o.creado)}</span><h2>${esc(o.descripcion)}</h2></div><div class="row-btns">${chip(o.estado)}${payChip(o.estadoPago)}</div></div>
  <div class="grid-2">
    <div class="stack">
      ${o.estadoPago === "en_revision" ? `<section class="card action-card"><small>Pago en revisión</small><p>El cliente marcó «ya pagué» (operación <b>${esc(o.comprobante || "—")}</b>) y el repartidor no lo confirmó. Revisa la captura o el código y decide.</p><div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="pay" data-d="rechazar">Pago no válido</button><button class="btn small teal" type="button" data-act="pay" data-d="confirmar">Confirmar pago</button></div></section>` : ""}
      <section class="card"><h2 class="card-t">Participantes</h2>
        <div class="person">${avatar(o.clienteId, db.users[o.clienteId].nombre)}<div><b>${userName(db, o.clienteId)}${botTag(db, o.clienteId)}</b><span>Cliente · ${fmtPhone(db.users[o.clienteId].telefono)}</span></div></div>
        ${o.courierId ? courierMini(db, o.courierId) : `<p class="muted" style="margin-top:10px">Sin repartidor asignado.</p>`}
      </section>
      <section class="card"><h2 class="card-t">Ofertas (${offers.length})</h2>${offers.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Repartidor</th><th>Total</th><th>Comisión</th><th>Estado</th></tr></thead><tbody>${offers.map(of => `<tr><td>${userName(db, of.courierId)}<small>${of.tiempo} min · ${ago(of.creado)}</small></td><td>${sol(of.total)}<small>Envío ${sol(of.tarifa)}</small></td><td>${sol(of.comision)}</td><td><span class="chip ${L[of.estado][1]}">${L[of.estado][0]}</span></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Sin ofertas todavía.</p>`}</section>
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
        <dl class="kv sm"><div><dt>DNI</dt><dd>${esc(a.dni)}</dd></div><div><dt>Celular</dt><dd>${fmtPhone(a.celular)}</dd></div><div><dt>Vehículo</dt><dd>${vehLabel(a.vehiculo)}</dd></div><div><dt>Yape</dt><dd>${fmtPhone(a.yape || a.celular)}</dd></div>
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
          <td>${fmtPhone(u.telefono)}<small>${u.telefonoVerificado ? "Verificado" : "Sin verificar"}</small></td>
          <td>${[u.roles.admin && "Admin", u.roles.cliente && "Cliente", u.roles.repartidor && `Repartidor (${u.roles.repartidor})`].filter(Boolean).join(" · ")}</td>
          <td>${u.roles.repartidor === "aprobado" ? `Comisiones ${sol(w.recargas)}<small>Ganancias ${sol(w.ganancias)}</small>` : `Saldo ${sol(w.saldo)}`}</td>
          <td><span class="chip ${u.estado === "activo" ? "ok" : "bad"}">${u.estado === "activo" ? "Activo" : "Suspendido"}</span></td>
          <td class="t-actions">${u.uid !== ctx.uid ? `<button class="link" type="button" data-act="adj" data-id="${u.uid}">Ajustar saldo</button> <button class="link ${u.estado === "activo" ? "danger-t" : ""}" type="button" data-act="susp" data-id="${u.uid}">${u.estado === "activo" ? "Suspender" : "Reactivar"}</button>` : `<span class="muted">Tú</span>`}</td></tr>`; }).join("")}
        </tbody></table></div></section>`;
      })}`;
  },
  changes: { bots(el, ctx) { ctx.state.bots = el.checked; ctx.rerender(); } },
  actions: {
    uf(b, ctx) { ctx.state.ufilter = b.dataset.f; ctx.rerender(); },
    susp(b, ctx) { const u = ctx.db.users[b.dataset.id], s = u.estado === "activo"; confirmModal(s ? "Suspender cuenta" : "Reactivar cuenta", s ? `${u.nombre} no podrá ingresar ni recibir pedidos hasta que lo reactives.` : `${u.nombre} podrá volver a usar RAPIDIN.`, s ? "Suspender" : "Reactivar", () => run(() => api.suspendAccount(ctx.uid, u.uid, s), s ? "Cuenta suspendida." : "Cuenta reactivada."), s ? "danger" : "teal"); },
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
        <div class="f"><label for="rLibre">Compra libre (comisión fija, S/)</label><input class="in" id="rLibre" name="libre" inputmode="decimal" value="${ruleDraft.libre.toFixed(2)}"></div>
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
        <canvas class="map pick" id="pMap" style="height:300px" role="img" aria-label="Mapa para ubicar el punto estratégico"></canvas>
        <button class="btn" type="submit" style="margin-top:14px">Guardar punto</button>
      </form></div>`;
  },
  mount(root, ctx) {
    const cv = $("#pMap", root);
    const draw = () => drawMap(cv, { markers: [...Object.values(ctx.db.establishments).filter(e => e.activo).map(e => ({ pos: e.pos, type: "shop" })), { pos: puntoDraft, type: "punto", label: "Punto estratégico" }] });
    cv.addEventListener("click", e => { const p = pickPos(cv, e); if (p.x < MAP.mar + 0.03) return; puntoDraft = p; draw(); });
    draw();
  },
  actions: {
    addT() { readTramos(); const last = ruleDraft.tramos[ruleDraft.tramos.length - 1]; ruleDraft.tramos.push({ hasta: (last?.hasta || 0) + 2, monto: (last?.monto || 0) + 0.6 }); $("#tramos").innerHTML = tramosHtml(); },
    delT(b) { readTramos(); ruleDraft.tramos.splice(+b.dataset.i, 1); $("#tramos").innerHTML = tramosHtml(); },
  },
  forms: {
    rules(f, ctx) {
      readTramos();
      const r = { libre: num(f.libre.value), tramos: ruleDraft.tramos, masDe10: num(f.mas.value) };
      if ([r.libre, r.masDe10, ...r.tramos.flatMap(t => [t.hasta, t.monto])].some(isNaN)) return ($("#rErr").textContent = "Revisa los valores: usa solo números.");
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

/* ---------- Establecimientos ---------- */
const establecimientos = {
  title: "Establecimientos",
  render(ctx) {
    return `<div class="toolbar"><p class="hint-s">Aparecen en «Tienda específica». El catálogo de productos es opcional en esta versión.</p><button class="btn small" type="button" data-act="edit">Agregar establecimiento</button></div>
    ${ctx.live("est", () => {
      const db = ctx.db, list = Object.values(db.establishments).sort((a, b) => a.nombre.localeCompare(b.nombre));
      return `<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Nombre</th><th>Categoría</th><th>Horario</th><th>Distancia</th><th>Estado</th><th></th></tr></thead><tbody>
      ${list.map(e => `<tr><td><b>${esc(e.nombre)}</b><small>${esc(e.direccion)}</small></td><td>${esc(e.categoria)}</td><td>${esc(e.horario)}<small>${esc(e.dias)}</small></td><td>${roadKm(db.config.puntoEstrategico.pos, e.pos).toFixed(1)} km<small>Comisión ${sol(api.commissionFor(db, "tienda", roadKm(db.config.puntoEstrategico.pos, e.pos)))}</small></td>
        <td><span class="chip ${e.activo ? "ok" : "muted"}">${e.activo ? "Activo" : "Inactivo"}</span></td>
        <td class="t-actions"><button class="link" type="button" data-act="edit" data-id="${e.id}">Editar</button> <button class="link" type="button" data-act="toggle" data-id="${e.id}">${e.activo ? "Desactivar" : "Activar"}</button></td></tr>`).join("")}
      </tbody></table></div></section>`;
    })}`;
  },
  actions: {
    toggle(b, ctx) { run(() => api.toggleEstablishment(ctx.uid, b.dataset.id), "Establecimiento actualizado."); },
    edit(b, ctx) {
      const e = b.dataset.id ? ctx.db.establishments[b.dataset.id] : { nombre: "", categoria: "Comida", direccion: "", horario: "08:00–22:00", dias: "Lunes a domingo", contacto: "", pos: null };
      let pos = e.pos ? { ...e.pos } : null;
      modal(b.dataset.id ? "Editar establecimiento" : "Nuevo establecimiento", `<form data-mform="e" novalidate>
        <div class="two"><div class="f"><label for="eN">Nombre</label><input class="in" id="eN" name="n" value="${esc(e.nombre)}"></div>
        <div class="f"><label for="eC">Categoría</label><select class="in" id="eC" name="c">${["Comida", "Mercado", "Farmacia", "Ferretería", "Regalos", "Mascotas", "Otros"].map(c => `<option ${c === e.categoria ? "selected" : ""}>${c}</option>`).join("")}</select></div></div>
        <div class="f"><label for="eD">Dirección</label><input class="in" id="eD" name="d" value="${esc(e.direccion)}"></div>
        <div class="two"><div class="f"><label for="eH">Horario</label><input class="in" id="eH" name="h" value="${esc(e.horario)}"></div><div class="f"><label for="eDi">Días</label><input class="in" id="eDi" name="di" value="${esc(e.dias)}"></div></div>
        <div class="f"><label for="eT">Contacto <span class="opt">· opcional</span></label><input class="in" id="eT" name="t" value="${esc(e.contacto || "")}"></div>
        <span class="lbl">Ubicación <span class="opt">· toca el mapa</span></span>
        <canvas class="map pick" id="eMap" style="height:220px" role="img" aria-label="Mapa para ubicar el establecimiento"></canvas>
        <p class="err" id="eErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Guardar</button></div></form>`,
        {
          mount(body) {
            const cv = body.querySelector("#eMap");
            const draw = () => drawMap(cv, { markers: pos ? [{ pos, type: "tienda" }] : [] });
            cv.addEventListener("click", ev => { const p = pickPos(cv, ev); if (p.x < MAP.mar + 0.03) return; pos = p; draw(); });
            requestAnimationFrame(draw);
          },
          e: f => { if (run(() => api.upsertEstablishment(ctx.uid, { id: b.dataset.id || undefined, nombre: f.n.value, categoria: f.c.value, direccion: f.d.value, horario: f.h.value.trim(), dias: f.di.value.trim(), contacto: f.t.value.trim(), pos }), "Establecimiento guardado.")) closeModal(); },
        });
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
        <canvas class="map" style="height:260px;margin-top:14px" ${mapAttr({ markers: [{ pos: ctx.db.config.puntoEstrategico.pos, type: "punto", label: "Punto estratégico" }] })} role="img" aria-label="Zona de cobertura de Camaná"></canvas>
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
      const L = { confirmTopup: "Recarga", approveWithdrawal: "Retiro", approveCourier: "Postulación", suspendAccount: "Cuenta", updateCommissionRules: "Comisiones", updatePlatformConfig: "Configuración", cancelOrder: "Cancelación", resolvePayment: "Pago", resolveReport: "Reclamo", adjustWallet: "Ajuste de saldo", upsertEstablishment: "Establecimiento", toggleEstablishment: "Establecimiento", updateZone: "Zona" };
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
      { id: "establecimientos", label: "Establecimientos", icon: "store" },
      { id: "zonas", label: "Zonas", icon: "map" },
      { id: "reclamos", label: "Reclamos", icon: "alert", badge: c.reps || "" },
      { id: "config", label: "Configuración", icon: "settings" },
      { id: "auditoria", label: "Auditoría", icon: "log" },
    ];
  },
  views: { resumen, pedidos, pedido, postulaciones, usuarios, recargas, retiros, comisiones, establecimientos, zonas, config, reclamos, auditoria },
};
