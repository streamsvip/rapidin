/* =========================================================
   RAPIDIN · Reglas de negocio (DEMOSTRACIÓN)
   Cada función lleva el nombre de la Cloud Function que la
   reemplazará. Todas validan quién llama, el estado actual y
   las reglas del documento maestro, y se ejecutan dentro de
   tx(), que hace de transacción de Firestore.
   ========================================================= */
import { tx, load, now, uid, roadKm, distKm, MAP, isOpen, statusLabel } from "./store.js";

export class ApiError extends Error {}
const fail = msg => { throw new ApiError(msg); };
const ok = (cond, msg) => { if (!cond) fail(msg); };
const r2 = n => Math.round(n * 100) / 100;

/* ---------- Estados del pedido ---------- */
export const ESTADOS = [
  "solicitado", "buscando_repartidor", "ofertas_recibidas", "oferta_aceptada", "repartidor_asignado",
  "camino_a_recogida", "en_establecimiento", "pedido_recogido", "camino_a_entrega", "repartidor_cerca", "entregado",
];
export const ESTADO_LABEL = {
  solicitado: "Solicitado", buscando_repartidor: "Buscando repartidor", ofertas_recibidas: "Ofertas recibidas",
  oferta_aceptada: "Oferta aceptada", repartidor_asignado: "Repartidor asignado", camino_a_recogida: "Camino a recogida",
  en_establecimiento: "En el establecimiento", pedido_recogido: "Pedido recogido", camino_a_entrega: "Camino a entrega",
  repartidor_cerca: "Repartidor cerca", entregado: "Entregado", cancelado: "Cancelado", en_revision: "En revisión",
};
export const PAGO_LABEL = { pendiente: "Pago pendiente", marcado: "Cliente marcó «ya pagué»", confirmado: "Pago confirmado", en_revision: "Pago en revisión", retenido: "Monto retenido del saldo" };
const NEXT_BY_COURIER = {
  repartidor_asignado: "camino_a_recogida", camino_a_recogida: "en_establecimiento", en_establecimiento: "pedido_recogido",
  pedido_recogido: "camino_a_entrega", camino_a_entrega: "entregado", repartidor_cerca: "entregado",
};
export const OPEN_STATES = ["buscando_repartidor", "ofertas_recibidas"];
export const ACTIVE_STATES = ["oferta_aceptada", "repartidor_asignado", "camino_a_recogida", "en_establecimiento", "pedido_recogido", "camino_a_entrega", "repartidor_cerca"];
export const nextStateFor = estado => NEXT_BY_COURIER[estado] || null;
export const METODOS_DIRECTOS = ["Yape", "Plin", "Lemon"];
export const MODALIDAD = { libre: "Compra libre", tienda: "Tienda específica", catalogo: "Market" };

/* ---------- Utilidades internas ---------- */
function user(db, id) { const u = db.users[id]; ok(u, "La cuenta no existe."); return u; }
function activeUser(db, id) { const u = user(db, id); ok(u.estado === "activo", "Tu cuenta está suspendida. Escríbenos para revisarla."); return u; }
function admin(db, id) { const u = activeUser(db, id); ok(u.roles.admin, "Esta acción es solo para administradores."); return u; }
function approvedCourier(db, id) { const u = activeUser(db, id); ok(u.roles.repartidor === "aprobado", "Tu cuenta de repartidor aún no está aprobada."); return u; }
function order(db, id) { const o = db.orders[id]; ok(o, "El pedido no existe."); return o; }
function wallet(db, id) { return (db.wallets[id] ||= { recargas: 0, ganancias: 0, reservado: 0, saldo: 0, retenido: 0 }); }

function ledger(db, e) {
  if (db.walletLedger.some(l => l.key === e.key)) return false; // idempotencia
  db.walletLedger.unshift({ id: uid("l"), t: now(), ...e, monto: r2(e.monto) });
  return true;
}
function audit(db, actor, accion, detalle) { db.auditLog.unshift({ id: uid("a"), t: now(), uid: actor, accion, detalle }); }
export function notify(db, to, texto, orderId = null, key = null) {
  const list = (db.notifications[to] ||= []);
  if (key && list.some(n => n.key === key)) return;
  list.unshift({ id: uid("n"), t: now(), texto, orderId, key, leida: false });
  list.length = Math.min(list.length, 40);
}
function event(db, o, estado, por, nota) { o.events.push({ t: now(), estado, por, nota }); o.actualizado = now(); }
const name = (db, id) => db.users[id]?.nombre || "Usuario";
const first = (db, id) => name(db, id).split(" ")[0];

export function commissionFor(db, modalidad, km) {
  const r = db.commissionRules;
  if (modalidad === "libre") return r.libre;
  for (const t of r.tramos) if (km <= t.hasta) return t.monto;
  return r.masDe10;
}
export const walletDisponible = w => r2(w.recargas - w.reservado);
export const saldoDisponible = w => r2(w.saldo - w.retenido);

function releaseOffer(db, o, of, motivo) {
  if (!of.reservaActiva) return;
  const w = wallet(db, of.courierId);
  w.reservado = r2(Math.max(0, w.reservado - of.comision));
  of.reservaActiva = false;
  ledger(db, { uid: of.courierId, tipo: "liberacion", monto: of.comision, ref: o.id, key: `release:${of.id}`, nota: `Reserva liberada (${motivo}) · ${o.codigo}` });
}
function releaseClientHold(db, o) {
  if (o.pago !== "Saldo RAPIDIN" || !o.retencion) return;
  const w = wallet(db, o.clienteId);
  w.retenido = r2(Math.max(0, w.retenido - o.retencion));
  ledger(db, { uid: o.clienteId, tipo: "liberacion", monto: o.retencion, ref: o.id, key: `hold-release:${o.id}`, nota: `Retención liberada · ${o.codigo}` });
  o.retencion = 0;
}
function settleSaldo(db, o) {
  if (o.pago !== "Saldo RAPIDIN" || !o.retencion) return;
  const wc = wallet(db, o.clienteId), wr = wallet(db, o.courierId), m = o.retencion;
  wc.retenido = r2(wc.retenido - m); wc.saldo = r2(wc.saldo - m); wr.ganancias = r2(wr.ganancias + m);
  ledger(db, { uid: o.clienteId, tipo: "pago_pedido", monto: -m, ref: o.id, key: `pay-out:${o.id}`, nota: `Pago del pedido ${o.codigo}` });
  ledger(db, { uid: o.courierId, tipo: "pago_pedido", monto: m, ref: o.id, key: `pay-in:${o.id}`, nota: `Cobro con saldo · ${o.codigo}` });
  o.retencion = 0; o.estadoPago = "confirmado";
}

