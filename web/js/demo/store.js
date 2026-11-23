/* =========================================================
   RAPIDIN · Almacén de datos de DEMOSTRACIÓN
   Simula Firestore en el navegador (localStorage). Cuando se
   conecte Firebase, este archivo se reemplaza por el SDK y las
   colecciones mantienen los mismos nombres:
   users, couriers, courierApplications, orders (offers, events,
   tracking), wallets, walletLedger, topups, withdrawals,
   commissionRules, config, establishments, zones, auditLog,
   notificationEvents.
   ========================================================= */

const KEY = "rapidin.demo.db.v3";
export const DEMO_PASSWORD = "Rapidin123";

export const TEST_ACCOUNTS = [
  { correo: "cliente@rapidin.test", rol: "Cliente", detalle: "María, con saldo y pedidos" },
  { correo: "repartidor@rapidin.test", rol: "Repartidor", detalle: "Carlos, aprobado y con saldo" },
  { correo: "postulante@rapidin.test", rol: "Postulante", detalle: "Lucía, postulación pendiente" },
  { correo: "admin@rapidin.test", rol: "Administrador", detalle: "Panel administrativo" },
];

let memory = null;          // copia en memoria si localStorage no está disponible
let listeners = new Set();

export const now = () => Date.now();
export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

/* ---------- Persistencia ---------- */
function readRaw() {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { /* sin almacenamiento */ }
  return memory ? JSON.parse(JSON.stringify(memory)) : null;
}
function writeRaw(db) {
  memory = db;
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* queda en memoria */ }
}

export function load() {
  let db = readRaw();
  if (!db || db.version !== 3) { db = seed(); writeRaw(db); }
  return db;
}

/** Lee la versión más reciente, aplica cambios y guarda: equivale a una transacción. */
export function tx(fn) {
  const db = load();
  const result = fn(db);
  db.rev = (db.rev || 0) + 1;
  writeRaw(db);
  emit();
  return result;
}

export function reset() { const db = seed(); writeRaw(db); emit(); }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

// Otra pestaña cambió los datos (por ejemplo, cliente en una y repartidor en otra).
window.addEventListener("storage", e => { if (e.key === KEY) { memory = null; emit(); } });

