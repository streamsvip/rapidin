/* RAPIDIN · Panel del repartidor (incluye la postulación) */
import * as api from "../demo/api.js";
import { roadKm } from "../demo/store.js";
import { $, esc, sol, fmtPhone, normPhone, waLink, run, modal, closeModal, num, chip, payChip, left, ago, empty, avatar, stars, firstName, shortName } from "../ui.js";
import { timeline, orderMap, orderSummaryRows, vehLabel } from "./common.js";
import { ledgerList, topupModal, reportModal, perfilView } from "./cliente.js";
import { openAuth } from "../auth.js";

const isMine = (o, uid) => o.courierId === uid;
const myOffer = (o, uid) => Object.values(o.offers).filter(x => x.courierId === uid).sort((a, b) => b.creado - a.creado)[0];
const NEXT_LABEL = {
  camino_a_recogida: "Voy camino a recoger", en_establecimiento: "Llegué al establecimiento", pedido_recogido: "Ya recogí el pedido",
  camino_a_entrega: "Salgo a entregar", entregado: "Entregué el pedido",
};

/* ---------- Postulación ---------- */
const postulacion = {
  title: "Trabaja con RAPIDIN", static: true,
  render(ctx) {
    const u = ctx.user, st = u.roles.repartidor, db = ctx.db;
    const app = Object.values(db.courierApplications).filter(a => a.uid === u.uid).sort((a, b) => b.creado - a.creado)[0];
    if (st === "pendiente") return `<section class="card narrow">
      <div class="ok-state"><svg class="ic big" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <h2>Tu postulación está en revisión</h2><p class="muted">Un administrador revisa tus documentos. Te avisaremos por notificación cuando termine.</p></div>
      <ol class="timeline"><li class="done"><span>Datos y documentos enviados</span>${app ? `<time>${ago(app.creado)}</time>` : ""}</li><li class="now"><span>En revisión por un administrador</span></li><li><span>Aprobada: ya puedes recibir pedidos</span></li></ol>
      <p class="hint-s">Mientras tu cuenta esté pendiente no puedes ver pedidos ni ofertar.</p></section>`;
    return `
      ${st === "rechazado" ? `<div class="banner bad">Tu postulación anterior no fue aprobada${app?.nota ? `: ${esc(app.nota)}` : ""}. Puedes corregir tus datos y volver a postular.</div>` : ""}
      ${u.telefonoVerificado ? "" : `<div class="banner warn">Verifica tu celular antes de postular. <button class="link" type="button" data-act="verify">Verificar ahora</button></div>`}
      <div class="grid-2 wide-left">
      <form class="card" data-form="postular" novalidate>
        <h2 class="card-t">Postula como repartidor</h2>
        <p class="muted" style="margin-bottom:18px">Solo pedimos lo necesario. Tus documentos los ve únicamente el equipo que revisa tu postulación.</p>
        <div class="two">
          <div class="f"><label for="aNom">Nombres y apellidos</label><input class="in" id="aNom" value="${esc(u.nombre)}" disabled></div>
          <div class="f"><label for="aDni">DNI</label><input class="in" id="aDni" name="dni" inputmode="numeric" maxlength="8" placeholder="8 dígitos"></div>
        </div>
        <div class="two">
          <div class="f"><label for="aVeh">¿Cómo repartes?</label><select class="in" id="aVeh" name="veh" data-change="veh"><option value="moto">Moto</option><option value="mototaxi">Mototaxi</option><option value="bicicleta">Bicicleta</option><option value="pie">A pie</option></select></div>
          <div class="f"><label for="aYape">Yape para cobrar</label><div class="phone-in"><span>+51</span><input class="in" id="aYape" name="yape" inputmode="numeric" maxlength="9" value="${esc(u.telefono)}"></div></div>
        </div>
        <div class="f"><label for="aDniF">Foto del DNI (ambas caras)</label><input class="in" id="aDniF" name="dniF" type="file" accept="image/*,.pdf" multiple></div>
        <div class="f" id="aLicBox"><label for="aLic">Licencia de conducir</label><input class="in" id="aLic" name="lic" type="file" accept="image/*,.pdf"></div>
        <label class="check"><input type="checkbox" id="aOk" name="ok"> <span>Declaro que mis datos son verdaderos y acepto los términos de RAPIDIN.</span></label>
        <p class="err" id="aErr" role="alert"></p>
        <button class="btn" type="submit" ${u.telefonoVerificado ? "" : "disabled"}>Enviar postulación</button>
        <p class="hint-s" style="margin-top:10px">Demostración: los archivos no se suben, solo se registran sus nombres.</p>
      </form>
      <aside class="card soft">
        <h2 class="card-t">Cómo funciona</h2>
        <ol class="steps-list"><li><b>Postulas</b><span>DNI y, si usas moto o mototaxi, tu licencia.</span></li><li><b>Te aprobamos</b><span>Un administrador revisa tus documentos.</span></li><li><b>Recargas tu billetera</b><span>La comisión se reserva al ofertar y se cobra solo si completas el pedido.</span></li><li><b>Ofertas y entregas</b><span>Tú pones tu tarifa. El cliente te paga directo.</span></li></ol>
      </aside></div>`;
  },
  changes: { veh(el) { $("#aLicBox").hidden = !["moto", "mototaxi"].includes(el.value); } },
  actions: { verify(b, ctx) { openAuth("verify", { uid: ctx.uid }); } },
  forms: {
    postular(f, ctx) {
      const err = $("#aErr"); err.textContent = "";
      const veh = f.veh.value, docs = [...f.dniF.files].map(x => x.name);
      if (!/^\d{8}$/.test(f.dni.value)) return (err.textContent = "El DNI debe tener 8 dígitos.");
      if (!/^9\d{8}$/.test(normPhone(f.yape.value))) return (err.textContent = "Tu Yape debe tener 9 dígitos y empezar con 9.");
      if (!docs.length) return (err.textContent = "Adjunta la foto de tu DNI.");
      if (["moto", "mototaxi"].includes(veh)) { if (!f.lic.files.length) return (err.textContent = "Adjunta tu licencia de conducir."); docs.push(f.lic.files[0].name); }
      if (!f.ok.checked) return (err.textContent = "Acepta los términos para continuar.");
      if (run(() => api.submitCourierApplication(ctx.uid, { dni: f.dni.value, vehiculo: veh, docs, yape: normPhone(f.yape.value) }), "Postulación enviada.")) ctx.rerender();
    },
  },
};

