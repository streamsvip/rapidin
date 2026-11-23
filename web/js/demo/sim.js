/* =========================================================
   RAPIDIN · Simulación de actividad (solo DEMOSTRACIÓN)
   Repartidores y clientes simulados para que una sola persona
   pueda probar todo el ciclo. Se desactiva en Admin →
   Configuración → «Actividad simulada». No existe en producción.
   ========================================================= */
import { load, now, uid, MAP, isOpen } from "./store.js";
import * as api from "./api.js";

const TAB = uid("tab");
const LEAD = "rapidin.demo.leader";
const BOT_COURIERS = ["b_rosa", "b_luis", "b_jorge", "b_ana"];
const BOT_CLIENTS = ["c_pedro", "c_elena", "c_raul"];
const MSGS = ["Salgo ahora mismo.", "Llevo bolsa térmica.", "Estoy a 3 cuadras.", "Te escribo si falta algo.", "Conozco dónde está más barato."];
const PEDIDOS = [
  { modalidad: "libre", descripcion: "Una gaseosa de 3 L y dos paquetes de galletas de vainilla.", pago: "Efectivo" },
  { modalidad: "tienda", tienda: "e3", descripcion: "Paracetamol 500 mg (una caja) y alcohol en gel.", pago: "Yape" },
  { modalidad: "tienda", tienda: "e1", descripcion: "1/4 de pollo a la brasa con papas y una chicha morada.", pago: "Efectivo" },
  { modalidad: "libre", descripcion: "Recoger un sobre en la notaría y traerlo a mi casa.", pago: "Plin" },
  { modalidad: "tienda", tienda: "e2", descripcion: "1 kg de arroz, 1 L de aceite y una docena de huevos.", pago: "Saldo RAPIDIN" },
  { modalidad: "tienda", tienda: "e5", descripcion: "10 panes franceses y un queque de naranja.", pago: "Efectivo" },
];
let lastBotOrder = 0;

function leader() {
  try {
    const l = JSON.parse(localStorage.getItem(LEAD) || "null");
    if (!l || l.id === TAB || now() - l.t > 4000) { localStorage.setItem(LEAD, JSON.stringify({ id: TAB, t: now() })); return true; }
    return false;
  } catch (e) { return true; }
}
const rnd = (a, b, step = 0.5) => Math.round((a + Math.random() * (b - a)) / step) * step;
const safe = fn => { try { fn(); } catch (e) { if (!(e instanceof api.ApiError)) console.error(e); } };
const isBot = (db, id) => !!db.users[id]?.bot;

function step(from, to, d = 0.014) {
  // Avanza por calles: primero en horizontal y luego en vertical.
  const p = { ...from };
  if (Math.abs(to.x - p.x) > 0.002) p.x += Math.sign(to.x - p.x) * Math.min(d, Math.abs(to.x - p.x));
  else if (Math.abs(to.y - p.y) > 0.002) p.y += Math.sign(to.y - p.y) * Math.min(d, Math.abs(to.y - p.y));
  else return { ...to, llego: true };
  return p;
}