/* =========================================================
   Autenticación (luego: Firebase Authentication)
   ========================================================= */
export function signIn(correo, pass) {
  const db = load();
  const u = Object.values(db.users).find(x => x.correo.toLowerCase() === correo.trim().toLowerCase());
  ok(u && !u.bot && u.pass === pass, "Correo o contraseña incorrectos.");
  ok(u.estado === "activo", "Tu cuenta está suspendida. Escríbenos para revisarla.");
  return u.uid;
}
export function signUp({ nombre, correo, pass, telefono, whatsapp }) {
  return tx(db => {
    const mail = correo.trim().toLowerCase();
    ok(!Object.values(db.users).some(u => u.correo.toLowerCase() === mail), "Ya existe una cuenta con ese correo. Ingresa o usa otro.");
    ok(!Object.values(db.users).some(u => u.telefono === telefono), "Ese celular ya está registrado en otra cuenta.");
    const id = uid("u");
    db.users[id] = { uid: id, nombre, correo: mail, pass, telefono, whatsapp, telefonoVerificado: false, roles: { cliente: true, repartidor: null, admin: false }, estado: "activo", creado: now() };
    wallet(db, id);
    return id;
  });
}
export function verifyPhone(id) { tx(db => { user(db, id).telefonoVerificado = true; }); }
/** El nombre de quien postula o trabaja como repartidor queda verificado con su DNI y no lo puede cambiar. */
export const nameLocked = u => ["pendiente", "aprobado"].includes(u?.roles?.repartidor);
export function updateProfile(id, patch) {
  tx(db => {
    const u = activeUser(db, id);
    if (patch.nombre && patch.nombre !== u.nombre) {
      ok(!nameLocked(u), "Tu nombre está verificado con tu DNI y no se puede cambiar. Si hay un error, escríbenos y un administrador lo revisará.");
      u.nombre = patch.nombre;
    }
    if (patch.whatsapp) u.whatsapp = patch.whatsapp;
    if (patch.telefono && patch.telefono !== u.telefono) {
      ok(!Object.values(db.users).some(x => x.telefono === patch.telefono && x.uid !== id), "Ese celular ya está registrado en otra cuenta.");
      u.telefono = patch.telefono; u.telefonoVerificado = false;
    }
  });
}

/* =========================================================
   Cliente
   ========================================================= */
export function createOrder(actor, { modalidad, descripcion, tienda, tiendaId, items, nota, entrega, pago }) {
  return tx(db => {
    const u = activeUser(db, actor);
    ok(u.roles.cliente, "Esta cuenta no puede crear pedidos.");
    ok(u.telefonoVerificado, "Verifica tu celular antes de pedir.");
    ok(db.zones.camana.activa, "Por ahora no estamos recibiendo pedidos.");
    ok(["libre", "tienda", "catalogo"].includes(modalidad), "Elige una modalidad.");
    ok(entrega?.pos && entrega.pos.x >= 0.01 && entrega.pos.x <= 0.99 && entrega.pos.y >= 0.01 && entrega.pos.y <= 0.99, "Marca un punto de entrega dentro de la zona de Camaná.");
    const permitidos = ["Efectivo", ...METODOS_DIRECTOS, ...(db.config.saldoClienteHabilitado ? ["Saldo RAPIDIN"] : [])];
    ok(permitidos.includes(pago), "Elige un medio de pago válido.");
    let km = null, lista = null, subtotal = null;
    if (modalidad === "catalogo") {
      // Precios del Market: se toman del catálogo del local, nunca de lo que envía el navegador.
      const e = db.establishments[tiendaId];
      ok(e && e.activo && e.tiendaVirtual, "Este local no está vendiendo en el Market.");
      ok(isOpen(e), `${e.nombre} está cerrado ahora (${statusLabel(e)}).`);
      ok(Array.isArray(items) && items.length, "Tu carrito está vacío.");
      lista = items.map(it => {
        const p = db.products[it.productId];
        ok(p && p.tiendaId === e.id, "Uno de los productos ya no existe. Revisa tu carrito.");
        ok(p.disponible, `«${p.nombre}» ya no está disponible.`);
        const cantidad = Math.round(+it.cantidad);
        ok(cantidad >= 1 && cantidad <= 30, "Las cantidades deben estar entre 1 y 30.");
        return { productId: p.id, nombre: p.nombre, precio: p.precio, cantidad, total: r2(p.precio * cantidad) };
      });
      subtotal = r2(lista.reduce((s, x) => s + x.total, 0));
      tienda = { id: e.id, nombre: e.nombre, direccion: e.direccion, pos: e.pos };
      descripcion = lista.map(x => `${x.cantidad} × ${x.nombre}`).join(", ");
    } else {
      ok(descripcion && descripcion.trim().length >= 6, "Describe tu pedido con un poco más de detalle.");
      if (modalidad === "tienda") {
        ok(tienda?.nombre && tienda.pos, "Elige el establecimiento o márcalo en el mapa.");
        if (tienda.id) { const e = db.establishments[tienda.id]; ok(e?.activo, "Ese establecimiento no está disponible."); ok(isOpen(e), `${e.nombre} está cerrado ahora (${statusLabel(e)}).`); }
      }
    }
    if (modalidad !== "libre") km = roadKm(db.config.puntoEstrategico.pos, tienda.pos);
    const id = uid("o"), codigo = `RP-${++db.seq}`;
    db.orders[id] = {
      id, codigo, clienteId: actor, modalidad, descripcion: descripcion.trim(), tienda: modalidad === "libre" ? null : tienda,
      items: lista, subtotal, nota: (nota || "").trim().slice(0, 200),
      entrega, pago, estado: "buscando_repartidor", estadoPago: "pendiente", courierId: null, ofertaAceptadaId: null,
      precioTotal: null, comision: null, distanciaKm: km, creado: now(), actualizado: now(), offers: {},
      events: [{ t: now(), estado: "solicitado", por: actor }, { t: now(), estado: "buscando_repartidor", por: "sistema" }],
      tracking: null, calificacion: null, cambios: [], reportes: [], comprobante: null, retencion: 0,
    };
    const aviso = modalidad === "catalogo" ? `Nuevo pedido del Market (${tienda.nombre}): ${codigo}` : `Nuevo pedido en tu zona: ${codigo}`;
    Object.values(db.couriers).forEach(c => { if (c.disponible && db.users[c.uid]?.roles.repartidor === "aprobado") notify(db, c.uid, aviso, id, `new:${id}`); });
    notify(db, actor, `Publicamos tu pedido ${codigo}. Pronto llegarán ofertas de envío.`, id, `pub:${id}`);
    return id;
  });
}