/* ---------- Pedidos disponibles ---------- */
const disponibles = {
  title: "Pedidos disponibles",
  render(ctx) { return ctx.live("disp", () => dispList(ctx)); },
  actions: {
    avail(b, ctx) { run(() => api.setAvailability(ctx.uid, b.dataset.on === "1"), b.dataset.on === "1" ? "Estás disponible. Te avisaremos de pedidos nuevos." : "Dejaste de estar disponible."); },
    offer(b, ctx) { offerModal(ctx, b.dataset.id); },
    withdraw(b, ctx) { run(() => api.withdrawOffer(ctx.uid, b.dataset.id, b.dataset.of), "Retiraste tu oferta. Liberamos la comisión."); },
    topup(b, ctx) { topupModal(ctx, "tu saldo para comisiones"); },
  },
};
function dispList(ctx) {
  const db = ctx.db, c = db.couriers[ctx.uid], w = db.wallets[ctx.uid];
  const open = Object.values(db.orders).filter(o => api.OPEN_STATES.includes(o.estado) && o.clienteId !== ctx.uid).sort((a, b) => b.creado - a.creado);
  const disp = api.walletDisponible(w);
  const head = `<div class="avail-bar ${c.disponible ? "on" : ""}">
      <div><b>${c.disponible ? "Estás disponible" : "No estás disponible"}</b><span>${c.disponible ? "Recibes pedidos de Camaná y puedes ofertar." : "Actívate para ver pedidos y enviar ofertas."}</span></div>
      <button class="switch" type="button" role="switch" aria-checked="${c.disponible}" data-act="avail" data-on="${c.disponible ? "0" : "1"}" aria-label="Disponible"><i></i></button>
    </div>
    <div class="kpis">
      <div class="kpi"><small>Saldo para comisiones</small><b>${sol(disp)}</b>${disp < 1 ? `<button class="btn small" type="button" data-act="topup">Recargar</button>` : `<span class="muted">Reservado: ${sol(w.reservado)}</span>`}</div>
      <div class="kpi"><small>Pedidos abiertos</small><b>${open.length}</b><span class="muted">En tu zona: Camaná</span></div>
      <div class="kpi"><small>Tu calificación</small><b>★ ${c.rating.toFixed(1)}</b><span class="muted">${c.completados} pedidos completados</span></div>
    </div>`;
  if (!c.disponible) return head + empty("Activa «Disponible» para ver pedidos", "Mientras no estés disponible no recibes pedidos ni puedes ofertar.");
  if (!open.length) return head + empty("No hay pedidos abiertos ahora", "Te avisaremos apenas un cliente publique una solicitud.");
  return head + `<div class="cards">${open.map(o => {
    const mineOf = myOffer(o, ctx.uid);
    const com = api.commissionFor(db, o.modalidad, o.distanciaKm);
    const n = Object.values(o.offers).filter(x => x.estado === "activa").length;
    const kmEntrega = o.tienda ? roadKm(o.tienda.pos, o.entrega.pos) : null;
    return `<article class="order-card static ${ctx.state.focus === o.id ? "focus" : ""}">
      <div class="oc-top"><b>${o.codigo}</b><span class="chip ${o.modalidad === "libre" ? "accent" : "info"}">${o.modalidad === "libre" ? "Compra libre" : "Tienda específica"}</span></div>
      <p class="oc-desc">${esc(o.descripcion)}</p>
      <dl class="kv sm">
        ${o.tienda ? `<div><dt>Recoger en</dt><dd>${esc(o.tienda.nombre)}<small>${esc(o.tienda.direccion)} · ${o.distanciaKm.toFixed(1)} km del centro</small></dd></div>` : `<div><dt>Recoger en</dt><dd>Donde tú elijas</dd></div>`}
        <div><dt>Entrega</dt><dd>${esc(o.entrega.referencia || "Ver mapa")}${kmEntrega != null ? `<small>${kmEntrega.toFixed(1)} km desde la tienda</small>` : ""}</dd></div>
        <div><dt>Pago</dt><dd>${esc(o.pago)}</dd></div>
        <div><dt>Comisión si te eligen</dt><dd><b>${sol(com)}</b></dd></div>
      </dl>
      <div class="oc-foot"><span class="muted">${ago(o.creado)} · ${n} ${n === 1 ? "oferta" : "ofertas"}</span>
      ${mineOf && mineOf.estado === "activa" ? `<span class="mine">Tu oferta: <b>${sol(mineOf.total)}</b> · vence ${left(mineOf.vence)} <button class="link" type="button" data-act="withdraw" data-id="${o.id}" data-of="${mineOf.id}">Retirar</button></span>`
        : mineOf && mineOf.estado !== "retirada" && mineOf.estado !== "vencida" ? `<span class="muted">Ya ofertaste</span>` : `<button class="btn small" type="button" data-act="offer" data-id="${o.id}">Ofertar</button>`}</div>
    </article>`;
  }).join("")}</div>`;
}
function offerModal(ctx, orderId) {
  const db = ctx.db, o = db.orders[orderId], w = db.wallets[ctx.uid];
  const com = api.commissionFor(db, o.modalidad, o.distanciaKm);
  const calc = body => {
    const costo = num(body.querySelector("#ofC").value) || 0, tarifa = num(body.querySelector("#ofT").value) || 0;
    body.querySelector("#ofTot").textContent = sol(costo + tarifa);
    const g = tarifa - com; const el = body.querySelector("#ofG"); el.textContent = sol(g); el.className = g < 0 ? "neg" : "pos";
  };
  modal(`Ofertar en ${o.codigo}`, `<form data-mform="of" novalidate>
    <p class="m-text">${esc(o.descripcion)}</p>
    <div class="two">
      <div class="f"><label for="ofC">Costo de productos (S/)</label><input class="in" id="ofC" name="c" inputmode="decimal" placeholder="0.00"><span class="hint-s">${o.modalidad === "libre" ? "Lo que estimas pagar por las compras." : "Precio en la tienda. Pon 0 si el cliente ya pagó."}</span></div>
      <div class="f"><label for="ofT">Tu tarifa de envío (S/)</label><input class="in" id="ofT" name="t" inputmode="decimal" value="6.00"></div>
    </div>
    <div class="two">
      <div class="f"><label for="ofMin">Tiempo estimado (min)</label><input class="in" id="ofMin" name="m" inputmode="numeric" value="20"></div>
      <div class="f"><label for="ofMsg">Mensaje <span class="opt">· opcional</span></label><input class="in" id="ofMsg" name="msg" maxlength="140" placeholder="Salgo ahora mismo"></div>
    </div>
    <div class="calc-box">
      <div><small>Precio total para el cliente</small><b id="ofTot">S/ 6.00</b></div>
      <div><small>Comisión RAPIDIN</small><b>${sol(com)}</b></div>
      <div><small>Tu ganancia estimada</small><b id="ofG" class="pos">${sol(6 - com)}</b></div>
    </div>
    <p class="hint-s">Al enviar reservamos ${sol(com)} de tu billetera (disponible: ${sol(api.walletDisponible(w))}). Si no te eligen o la oferta vence en ${Math.round(db.config.ofertaVenceSeg / 60)} min, la liberamos.</p>
    <p class="err" id="ofErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Enviar oferta</button></div></form>`,
    {
      mount: calc, input: (el, body) => calc(body),
      of: f => {
        const c = num(f.c.value || "0"), t = num(f.t.value), m = num(f.m.value);
        if (isNaN(c) || isNaN(t) || isNaN(m)) return ($("#ofErr").textContent = "Revisa los montos: usa solo números.");
        if (run(() => api.submitOffer(ctx.uid, orderId, { costoProductos: c, tarifa: t, tiempo: m, mensaje: f.msg.value }), "Oferta enviada. Te avisaremos si te eligen.")) closeModal();
      },
    });
}

