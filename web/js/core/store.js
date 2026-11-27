/* =========================================================
   RAPIDIN · Datos
   La web usa Firebase (Auth + Firestore) a través de fbstore.js.
   Este archivo también guarda los datos iniciales (Puerto en
   Llamas y su carta) que el admin sube con «Cargar datos
   iniciales», y un modo de prueba local que SOLO funciona en
   localhost (nunca en la web publicada) para probar cambios.
   ========================================================= */

import { CONFIG } from "../config.js";
import * as fbs from "./fbstore.js";

const KEY = "rapidin.local.db";
/** Datos que quedaron guardados en este navegador desde la versión de prueba anterior (se pueden importar a Firestore). */
export const LEGACY_KEY = "rapidin.demo.db.v4";
const LOCAL_HOST = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
/** Modo de prueba local: solo en localhost y solo si se activa a mano (localStorage «rapidin.pruebaLocal» = 1). */
const LOCAL_TEST = LOCAL_HOST && (() => { try { return localStorage.getItem("rapidin.pruebaLocal") === "1"; } catch (e) { return false; } })();
/** true = la web usa tu Firebase real. En la web publicada siempre es true. */
export const IS_FB = !LOCAL_TEST && CONFIG.backend === "firebase" && !!CONFIG.firebase?.apiKey;
export const DEMO_PASSWORD = "Rapidin123";

/** Especialidades de los locales: se usan como categorías del Market y en «Pedir en un local». */
export const ESPECIALIDADES = [
  ["Pollo a la brasa", "🍗"], ["Pollo al cilindro", "🔥"], ["Broaster", "🍟"], ["Alitas", "🍖"], ["Salchipapas", "🌭"], ["Sándwiches", "🥪"], ["Chifa", "🥡"], ["Cevichería", "🐟"], ["Pizzas", "🍕"],
  ["Hamburguesas", "🍔"], ["Parrillas", "🥩"], ["Comida criolla", "🍲"], ["Menú del día", "🍛"], ["Postres y tortas", "🍰"],
  ["Panadería", "🥖"], ["Juguería", "🥤"], ["Cafetería", "☕"], ["Bodega", "🛒"], ["Minimarket", "🏪"],
  ["Farmacia", "💊"], ["Ferretería", "🔧"], ["Florería", "💐"], ["Regalos", "🎁"], ["Mascotas", "🐾"],
];
export const espIcon = n => (ESPECIALIDADES.find(e => e[0] === n) || [, "🏬"])[1];

export const TEST_ACCOUNTS = [
  { correo: "cliente@rapidin.test", rol: "Cliente", detalle: "María, para hacer pedidos" },
  { correo: "repartidor@rapidin.test", rol: "Repartidor", detalle: "Carlos, aprobado" },
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
  if (IS_FB) return fbs.getDb() || (memory ||= emptyDb());
  let db = readRaw();
  if (!db || db.version !== 6) { db = seed(); writeRaw(db); }
  // Migración: quitar repartidores simulados que no tengan pedidos (datos limpios para producción).
  const bots = Object.values(db.users).filter(u => u.bot && !Object.values(db.orders).some(o => o.courierId === u.uid || o.clienteId === u.uid));
  if (bots.length) { bots.forEach(u => { delete db.users[u.uid]; delete db.couriers[u.uid]; delete db.wallets[u.uid]; }); writeRaw(db); }
  // Migración: la comisión de compra libre pasó de monto fijo a porcentaje del total.
  if (typeof db.commissionRules?.libre === "number") { db.commissionRules.libre = { pct: 6, min: 1.5, max: 6 }; writeRaw(db); }
  // Migración suave: colecciones nuevas sin borrar los datos de prueba.
  if (!db.businessApplications) { db.businessApplications = {}; db.notificationEvents ||= []; writeRaw(db); }
  return db;
}

/** Lee la versión más reciente, aplica cambios y guarda: equivale a una transacción. */
export function tx(fn) {
  if (IS_FB) return fbs.tx(fn);
  const db = load();
  const result = fn(db);
  db.rev = (db.rev || 0) + 1;
  writeRaw(db);
  emit();
  return result;
}

export function reset() { if (IS_FB) return; const db = seed(); writeRaw(db); emit(); }