/* Direcciones frecuentes del cliente */
export function saveAddress(actor, { nombre, pos, referencia }) {
  return tx(db => {
    const u = activeUser(db, actor);
    ok(nombre && nombre.trim().length >= 2, "Ponle un nombre a la dirección, por ejemplo «Casa».");
    ok(pos, "Marca la dirección en el mapa.");
    u.direcciones ||= [];
    ok(u.direcciones.length < 8, "Puedes guardar hasta 8 direcciones.");
    const id = uid("d");
    u.direcciones.push({ id, nombre: nombre.trim().slice(0, 30), pos, referencia: (referencia || "").trim() });
    return id;
  });
}
export function deleteAddress(actor, id) {
  tx(db => { const u = activeUser(db, actor); u.direcciones = (u.direcciones || []).filter(d => d.id !== id); });
}

export function acceptOffer(actor, orderId, offerId) {
  return tx(db => {
    activeUser(db, actor);
    const o = order(db, orderId);
    ok(o.clienteId === actor, "Este pedido no es tuyo.");
    ok(OPEN_STATES.includes(o.estado), "Este pedido ya no está disponible para aceptar ofertas.");
    const of = o.offers[offerId];
    ok(of && of.estado === "activa", "Esta oferta ya no está disponible.");
    ok(of.vence > now(), "Esta oferta venció. Elige otra.");
    ok(db.users[of.courierId]?.estado === "activo", "Este repartidor no está disponible.");
    if (o.pago === "Saldo RAPIDIN") {
      ok(db.config.saldoClienteHabilitado, "El pago con saldo no está habilitado.");
      const w = wallet(db, actor);
      ok(saldoDisponible(w) >= of.total, `Tu saldo disponible (S/ ${saldoDisponible(w).toFixed(2)}) no alcanza para esta oferta.`);
      w.retenido = r2(w.retenido + of.total); o.retencion = of.total; o.estadoPago = "retenido";
      ledger(db, { uid: actor, tipo: "retencion", monto: -of.total, ref: o.id, key: `hold:${o.id}`, nota: `Monto retenido · ${o.codigo}` });
    }
    of.estado = "aceptada";
    Object.values(o.offers).forEach(x => {
      if (x.id !== of.id && x.estado === "activa") {
        x.estado = "rechazada"; releaseOffer(db, o, x, "no elegida");
        notify(db, x.courierId, `El cliente eligió otra oferta en ${o.codigo}.`, o.id, `rej:${x.id}`);
      }
    });
    o.courierId = of.courierId; o.ofertaAceptadaId = of.id; o.precioTotal = of.total; o.comision = of.comision;
    const c = db.couriers[of.courierId];
    const recogida = o.tienda?.pos || nearestShop(db, o.entrega.pos);
    o.recogida = recogida;
    o.tracking = { pos: { ...(c?.pos || recogida) }, t: now() };
    event(db, o, "oferta_aceptada", actor);
    event(db, o, "repartidor_asignado", "sistema");
    o.estado = "repartidor_asignado";
    if (o.pago === "Saldo RAPIDIN" && db.config.pagoSaldoLiberacion === "al_aceptar") settleSaldo(db, o);
    notify(db, of.courierId, `¡Te eligieron! Pedido ${o.codigo} asignado.`, o.id, `acc:${of.id}`);
    notify(db, actor, `${first(db, of.courierId)} es tu repartidor para ${o.codigo}.`, o.id, `asg:${o.id}`);
  });
}
function nearestShop(db, pos) {
  const shops = Object.values(db.establishments).filter(e => e.activo);
  shops.sort((a, b) => distKm(a.pos, pos) - distKm(b.pos, pos));
  return shops[0]?.pos || db.config.puntoEstrategico.pos;
}

export function cancelOrder(actor, orderId, motivo = "") {
  tx(db => {
    const u = activeUser(db, actor);
    const o = order(db, orderId);
    const isAdmin = u.roles.admin;
    ok(isAdmin || o.clienteId === actor, "No puedes cancelar este pedido.");
    ok(!["entregado", "cancelado"].includes(o.estado), "Este pedido ya terminó.");
    if (!isAdmin) ok(ESTADOS.indexOf(o.estado) < ESTADOS.indexOf("pedido_recogido"), "El repartidor ya recogió tu pedido. Para cancelarlo, repórtalo y lo revisamos.");
    Object.values(o.offers).forEach(x => { if (["activa", "aceptada"].includes(x.estado)) { if (x.estado === "activa") x.estado = "retirada"; releaseOffer(db, o, x, "pedido cancelado"); } });
    releaseClientHold(db, o);
    o.estado = "cancelado"; o.tracking = null;
    event(db, o, "cancelado", actor, motivo || (isAdmin ? "Cancelado por administración" : "Cancelado por el cliente"));
    if (o.courierId) notify(db, o.courierId, `El pedido ${o.codigo} fue cancelado. No se te cobra comisión.`, o.id, `cancel-c:${o.id}`);
    notify(db, o.clienteId, `Tu pedido ${o.codigo} fue cancelado.`, o.id, `cancel:${o.id}`);
    if (isAdmin) audit(db, actor, "cancelOrder", `${o.codigo}: ${motivo || "sin motivo"}`);
  });
}