/* ---------- Mis ofertas ---------- */
const ofertas = {
  title: "Mis ofertas",
  render(ctx) {
    return ctx.live("ofs", () => {
      const db = ctx.db, rows = [];
      Object.values(db.orders).forEach(o => Object.values(o.offers).forEach(of => { if (of.courierId === ctx.uid) rows.push({ o, of }); }));
      rows.sort((a, b) => b.of.creado - a.of.creado);
      if (!rows.length) return empty("Aún no enviaste ofertas", "Revisa los pedidos disponibles y envía tu primera oferta.", `<a class="btn small" href="#repartidor-disponibles">Ver pedidos</a>`);
      const L = { activa: ["Esperando al cliente", "warn"], aceptada: ["Aceptada", "ok"], rechazada: ["No elegida", "muted"], vencida: ["Vencida", "muted"], retirada: ["Retirada", "muted"] };
      return `<div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Total</th><th>Comisión</th><th>Estado</th><th>Enviada</th></tr></thead><tbody>
        ${rows.map(({ o, of }) => `<tr><td><b>${o.codigo}</b><small>${esc(o.descripcion.slice(0, 48))}${o.descripcion.length > 48 ? "…" : ""}</small></td><td>${sol(of.total)}</td><td>${sol(of.comision)}<small>${of.estado === "activa" ? "Reservada" : of.estado === "aceptada" ? (o.estado === "entregado" ? "Cobrada" : "Reservada") : "Liberada"}</small></td>
        <td><span class="chip ${L[of.estado][1]}">${L[of.estado][0]}</span>${of.estado === "activa" ? `<small>Vence ${left(of.vence)}</small>` : ""}</td><td>${ago(of.creado)}</td></tr>`).join("")}
      </tbody></table></div>`;
    });
  },
};