/* ---------- Firebase ---------- */
/** Datos de la primera carga (los sube el admin con «Cargar datos iniciales»). */
export function initialData() {
  const d = seed();
  return { config: { ...d.config, simulacion: false, saldoClienteHabilitado: false, retirosHabilitados: false }, commissionRules: d.commissionRules, zones: d.zones, establishments: d.establishments, products: d.products };
}
function emptyDb() {
  const i = initialData();
  return { version: 6, isFb: true, metaLoaded: false, users: {}, couriers: {}, wallets: {}, establishments: {}, products: {}, proveedores: {}, preciosRef: {}, orders: {},
    courierApplications: {}, businessApplications: {}, topups: {}, withdrawals: {}, walletLedger: [], auditLog: [], notificationEvents: [], notifications: {},
    config: i.config, commissionRules: i.commissionRules, zones: i.zones };
}
/** Conecta con Firebase. En el modo de prueba local no hace nada. */
export function start(onError) {
  if (!IS_FB) return Promise.resolve();
  return fbs.start({ firebase: CONFIG.firebase, emit, empty: emptyDb, onError });
}
export { fbs };

/** Locales, productos y guía de precios guardados en este navegador por la versión de prueba anterior. */
export function legacyLocalData() {
  try {
    const d = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
    if (!d || !d.establishments) return null;
    const pick = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v && typeof v === "object"));
    const out = { establishments: pick(d.establishments), products: pick(d.products), proveedores: pick(d.proveedores), preciosRef: pick(d.preciosRef) };
    return Object.keys(out.establishments).length || Object.keys(out.proveedores).length ? out : null;
  } catch (e) { return null; }
}
export function forgetLegacyLocalData() { try { localStorage.removeItem(LEGACY_KEY); } catch (e) {} }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

