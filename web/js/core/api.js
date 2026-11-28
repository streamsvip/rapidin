/* =========================================================
   RAPIDIN · Reglas de negocio (DEMOSTRACIÓN)
   Cada función lleva el nombre de la Cloud Function que la
   reemplazará. Todas validan quién llama, el estado actual y
   las reglas del documento maestro, y se ejecutan dentro de
   tx(), que hace de transacción de Firestore.
   ========================================================= */
import { tx, load, now, uid, roadKm, distKm, MAP, isOpen, statusLabel, ESPECIALIDADES, limaNow } from "./store.js";

export class ApiError extends Error {}
const fail = msg => { throw new ApiError(msg); };
const ok = (cond, msg) => { if (!cond) fail(msg); };
const r2 = n => Math.round(n * 100) / 100;

/* ---------- Estados del pedido ---------- */
export const ESTADOS = [
  "solicitado", "esperando_local", "buscando_repartidor", "ofertas_recibidas", "oferta_aceptada", "repartidor_asignado",
  "camino_a_recogida", "en_establecimiento", "pedido_recogido", "camino_a_entrega", "repartidor_cerca", "por_confirmar", "entregado",
];
export const ESTADO_LABEL = {
  solicitado: "Solicitado", esperando_local: "Esperando al local", buscando_repartidor: "Buscando repartidor", ofertas_recibidas: "Ofertas recibidas",
  oferta_aceptada: "Oferta aceptada", repartidor_asignado: "Repartidor asignado", camino_a_recogida: "Camino a recogida",
  en_establecimiento: "En el establecimiento", pedido_recogido: "Pedido recogido", camino_a_entrega: "Camino a entrega",
  repartidor_cerca: "Repartidor cerca", por_confirmar: "Entregado · por confirmar", entregado: "Entregado", cancelado: "Cancelado", en_revision: "En revisión",
};
export const PAGO_LABEL = { pendiente: "Pago pendiente", marcado: "Cliente marcó «ya pagué»", confirmado: "Pago confirmado", en_revision: "Pago en revisión", retenido: "Monto retenido del saldo" };
const NEXT_BY_COURIER = {
  repartidor_asignado: "camino_a_recogida", camino_a_recogida: "en_establecimiento", en_establecimiento: "pedido_recogido",
  pedido_recogido: "camino_a_entrega", camino_a_entrega: "por_confirmar", repartidor_cerca: "por_confirmar",
};
export const OPEN_STATES = ["buscando_repartidor", "ofertas_recibidas"];
export const ACTIVE_STATES = ["oferta_aceptada", "repartidor_asignado", "camino_a_recogida", "en_establecimiento", "pedido_recogido", "camino_a_entrega", "repartidor_cerca"];
export const nextStateFor = estado => NEXT_BY_COURIER[estado] || null;
/** Pedido del Market a un local con panel propio: el cliente paga los productos al local y el local lo acepta. */
export const isStoreOrder = o => !!o?.gestionado;
/** Hasta cuándo puede cancelar el cliente:
 *  · Pedido a un local con panel: solo mientras el local no lo acepte.
 *  · Compra libre o local sin panel: hasta que el repartidor llegue al local (después ya está comprando o esperando el pedido). */
export const CANCEL_HASTA = ["buscando_repartidor", "ofertas_recibidas", "oferta_aceptada", "repartidor_asignado", "camino_a_recogida"];
export const canClientCancel = o => o.gestionado ? o.estado === "esperando_local" : CANCEL_HASTA.includes(o.estado);
export const MOTIVOS_REPORTE = {
  cliente: ["No llegó o llegó muy tarde", "Pedido incompleto o en mal estado", "Cobro incorrecto", "Trato inadecuado", "Otro"],
  repartidor: ["El cliente no respondió ni recibió", "Dirección falsa o incorrecta", "No pagó o pagó incompleto", "Trato inadecuado", "Otro"],
};
export const METODOS_DIRECTOS = ["Yape", "Plin", "Lemon"];
/** Medios para recargar saldo: los anteriores y transferencias desde la app de otro banco al celular de RAPIDIN. */
export const METODOS_RECARGA = [...METODOS_DIRECTOS]; // Recargas solo por Yape, Plin o Lemon
export const MODALIDAD = { libre: "Compra libre", tienda: "Tienda específica", catalogo: "Market" };

/* ---------- Utilidades internas ---------- */
function user(db, id) { const u = db.users[id]; ok(u, "La cuenta no existe."); return u; }
function activeUser(db, id) { const u = user(db, id); ok(u.estado === "activo", "Tu cuenta está suspendida. Escríbenos para revisarla."); return u; }
function admin(db, id) { const u = activeUser(db, id); ok(u.roles.admin, "Esta acción es solo para administradores."); return u; }
/** Dueño de un local aprobado: devuelve su local. */
function myStore(db, id) {
  const u = activeUser(db, id);
  ok(u.roles.negocio === "aprobado" && u.negocioId, "Tu negocio aún no está aprobado.");
  const e = db.establishments[u.negocioId]; ok(e, "No encontramos tu local. Escríbenos por soporte.");
  return e;
}
function storeOwnerOf(db, o) { return o.tiendaId ? db.establishments[o.tiendaId]?.ownerUid || null : null; }
function approvedCourier(db, id) { const u = activeUser(db, id); ok(u.roles.repartidor === "aprobado", "Tu cuenta de repartidor aún no está aprobada."); return u; }
function order(db, id) { const o = db.orders[id]; ok(o, "El pedido no existe."); return o; }
function wallet(db, id) { return (db.wallets[id] ||= { recargas: 0, ganancias: 0, reservado: 0, saldo: 0, retenido: 0 }); }

function ledger(db, e) {
  if (db.walletLedger.some(l => l.key === e.key)) return false; // idempotencia
  db.walletLedger.unshift({ id: uid("l"), t: now(), ...e, monto: r2(e.monto) });
  return true;
}
function audit(db, actor, accion, detalle) { db.auditLog.unshift({ id: uid("a"), t: now(), uid: actor, accion, detalle }); }
/** Bandeja compartida de avisos para administradores (en Firestore: notifications/_admins/items). */
export const ADMINS = "_admins";
export function notify(db, to, texto, orderId = null, key = null) {
  const list = (db.notifications[to] ||= []);
  if (key && list.some(n => n.key === key)) return;
  list.unshift({ id: uid("n"), t: now(), texto, orderId, key, leida: false });
  list.length = Math.min(list.length, 40);
}
function event(db, o, estado, por, nota) { o.events.push({ t: now(), estado, por, nota }); o.actualizado = now(); }
const name = (db, id) => db.users[id]?.nombre || "Usuario";
const first = (db, id) => name(db, id).split(" ")[0];