/* ---------- Mis entregas ---------- */
const asignados = {
  title: "Mis entregas",
  render(ctx) {
    return ctx.live("asg", () => {
      const db = ctx.db, all = Object.values(db.orders).filter(o => isMine(o, ctx.uid)).sort((a, b) => b.actualizado - a.actualizado);
      const act = all.filter(o => api.ACTIVE_STATES.includes(o.estado)), done = all.filter(o => !api.ACTIVE_STATES.includes(o.estado));
      const card = o => `<button type="button" class="order-card" data-act="open" data-id="${o.id}">
        <div class="oc-top"><b>${o.codigo}</b>${chip(o.estado)}</div><p class="oc-desc">${esc(o.descripcion)}</p>
        <div class="oc-meta"><span>${esc(shortName(db.users[o.clienteId].nombre))}</span><span>${ago(o.actualizado)}</span></div>
        <div class="oc-foot"><b>${sol(o.precioTotal)}</b><span class="muted">${esc(o.pago)}</span></div></button>`;
      return `<h2 class="sec-t">En curso</h2>${act.length ? `<div class="cards">${act.map(card).join("")}</div>` : empty("No tienes entregas en curso", "Cuando un cliente acepte tu oferta, el pedido aparecerá aquí.")}
        <h2 class="sec-t">Historial</h2>${done.length ? `<div class="cards">${done.map(card).join("")}</div>` : `<p class="muted">Todavía no completas pedidos.</p>`}`;
    });
  },
  actions: { open(b, ctx) { ctx.go("#repartidor-entrega", { id: b.dataset.id }); } },
};