export function markOrderPaid(actor, orderId, comprobante) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor, "Este pedido no es tuyo.");
    ok(METODOS_DIRECTOS.includes(o.pago), "Este pedido no se paga por transferencia.");
    ok(o.courierId && ACTIVE_STATES.includes(o.estado), "Podrás pagar cuando tengas un repartidor asignado.");
    ok(["pendiente", "en_revision"].includes(o.estadoPago), "Ya registraste el pago.");
    o.estadoPago = "marcado"; o.comprobante = (comprobante || "").trim() || "Sin código";
    notify(db, o.courierId, `${first(db, actor)} marcó «ya pagué» en ${o.codigo}. Revisa tu ${o.pago}.`, o.id, `paid:${o.id}:${o.events.length}`);
  });
}
export function confirmOrderPayment(actor, orderId, recibido) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.courierId === actor, "Este pedido no está asignado a ti.");
    if (o.pago === "Efectivo") { ok(recibido, "Para efectivo solo confirmas al recibir el dinero."); o.estadoPago = "confirmado"; return; }
    ok(o.estadoPago === "marcado", "El cliente aún no marca «ya pagué».");
    if (recibido) { o.estadoPago = "confirmado"; notify(db, o.clienteId, `${first(db, actor)} confirmó tu pago de ${o.codigo}.`, o.id, `pconf:${o.id}`); }
    else {
      o.estadoPago = "en_revision";
      notify(db, o.clienteId, `El repartidor no ve tu pago de ${o.codigo}. Un administrador lo revisará.`, o.id, `prev:${o.id}`);
      Object.values(db.users).filter(x => x.roles.admin).forEach(a => notify(db, a.uid, `Pago en revisión en ${o.codigo}.`, o.id, `prev-a:${o.id}`));
    }
  });
}
export function rateCourier(actor, orderId, estrellas, comentario) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor, "Este pedido no es tuyo.");
    ok(o.estado === "entregado", "Califica cuando recibas tu pedido.");
    ok(!o.calificacion, "Ya calificaste este pedido.");
    ok(estrellas >= 1 && estrellas <= 5, "Elige de 1 a 5 estrellas.");
    o.calificacion = { estrellas, comentario: (comentario || "").trim() };
    const c = db.couriers[o.courierId];
    if (c) { c.rating = r2((c.rating * c.ratingCount + estrellas) / (c.ratingCount + 1)); c.ratingCount++; }
    notify(db, o.courierId, `Recibiste ${estrellas} ★ en ${o.codigo}.`, o.id, `rate:${o.id}`);
  });
}
export function reportProblem(actor, orderId, texto) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor || o.courierId === actor, "No participas en este pedido.");
    ok(texto && texto.trim().length >= 8, "Cuéntanos qué pasó con un poco más de detalle.");
    o.reportes.push({ id: uid("r"), t: now(), por: actor, texto: texto.trim(), estado: "abierto" });
    Object.values(db.users).filter(x => x.roles.admin).forEach(a => notify(db, a.uid, `Nuevo reclamo en ${o.codigo}.`, o.id));
  });
}

/* Cambios después de aceptar (compra libre, precio o producto) */
export function proposeOrderChange(actor, orderId, { nuevoTotal, motivo }) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.courierId === actor, "Este pedido no está asignado a ti.");
    ok(ACTIVE_STATES.includes(o.estado) && ESTADOS.indexOf(o.estado) < ESTADOS.indexOf("camino_a_entrega"), "Solo puedes proponer cambios antes de salir a entregar.");
    ok(!o.cambios.some(c => c.estado === "pendiente"), "Ya hay un cambio esperando respuesta del cliente.");
    ok(nuevoTotal > 0 && motivo && motivo.trim().length >= 6, "Indica el nuevo precio total y el motivo.");
    o.cambios.push({ id: uid("ch"), t: now(), nuevoTotal: r2(nuevoTotal), anterior: o.precioTotal, motivo: motivo.trim(), estado: "pendiente" });
    notify(db, o.clienteId, `${first(db, actor)} propone un cambio en ${o.codigo}. Revísalo.`, o.id);
  });
}
export function approveOrderChange(actor, orderId, changeId, aprobar) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor, "Este pedido no es tuyo.");
    const ch = o.cambios.find(c => c.id === changeId);
    ok(ch && ch.estado === "pendiente", "Este cambio ya fue respondido.");
    if (aprobar && o.pago === "Saldo RAPIDIN" && o.retencion) {
      const w = wallet(db, actor), diff = r2(ch.nuevoTotal - o.retencion);
      ok(diff <= 0 || saldoDisponible(w) >= diff, "Tu saldo no alcanza para el nuevo precio.");
      w.retenido = r2(w.retenido + diff); o.retencion = ch.nuevoTotal;
    }
    ch.estado = aprobar ? "aprobado" : "rechazado";
    if (aprobar) o.precioTotal = ch.nuevoTotal;
    notify(db, o.courierId, `El cliente ${aprobar ? "aprobó" : "rechazó"} el cambio en ${o.codigo}.`, o.id);
  });
}

export function requestTopup(actor, { monto, metodo, operacion }) {
  tx(db => {
    activeUser(db, actor);
    ok(monto >= 5 && monto <= 1000, "La recarga debe ser entre S/ 5 y S/ 1000.");
    ok(METODOS_DIRECTOS.includes(metodo), "Elige Yape, Plin o Lemon.");
    ok(/^\d{4,12}$/.test(operacion || ""), "Escribe el código de operación (solo números).");
    ok(!Object.values(db.topups).some(t => t.operacion === operacion && t.estado !== "rechazada"), "Ese código de operación ya fue registrado.");
    const id = uid("tp");
    db.topups[id] = { id, uid: actor, monto: r2(monto), metodo, operacion, estado: "pendiente", creado: now() };
    Object.values(db.users).filter(x => x.roles.admin).forEach(a => notify(db, a.uid, `Nueva recarga por verificar: S/ ${r2(monto).toFixed(2)}.`));
  });
}
export function requestWithdrawal(actor, { monto, cuenta }) {
  tx(db => {
    approvedCourier(db, actor);
    ok(db.config.retirosHabilitados, "Los retiros están deshabilitados por ahora.");
    const w = wallet(db, actor);
    const pendiente = Object.values(db.withdrawals).filter(x => x.uid === actor && x.estado === "pendiente").reduce((s, x) => s + x.monto, 0);
    ok(monto >= 10, "El retiro mínimo es S/ 10.");
    ok(monto <= r2(w.ganancias - pendiente), `Puedes retirar hasta S/ ${r2(w.ganancias - pendiente).toFixed(2)} de tus ganancias.`);
    ok(cuenta, "Elige la cuenta donde recibirás el dinero.");
    const id = uid("wd");
    db.withdrawals[id] = { id, uid: actor, monto: r2(monto), cuenta, estado: "pendiente", creado: now() };
  });
}

/* =========================================================
   Repartidor
   ========================================================= */