// Otra pestaña cambió los datos (por ejemplo, cliente en una y repartidor en otra).
window.addEventListener("storage", e => { if (!IS_FB && e.key === KEY) { memory = null; emit(); } });

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
    u_admin: user("u_admin", "Administración RAPIDIN", "admin@rapidin.test", "900000001", { cliente: false, admin: true }),
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
    u_carlos: courier("u_carlos", "moto", 0, 0, 0, 0.55, 0.5),
  };
  const wallets = {};
  Object.keys(users).forEach(k => { wallets[k] = { recargas: 0, ganancias: 0, reservado: 0, saldo: 0, retenido: 0 }; });
  wallets.u_carlos.recargas = 20; // para poder reservar comisiones al ofertar

  // Horarios: días 0 = domingo … 6 = sábado. Horas en hora de Lima.
  const TODOS = [1, 2, 3, 4, 5, 6, 0];
  // Locales reales. Coordenadas exactas de Google Maps (lat, lng) convertidas al mapa normalizado.
  const fromLL = (lat, lng) => ({ x: +((lng - MAP.lngLeft) / (MAP.lngRight - MAP.lngLeft)).toFixed(5), y: +((lat - MAP.latTop) / (MAP.latBottom - MAP.latTop)).toFixed(5) });
  const establishments = {
    e1: {
      id: "e1", nombre: "Puerto en Llamas by Ala Ruta", categoria: "Comida", direccion: "Jr. Puente Grau #281, esquina con Dos de Mayo",
      lat: -16.624167, lng: -72.712889, pos: fromLL(-16.624167, -72.712889), ubicacionFuente: "google",
      horario: { dias: [4, 5, 6, 0], abre: "19:00", cierra: "22:30" }, activo: true, tiendaVirtual: true, tiempoPrep: 20, // jueves a domingo
      descripcion: "Restobar: pollo y chancho al cilindro, broaster, alitas, salchipapas y sándwiches.",
      zona: "camana", telefono: "981157504", logo: null, portada: null,
      etiquetas: ["Pollo al cilindro", "Broaster", "Alitas", "Salchipapas"], rating: 0, ratingCount: 0, resenas: [], creado: t,
    },
  };

  // Catálogo del Market: carta oficial del local, con su precio.
  const products = {};
  let pn = 0;
  const prod = (tiendaId, seccion, nombre, precio, descripcion = "") => { const id = `p${++pn}`; products[id] = { id, tiendaId, seccion, nombre, precio, descripcion, disponible: true, img: null, orden: pn }; };
  const PAPAS = "Con papas fritas y ensalada.";
  [
    ["e1", "Especiales al cilindro", "Especial Cilindro 36", 38, "1/4 de pollo + 1 porción de chancho al cilindro + hot dog + papas fritas + ensalada."],
    ["e1", "Especiales al cilindro", "Chancho al cilindro", 25, "250 g de chancho + papas fritas + nativos + ensalada."],
    ["e1", "Pollo al cilindro", "1/8 pollo al cilindro", 13, PAPAS],
    ["e1", "Pollo al cilindro", "1/4 pollo al cilindro", 18, PAPAS],
    ["e1", "Pollo al cilindro", "1/2 pollo al cilindro", 33, PAPAS],
    ["e1", "Pollo al cilindro", "1 pollo al cilindro", 60, PAPAS],
    ["e1", "Pollo broaster", "Broaster 5 piezas", 19, "Piezas crocantes de pollo + papas fritas + ensalada."],
    ["e1", "Pollo broaster", "Broaster 7 piezas", 23, "Piezas crocantes de pollo + papas fritas + ensalada."],
    ["e1", "Pollo broaster", "Broaster 10 piezas", 28, "Piezas crocantes de pollo + papas fritas + ensalada."],
    ...["BBQ", "Acevichadas", "Maracuyá", "Búfalo", "Teriyaki", "Chimichurri"].flatMap(sab => [
      ["e1", "Alitas a la parrilla", `Alitas ${sab} · 6 piezas`, 20, "6 piezas + papas fritas."],
      ["e1", "Alitas a la parrilla", `Alitas ${sab} · 8 piezas`, 25, "8 piezas + papas fritas."],
    ]),
    ["e1", "Salchipapas", "Salchipapa simple", 10, "Hot dog + papas fritas."],
    ["e1", "Salchipapas", "Salchipapa mixta", 15, "Hot dog + salchicha ahumada + papas fritas."],
    ["e1", "Salchipapas", "Salchipapa especial", 17, "Hot dog + salchicha ahumada + huevo + papas fritas."],
    ["e1", "Salchipapas", "Salchipapa Cilindro 36", 25, "Hot dog + salchicha ahumada + pollo al cilindro + papas fritas."],
    ["e1", "Sándwiches", "Sándwich de chancho", 15, ""],
    ["e1", "Sándwiches", "Sándwich de pollo al cilindro", 15, ""],
  ].forEach(r => prod(...r));

  // Guía de precios para repartidores: vacía; el admin la va llenando.
  const proveedores = {}, preciosRef = {};

  return {
    version: 6, rev: 1, creado: t,
    users, couriers, wallets, establishments, products, proveedores, preciosRef,
    courierApplications: {},
    orders: {},
    businessApplications: {},
    notificationEvents: [],
    walletLedger: [
      { id: "l1", uid: "u_carlos", tipo: "recarga", monto: 20, ref: "tp_seed1", key: "topup:tp_seed1", t: t - D, nota: "Recarga de prueba" },
    ],
    topups: {},
    withdrawals: {},
    commissionRules: {
      libre: { pct: 6, min: 1.5, max: 6 }, // compra libre: 6 % del total de la oferta, entre S/ 1.50 y S/ 6
      tramos: [{ hasta: 2, monto: 0.8 }, { hasta: 4, monto: 1.2 }, { hasta: 6, monto: 1.8 }, { hasta: 8, monto: 2.4 }, { hasta: 10, monto: 3.0 }],
      masDe10: 3.5,
    },
    config: {
      ofertaVenceSeg: 120,
      umbralCercaM: 250,
      saldoClienteHabilitado: true,
      retirosHabilitados: true,
      pagoSaldoLiberacion: "al_entregar",
      simulacion: false,
      autoConfirmarMin: 30, // si el cliente no confirma la entrega, se confirma sola
      puntoEstrategico: { nombre: "Plaza de Armas de Camaná", pos: { x: 0.62, y: 0.38 } },
    },
    zones: { camana: { id: "camana", nombre: "Camaná", ciudad: "Camaná, Arequipa", activa: true } },
    auditLog: [],
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