/* ---------- Detalle de entrega ---------- */
const entrega = {
  title: "Entrega", parent: "asignados",
  render(ctx) {
    const o = ctx.db.orders[ctx.state.id];
    if (!o || o.courierId !== ctx.uid) return empty("No encontramos esta entrega", "Vuelve a tu lista de entregas.", `<a class="btn small" href="#repartidor-asignados">Mis entregas</a>`);
    return `<a class="back" href="#repartidor-asignados">← Mis entregas</a>${ctx.live("ent", () => entregaDetail(ctx))}`;
  },
  actions: {
    next(b, ctx) {
      const o = ctx.db.orders[ctx.state.id], nuevo = b.dataset.next;
      if (nuevo !== "entregado") return run(() => api.advanceOrderState(ctx.uid, o.id, nuevo), "Estado actualizado. Avisamos al cliente.");
      modal("Confirmar entrega", `<form data-mform="d" novalidate>
        ${o.pago === "Efectivo" ? `<label class="check"><input type="checkbox" name="cash"> <span>Recibí ${sol(o.precioTotal)} en efectivo.</span></label>` : ""}
        <div class="f"><label for="dEv">Foto de la entrega <span class="opt">· opcional</span></label><input class="in" id="dEv" name="ev" type="file" accept="image/*"></div>
        <div class="f"><label for="dCp">Comprobante de compra <span class="opt">· si corresponde</span></label><input class="in" id="dCp" name="cp" type="file" accept="image/*,.pdf"></div>
        <p class="hint-s">Al confirmar se cobra la comisión de ${sol(o.comision)} que estaba reservada.</p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn teal" type="submit">Confirmar entrega</button></div></form>`,
        { d: f => { const ev = [f.ev.files[0]?.name, f.cp.files[0]?.name].filter(Boolean).join(", "); if (run(() => api.advanceOrderState(ctx.uid, o.id, "entregado", { efectivoRecibido: !!f.cash?.checked, evidencia: ev || null }), "¡Entrega completada!")) closeModal(); } });
    },
    pay(b, ctx) { run(() => api.confirmOrderPayment(ctx.uid, ctx.state.id, b.dataset.ok === "1"), b.dataset.ok === "1" ? "Pago confirmado." : "Enviamos el pago a revisión."); },
    change(b, ctx) {
      const o = ctx.db.orders[ctx.state.id];
      modal("Proponer un cambio", `<form data-mform="ch" novalidate>
        <p class="m-text">El cliente debe aprobar cualquier cambio de producto o precio. Precio actual: <b>${sol(o.precioTotal)}</b>.</p>
        <div class="f"><label for="chT">Nuevo precio total (S/)</label><input class="in" id="chT" name="t" inputmode="decimal"></div>
        <div class="f"><label for="chM">Motivo</label><textarea class="in" id="chM" name="m" rows="3" placeholder="Ej.: No había gaseosa de 1.5 L, solo de 2 L (+S/ 1.50)."></textarea></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Enviar al cliente</button></div></form>`,
        { ch: f => { if (run(() => api.proposeOrderChange(ctx.uid, o.id, { nuevoTotal: num(f.t.value), motivo: f.m.value }), "Enviamos el cambio al cliente.")) closeModal(); } });
    },
    report(b, ctx) { reportModal(ctx, ctx.state.id); },
  },
};
function entregaDetail(ctx) {
  const db = ctx.db, o = db.orders[ctx.state.id]; if (!o) return "";
  const cl = db.users[o.clienteId], of = o.offers[o.ofertaAceptadaId];
  const next = api.nextStateFor(o.estado);
  const active = api.ACTIVE_STATES.includes(o.estado);
  const needsPay = next === "entregado" && api.METODOS_DIRECTOS.includes(o.pago) && o.estadoPago !== "confirmado";
  const pend = o.cambios.find(c => c.estado === "pendiente");
  let pago = "";
  if (api.METODOS_DIRECTOS.includes(o.pago)) pago = `<div class="pay-state"><div>${payChip(o.estadoPago)}<b>${sol(o.precioTotal)} por ${esc(o.pago)}</b></div>
    ${o.estadoPago === "marcado" ? `<p>El cliente marcó «ya pagué» · operación <b>${esc(o.comprobante)}</b>. Revisa tu ${esc(o.pago)}.</p><div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="pay" data-ok="0">No lo veo</button><button class="btn small teal" type="button" data-act="pay" data-ok="1">Pago recibido</button></div>` : o.estadoPago === "pendiente" ? `<p class="muted">El cliente aún no marca «ya pagué».</p>` : o.estadoPago === "en_revision" ? `<p class="muted">Un administrador está revisando el pago.</p>` : ""}</div>`;
  else if (o.pago === "Efectivo") pago = `<div class="pay-state"><div>${payChip(o.estadoPago)}<b>Cobra ${sol(o.precioTotal)} en efectivo</b></div><p class="muted">Confirmarás el cobro al marcar la entrega.</p></div>`;
  else pago = `<div class="pay-state"><div>${payChip(o.estadoPago)}<b>${sol(o.precioTotal)} con saldo RAPIDIN</b></div><p class="muted">Se acredita a tus ganancias cuando confirmes la entrega.</p></div>`;
  return `
  <div class="det-head"><div><span class="muted">${o.codigo} · ${o.modalidad === "libre" ? "Compra libre" : "Tienda específica"}</span><h2>${esc(o.descripcion)}</h2></div>${chip(o.estado)}</div>
  <div class="grid-2">
    <div class="stack">
      ${active ? `<section class="card action-card">
        <small>Siguiente paso</small>
        ${o.estado === "camino_a_entrega" ? `<p>Vas camino al cliente. Cuando estés a menos de ${db.config.umbralCercaM} m le avisamos que estás cerca.</p>` : ""}
        ${needsPay ? `<p>Para cerrar la entrega primero confirma el pago del cliente.</p>` : ""}
        ${next ? `<button class="btn big" type="button" data-act="next" data-next="${next}" ${needsPay ? "disabled" : ""}>${NEXT_LABEL[next]}</button>` : ""}
      </section>` : ""}
      <section class="card"><h2 class="card-t">Cliente</h2>
        <div class="person">${avatar(cl.uid, cl.nombre)}<div><b>${esc(cl.nombre)}</b><span>${esc(o.entrega.referencia || "Sin referencia")}</span></div></div>
        ${active ? `<div class="contact-row"><a class="btn small ghost-dark" href="${waLink(cl.whatsapp)}" target="_blank" rel="noopener">WhatsApp ${fmtPhone(cl.whatsapp)}</a><span class="muted">Llamar: ${fmtPhone(cl.telefono)}</span></div>
        <p class="hint-s">Solo ves estos datos mientras atiendes este pedido.</p>` : ""}
      </section>
      <section class="card"><h2 class="card-t">Cobro</h2>${pago}
        <dl class="kv" style="margin-top:12px">${of?.costoProductos ? `<div><dt>Productos</dt><dd>${sol(of.costoProductos)}</dd></div>` : ""}<div><dt>Tu tarifa</dt><dd>${sol(of?.tarifa || 0)}</dd></div><div><dt>Comisión RAPIDIN</dt><dd>${sol(o.comision)} <small>${o.estado === "entregado" ? "Cobrada" : "Reservada"}</small></dd></div><div><dt>Tu ganancia</dt><dd><b class="pos">${sol((of?.tarifa || 0) - o.comision)}</b></dd></div></dl>
      </section>
      ${pend ? `<div class="banner warn">Esperando que el cliente apruebe el cambio a ${sol(pend.nuevoTotal)}.</div>` : ""}
      ${o.cambios.filter(c => c.estado !== "pendiente").slice(-1).map(c => `<div class="banner ${c.estado === "aprobado" ? "ok" : "bad"}">El cliente ${c.estado === "aprobado" ? "aprobó" : "rechazó"} el cambio a ${sol(c.nuevoTotal)}.</div>`).join("")}
      <div class="row-btns">
        ${active && api.ESTADOS.indexOf(o.estado) < api.ESTADOS.indexOf("camino_a_entrega") && !pend ? `<button class="btn small ghost-dark" type="button" data-act="change">Proponer cambio de precio o producto</button>` : ""}
        <button class="btn small ghost-dark" type="button" data-act="report">Reportar un problema</button>
      </div>
      ${o.calificacion ? `<div class="banner ok">El cliente te calificó con ${"★".repeat(o.calificacion.estrellas)}${o.calificacion.comentario ? ` · «${esc(o.calificacion.comentario)}»` : ""}</div>` : ""}
    </div>
    <div class="stack">
      <section class="card">${orderMap(o, db)}</section>
      <section class="card"><h2 class="card-t">Detalle</h2>${orderSummaryRows(o)}</section>
      <section class="card"><h2 class="card-t">Estado</h2>${timeline(o)}</section>
    </div>
  </div>`;
}