export function submitCourierApplication(actor, { dni, vehiculo, docs, yape }) {
  tx(db => {
    const u = activeUser(db, actor);
    ok(u.telefonoVerificado, "Verifica tu celular antes de postular.");
    ok(!["pendiente", "aprobado"].includes(u.roles.repartidor), "Ya tienes una postulación registrada.");
    ok(/^\d{8}$/.test(dni), "El DNI debe tener 8 dígitos.");
    ok(["moto", "mototaxi", "bicicleta", "pie"].includes(vehiculo), "Elige cómo repartes.");
    ok(docs.length >= 1, "Adjunta la foto de tu DNI.");
    const id = uid("app");
    db.courierApplications[id] = { id, uid: actor, nombre: u.nombre, dni, celular: u.telefono, vehiculo, docs, yape: yape || u.telefono, estado: "pendiente", creado: now(), nota: "" };
    u.roles.repartidor = "pendiente";
    Object.values(db.users).filter(x => x.roles.admin).forEach(a => notify(db, a.uid, `Nueva postulación de ${u.nombre}.`));
  });
}
export function setAvailability(actor, disponible) {
  tx(db => { approvedCourier(db, actor); db.couriers[actor].disponible = !!disponible; });
}
export function updatePayoutAccounts(actor, cuentas) {
  tx(db => {
    approvedCourier(db, actor);
    cuentas.forEach(c => ok(/^9\d{8}$/.test(c.numero), `El número de ${c.tipo} debe tener 9 dígitos y empezar con 9.`));
    const prev = db.couriers[actor].cuentasCobro;
    db.couriers[actor].cuentasCobro = cuentas.map(c => ({ ...c, verificada: prev.some(p => p.tipo === c.tipo && p.numero === c.numero && p.verificada) }));
  });
}

export function submitOffer(actor, orderId, { costoProductos, tarifa, tiempo, mensaje }) {
  costoProductos = +costoProductos || 0;
  return tx(db => {
    approvedCourier(db, actor);
    const c = db.couriers[actor];
    ok(c.disponible, "Activa «Disponible» para enviar ofertas.");
    const o = order(db, orderId);
    ok(OPEN_STATES.includes(o.estado), "Este pedido ya no recibe ofertas.");
    ok(o.clienteId !== actor, "No puedes ofertar en tu propio pedido.");
    ok(!Object.values(o.offers).some(x => x.courierId === actor && ["activa", "aceptada"].includes(x.estado)), "Ya enviaste una oferta para este pedido.");
    if (o.modalidad === "catalogo") costoProductos = o.subtotal; // el precio lo fija el local
    ok(tarifa > 0 && tarifa <= 100, "Tu tarifa debe ser mayor a S/ 0.");
    ok(costoProductos >= 0, "El costo de productos no puede ser negativo.");
    ok(tiempo >= 5 && tiempo <= 180, "El tiempo estimado debe estar entre 5 y 180 minutos.");
    const comision = commissionFor(db, o.modalidad, o.distanciaKm);
    const w = wallet(db, actor);
    ok(walletDisponible(w) >= comision, `Necesitas S/ ${comision.toFixed(2)} disponibles en tu billetera para reservar la comisión. Recarga para seguir ofertando.`);
    const id = uid("of");
    w.reservado = r2(w.reservado + comision);
    o.offers[id] = { id, courierId: actor, costoProductos: r2(costoProductos), tarifa: r2(tarifa), total: r2(costoProductos + tarifa), tiempo: Math.round(tiempo), mensaje: (mensaje || "").trim().slice(0, 140), estado: "activa", comision, reservaActiva: true, creado: now(), vence: now() + db.config.ofertaVenceSeg * 1000 };
    ledger(db, { uid: actor, tipo: "reserva", monto: -comision, ref: o.id, key: `reserve:${id}`, nota: `Comisión reservada · ${o.codigo}` });
    if (o.estado === "buscando_repartidor") { o.estado = "ofertas_recibidas"; event(db, o, "ofertas_recibidas", "sistema"); }
    notify(db, o.clienteId, `Nueva oferta de ${first(db, actor)} en ${o.codigo}: S/ ${o.offers[id].total.toFixed(2)}.`, o.id, `offer:${id}`);
    return id;
  });
}
export function withdrawOffer(actor, orderId, offerId) {
  tx(db => {
    const o = order(db, orderId), of = o.offers[offerId];
    ok(of && of.courierId === actor && of.estado === "activa", "Esta oferta ya no se puede retirar.");
    of.estado = "retirada"; releaseOffer(db, o, of, "retirada");
    if (!Object.values(o.offers).some(x => x.estado === "activa") && o.estado === "ofertas_recibidas") o.estado = "buscando_repartidor";
  });
}

export function advanceOrderState(actor, orderId, nuevo, extra = {}) {
  tx(db => {
    approvedCourier(db, actor);
    const o = order(db, orderId);
    ok(o.courierId === actor, "Este pedido no está asignado a ti.");
    ok(NEXT_BY_COURIER[o.estado] === nuevo, `No puedes pasar de «${ESTADO_LABEL[o.estado]}» a «${ESTADO_LABEL[nuevo] || nuevo}».`);
    if (nuevo === "entregado") {
      if (o.pago === "Efectivo") { ok(extra.efectivoRecibido, "Confirma que recibiste el efectivo."); o.estadoPago = "confirmado"; }
      else if (METODOS_DIRECTOS.includes(o.pago)) ok(o.estadoPago === "confirmado", "Confirma el pago del cliente antes de marcar la entrega.");
      settleSaldo(db, o);
      // Cobro de la comisión: la reserva se convierte en cobro (idempotente).
      const of = o.offers[o.ofertaAceptadaId], w = wallet(db, actor);
      if (of?.reservaActiva) {
        w.reservado = r2(Math.max(0, w.reservado - of.comision)); w.recargas = r2(w.recargas - of.comision); of.reservaActiva = false;
        ledger(db, { uid: actor, tipo: "cobro_comision", monto: -of.comision, ref: o.id, key: `fee:${o.id}`, nota: `Comisión cobrada · ${o.codigo}` });
      }
      db.couriers[actor].completados++;
      if (extra.evidencia) o.evidencia = extra.evidencia;
      o.tracking = null; // retención limitada de ubicaciones
    }
    o.estado = nuevo; event(db, o, nuevo, actor);
    const msg = {
      camino_a_recogida: `${first(db, actor)} va camino a recoger tu pedido ${o.codigo}.`,
      en_establecimiento: `${first(db, actor)} llegó al establecimiento (${o.codigo}).`,
      pedido_recogido: `¡Tu pedido ${o.codigo} fue recogido!`,
      camino_a_entrega: `Tu pedido ${o.codigo} va en camino.`,
      entregado: `Pedido ${o.codigo} entregado. ¡Califica a ${first(db, actor)}!`,
    }[nuevo];
    if (msg) notify(db, o.clienteId, msg, o.id, `st:${o.id}:${nuevo}`);
  });
}