/** Compra libre: porcentaje del TOTAL de la oferta, con mínimo y máximo.
 *  Sobre el total (no solo el envío) para que no convenga «pasar» dinero del envío a los productos.
 *  El repartidor se queda con todo lo que ahorre al conseguir los productos más baratos. */
export const libreRule = r => (typeof r.libre === "number" ? { pct: 0, min: r.libre, max: r.libre } : r.libre);
export function commissionFor(db, modalidad, km, total) {
  const r = db.commissionRules;
  if (modalidad === "libre") {
    const L = libreRule(r);
    return total == null ? L.min : r2(Math.min(L.max, Math.max(L.min, (total * L.pct) / 100)));
  }
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
  o.saldoPagado = m; o.retencion = 0; o.estadoPago = "confirmado";
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
export function signUp({ nombre, correo, pass, telefono, whatsapp, consentimientos = null }) {
  return tx(db => {
    const mail = correo.trim().toLowerCase();
    ok(!Object.values(db.users).some(u => u.correo.toLowerCase() === mail), "Ya existe una cuenta con ese correo. Ingresa o usa otro.");
    ok(!Object.values(db.users).some(u => u.telefono === telefono), "Ese celular ya está registrado en otra cuenta.");
    const id = uid("u");
    db.users[id] = { uid: id, nombre, correo: mail, pass, telefono, whatsapp, consentimientos, telefonoVerificado: false, roles: { cliente: true, repartidor: null, admin: false }, estado: "activo", creado: now() };
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
    if ("foto" in patch) { ok(validImg(patch.foto), "La foto es demasiado pesada. Usa otra."); u.foto = patch.foto || null; }
    if (db.couriers[id] && (patch.telefono || patch.whatsapp)) Object.assign(db.couriers[id], { telefono: patch.telefono || u.telefono, whatsapp: patch.whatsapp || u.whatsapp });
    if (patch.telefono && patch.telefono !== u.telefono) {
      ok(!Object.values(db.users).some(x => x.telefono === patch.telefono && x.uid !== id), "Ese celular ya está registrado en otra cuenta.");
      u.telefono = patch.telefono; u.telefonoVerificado = !!db.isFb; // con Firebase (plan Spark) aún no hay SMS
    }
  });
}

/* =========================================================
   Cliente
   ========================================================= */
/** Cuentas Yape/Plin/Lemon donde un local con panel recibe el pago de los productos. */
export const storeAccounts = e => (e?.cobros || []).filter(c => METODOS_DIRECTOS.includes(c.tipo) && /^9\d{8}$/.test(c.numero || ""));
export const storeManaged = e => !!(e?.ownerUid && storeAccounts(e).length);
export function createOrder(actor, { modalidad, descripcion, tienda, tiendaId, items, nota, entrega, pago, pagoLocal }) {
  return tx(db => {
    const u = activeUser(db, actor);
    ok(u.roles.cliente, "Esta cuenta no puede crear pedidos.");
    ok(u.telefonoVerificado, "Verifica tu celular antes de pedir.");
    ok(db.zones.camana.activa, "Por ahora no estamos recibiendo pedidos.");
    ok(["libre", "tienda", "catalogo"].includes(modalidad), "Elige una modalidad.");
    ok(entrega?.pos && entrega.pos.x >= 0.01 && entrega.pos.x <= 0.99 && entrega.pos.y >= 0.01 && entrega.pos.y <= 0.99, "Marca un punto de entrega dentro de la zona de Camaná.");
    const permitidos = ["Efectivo", ...METODOS_DIRECTOS, ...(db.config.saldoClienteHabilitado ? ["Saldo RAPIDIN"] : [])];
    ok(permitidos.includes(pago), "Elige un medio de pago válido.");
    let km = null, lista = null, subtotal = null, gestionado = false;
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
      gestionado = storeManaged(e);
      if (gestionado) {
        ok(pago !== "Saldo RAPIDIN", "El envío de este pedido se paga en efectivo, Yape, Plin o Lemon.");
        // Los productos se pagan directo al local (Yape, Plin o Lemon) ANTES de que el local acepte.
        ok(pagoLocal && storeAccounts(e).some(c => c.tipo === pagoLocal.metodo), `Elige cómo pagaste a ${e.nombre}.`);
        ok(pagoLocal.pagado, `Paga ${"S/ " + subtotal.toFixed(2)} a ${e.nombre} y marca «Ya pagué».`);
      }
    } else {
      ok(descripcion && descripcion.trim().length >= 6, "Describe tu pedido con un poco más de detalle.");
      if (modalidad === "tienda") {
        ok(tienda?.nombre && tienda.pos, "Elige el establecimiento o márcalo en el mapa.");
        if (tienda.id) { const e = db.establishments[tienda.id]; ok(e?.activo, "Ese establecimiento no está disponible."); ok(isOpen(e), `${e.nombre} está cerrado ahora (${statusLabel(e)}).`); }
      }
    }
    if (modalidad !== "libre") km = roadKm(db.config.puntoEstrategico.pos, tienda.pos);
    const id = uid("o"), codigo = db.isFb ? `RP-${Date.now().toString(36).slice(-4).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}` : `RP-${++db.seq}`;
    db.orders[id] = {
      id, codigo, clienteId: actor, modalidad, descripcion: descripcion.trim(), tienda: modalidad === "libre" ? null : tienda,
      items: lista, subtotal, nota: (nota || "").trim().slice(0, 200),
      entrega, pago, estado: gestionado ? "esperando_local" : "buscando_repartidor", estadoPago: "pendiente", courierId: null, ofertaAceptadaId: null,
      tiendaId: modalidad === "catalogo" ? tienda.id : null, gestionado,
      ...(gestionado ? { pagoLocal: { metodo: pagoLocal.metodo, monto: subtotal, estado: "marcado", t: now() }, clienteNombre: u.nombre } : {}),
      precioTotal: null, comision: null, distanciaKm: km, creado: now(), actualizado: now(), offers: {},
      events: [{ t: now(), estado: "solicitado", por: actor }, { t: now(), estado: gestionado ? "esperando_local" : "buscando_repartidor", por: "sistema" }],
      tracking: null, calificacion: null, cambios: [], reportes: [], comprobante: null, retencion: 0,
    };
    if (gestionado) {
      const e = db.establishments[tienda.id];
      notify(db, e.ownerUid, `Nuevo pedido ${codigo}: ${descripcion}. ${u.nombre} dice que pagó S/ ${subtotal.toFixed(2)} por ${pagoLocal.metodo}. Revisa y acéptalo.`, id, `store-new:${id}`);
      notify(db, actor, `Enviamos tu pedido ${codigo} a ${tienda.nombre}. Cuando confirme tu pago, buscamos repartidor.`, id, `pub:${id}`);
      return id;
    }
    notifyCouriers(db, db.orders[id]);
    notify(db, actor, `Publicamos tu pedido ${codigo}. Pronto llegarán ofertas de envío.`, id, `pub:${id}`);
    return id;
  });
}