/* ---------- Billetera ---------- */
const billetera = {
  title: "Billetera",
  render(ctx) {
    return ctx.live("bw", () => {
      const db = ctx.db, w = db.wallets[ctx.uid];
      const wds = Object.values(db.withdrawals).filter(x => x.uid === ctx.uid).sort((a, b) => b.creado - a.creado);
      const tops = Object.values(db.topups).filter(x => x.uid === ctx.uid).sort((a, b) => b.creado - a.creado);
      const ST = { pendiente: ["Por revisar", "warn"], pagado: ["Pagado", "ok"], rechazado: ["Rechazado", "bad"], confirmada: ["Verificada", "ok"], rechazada: ["Rechazada", "bad"] };
      return `<div class="kpis">
        <div class="kpi kpi-main"><small>Saldo para comisiones</small><b>${sol(api.walletDisponible(w))}</b><button class="btn small" type="button" data-act="topup">Recargar</button></div>
        <div class="kpi"><small>Reservado en ofertas</small><b>${sol(w.reservado)}</b><span class="muted">Se libera si no te eligen</span></div>
        <div class="kpi"><small>Ganancias retirables</small><b class="pos">${sol(w.ganancias)}</b>${db.config.retirosHabilitados ? `<button class="btn small ghost-dark" type="button" data-act="withdraw">Solicitar retiro</button>` : `<span class="muted">Retiros pausados</span>`}</div>
      </div>
      <p class="hint-s" style="margin:-6px 0 18px">Las recargas solo sirven para pagar comisiones. Los retiros salen únicamente de tus ganancias (pedidos pagados con saldo RAPIDIN).</p>
      <div class="grid-3">
        <section class="card"><h2 class="card-t">Recargas</h2>${tops.length ? `<ul class="rows">${tops.map(t => `<li><div><b>${sol(t.monto)} · ${esc(t.metodo)}</b><small>Op. ${esc(t.operacion)} · ${ago(t.creado)}</small></div><span class="chip ${ST[t.estado][1]}">${ST[t.estado][0]}</span></li>`).join("")}</ul>` : `<p class="muted">Sin recargas.</p>`}</section>
        <section class="card"><h2 class="card-t">Retiros</h2>${wds.length ? `<ul class="rows">${wds.map(t => `<li><div><b>${sol(t.monto)}</b><small>${esc(t.cuenta)} · ${ago(t.creado)}</small></div><span class="chip ${ST[t.estado][1]}">${ST[t.estado][0]}</span></li>`).join("")}</ul>` : `<p class="muted">Sin retiros.</p>`}</section>
        <section class="card"><h2 class="card-t">Movimientos</h2>${ledgerList(db.walletLedger.filter(l => l.uid === ctx.uid).slice(0, 25))}</section>
      </div>`;
    });
  },
  actions: {
    topup(b, ctx) { topupModal(ctx, "tu saldo para comisiones"); },
    withdraw(b, ctx) {
      const c = ctx.db.couriers[ctx.uid], w = ctx.db.wallets[ctx.uid];
      modal("Solicitar retiro", `<form data-mform="w" novalidate>
        <p class="m-text">Disponible para retirar: <b>${sol(w.ganancias)}</b>. Un administrador aprueba y envía el dinero.</p>
        <div class="two"><div class="f"><label for="wM">Monto (S/)</label><input class="in" id="wM" name="m" inputmode="decimal" placeholder="20.00"></div>
        <div class="f"><label for="wC">Cuenta</label><select class="in" id="wC" name="c">${c.cuentasCobro.map(x => `<option>${esc(x.tipo)} ${fmtPhone(x.numero).replace("+51 ", "")}</option>`).join("")}</select></div></div>
        <p class="err" id="wErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Solicitar retiro</button></div></form>`,
        { w: f => { const m = num(f.m.value); if (!(m > 0)) return ($("#wErr").textContent = "Escribe el monto."); if (run(() => api.requestWithdrawal(ctx.uid, { monto: m, cuenta: f.c.value }), "Solicitud enviada.")) closeModal(); } });
    },
  },
};