/* ---------- Mapa de Camaná (coordenadas normalizadas 0..1) ---------- */
export const MAP = { latTop: -16.612, latBottom: -16.636, lngLeft: -72.725, lngRight: -72.697, mar: 0.18 };
export const toLatLng = p => ({ lat: MAP.latTop + (MAP.latBottom - MAP.latTop) * p.y, lng: MAP.lngLeft + (MAP.lngRight - MAP.lngLeft) * p.x });
export function distKm(a, b) {
  const A = toLatLng(a), B = toLatLng(b), R = 6371, r = Math.PI / 180;
  const dLat = (B.lat - A.lat) * r, dLng = (B.lng - A.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * r) * Math.cos(B.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Distancia estimada por carretera (en la versión real la calcula RoutingService en Cloud Functions). */
export const roadKm = (a, b) => Math.round(distKm(a, b) * 1.3 * 100) / 100;

/* ---------- Datos semilla ---------- */
function seed() {
  const t = now(), H = 3600e3, D = 24 * H;
  const user = (id, nombre, correo, tel, roles, extra = {}) => ({
    uid: id, nombre, correo, pass: DEMO_PASSWORD, telefono: tel, whatsapp: tel, telefonoVerificado: true,
    roles: { cliente: true, repartidor: null, admin: false, ...roles }, estado: "activo", creado: t - 30 * D, demo: true, ...extra,
  });
  const users = {
    u_maria: user("u_maria", "María Quispe Flores", "cliente@rapidin.test", "987654321", {}, { direcciones: [{ id: "d1", nombre: "Casa", pos: { x: 0.6, y: 0.55 }, referencia: "Casa verde, 2.º piso" }, { id: "d2", nombre: "Trabajo", pos: { x: 0.72, y: 0.36 }, referencia: "Oficina 3, Jr. Comercio 410" }] }),
    u_carlos: user("u_carlos", "Carlos Huamán Ríos", "repartidor@rapidin.test", "912345678", { cliente: false, repartidor: "aprobado" }),
    u_lucia: user("u_lucia", "Lucía Mamani Torres", "postulante@rapidin.test", "945112233", { repartidor: "pendiente" }),
    u_admin: user("u_admin", "Administración RAPIDIN", "admin@rapidin.test", "900000001", { cliente: false, admin: true }),
    // Repartidores y clientes simulados: generan actividad para probar sin otra persona.
    b_rosa: user("b_rosa", "Rosa Quispe", "rosa.bot@rapidin.test", "951000001", { cliente: false, repartidor: "aprobado" }, { bot: true }),
    b_luis: user("b_luis", "Luis Medina", "luis.bot@rapidin.test", "951000002", { cliente: false, repartidor: "aprobado" }, { bot: true }),
    b_jorge: user("b_jorge", "Jorge Paredes", "jorge.bot@rapidin.test", "951000003", { cliente: false, repartidor: "aprobado" }, { bot: true }),
    b_ana: user("b_ana", "Ana Torres", "ana.bot@rapidin.test", "951000004", { cliente: false, repartidor: "aprobado" }, { bot: true }),
    c_pedro: user("c_pedro", "Pedro Salas", "pedro.bot@rapidin.test", "962000001", {}, { bot: true }),
    c_elena: user("c_elena", "Elena Chávez", "elena.bot@rapidin.test", "962000002", {}, { bot: true }),
    c_raul: user("c_raul", "Raúl Ccama", "raul.bot@rapidin.test", "962000003", {}, { bot: true }),
  };
  const courier = (id, vehiculo, rating, ratingCount, completados, x, y) => ({
    uid: id, vehiculo, disponible: true, zona: "camana", rating, ratingCount, completados,
    cuentasCobro: [
      { tipo: "Yape", numero: users[id].telefono, titular: users[id].nombre, verificada: true },
      { tipo: "Plin", numero: users[id].telefono, titular: users[id].nombre, verificada: true },
    ],
    pos: { x, y },
  });
  const couriers = {
    u_carlos: courier("u_carlos", "moto", 4.8, 36, 42, 0.55, 0.5),
    b_rosa: courier("b_rosa", "moto", 4.9, 120, 486, 0.4, 0.3),
    b_luis: courier("b_luis", "moto", 4.7, 80, 212, 0.8, 0.6),
    b_jorge: courier("b_jorge", "bicicleta", 4.6, 41, 98, 0.7, 0.2),
    b_ana: courier("b_ana", "mototaxi", 4.8, 64, 175, 0.3, 0.7),
  };
  const wallets = {};
  Object.keys(users).forEach(k => { wallets[k] = { recargas: 0, ganancias: 0, reservado: 0, saldo: 0, retenido: 0 }; });
  wallets.u_maria.saldo = 50;
  wallets.u_carlos.recargas = 20; wallets.u_carlos.ganancias = 35.5;
  ["b_rosa", "b_luis", "b_jorge", "b_ana"].forEach(k => (wallets[k].recargas = 50));
  ["c_pedro", "c_elena", "c_raul"].forEach(k => (wallets[k].saldo = 100));

  // Horarios: días 0 = domingo … 6 = sábado. Horas en hora de Lima.
  const TODOS = [1, 2, 3, 4, 5, 6, 0], LUN_SAB = [1, 2, 3, 4, 5, 6];
  const establishments = {};
  [
    ["e1", "Pollería La Brasa Dorada", "Comida", "Jr. 28 de Julio 214", 0.66, 0.34, TODOS, "12:00", "23:00", true, 25, "Pollo a la leña, parrillas y bebidas."],
    ["e2", "Minimarket Central", "Mercado", "Av. Lima 530", 0.58, 0.46, TODOS, "06:30", "23:59", true, 10, "Abarrotes, bebidas y limpieza."],
    ["e3", "Botica Salud Total", "Farmacia", "Jr. Mariscal Castilla 120", 0.7, 0.42, TODOS, "00:00", "23:59", true, 5, "Atención las 24 horas. Productos de venta libre."],
    ["e4", "Ferretería El Constructor", "Ferretería", "Av. Mariscal Castilla 905", 0.86, 0.62, LUN_SAB, "08:00", "19:00", false, 15, "Herramientas y materiales."],
    ["e5", "Panadería La Espiga", "Comida", "Jr. Comercio 340", 0.5, 0.3, TODOS, "06:00", "21:00", true, 10, "Pan del día, pasteles y empanadas."],
    ["e6", "Florería Primavera", "Regalos", "Jr. Quilca 210", 0.74, 0.24, LUN_SAB, "09:00", "20:00", true, 30, "Ramos, arreglos y detalles."],
    ["e7", "Cevichería Mar Azul", "Comida", "Av. Costanera s/n, La Punta", 0.27, 0.78, TODOS, "10:00", "17:00", true, 20, "Ceviches y platos marinos del día."],
  ].forEach(([id, nombre, categoria, direccion, x, y, dias, abre, cierra, tiendaVirtual, prep, descripcion]) => {
    establishments[id] = { id, nombre, categoria, direccion, pos: { x, y }, horario: { dias, abre, cierra }, activo: true, tiendaVirtual, tiempoPrep: prep, descripcion, zona: "camana", contacto: "" };
  });

  // Catálogo del Market: precio fijado por cada local.
  const products = {};
  let pn = 0;
  const prod = (tiendaId, seccion, nombre, precio, descripcion = "") => { const id = `p${++pn}`; products[id] = { id, tiendaId, seccion, nombre, precio, descripcion, disponible: true, img: null, orden: pn }; };
  [
    ["e1", "Pollos", "Pollo a la brasa entero", 62, "Con papas fritas y ensalada fresca."],
    ["e1", "Pollos", "1/2 pollo a la brasa", 33, "Con papas fritas y ensalada."],
    ["e1", "Pollos", "1/4 de pollo a la brasa", 18, "Con papas fritas y ensalada."],
    ["e1", "Acompañamientos", "Porción de papas fritas", 8, ""],
    ["e1", "Acompañamientos", "Ensalada fresca", 6, "Lechuga, tomate, pepino y zanahoria."],
    ["e1", "Bebidas", "Chicha morada 1 L", 9, "Preparada en casa."],
    ["e1", "Bebidas", "Gaseosa 1.5 L", 8, "Sabor a elegir según stock."],
    ["e2", "Abarrotes", "Arroz extra 5 kg", 22, ""],
    ["e2", "Abarrotes", "Aceite vegetal 1 L", 10.5, ""],
    ["e2", "Abarrotes", "Azúcar rubia 1 kg", 4.2, ""],
    ["e2", "Lácteos y huevos", "Huevos x 15", 9, "Huevos de granja."],
    ["e2", "Lácteos y huevos", "Leche evaporada x 6", 24, "Pack de 6 latas."],
    ["e2", "Bebidas", "Agua mineral 2.5 L", 4, ""],
    ["e2", "Limpieza", "Papel higiénico x 4", 6, ""],
    ["e3", "Medicamentos de venta libre", "Paracetamol 500 mg x 10", 3, "Caja de 10 tabletas."],
    ["e3", "Medicamentos de venta libre", "Suero oral 1 L", 7, ""],
    ["e3", "Cuidado personal", "Alcohol 70° 250 ml", 5, ""],
    ["e3", "Cuidado personal", "Gel antibacterial 250 ml", 9, ""],
    ["e3", "Cuidado personal", "Protector solar FPS 50", 45, "Recomendado para la playa."],
    ["e3", "Cuidado personal", "Mascarillas x 10", 6, ""],
    ["e5", "Panes", "Pan francés x 10", 3, "Recién horneado."],
    ["e5", "Panes", "Pan integral x 6", 4, ""],
    ["e5", "Dulces", "Queque de naranja", 15, "Entero, para 8 porciones."],
    ["e5", "Dulces", "Alfajores x 6", 9, ""],
    ["e5", "Salados", "Empanada de pollo", 5, ""],
    ["e6", "Ramos", "Ramo de 12 rosas", 60, "Rosas rojas con papel coreano."],
    ["e6", "Arreglos", "Arreglo de girasoles", 45, ""],
    ["e6", "Detalles", "Peluche mediano", 35, ""],
    ["e6", "Detalles", "Tarjeta con dedicatoria", 3, "Escribe el mensaje en la nota del pedido."],
    ["e7", "Ceviches", "Ceviche de pescado", 28, "Con camote y choclo."],
    ["e7", "Ceviches", "Ceviche mixto", 35, ""],
    ["e7", "Platos", "Chicharrón de pescado", 30, ""],
    ["e7", "Platos", "Arroz con mariscos", 32, ""],
    ["e7", "Bebidas", "Chicha morada (vaso)", 4, ""],
  ].forEach(r => prod(...r));

  // Historial: un pedido entregado de María con Carlos.
  const o1 = {
    id: "o_hist1", codigo: "RP-1000", clienteId: "u_maria", modalidad: "tienda", descripcion: "1 pollo a la brasa entero con papas y ensalada.",
    tienda: { id: "e1", nombre: "Pollería La Brasa Dorada", direccion: "Jr. 28 de Julio 214", pos: { x: 0.66, y: 0.34 } },
    entrega: { pos: { x: 0.6, y: 0.55 }, referencia: "Casa verde, 2.º piso" }, pago: "Yape",
    estado: "entregado", estadoPago: "confirmado", courierId: "u_carlos", ofertaAceptadaId: "of_hist1",
    precioTotal: 74, comision: 0.8, distanciaKm: 0.4, creado: t - 2 * D, actualizado: t - 2 * D + H,
    offers: { of_hist1: { id: "of_hist1", courierId: "u_carlos", costoProductos: 68, tarifa: 6, total: 74, tiempo: 25, mensaje: "Salgo de inmediato.", estado: "aceptada", comision: 0.8, creado: t - 2 * D, vence: t - 2 * D + 120e3 } },
    events: [
      { t: t - 2 * D, estado: "solicitado", por: "u_maria" }, { t: t - 2 * D + 60e3, estado: "ofertas_recibidas", por: "sistema" },
      { t: t - 2 * D + 300e3, estado: "oferta_aceptada", por: "u_maria" }, { t: t - 2 * D + H, estado: "entregado", por: "u_carlos" },
    ],
    tracking: null, calificacion: { estrellas: 5, comentario: "Muy rápido y amable." }, cambios: [], reportes: [], retencion: 0, comprobante: "482910", recogida: { x: 0.66, y: 0.34 },
  };

  return {
    version: 3, rev: 1, creado: t,
    users, couriers, wallets, establishments, products,
    courierApplications: {
      app_lucia: { id: "app_lucia", uid: "u_lucia", nombre: "Lucía Mamani Torres", dni: "45123987", celular: "945112233", vehiculo: "moto", docs: ["dni_frente.jpg", "dni_reverso.jpg", "licencia.jpg"], estado: "pendiente", creado: t - 5 * H, nota: "" },
    },
    orders: { o_hist1: o1 },
    walletLedger: [
      { id: "l1", uid: "u_maria", tipo: "recarga", monto: 50, ref: "tp_seed0", key: "topup:tp_seed0", t: t - 10 * D, nota: "Recarga Yape verificada" },
      { id: "l2", uid: "u_carlos", tipo: "recarga", monto: 20.8, ref: "tp_seed1", key: "topup:tp_seed1", t: t - 9 * D, nota: "Recarga Plin verificada" },
      { id: "l3", uid: "u_carlos", tipo: "cobro_comision", monto: -0.8, ref: "o_hist1", key: "fee:o_hist1", t: t - 2 * D + H, nota: "Comisión del pedido" },
      { id: "l4", uid: "u_carlos", tipo: "pago_pedido", monto: 35.5, ref: "o_seed", key: "pay:o_seed", t: t - 4 * D, nota: "Pedidos pagados con saldo" },
    ],
    topups: {
      tp_maria: { id: "tp_maria", uid: "u_maria", monto: 30, metodo: "Yape", operacion: "73519284", estado: "pendiente", creado: t - 2 * H },
    },
    withdrawals: {
      wd_carlos: { id: "wd_carlos", uid: "u_carlos", monto: 20, cuenta: "Yape 912 345 678", estado: "pendiente", creado: t - 3 * H },
    },
    commissionRules: {
      libre: 1.0,
      tramos: [{ hasta: 2, monto: 0.8 }, { hasta: 4, monto: 1.2 }, { hasta: 6, monto: 1.8 }, { hasta: 8, monto: 2.4 }, { hasta: 10, monto: 3.0 }],
      masDe10: 3.5,
    },
    config: {
      ofertaVenceSeg: 120,
      umbralCercaM: 250,
      saldoClienteHabilitado: true,
      retirosHabilitados: true,
      pagoSaldoLiberacion: "al_entregar",
      simulacion: true,
      puntoEstrategico: { nombre: "Plaza de Armas de Camaná", pos: { x: 0.62, y: 0.38 } },
    },
    zones: { camana: { id: "camana", nombre: "Camaná", ciudad: "Camaná, Arequipa", activa: true } },
    auditLog: [
      { id: "a1", t: t - 9 * D, uid: "u_admin", accion: "confirmTopup", detalle: "Recarga S/ 20.80 de Carlos Huamán Ríos" },
      { id: "a2", t: t - 20 * D, uid: "u_admin", accion: "approveCourier", detalle: "Carlos Huamán Ríos aprobado como repartidor" },
    ],
    notifications: {},
    seq: 1000,
  };
}

/* ---------- Horarios de atención (hora de Lima) ---------- */
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_L = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const toMin = h => { const [a, b] = String(h || "0:0").split(":").map(Number); return a * 60 + (b || 0); };
export function limaNow(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = t => p.find(x => x.type === t)?.value;
  return { dia: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), min: +get("hour") * 60 + +get("minute") };
}
/** ¿Está abierto ahora? Soporta horarios que cruzan la medianoche (por ejemplo 18:00–02:00). */
export function isOpen(e, now = limaNow()) {
  if (!e?.activo || !e.horario) return false;
  const { dias, abre, cierra } = e.horario, a = toMin(abre), c = toMin(cierra);
  if (c > a) return dias.includes(now.dia) && now.min >= a && now.min < c + (c === 1439 ? 1 : 0);
  const ayer = (now.dia + 6) % 7;
  return (dias.includes(now.dia) && now.min >= a) || (dias.includes(ayer) && now.min < c);
}
export const is24h = e => e.horario && e.horario.abre === "00:00" && e.horario.cierra === "23:59" && e.horario.dias.length === 7;
export function daysLabel(dias) {
  const s = [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (s.length === 7) return "Todos los días";
  if (s.join() === "1,2,3,4,5,6") return "Lunes a sábado";
  if (s.join() === "1,2,3,4,5") return "Lunes a viernes";
  return s.map(d => DIAS[d]).join(", ");
}
export const hoursLabel = e => (is24h(e) ? "Abierto las 24 horas" : `${daysLabel(e.horario.dias)} · ${e.horario.abre}–${e.horario.cierra}`);
/** Texto corto del estado: «Abierto · cierra 23:00» o «Cerrado · abre mañana 06:00». */
export function statusLabel(e, now = limaNow()) {
  if (!e.activo) return "No disponible";
  if (is24h(e)) return "Abierto · 24 horas";
  if (isOpen(e, now)) return `Abierto · cierra ${e.horario.cierra}`;
  const a = toMin(e.horario.abre);
  for (let k = 0; k < 8; k++) {
    const d = (now.dia + k) % 7;
    if (!e.horario.dias.includes(d)) continue;
    if (k === 0 && now.min >= a) continue;
    return `Cerrado · abre ${k === 0 ? "hoy" : k === 1 ? "mañana" : `el ${DIAS_L[d]}`} ${e.horario.abre}`;
  }
  return "Cerrado";
}