function notifyCouriers(db, o) {
  const aviso = o.modalidad === "catalogo" ? `Nuevo pedido del Market (${o.tienda.nombre}): ${o.codigo}${o.gestionado ? " · productos ya pagados, solo ofertas tu envío" : ""}` : `Nuevo pedido en tu zona: ${o.codigo}`;
  Object.values(db.couriers).forEach(c => { if (c.disponible && db.users[c.uid]?.roles.repartidor === "aprobado") notify(db, c.uid, aviso, o.id, `new:${o.id}`); });
}

/* ---------- El local atiende los pedidos del Market (panel de negocio) ---------- */
function storeOrder(db, actor, orderId) {
  const e = myStore(db, actor), o = order(db, orderId);
  ok(o.tiendaId === e.id && o.gestionado, "Este pedido no es de tu local.");
  return { e, o };
}
/** El local confirma que recibió el pago y acepta el pedido: desde aquí se buscan repartidores y ya no se puede cancelar. */
export function storeAcceptOrder(actor, orderId) {
  tx(db => {
    const { e, o } = storeOrder(db, actor, orderId);
    ok(o.estado === "esperando_local", o.estado === "cancelado" ? "El cliente canceló este pedido." : "Este pedido ya fue atendido.");
    o.pagoLocal.estado = "confirmado"; o.localAceptado = now();
    o.estado = "buscando_repartidor"; event(db, o, "buscando_repartidor", actor, `${e.nombre} confirmó el pago y aceptó el pedido`);
    notify(db, o.clienteId, `${e.nombre} confirmó tu pago y está preparando tu pedido ${o.codigo}. Ya buscamos repartidor.`, o.id, `store-ok:${o.id}`);
    notifyCouriers(db, o);
  });
}
/** El local rechaza el pedido (pago no recibido, sin stock, etc.). */
export function storeRejectOrder(actor, orderId, motivo) {
  tx(db => {
    const { e, o } = storeOrder(db, actor, orderId);
    ok(o.estado === "esperando_local", "Este pedido ya fue atendido.");
    ok(motivo && motivo.trim().length >= 4, "Indica el motivo para que el cliente lo sepa.");
    o.pagoLocal.estado = "rechazado"; o.localRechazo = { motivo: motivo.trim().slice(0, 160), t: now() };
    o.estado = "cancelado"; event(db, o, "cancelado", actor, `${e.nombre} no aceptó el pedido: ${motivo.trim()}`);
    notify(db, o.clienteId, `${e.nombre} no pudo aceptar tu pedido ${o.codigo}: ${motivo.trim()}. Si ya pagaste, el local te devolverá el dinero.`, o.id, `store-no:${o.id}`);
  });
}
/** El local avisa que el pedido está listo para recoger. */
export function storeMarkReady(actor, orderId) {
  tx(db => {
    const { e, o } = storeOrder(db, actor, orderId);
    ok(!["esperando_local", "cancelado", "entregado"].includes(o.estado) && ESTADOS.indexOf(o.estado) < ESTADOS.indexOf("pedido_recogido"), "Este pedido ya no está en preparación.");
    ok(!o.listoLocal, "Ya avisaste que está listo.");
    o.listoLocal = now(); event(db, o, o.estado, actor, `${e.nombre}: pedido listo para recoger`);
    if (o.courierId) notify(db, o.courierId, `${e.nombre}: el pedido ${o.codigo} está listo para recoger.`, o.id, `ready:${o.id}`);
    notify(db, o.clienteId, `${e.nombre} terminó de preparar tu pedido ${o.codigo}.`, o.id, `ready-c:${o.id}`);
  });
}