/* ---------- Perfil y cuentas de cobro ---------- */
const basePerfil = perfilView("");
const perfil = {
  title: "Perfil y cobros", static: true,
  render(ctx) {
    const c = ctx.db.couriers[ctx.uid];
    const get = t => c.cuentasCobro.find(x => x.tipo === t);
    return `<div class="grid-2">${basePerfil.render(ctx)}
      <div class="stack">
        <form class="card" data-form="cuentas" novalidate>
          <h2 class="card-t">Cuentas de cobro</h2>
          <p class="hint-s" style="margin-bottom:14px">El cliente las ve solo después de aceptar tu oferta y solo para ese pedido. RAPIDIN las verifica antes de mostrarlas.</p>
          ${["Yape", "Plin", "Lemon"].map(t => `<div class="f"><label for="cc${t}">${t} ${get(t) ? (get(t).verificada ? `<span class="ok-pill">Verificada</span>` : `<span class="chip warn">Por verificar</span>`) : ""}</label><div class="phone-in"><span>+51</span><input class="in" id="cc${t}" name="${t}" inputmode="numeric" maxlength="9" value="${esc(get(t)?.numero || "")}" placeholder="Opcional"></div></div>`).join("")}
          <p class="err" id="ccErr" role="alert"></p>
          <button class="btn" type="submit">Guardar cuentas</button>
        </form>
        <section class="card soft"><h2 class="card-t">Tu cuenta de repartidor</h2>
          <dl class="kv"><div><dt>Vehículo</dt><dd>${vehLabel(c.vehiculo)}</dd></div><div><dt>Zona</dt><dd>Camaná</dd></div><div><dt>Calificación</dt><dd>${stars(c.rating)} (${c.ratingCount})</dd></div><div><dt>Pedidos completados</dt><dd>${c.completados}</dd></div></dl></section>
      </div></div>`;
  },
  actions: basePerfil.actions,
  forms: {
    ...basePerfil.forms,
    cuentas(f, ctx) {
      const cuentas = ["Yape", "Plin", "Lemon"].map(t => ({ tipo: t, numero: normPhone(f[t].value), titular: ctx.user.nombre })).filter(x => x.numero);
      if (!cuentas.length) return ($("#ccErr").textContent = "Registra al menos una cuenta para cobrar.");
      if (run(() => api.updatePayoutAccounts(ctx.uid, cuentas), "Cuentas guardadas. Las nuevas quedan por verificar.")) ctx.rerender();
    },
  },
};