/** Ubicación del repartidor. En la versión real llega cada 5–10 s y el backend decide «repartidor cerca». */
export function updateTracking(courierId, orderId, pos) {
  tx(db => {
    const o = db.orders[orderId];
    if (!o || o.courierId !== courierId || !ACTIVE_STATES.includes(o.estado)) return;
    o.tracking = { pos, t: now() };
    if (db.couriers[courierId]) db.couriers[courierId].pos = pos;
    if (o.estado === "camino_a_entrega" && distKm(pos, o.entrega.pos) * 1000 <= db.config.umbralCercaM) {
      o.estado = "repartidor_cerca"; event(db, o, "repartidor_cerca", "sistema");
      notify(db, o.clienteId, `Tu repartidor está cerca (${o.codigo}).`, o.id, `near:${o.id}`);
    }
  });
}

/* ---------- Tareas programadas (luego: expireOffers, expireStaleOrders) ---------- */
export function runScheduled() {
  const db = load(), t = now();
  const needs = Object.values(db.orders).some(o =>
    (OPEN_STATES.includes(o.estado) && (Object.values(o.offers).some(x => x.estado === "activa" && x.vence <= t) || t - o.creado > 3600e3)));
  if (!needs) return;
  tx(db => {
    Object.values(db.orders).forEach(o => {
      if (!OPEN_STATES.includes(o.estado)) return;
      Object.values(o.offers).forEach(x => {
        if (x.estado === "activa" && x.vence <= t) { x.estado = "vencida"; releaseOffer(db, o, x, "vencida"); }
      });
      if (o.estado === "ofertas_recibidas" && !Object.values(o.offers).some(x => x.estado === "activa")) o.estado = "buscando_repartidor";
      if (t - o.creado > 3600e3) {
        o.estado = "cancelado"; event(db, o, "cancelado", "sistema", "Sin oferta aceptada en 60 minutos");
        notify(db, o.clienteId, `Tu solicitud ${o.codigo} venció sin oferta aceptada.`, o.id, `stale:${o.id}`);
      }
    });
  });
}

/* =========================================================
   Administración (todas quedan en auditLog)
   ========================================================= */