/* ---------- El local administra su negocio ---------- */
const STORE_FIELDS = ["descripcion", "telefono", "logo", "portada", "horario", "etiquetas", "tiempoPrep", "cobros", "direccion", "referencia"];
export function updateMyStore(actor, patch) {
  tx(db => {
    const e = myStore(db, actor);
    const p = Object.fromEntries(Object.entries(patch).filter(([k]) => STORE_FIELDS.includes(k)));
    if (p.horario) {
      const h = p.horario;
      ok(Array.isArray(h.dias) && h.dias.length, "Elige al menos un día de atención.");
      ok(/^\d{2}:\d{2}$/.test(h.abre) && /^\d{2}:\d{2}$/.test(h.cierra) && h.abre !== h.cierra, "Revisa el horario de apertura y cierre.");
    }
    if ("telefono" in p) ok(!p.telefono || /^9\d{8}$/.test(p.telefono), "El celular del local debe tener 9 dígitos y empezar con 9.");
    if ("logo" in p || "portada" in p) ok(validImg(p.logo) && validImg(p.portada), "La imagen es demasiado pesada. Usa una foto más liviana.");
    if (p.cobros) {
      p.cobros = p.cobros.filter(c => c && c.numero).map(c => ({ tipo: c.tipo, numero: String(c.numero).replace(/\D/g, ""), titular: (c.titular || "").trim().slice(0, 60) }));
      p.cobros.forEach(c => { ok(METODOS_DIRECTOS.includes(c.tipo), "Medio de cobro no válido."); ok(/^9\d{8}$/.test(c.numero), `El número de ${c.tipo} debe tener 9 dígitos y empezar con 9.`); ok(c.titular.length >= 3, `Escribe el titular de tu ${c.tipo}: el cliente lo verá al pagar.`); });
      ok(new Set(p.cobros.map(c => c.tipo)).size === p.cobros.length, "Registra un solo número por medio de pago.");
    }
    if (p.etiquetas) p.etiquetas = p.etiquetas.filter(x => ESPECIALIDADES.some(([n]) => n === x)).slice(0, 4);
    if ("tiempoPrep" in p) p.tiempoPrep = Math.max(0, Math.min(120, Math.round(+p.tiempoPrep || 0)));
    if ("descripcion" in p) p.descripcion = (p.descripcion || "").trim().slice(0, 200);
    Object.assign(e, p, { actualizado: now() });
  });
}
/** Abrir o cerrar el local fuera de su horario (o volver al horario normal). */
export function setStoreOverride(actor, modo) {
  tx(db => {
    const e = myStore(db, actor);
    ok(["abrir", "cerrar", "auto"].includes(modo), "Opción no válida.");
    if (modo === "auto") { e.forzado = null; return; }
    // Vale por el resto del día: hasta las 05:00 o, si abre antes de tiempo, hasta su hora de cierre de hoy.
    const L = limaNow(), msHasta = min => ((min - L.min + 1440) % 1440 || 1440) * 60e3;
    let hasta = now() + msHasta(5 * 60);
    if (modo === "abrir" && e.horario?.dias.includes(L.dia)) {
      const [a, b] = e.horario.cierra.split(":").map(Number), c = a * 60 + b;
      if (c > L.min) hasta = Math.min(hasta, now() + (c - L.min) * 60e3);
    }
    e.forzado = { estado: modo === "abrir" ? "abierto" : "cerrado", hasta, t: now() };
  });
}
export function upsertMyProduct(actor, p) {
  return tx(db => {
    const e = myStore(db, actor);
    ok(p.nombre && p.nombre.trim().length >= 2, "Escribe el nombre del producto.");
    ok(p.precio > 0 && p.precio <= 5000, "El precio debe ser mayor a S/ 0.");
    ok(p.seccion && p.seccion.trim().length >= 2, "Indica la sección, por ejemplo «Bebidas».");
    ok(validImg(p.img), "La foto es demasiado pesada. Usa una más liviana.");
    const prev = p.id ? db.products[p.id] : null;
    if (prev) ok(prev.tiendaId === e.id, "Este producto no es de tu local.");
    const id = prev?.id || uid("p");
    db.products[id] = { ...(prev || { disponible: true, orden: Object.values(db.products).filter(x => x.tiendaId === e.id).length + 1 }),
      id, tiendaId: e.id, nombre: p.nombre.trim().slice(0, 60), descripcion: (p.descripcion || "").trim().slice(0, 160), precio: r2(p.precio), seccion: p.seccion.trim().slice(0, 40), img: p.img || null };
    return id;
  });
}
function myProduct(db, actor, id) { const e = myStore(db, actor), p = db.products[id]; ok(p && p.tiendaId === e.id, "Este producto no es de tu local."); return p; }
export function toggleMyProduct(actor, id) { tx(db => { const p = myProduct(db, actor, id); p.disponible = !p.disponible; }); }
export function deleteMyProduct(actor, id) { tx(db => { myProduct(db, actor, id); delete db.products[id]; }); }

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
    // El repartidor elegido recién ahora puede ver el celular del cliente.
    const me = db.users[actor]; o.contactoCliente = { telefono: me.telefono || "", whatsapp: me.whatsapp || me.telefono || "" };
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
    if (!isAdmin) ok(canClientCancel(o), o.gestionado
      ? "El local ya aceptó y está preparando tu pedido, por eso ya no se puede cancelar. Si hay un problema, repórtalo."
      : "El repartidor ya llegó al local o está con tu pedido, por eso ya no se puede cancelar. Si hay un problema, repórtalo.");
    Object.values(o.offers).forEach(x => { if (["activa", "aceptada"].includes(x.estado)) { if (x.estado === "activa") x.estado = "retirada"; releaseOffer(db, o, x, "pedido cancelado"); } });
    releaseClientHold(db, o);
    o.estado = "cancelado"; o.tracking = null;
    event(db, o, "cancelado", actor, motivo || (isAdmin ? "Cancelado por administración" : "Cancelado por el cliente"));
    if (o.courierId) notify(db, o.courierId, `El pedido ${o.codigo} fue cancelado. No se te cobra comisión.`, o.id, `cancel-c:${o.id}`);
    const owner = storeOwnerOf(db, o); if (owner && o.gestionado) notify(db, owner, `${isAdmin ? "Administración" : "El cliente"} canceló el pedido ${o.codigo}.${o.localAceptado ? "" : " No lo prepares."}`, o.id, `cancel-s:${o.id}`);
    notify(db, o.clienteId, `Tu pedido ${o.codigo} fue cancelado.`, o.id, `cancel:${o.id}`);
    if (isAdmin) audit(db, actor, "cancelOrder", `${o.codigo}: ${motivo || "sin motivo"}`);
  });
}

/** El cliente solo toca «Ya pagué»: no envía código ni captura. El repartidor revisa su Yape/Plin/Lemon y confirma. */
export function markOrderPaid(actor, orderId) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor, "Este pedido no es tuyo.");
    ok(METODOS_DIRECTOS.includes(o.pago), "Este pedido no se paga por transferencia.");
    ok(o.courierId && ACTIVE_STATES.includes(o.estado), "Podrás pagar cuando tengas un repartidor asignado.");
    ok(["pendiente", "en_revision"].includes(o.estadoPago), "Ya avisaste que pagaste.");
    o.estadoPago = "marcado"; o.pagoMarcado = now();
    event(db, o, o.estado, actor, `Cliente marcó «ya pagué» por ${o.pago}`);
    notify(db, o.courierId, `${first(db, actor)} dice que ya te pagó ${o.codigo} por ${o.pago}. Revisa y confirma.`, o.id, `paid:${o.id}:${o.events.length}`);
  });
}

/* ---------- Chat del pedido (cliente ↔ repartidor asignado) ----------
   En producción: subcolección orders/{id}/messages con reglas que solo
   permiten leer y escribir al cliente y al repartidor del pedido. */