export function tick() {
  api.runScheduled();
  if (!leader()) return;
  let db = load();
  if (!db.config.simulacion) return;
  const t = now();
  const orders = Object.values(db.orders);

  // 1) Ofertas de repartidores simulados en pedidos de clientes reales.
  orders.filter(o => api.OPEN_STATES.includes(o.estado) && !isBot(db, o.clienteId)).forEach(o => {
    BOT_COURIERS.forEach((b, i) => {
      if (t - o.creado < (4 + i * 5) * 1000) return;
      if (Object.values(o.offers).some(x => x.courierId === b)) return;
      if (!db.couriers[b]?.disponible || db.users[b].estado !== "activo") return;
      const costo = o.modalidad === "catalogo" ? o.subtotal : rnd(8, 45);
      safe(() => api.submitOffer(b, o.id, { costoProductos: costo, tarifa: rnd(4, 8.5), tiempo: Math.round(rnd(10, 30, 1)), mensaje: MSGS[(i + o.codigo.length) % MSGS.length] }));
    });
  });

  // 2) Clientes simulados publican pedidos para que el repartidor de prueba tenga trabajo.
  db = load();
  const openBot = Object.values(db.orders).filter(o => api.OPEN_STATES.includes(o.estado) && isBot(db, o.clienteId));
  if (openBot.length < 2 && t - lastBotOrder > 25000) {
    lastBotOrder = t;
    const cliente = BOT_CLIENTS[Math.floor(Math.random() * BOT_CLIENTS.length)];
    const entrega = { pos: { x: rnd(MAP.mar + 0.12, 0.92, 0.01), y: rnd(0.12, 0.9, 0.01) }, referencia: "Puerta marrón, tocar timbre" };
    const abiertas = Object.values(db.establishments).filter(e => e.tiendaVirtual && isOpen(e));
    if (abiertas.length && Math.random() < 0.6) {
      const e = abiertas[Math.floor(Math.random() * abiertas.length)];
      const prods = Object.values(db.products).filter(x => x.tiendaId === e.id && x.disponible).sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
      safe(() => api.createOrder(cliente, { modalidad: "catalogo", tiendaId: e.id, items: prods.map(x => ({ productId: x.id, cantidad: 1 + Math.floor(Math.random() * 2) })), pago: ["Efectivo", "Yape", "Saldo RAPIDIN"][Math.floor(Math.random() * 3)], entrega }));
    } else {
      const p = PEDIDOS.filter(x => x.modalidad === "libre")[Math.floor(Math.random() * 2)];
      safe(() => api.createOrder(cliente, { modalidad: "libre", descripcion: p.descripcion, pago: p.pago, entrega }));
    }
  }

  // 3) Clientes simulados aceptan la oferta más barata, pagan y califican.
  db = load();
  Object.values(db.orders).filter(o => isBot(db, o.clienteId)).forEach(o => {
    const activas = Object.values(o.offers).filter(x => x.estado === "activa");
    if (api.OPEN_STATES.includes(o.estado) && activas.length && t - Math.min(...activas.map(x => x.creado)) > 6000) {
      activas.sort((a, b) => a.total - b.total);
      safe(() => api.acceptOffer(o.clienteId, o.id, activas[0].id));
    }
    if (api.METODOS_DIRECTOS.includes(o.pago) && api.ACTIVE_STATES.includes(o.estado) && o.estadoPago === "pendiente" && t - o.actualizado > 5000)
      safe(() => api.markOrderPaid(o.clienteId, o.id, String(Math.floor(10000000 + Math.random() * 89999999))));
    if (o.estado === "entregado" && !o.calificacion && t - o.actualizado > 3000)
      safe(() => api.rateCourier(o.clienteId, o.id, Math.random() < 0.7 ? 5 : 4, "Gracias, todo bien."));
  });

  // 4) Movimiento en el mapa (simula el GPS) y avance de repartidores simulados.
  db = load();
  Object.values(db.orders).filter(o => api.ACTIVE_STATES.includes(o.estado) && o.tracking).forEach(o => {
    const target = o.estado === "camino_a_recogida" ? o.recogida : ["camino_a_entrega", "repartidor_cerca"].includes(o.estado) ? o.entrega.pos : null;
    if (target) {
      const p = step(o.tracking.pos, target);
      if (!(p.llego && o.tracking.pos.x === target.x && o.tracking.pos.y === target.y)) safe(() => api.updateTracking(o.courierId, o.id, { x: p.x, y: p.y }));
    }
    if (!isBot(db, o.courierId)) return;
    const fresh = load().orders[o.id];
    if (t - fresh.actualizado < 5000) return;
    const next = api.nextStateFor(fresh.estado);
    const pos = fresh.tracking?.pos || {};
    const at = (q) => q && Math.abs(pos.x - q.x) < 0.003 && Math.abs(pos.y - q.y) < 0.003;
    if (fresh.estado === "camino_a_recogida" && !at(fresh.recogida)) return;
    if (fresh.estado === "camino_a_entrega") return; // espera a estar cerca (lo marca el sistema)
    if (next === "entregado") {
      if (api.METODOS_DIRECTOS.includes(fresh.pago) && fresh.estadoPago === "marcado") { safe(() => api.confirmOrderPayment(fresh.courierId, fresh.id, true)); return; }
      if (api.METODOS_DIRECTOS.includes(fresh.pago) && fresh.estadoPago !== "confirmado") return;
      if (!at(fresh.entrega.pos)) return;
      safe(() => api.advanceOrderState(fresh.courierId, fresh.id, "entregado", { efectivoRecibido: true }));
      return;
    }
    if (next) safe(() => api.advanceOrderState(fresh.courierId, fresh.id, next));
  });
}

export function startSimulation() {
  tick();
  return setInterval(tick, 1000);
}