export default {
  id: "repartidor", label: "Panel de repartidor", icon: "moto",
  allowed: u => !u.roles.admin || !!u.roles.repartidor,
  switchable: u => !!u.roles.repartidor,
  home: u => (u.roles.repartidor === "aprobado" ? "#repartidor-disponibles" : "#repartidor-postulacion"),
  defaultView: u => (u.roles.repartidor === "aprobado" ? "disponibles" : "postulacion"),
  resolve(v, u) {
    if (u.roles.repartidor !== "aprobado") return "postulacion";
    if (v === "postulacion") return "disponibles";
    return null;
  },
  nav(u, db) {
    if (u.roles.repartidor !== "aprobado") return [{ id: "postulacion", label: "Mi postulación", icon: "log" }];
    const open = Object.values(db.orders).filter(o => api.OPEN_STATES.includes(o.estado) && o.clienteId !== u.uid && !myOffer(o, u.uid)).length;
    const act = Object.values(db.orders).filter(o => o.courierId === u.uid && api.ACTIVE_STATES.includes(o.estado)).length;
    return [
      { id: "disponibles", label: "Pedidos disponibles", short: "Pedidos", icon: "list", badge: db.couriers[u.uid]?.disponible ? open || "" : "" },
      { id: "asignados", label: "Mis entregas", short: "Entregas", icon: "route", badge: act || "" },
      { id: "ofertas", label: "Mis ofertas", short: "Ofertas", icon: "tag" },
      { id: "billetera", label: "Billetera", short: "Billetera", icon: "wallet" },
      { id: "perfil", label: "Perfil y cobros", short: "Perfil", icon: "user" },
    ];
  },
  views: { postulacion, disponibles, ofertas, asignados, entrega, billetera, perfil },
};