export const chatOpen = o => !!o.courierId && (ACTIVE_STATES.includes(o.estado) || ["por_confirmar", "en_revision"].includes(o.estado) || (o.estado === "entregado" && now() - o.actualizado < 2 * 3600e3));
export function sendChatMessage(actor, orderId, texto) {
  tx(db => {
    const o = order(db, orderId);
    ok(actor === o.clienteId || actor === o.courierId, "No participas en este pedido.");
    ok(chatOpen(o), "El chat de este pedido ya está cerrado.");
    const t = String(texto || "").trim().replace(/\s+/g, " ");
    ok(t.length >= 1, "Escribe un mensaje."); ok(t.length <= 300, "El mensaje es muy largo (máximo 300 caracteres).");
    o.chat ||= [];
    const m = { id: uid("m"), por: actor, texto: t, t: now() };
    o.chat.push(m); if (o.chat.length > 200) o.chat.shift();
    (o.chatLeido ||= {})[actor] = m.t;
    const to = actor === o.clienteId ? o.courierId : o.clienteId;
    notify(db, to, `💬 ${first(db, actor)} (${o.codigo}): ${t.length > 60 ? t.slice(0, 57) + "…" : t}`, o.id, `chat:${m.id}`);
  });
}
export const chatUnread = (o, uid) => (o.chat || []).filter(m => m.por !== uid && m.t > (o.chatLeido?.[uid] || 0)).length;
export function markChatRead(actor, orderId) {
  const o = load().orders[orderId];
  if (!o || !chatUnread(o, actor)) return;
  tx(db => { const x = db.orders[orderId]; (x.chatLeido ||= {})[actor] = now(); });
}
export function confirmOrderPayment(actor, orderId, recibido) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.courierId === actor, "Este pedido no está asignado a ti.");
    if (o.pago === "Efectivo") { ok(recibido, "Para efectivo solo confirmas al recibir el dinero."); o.estadoPago = "confirmado"; return; }
    ok(o.estadoPago !== "confirmado", "Este pago ya está confirmado.");
    // El repartidor puede confirmar apenas le llega, aunque el cliente no haya tocado «Ya pagué».
    if (recibido) { o.estadoPago = "confirmado"; event(db, o, o.estado, actor, `Pago por ${o.pago} confirmado`); notify(db, o.clienteId, `${first(db, actor)} confirmó tu pago de ${o.codigo}. ¡Gracias!`, o.id, `pconf:${o.id}`); }
    else {
      ok(o.estadoPago === "marcado", "El cliente aún no avisa que pagó.");
      o.estadoPago = "en_revision";
      notify(db, o.clienteId, `${first(db, actor)} aún no ve tu pago de ${o.codigo}. Revisa tu ${o.pago} y vuelve a tocar «Ya pagué», o escríbele por el chat.`, o.id, `prev:${o.id}:${o.events.length}`);
      notify(db, ADMINS, `Pago en revisión en ${o.codigo}.`, o.id, `prev-a:${o.id}`);
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
/** Calificación del local (Market o tienda registrada), después de recibir el pedido. */
export function rateStore(actor, orderId, estrellas, comentario) {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor, "Este pedido no es tuyo.");
    ok(o.estado === "entregado", "Califica cuando recibas tu pedido.");
    const e = o.tienda?.id && db.establishments[o.tienda.id]; ok(e, "Este pedido no tiene un local registrado.");
    ok(!o.calificacionLocal, "Ya calificaste este local en este pedido.");
    ok(estrellas >= 1 && estrellas <= 5, "Elige de 1 a 5 estrellas.");
    const texto = (comentario || "").trim().slice(0, 200);
    o.calificacionLocal = { estrellas, comentario: texto };
    e.rating = r2(((e.rating || 0) * (e.ratingCount || 0) + estrellas) / ((e.ratingCount || 0) + 1)); e.ratingCount = (e.ratingCount || 0) + 1;
    if (texto) { e.resenas ||= []; e.resenas.unshift({ por: first(db, actor), estrellas, texto, t: now() }); e.resenas.length = Math.min(e.resenas.length, 20); }
  });
}
/** Reporte dentro de un pedido: el cliente reporta al repartidor y el repartidor al cliente. Llega al panel de administración. */
export function reportProblem(actor, orderId, texto, motivo = "Otro") {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor || o.courierId === actor, "No participas en este pedido.");
    const rol = o.clienteId === actor ? "cliente" : "repartidor";
    ok(MOTIVOS_REPORTE[rol].includes(motivo), "Elige el motivo del reporte.");
    ok(texto && texto.trim().length >= 8, "Cuéntanos qué pasó con un poco más de detalle.");
    ok(o.reportes.filter(r => r.por === actor && r.estado === "abierto").length < 2, "Ya tienes reportes abiertos en este pedido. Te responderemos pronto.");
    const contra = rol === "cliente" ? o.courierId : o.clienteId;
    o.reportes.push({ id: uid("r"), t: now(), por: actor, rol, contra: contra || null, motivo, texto: texto.trim().slice(0, 500), estado: "abierto" });
    notify(db, ADMINS, `Nuevo reporte de ${rol === "cliente" ? "un cliente" : "un repartidor"} en ${o.codigo}: ${motivo}.`, o.id);
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

export function requestTopup(actor, { monto, metodo, pagador }) {
  tx(db => {
    activeUser(db, actor);
    ok(monto >= 5 && monto <= 1000, "La recarga debe ser entre S/ 5 y S/ 1000.");
    ok(METODOS_RECARGA.includes(metodo), "Elige con qué recargaste.");
    pagador = String(pagador || "").trim().replace(/\s+/g, " ");
    ok(pagador.length >= 3 && pagador.length <= 60, "Escribe el nombre de quien hizo el pago.");
    ok(Object.values(db.topups).filter(t => t.uid === actor && t.estado === "pendiente").length < 3, "Ya tienes 3 recargas por confirmar. Espera a que se confirmen.");
    const id = uid("tp");
    db.topups[id] = { id, uid: actor, monto: r2(monto), metodo, pagador, estado: "pendiente", creado: now() };
    notify(db, ADMINS, `Nueva recarga: S/ ${r2(monto).toFixed(2)} por ${metodo} de ${pagador}. Confírmala cuando te llegue.`);
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
    ok(u.foto, "Sube tu foto de perfil: el cliente la ve al elegir tu oferta.");
    const id = uid("app");
    db.courierApplications[id] = { id, uid: actor, nombre: u.nombre, dni, celular: u.telefono, vehiculo, docs, yape: yape || u.telefono, estado: "pendiente", creado: now(), nota: "" };
    u.roles.repartidor = "pendiente";
    notify(db, ADMINS, `Nueva postulación de ${u.nombre}.`);
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
    if (o.gestionado) costoProductos = 0; // el cliente ya pagó los productos al local: solo se oferta el envío
    else if (o.modalidad === "catalogo") costoProductos = o.subtotal; // el precio lo fija el local
    ok(tarifa > 0 && tarifa <= 100, "Tu tarifa debe ser mayor a S/ 0.");
    ok(costoProductos >= 0, "El costo de productos no puede ser negativo.");
    ok(tiempo >= 5 && tiempo <= 180, "El tiempo estimado debe estar entre 5 y 180 minutos.");
    const comision = commissionFor(db, o.modalidad, o.distanciaKm, costoProductos + tarifa);
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
    if (nuevo === "por_confirmar") {
      // El repartidor marca la entrega SIN foto ni comprobante: el cliente la confirma con un toque.
      if (o.pago === "Efectivo") { ok(extra.efectivoRecibido, "Confirma que recibiste el efectivo."); o.estadoPago = "confirmado"; }
      else if (METODOS_DIRECTOS.includes(o.pago)) ok(o.estadoPago === "confirmado", "Confirma el pago del cliente antes de marcar la entrega.");
      o.entregaMarcada = now(); o.tracking = null;
    }
    o.estado = nuevo; event(db, o, nuevo, actor);
    const msg = {
      camino_a_recogida: `${first(db, actor)} va camino a recoger tu pedido ${o.codigo}.`,
      en_establecimiento: `${first(db, actor)} llegó al establecimiento (${o.codigo}).`,
      pedido_recogido: `¡Tu pedido ${o.codigo} fue recogido!`,
      camino_a_entrega: `Tu pedido ${o.codigo} va en camino.`,
      por_confirmar: `${first(db, actor)} marcó tu pedido ${o.codigo} como entregado. ¿Lo recibiste? Confírmalo con un toque.`,
    }[nuevo];
    if (msg) notify(db, o.clienteId, msg, o.id, `st:${o.id}:${nuevo}`);
  });
}