export function approveCourier(actor, appId, aprobar, nota = "") {
  tx(db => {
    admin(db, actor);
    const a = db.courierApplications[appId];
    ok(a && a.estado === "pendiente", "Esta postulación ya fue revisada.");
    const u = user(db, a.uid);
    a.estado = aprobar ? "aprobada" : "rechazada"; a.nota = nota; a.revisado = now();
    u.roles.repartidor = aprobar ? "aprobado" : "rechazado";
    if (aprobar) {
      db.couriers[a.uid] ||= { uid: a.uid, vehiculo: a.vehiculo, disponible: false, zona: "camana", rating: 5, ratingCount: 0, completados: 0, cuentasCobro: [{ tipo: "Yape", numero: a.yape || u.telefono, titular: u.nombre, verificada: true }], pos: { ...db.config.puntoEstrategico.pos } };
      wallet(db, a.uid);
    }
    notify(db, a.uid, aprobar ? "¡Tu postulación fue aprobada! Ya puedes trabajar con RAPIDIN." : `Tu postulación no fue aprobada.${nota ? " Motivo: " + nota : ""}`);
    audit(db, actor, "approveCourier", `${u.nombre}: ${aprobar ? "aprobada" : "rechazada"}${nota ? " · " + nota : ""}`);
  });
}
export function suspendAccount(actor, target, suspender) {
  tx(db => {
    admin(db, actor);
    ok(actor !== target, "No puedes suspender tu propia cuenta.");
    const u = user(db, target);
    u.estado = suspender ? "suspendido" : "activo";
    if (suspender && db.couriers[target]) db.couriers[target].disponible = false;
    audit(db, actor, "suspendAccount", `${u.nombre}: ${suspender ? "suspendida" : "reactivada"}`);
  });
}
export function confirmTopup(actor, id, aprobar) {
  tx(db => {
    admin(db, actor);
    const t = db.topups[id];
    ok(t && t.estado === "pendiente", "Esta recarga ya fue revisada.");
    t.estado = aprobar ? "confirmada" : "rechazada"; t.revisado = now();
    if (aprobar) {
      const u = user(db, t.uid), w = wallet(db, t.uid);
      // Repartidor: saldo para comisiones. Cliente: saldo para pagar pedidos. Ninguna recarga es ingreso de RAPIDIN.
      if (u.roles.repartidor === "aprobado") w.recargas = r2(w.recargas + t.monto); else w.saldo = r2(w.saldo + t.monto);
      ledger(db, { uid: t.uid, tipo: "recarga", monto: t.monto, ref: id, key: `topup:${id}`, nota: `Recarga ${t.metodo} verificada` });
    }
    notify(db, t.uid, aprobar ? `Tu recarga de S/ ${t.monto.toFixed(2)} fue verificada.` : `Tu recarga de S/ ${t.monto.toFixed(2)} fue rechazada. Revisa el código de operación.`);
    audit(db, actor, "confirmTopup", `S/ ${t.monto.toFixed(2)} de ${name(db, t.uid)}: ${aprobar ? "confirmada" : "rechazada"}`);
  });
}
export function approveWithdrawal(actor, id, aprobar) {
  tx(db => {
    admin(db, actor);
    const r = db.withdrawals[id];
    ok(r && r.estado === "pendiente", "Este retiro ya fue revisado.");
    const w = wallet(db, r.uid);
    if (aprobar) {
      ok(w.ganancias >= r.monto, "Las ganancias del repartidor ya no alcanzan para este retiro.");
      w.ganancias = r2(w.ganancias - r.monto);
      ledger(db, { uid: r.uid, tipo: "retiro", monto: -r.monto, ref: id, key: `wd:${id}`, nota: `Retiro a ${r.cuenta}` });
    }
    r.estado = aprobar ? "pagado" : "rechazado"; r.revisado = now();
    notify(db, r.uid, aprobar ? `Te enviamos S/ ${r.monto.toFixed(2)} a ${r.cuenta}.` : "Tu solicitud de retiro fue rechazada.");
    audit(db, actor, "approveWithdrawal", `S/ ${r.monto.toFixed(2)} de ${name(db, r.uid)}: ${aprobar ? "pagado" : "rechazado"}`);
  });
}
export function updateCommissionRules(actor, rules) {
  tx(db => {
    admin(db, actor);
    ok(rules.libre >= 0 && rules.masDe10 >= 0, "Las comisiones no pueden ser negativas.");
    let prev = 0;
    rules.tramos.forEach(t => { ok(t.hasta > prev, "Los tramos deben ir de menor a mayor distancia."); ok(t.monto >= 0, "Las comisiones no pueden ser negativas."); prev = t.hasta; });
    db.commissionRules = { libre: r2(rules.libre), tramos: rules.tramos.map(t => ({ hasta: r2(t.hasta), monto: r2(t.monto) })), masDe10: r2(rules.masDe10) };
    audit(db, actor, "updateCommissionRules", `Compra libre S/ ${r2(rules.libre).toFixed(2)} · ${rules.tramos.length} tramos`);
  });
}
export function updatePlatformConfig(actor, patch) {
  tx(db => {
    admin(db, actor);
    if ("ofertaVenceSeg" in patch) ok(patch.ofertaVenceSeg >= 30 && patch.ofertaVenceSeg <= 1800, "El vencimiento debe estar entre 30 y 1800 segundos.");
    if ("umbralCercaM" in patch) ok(patch.umbralCercaM >= 50 && patch.umbralCercaM <= 2000, "El umbral debe estar entre 50 y 2000 metros.");
    Object.assign(db.config, patch);
    audit(db, actor, "updatePlatformConfig", Object.keys(patch).join(", "));
  });
}
export function setZoneActive(actor, zoneId, activa) {
  tx(db => { admin(db, actor); db.zones[zoneId].activa = !!activa; audit(db, actor, "updateZone", `${db.zones[zoneId].nombre}: ${activa ? "activa" : "pausada"}`); });
}
export function upsertEstablishment(actor, e) {
  tx(db => {
    admin(db, actor);
    ok(e.nombre && e.nombre.trim().length >= 3, "Escribe el nombre del establecimiento.");
    ok(e.direccion && e.direccion.trim().length >= 4, "Escribe la dirección.");
    ok(e.pos && e.pos.x >= 0.01 && e.pos.x <= 0.99, "Marca la ubicación en el mapa.");
    const h = e.horario;
    ok(h && Array.isArray(h.dias) && h.dias.length, "Elige al menos un día de atención.");
    ok(/^\d{2}:\d{2}$/.test(h.abre) && /^\d{2}:\d{2}$/.test(h.cierra) && h.abre !== h.cierra, "Revisa el horario de apertura y cierre.");
    ok(!e.telefono || /^9\d{8}$/.test(e.telefono), "El teléfono del local debe tener 9 dígitos y empezar con 9.");
    const id = e.id || uid("e");
    db.establishments[id] = {
      ...(db.establishments[id] || { activo: true, zona: "camana", contacto: "" }),
      ...e, id, nombre: e.nombre.trim(), direccion: e.direccion.trim(), descripcion: (e.descripcion || "").trim(),
      tiempoPrep: Math.max(0, Math.round(+e.tiempoPrep || 0)), tiendaVirtual: !!e.tiendaVirtual,
    };
    audit(db, actor, "upsertEstablishment", db.establishments[id].nombre);
  });
}
export function upsertProduct(actor, p) {
  tx(db => {
    admin(db, actor);
    const e = db.establishments[p.tiendaId];
    ok(e, "El local no existe.");
    ok(p.nombre && p.nombre.trim().length >= 2, "Escribe el nombre del producto.");
    ok(p.precio > 0 && p.precio <= 5000, "El precio debe ser mayor a S/ 0.");
    ok(p.seccion && p.seccion.trim().length >= 2, "Indica la sección del catálogo, por ejemplo «Bebidas».");
    const id = p.id || uid("p");
    const prev = db.products[id];
    db.products[id] = { ...(prev || { disponible: true, orden: Object.keys(db.products).length + 1 }), ...p, id, nombre: p.nombre.trim(), seccion: p.seccion.trim(), descripcion: (p.descripcion || "").trim(), precio: r2(p.precio) };
    audit(db, actor, "upsertProduct", `${e.nombre}: ${db.products[id].nombre} · S/ ${db.products[id].precio.toFixed(2)}${prev && prev.precio !== db.products[id].precio ? ` (antes S/ ${prev.precio.toFixed(2)})` : ""}`);
  });
}
export function toggleProduct(actor, id) {
  tx(db => { admin(db, actor); const p = db.products[id]; ok(p, "El producto no existe."); p.disponible = !p.disponible; audit(db, actor, "toggleProduct", `${p.nombre}: ${p.disponible ? "disponible" : "agotado"}`); });
}
export function deleteProduct(actor, id) {
  tx(db => { admin(db, actor); const p = db.products[id]; ok(p, "El producto no existe."); delete db.products[id]; audit(db, actor, "deleteProduct", p.nombre); });
}
export function toggleEstablishment(actor, id) {
  tx(db => { admin(db, actor); const e = db.establishments[id]; e.activo = !e.activo; audit(db, actor, "toggleEstablishment", `${e.nombre}: ${e.activo ? "activo" : "inactivo"}`); });
}
export function resolvePayment(actor, orderId, decision) {
  tx(db => {
    admin(db, actor);
    const o = order(db, orderId);
    ok(o.estadoPago === "en_revision", "Este pago no está en revisión.");
    o.estadoPago = decision === "confirmar" ? "confirmado" : "pendiente";
    notify(db, o.clienteId, decision === "confirmar" ? `Confirmamos tu pago de ${o.codigo}.` : `No pudimos confirmar tu pago de ${o.codigo}. Vuelve a enviarlo.`, o.id);
    notify(db, o.courierId, decision === "confirmar" ? `Administración confirmó el pago de ${o.codigo}.` : `Pago de ${o.codigo} no confirmado: el cliente debe pagar de nuevo.`, o.id);
    audit(db, actor, "resolvePayment", `${o.codigo}: ${decision === "confirmar" ? "pago confirmado" : "pago rechazado"}`);
  });
}
export function resolveReport(actor, orderId, reportId, respuesta) {
  tx(db => {
    admin(db, actor);
    const o = order(db, orderId), r = o.reportes.find(x => x.id === reportId);
    ok(r && r.estado === "abierto", "Este reclamo ya fue resuelto.");
    r.estado = "resuelto"; r.respuesta = (respuesta || "").trim() || "Resuelto"; r.resuelto = now();
    notify(db, r.por, `Respondimos tu reclamo de ${o.codigo}: ${r.respuesta}`, o.id);
    audit(db, actor, "resolveReport", `${o.codigo}: ${r.respuesta}`);
  });
}
export function adjustWallet(actor, target, campo, monto, nota) {
  tx(db => {
    admin(db, actor);
    ok(["saldo", "recargas", "ganancias"].includes(campo), "Campo no válido.");
    ok(monto !== 0 && Math.abs(monto) <= 1000, "Indica un monto entre -1000 y 1000, distinto de 0.");
    ok(nota && nota.trim().length >= 5, "Explica el motivo del ajuste.");
    const w = wallet(db, target);
    ok(w[campo] + monto >= 0, "El ajuste dejaría el saldo en negativo.");
    w[campo] = r2(w[campo] + monto);
    ledger(db, { uid: target, tipo: "ajuste", monto, ref: actor, key: uid("adj"), nota: nota.trim() });
    audit(db, actor, "adjustWallet", `${name(db, target)} · ${campo} ${monto > 0 ? "+" : ""}${monto.toFixed(2)} · ${nota.trim()}`);
  });
}
export function markNotificationsRead(actor) {
  tx(db => { (db.notifications[actor] || []).forEach(n => (n.leida = true)); });
}