/** Cierre del pedido: cobra la comisión, liquida el saldo y suma la entrega al repartidor (idempotente). */
function finalizeDelivery(db, o, por, nota) {
  if (o.estado === "entregado") return;
  settleSaldo(db, o);
  const of = o.offers[o.ofertaAceptadaId], w = wallet(db, o.courierId);
  if (of?.reservaActiva) {
    w.reservado = r2(Math.max(0, w.reservado - of.comision)); w.recargas = r2(w.recargas - of.comision); of.reservaActiva = false;
    ledger(db, { uid: o.courierId, tipo: "cobro_comision", monto: -of.comision, ref: o.id, key: `fee:${o.id}`, nota: `Comisión cobrada · ${o.codigo}` });
  }
  db.couriers[o.courierId].completados++;
  o.estado = "entregado"; o.tracking = null; o.entregaConfirmada = { t: now(), por };
  event(db, o, "entregado", por, nota);
}
/** El cliente confirma que recibió (o no) el pedido que el repartidor marcó como entregado. */
export function confirmDelivery(actor, orderId, recibido, detalle = "") {
  tx(db => {
    const o = order(db, orderId);
    ok(o.clienteId === actor, "Este pedido no es tuyo.");
    ok(o.estado === "por_confirmar", "Este pedido no está esperando tu confirmación.");
    if (recibido) {
      finalizeDelivery(db, o, actor, "Cliente confirmó que recibió el pedido");
      notify(db, o.courierId, `${first(db, actor)} confirmó que recibió ${o.codigo}. ¡Buen trabajo!`, o.id, `recv:${o.id}`);
    } else {
      o.estado = "en_revision"; event(db, o, "en_revision", actor, "El cliente dice que no recibió el pedido");
      o.reportes.push({ id: uid("r"), t: now(), por: actor, texto: `No recibí el pedido.${detalle ? " " + detalle.trim() : ""}`, estado: "abierto" });
      notify(db, o.courierId, `${first(db, actor)} indica que no recibió ${o.codigo}. Escríbele por el chat; un administrador lo revisará.`, o.id, `norecv:${o.id}`);
      notify(db, ADMINS, `Entrega en disputa: ${o.codigo}. El cliente dice que no la recibió.`, o.id, `disp:${o.id}`);
    }
  });
}
/** Administración resuelve una entrega en disputa. */
export function resolveDelivery(actor, orderId, entregado, nota = "") {
  tx(db => {
    admin(db, actor);
    const o = order(db, orderId);
    ok(o.estado === "en_revision" && o.entregaMarcada, "Este pedido no tiene una entrega en disputa.");
    if (entregado) {
      finalizeDelivery(db, o, actor, `Entrega confirmada por administración${nota ? ": " + nota : ""}`);
      notify(db, o.clienteId, `Revisamos ${o.codigo} y confirmamos la entrega.`, o.id);
      notify(db, o.courierId, `Revisamos ${o.codigo}: la entrega quedó confirmada.`, o.id);
    }
    o.reportes.forEach(r => (r.estado = "resuelto"));
    audit(db, actor, "resolveDelivery", `${o.codigo}: ${entregado ? "entregado" : "no entregado"}${nota ? " · " + nota : ""}`);
  });
  if (!entregado) cancelOrder(actor, orderId, nota || "Entrega no realizada (revisión)");
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
export function runScheduled(who = null) {
  const db = load(), t = now();
  // Con Firebase cada navegador solo procesa los pedidos en los que participa (las reglas no dejan tocar los demás).
  const mine = o => !db.isFb || (who && (o.clienteId === who || o.courierId === who || db.users[who]?.roles.admin));
  const autoMs = (db.config.autoConfirmarMin || 30) * 60e3;
  const needs = Object.values(db.orders).filter(mine).some(o =>
    (OPEN_STATES.includes(o.estado) && (Object.values(o.offers).some(x => x.estado === "activa" && x.vence <= t) || (!o.gestionado && t - o.creado > 3600e3) || (o.gestionado && !o.alertaSinRepartidor && t - o.localAceptado > 15 * 60e3))) ||
    (o.estado === "por_confirmar" && t - o.entregaMarcada > autoMs));
  if (!needs) return;
  tx(db => {
    Object.values(db.orders).filter(mine).forEach(o => {
      if (o.estado === "por_confirmar" && t - o.entregaMarcada > autoMs) {
        finalizeDelivery(db, o, "sistema", `Confirmado automáticamente: el cliente no respondió en ${db.config.autoConfirmarMin || 30} min`);
        notify(db, o.courierId, `${o.codigo} se confirmó automáticamente como entregado.`, o.id, `auto:${o.id}`);
        notify(db, o.clienteId, `Dimos por recibido tu pedido ${o.codigo}. Si hubo un problema, repórtalo desde el pedido.`, o.id, `autoc:${o.id}`);
        return;
      }
      if (!OPEN_STATES.includes(o.estado)) return;
      Object.values(o.offers).forEach(x => {
        if (x.estado === "activa" && x.vence <= t) { x.estado = "vencida"; releaseOffer(db, o, x, "vencida"); }
      });
      if (o.estado === "ofertas_recibidas" && !Object.values(o.offers).some(x => x.estado === "activa")) o.estado = "buscando_repartidor";
      if (o.gestionado) {
        // Ya pagado y en preparación: nunca se cancela solo. Si nadie ofertó en 15 min, se avisa a administración.
        if (!o.alertaSinRepartidor && t - o.localAceptado > 15 * 60e3) {
          o.alertaSinRepartidor = t;
          notify(db, ADMINS, `${o.codigo} (${o.tienda.nombre}) lleva 15 min sin repartidor y ya está pagado.`, o.id, `norider:${o.id}`);
          notify(db, o.clienteId, `Seguimos buscando repartidor para ${o.codigo}. Si se demora, te escribiremos.`, o.id, `norider-c:${o.id}`);
        }
        return;
      }
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
      db.couriers[a.uid] ||= { uid: a.uid, telefono: u.telefono || "", whatsapp: u.whatsapp || u.telefono || "", vehiculo: a.vehiculo, disponible: false, zona: "camana", rating: 0, ratingCount: 0, completados: 0, cuentasCobro: [{ tipo: "Yape", numero: a.yape || u.telefono, titular: u.nombre, verificada: true }], pos: { ...db.config.puntoEstrategico.pos } };
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
      const campo = u.roles.repartidor === "aprobado" ? "recargas" : "saldo";
      w[campo] = r2(w[campo] + t.monto);
      ledger(db, { uid: t.uid, tipo: "recarga", campo, monto: t.monto, ref: id, key: `topup:${id}`, nota: `Recarga ${t.metodo} confirmada` });
    }
    notify(db, t.uid, aprobar ? `Tu recarga de S/ ${t.monto.toFixed(2)} fue confirmada y ya está en tu saldo.` : `Tu recarga de S/ ${t.monto.toFixed(2)} no se pudo confirmar: el pago no llegó. Escríbenos por WhatsApp si ya lo enviaste.`);
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
      ledger(db, { uid: r.uid, tipo: "retiro", campo: "ganancias", monto: -r.monto, ref: id, key: `wd:${id}`, nota: `Retiro a ${r.cuenta}` });
    }
    r.estado = aprobar ? "pagado" : "rechazado"; r.revisado = now();
    notify(db, r.uid, aprobar ? `Te enviamos S/ ${r.monto.toFixed(2)} a ${r.cuenta}.` : "Tu solicitud de retiro fue rechazada.");
    audit(db, actor, "approveWithdrawal", `S/ ${r.monto.toFixed(2)} de ${name(db, r.uid)}: ${aprobar ? "pagado" : "rechazado"}`);
  });
}
export function updateCommissionRules(actor, rules) {
  tx(db => {
    admin(db, actor);
    const L = rules.libre;
    ok(L && L.pct >= 0 && L.pct <= 30, "El porcentaje de compra libre debe estar entre 0 % y 30 %.");
    ok(L.min >= 0 && L.max >= L.min, "En compra libre, el máximo debe ser mayor o igual al mínimo.");
    ok(rules.masDe10 >= 0, "Las comisiones no pueden ser negativas.");
    let prev = 0;
    rules.tramos.forEach(t => { ok(t.hasta > prev, "Los tramos deben ir de menor a mayor distancia."); ok(t.monto >= 0, "Las comisiones no pueden ser negativas."); prev = t.hasta; });
    db.commissionRules = { libre: { pct: r2(L.pct), min: r2(L.min), max: r2(L.max) }, tramos: rules.tramos.map(t => ({ hasta: r2(t.hasta), monto: r2(t.monto) })), masDe10: r2(rules.masDe10) };
    audit(db, actor, "updateCommissionRules", `Compra libre ${r2(L.pct)} % (S/ ${r2(L.min).toFixed(2)}–${r2(L.max).toFixed(2)}) · ${rules.tramos.length} tramos`);
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
    ok(validImg(e.logo) && validImg(e.portada), "La imagen es demasiado pesada. Usa una foto más liviana.");
    const { solicitudId, ...data } = e;
    const sol = solicitudId ? db.businessApplications?.[solicitudId] : null;
    if (solicitudId) ok(sol && sol.estado === "pendiente", "Esa solicitud ya fue atendida.");
    const id = e.id || uid("e");
    db.establishments[id] = {
      ...(db.establishments[id] || { activo: true, zona: "camana", contacto: "", creado: now() }),
      ...data, id, nombre: e.nombre.trim(), direccion: e.direccion.trim(), descripcion: (e.descripcion || "").trim(),
      tiempoPrep: Math.max(0, Math.round(+e.tiempoPrep || 0)), tiendaVirtual: !!e.tiendaVirtual,
      logo: e.logo || null, portada: e.portada || null, actualizado: now(),
      etiquetas: (e.etiquetas || db.establishments[id]?.etiquetas || []).filter(x => ESPECIALIDADES.some(([n]) => n === x)).slice(0, 4),
      rating: db.establishments[id]?.rating || 0, ratingCount: db.establishments[id]?.ratingCount || 0, resenas: db.establishments[id]?.resenas || [],
    };
    audit(db, actor, "upsertEstablishment", db.establishments[id].nombre + (e.logo || e.portada ? " (con imagen)" : ""));
    if (sol) {
      Object.assign(sol, { estado: "aprobada", establishmentId: id, resuelto: now(), resueltoPor: actor });
      audit(db, actor, "approveBusiness", sol.negocio);
      if (sol.uid && db.users[sol.uid]) {
        linkOwner(db, sol.uid, id);
        notify(db, sol.uid, `¡${sol.negocio} ya está en RAPIDIN! Entra a tu Panel de negocio para cargar tu menú y tus datos de cobro.`);
      }
    }
  });
}
function linkOwner(db, ownerUid, estId) {
  const u = db.users[ownerUid]; ok(u, "La cuenta del dueño no existe.");
  ok(!u.roles.admin, "Una cuenta de administrador no puede ser dueña de un local.");
  const prev = Object.values(db.establishments).find(x => x.ownerUid === ownerUid && x.id !== estId);
  ok(!prev, `Esa cuenta ya administra ${prev?.nombre}.`);
  const e = db.establishments[estId];
  if (e.ownerUid && e.ownerUid !== ownerUid && db.users[e.ownerUid]) { const o = db.users[e.ownerUid]; o.roles = { ...o.roles, negocio: null }; o.negocioId = null; }
  e.ownerUid = ownerUid;
  u.roles = { ...u.roles, negocio: "aprobado" }; u.negocioId = estId;
}
/** El admin asigna (o quita) la cuenta que administra un local, buscándola por su correo. */
export function assignStoreOwner(actor, estId, correo) {
  tx(db => {
    admin(db, actor);
    const e = db.establishments[estId]; ok(e, "El local no existe.");
    const mail = (correo || "").trim().toLowerCase();
    if (!mail) {
      if (e.ownerUid && db.users[e.ownerUid]) { const o = db.users[e.ownerUid]; o.roles = { ...o.roles, negocio: null }; o.negocioId = null; notify(db, o.uid, `Ya no administras ${e.nombre} en RAPIDIN.`); }
      e.ownerUid = null; audit(db, actor, "assignStoreOwner", `${e.nombre}: sin dueño`); return;
    }
    const u = Object.values(db.users).find(x => (x.correo || "").toLowerCase() === mail);
    ok(u, "No hay una cuenta RAPIDIN con ese correo. Pide al dueño que se registre primero.");
    linkOwner(db, u.uid, estId);
    notify(db, u.uid, `Ahora administras ${e.nombre} en RAPIDIN. Entra a tu Panel de negocio.`);
    audit(db, actor, "assignStoreOwner", `${e.nombre}: ${mail}`);
  });
}
/* ---------- Registro de negocios (formulario público «Registra tu negocio») ----------
   En producción: callable submitBusinessApplication (sin login, con App Check y límite por IP)
   + trigger onBusinessApplicationCreated que avisa al panel (FCM) y por WhatsApp (Cloud API). */
const validImg = v => !v || (typeof v === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(v) && v.length < 600e3);
export const BIZ_CATS = ["Comida", "Mercado", "Farmacia", "Ferretería", "Regalos", "Mascotas", "Otros"];
export function submitBusinessApplication(actor, b) {
  return tx(db => {
    db.businessApplications ||= {};
    const u = activeUser(db, actor);
    ok(!u.roles.admin, "Usa una cuenta de cliente para registrar tu negocio.");
    ok(u.roles.negocio !== "aprobado", "Tu cuenta ya administra un negocio.");
    ok(!Object.values(db.businessApplications).some(x => x.uid === actor && x.estado === "pendiente"), "Ya enviaste una solicitud. La estamos revisando.");
    ok(b.negocio && b.negocio.trim().length >= 3, "Escribe el nombre de tu negocio.");
    ok(BIZ_CATS.includes(b.categoria), "Elige el rubro de tu negocio.");
    ok(b.responsable && b.responsable.trim().split(/\s+/).length >= 2, "Escribe tu nombre y apellido.");
    ok(/^9\d{8}$/.test(b.celular || ""), "Tu celular debe tener 9 dígitos y empezar con 9.");
    ok(b.direccion && b.direccion.trim().length >= 6, "Escribe la dirección del local.");
    ok(b.pos && b.pos.x > 0.01 && b.pos.x < 0.99 && b.pos.y > 0.01 && b.pos.y < 0.99, "Marca la ubicación del local: busca la dirección, usa tu GPS o toca el mapa.");
    ok(validImg(b.logo) && validImg(b.portada), "La imagen es demasiado pesada. Usa una foto más liviana.");
    ok(b.acepta, "Acepta que te contactemos para continuar.");
    const dup = Object.values(db.businessApplications).find(x => x.estado === "pendiente" && x.celular === b.celular && x.negocio.toLowerCase() === b.negocio.trim().toLowerCase());
    ok(!dup, "Ya recibimos la solicitud de este negocio. Te escribiremos pronto.");
    const id = uid("biz");
    const a = db.businessApplications[id] = {
      id, uid: actor, correo: u.correo || "", negocio: b.negocio.trim(), categoria: b.categoria, responsable: b.responsable.trim(), celular: b.celular,
      direccion: b.direccion.trim(), referencia: (b.referencia || "").trim(), pos: b.pos, ubicacionFuente: b.ubicacionFuente || "",
      horario: b.horario || null, descripcion: (b.descripcion || "").trim(), mercado: !!b.mercado, logo: b.logo || null, portada: b.portada || null,
      estado: "pendiente", creado: now(), nota: "",
    };
    notify(db, ADMINS, `Nuevo negocio por registrar: ${a.negocio} (${a.categoria}).`, null, `biz:${id}`);
    db.notificationEvents ||= [];
    db.notificationEvents.unshift({ id: uid("ne"), t: now(), tipo: "negocio_nuevo", canal: "whatsapp_admin", ref: id, estado: "pendiente_envio" });
    return a;
  });
}
export function rejectBusinessApplication(actor, id, nota) {
  tx(db => {
    admin(db, actor);
    const a = db.businessApplications?.[id]; ok(a, "La solicitud no existe."); ok(a.estado === "pendiente", "Esa solicitud ya fue atendida.");
    Object.assign(a, { estado: "rechazada", nota: (nota || "").trim(), resuelto: now(), resueltoPor: actor });
    audit(db, actor, "rejectBusiness", `${a.negocio}${a.nota ? ": " + a.nota : ""}`);
    if (a.uid) notify(db, a.uid, `Revisamos la solicitud de ${a.negocio}.${a.nota ? " " + a.nota : ""}`);
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
    ledger(db, { uid: target, tipo: "ajuste", campo, monto, ref: actor, key: uid("adj"), nota: nota.trim() });
    audit(db, actor, "adjustWallet", `${name(db, target)} · ${campo} ${monto > 0 ? "+" : ""}${monto.toFixed(2)} · ${nota.trim()}`);
  });
}
/** Primera vez con Firebase: el admin carga la configuración, Puerto en Llamas y su carta. */
export function seedInitialData(actor, data) {
  tx(db => {
    admin(db, actor);
    db.config = { ...data.config, ...db.config, sembrado: now() };
    // Diseño original: Saldo RAPIDIN y retiros encendidos (una sola vez; luego manda lo que elijas en Configuración).
    if (!(db.config.cfgSaldo >= 2)) Object.assign(db.config, { saldoClienteHabilitado: true, retirosHabilitados: true, cfgSaldo: 2 });
    db.commissionRules = db.commissionRules || data.commissionRules; db.zones = db.zones || data.zones;
    Object.values(data.establishments).forEach(e => { if (!db.establishments[e.id]) db.establishments[e.id] = e; });
    Object.values(data.products).forEach(p => { if (!db.products[p.id]) db.products[p.id] = p; });
    audit(db, actor, "seedInitialData", `${Object.keys(data.establishments).length} local(es) y ${Object.keys(data.products).length} productos`);
  });
}
/** Sube a Firestore los locales, productos y guía de precios creados en la versión de prueba (solo los que no existen). */
export function importLocalData(actor, data) {
  tx(db => {
    admin(db, actor);
    let n = 0;
    ["establishments", "products", "proveedores", "preciosRef"].forEach(k => Object.values(data[k] || {}).forEach(v => { if (v?.id && !db[k][v.id]) { db[k][v.id] = v; n++; } }));
    ok(n > 0, "No hay datos nuevos para guardar.");
    audit(db, actor, "importLocalData", `${n} registro(s) de la versión de prueba`);
  });
}
export function markNotificationsRead(actor) {
  tx(db => { [actor, ...(db.users[actor]?.roles.admin ? [ADMINS] : [])].forEach(k => (db.notifications[k] || []).forEach(n => (n.leida = true))); });
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