/* =========================================================
   Guía de precios para repartidores (administración)
   ========================================================= */
export function upsertProveedor(actor, p) {
  tx(db => {
    admin(db, actor);
    ok(p.nombre && p.nombre.trim().length >= 3, "Escribe el nombre del proveedor.");
    ok(p.direccion && p.direccion.trim().length >= 4, "Escribe la dirección.");
    ok(/^9\d{8}$/.test(p.telefono || ""), "El teléfono debe tener 9 dígitos y empezar con 9.");
    ok(p.pos && p.pos.x >= 0.01 && p.pos.x <= 0.99, "Marca la ubicación en el mapa.");
    const h = p.horario;
    ok(h && h.dias?.length && /^\d{2}:\d{2}$/.test(h.abre) && /^\d{2}:\d{2}$/.test(h.cierra) && h.abre !== h.cierra, "Revisa los días y el horario de atención.");
    const id = p.id || uid("pv");
    db.proveedores[id] = { ...(db.proveedores[id] || { activo: true, creado: now() }), ...p, id, nombre: p.nombre.trim(), direccion: p.direccion.trim(), notas: (p.notas || "").trim(), pedidosTelefono: !!p.pedidosTelefono };
    audit(db, actor, "upsertProveedor", db.proveedores[id].nombre);
  });
}
export function toggleProveedor(actor, id) {
  tx(db => { admin(db, actor); const p = db.proveedores[id]; ok(p, "El proveedor no existe."); p.activo = !p.activo; audit(db, actor, "toggleProveedor", `${p.nombre}: ${p.activo ? "visible" : "oculto"}`); });
}
export function upsertPrecioRef(actor, r) {
  tx(db => {
    admin(db, actor);
    const pv = db.proveedores[r.provId];
    ok(pv, "El proveedor no existe.");
    ok(r.nombre && r.nombre.trim().length >= 2, "Escribe el nombre del producto.");
    ok(r.precio > 0 && r.precio <= 5000, "El precio debe ser mayor a S/ 0.");
    ok(r.seccion && r.seccion.trim().length >= 2, "Indica la sección, por ejemplo «Abarrotes».");
    const id = r.id || uid("r");
    const prev = db.preciosRef[id];
    db.preciosRef[id] = { ...(prev || { disponible: true, orden: Object.keys(db.preciosRef).length + 1 }), ...r, id, nombre: r.nombre.trim(), presentacion: (r.presentacion || "").trim(), seccion: r.seccion.trim(), precio: r2(r.precio), actualizado: now() };
    audit(db, actor, "upsertPrecioRef", `${pv.nombre}: ${db.preciosRef[id].nombre} · S/ ${db.preciosRef[id].precio.toFixed(2)}${prev && prev.precio !== db.preciosRef[id].precio ? ` (antes S/ ${prev.precio.toFixed(2)})` : ""}`);
  });
}
export function togglePrecioRef(actor, id) {
  tx(db => { admin(db, actor); const r = db.preciosRef[id]; ok(r, "El producto no existe."); r.disponible = !r.disponible; r.actualizado = now(); });
}
export function deletePrecioRef(actor, id) {
  tx(db => { admin(db, actor); const r = db.preciosRef[id]; ok(r, "El producto no existe."); delete db.preciosRef[id]; audit(db, actor, "deletePrecioRef", r.nombre); });
}
/** Marca todos los precios de un proveedor como revisados hoy (después de llamar y confirmar). */
export function confirmPreciosProveedor(actor, provId) {
  tx(db => {
    admin(db, actor);
    const pv = db.proveedores[provId]; ok(pv, "El proveedor no existe.");
    Object.values(db.preciosRef).filter(r => r.provId === provId).forEach(r => (r.actualizado = now()));
    audit(db, actor, "confirmPreciosProveedor", pv.nombre);
  });
}

/** Solo un administrador corrige el nombre verificado de un repartidor, y queda en la auditoría. */
export function adminSetName(actor, target, nombre, motivo) {
  tx(db => {
    admin(db, actor);
    const u = user(db, target);
    const nuevo = (nombre || "").trim().replace(/\s+/g, " ");
    ok(nuevo.split(" ").length >= 2, "Escribe nombres y al menos un apellido.");
    ok(nuevo !== u.nombre, "El nombre es el mismo.");
    ok(motivo && motivo.trim().length >= 5, "Explica el motivo de la corrección.");
    const antes = u.nombre;
    u.nombre = nuevo;
    Object.values(db.courierApplications).filter(a => a.uid === target).forEach(a => (a.nombre = nuevo));
    (db.couriers[target]?.cuentasCobro || []).forEach(c => (c.titular = nuevo));
    notify(db, target, `Un administrador corrigió tu nombre a «${nuevo}».`);
    audit(db, actor, "adminSetName", `${antes} → ${nuevo} · ${motivo.trim()}`);
  });
}
