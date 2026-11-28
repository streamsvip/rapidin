/* =========================================================
   RAPIDIN · Conexión con Firebase (Auth + Firestore)
   ---------------------------------------------------------
   La web trabaja con un objeto «db» en memoria (igual que la
   demo) y este módulo lo mantiene sincronizado con Firestore:

   • Lectura: escucha en tiempo real solo lo que cada rol puede
     ver (las reglas de seguridad lo exigen).
   • Escritura: cada acción (api.js) se aplica sobre una copia,
     se calcula la diferencia y se guarda campo por campo, para
     que dos personas puedan escribir el mismo pedido a la vez
     (por ejemplo, dos repartidores ofertando).
   • Saldos (plan Spark, sin Cloud Functions): NO se guardan.
     Se calculan a partir de las recargas que confirma el admin
     y de los pedidos. Así nadie puede cambiarse su saldo.
   ========================================================= */
import { CONFIG } from "../config.js";

const V = "10.14.1";
const CDN = n => `https://www.gstatic.com/firebasejs/${V}/firebase-${n}.js`;

let A, AU, FS;                 // módulos del SDK (app, auth, firestore)
let auth, fdb;
let hooks = null;              // { emit, empty, onError }
let db = null;                 // vista en memoria que consume la web
let me = null, isAdmin = false, meDoc = null, meLoaded = false;
const q = {};                  // resultados por suscripción: q[key] = { coll, docs: {id: data} }
const unsubs = {};             // suscripciones activas
let readyWaiters = [], userReadyFlag = false, adminSetupFailed = false;
let startedP = null;

const MAP_COLLS = ["couriers", "establishments", "products", "proveedores", "preciosRef", "orders", "courierApplications", "businessApplications", "topups", "withdrawals"];
const ARR_COLLS = { walletLedger: "ledger", auditLog: "auditLog", notificationEvents: "notificationEvents" };
const LEDGER_PERSIST = ["recarga", "ajuste", "retiro"];
const OPEN = ["buscando_repartidor", "ofertas_recibidas"];
const ACTIVE = ["oferta_aceptada", "repartidor_asignado", "camino_a_recogida", "en_establecimiento", "pedido_recogido", "camino_a_entrega", "repartidor_cerca", "por_confirmar", "en_revision"];
const r2 = n => Math.round(n * 100) / 100;
const clone = o => (o == null ? o : JSON.parse(JSON.stringify(o)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isObj = v => v && typeof v === "object" && !Array.isArray(v);

export const getDb = () => db;
export const currentUid = () => me;
export const adminNow = () => isAdmin;
/** true cuando ya llegaron de Firestore la configuración, los locales y los productos (existan o no). */
export const publicReady = () => q.meta !== undefined && !!q["pub:est"]?.ok && !!q["pub:prod"]?.ok;
/** true si la cuenta es de admin (config.js) pero Firestore no dejó crear su registro: faltan publicar las reglas. */
export const adminPending = () => adminSetupFailed && !isAdmin;

/* ---------- Inicio ---------- */
export function start(opts) {
  if (startedP) return startedP;
  hooks = opts; db = hooks.empty();
  startedP = (async () => {
    [A, AU, FS] = await Promise.all([import(CDN("app")), import(CDN("auth")), import(CDN("firestore"))]);
    const app = A.initializeApp(opts.firebase);
    auth = AU.getAuth(app);
    try { await AU.setPersistence(auth, AU.browserLocalPersistence); } catch (e) { /* usa la predeterminada */ }
    fdb = FS.initializeFirestore(app, { ignoreUndefinedProperties: true });
    // Datos públicos: locales, carta y configuración (también para quien no inició sesión).
    listen("pub:est", FS.collection(fdb, "establishments"), "establishments");
    listen("pub:prod", FS.collection(fdb, "products"), "products");
    listenDoc("pub:meta", FS.doc(fdb, "meta", "app"), d => { q.meta = d; });
    await new Promise(res => {
      let first = true;
      AU.onAuthStateChanged(auth, async u => {
        await setUser(u);
        if (first) { first = false; res(); }
      });
    });
  })();
  return startedP;
}

async function setUser(u) {
  const uid = u?.uid || null;
  if (uid === me) return;
  // Cierra lo del usuario anterior.
  Object.keys(unsubs).filter(k => !k.startsWith("pub:")).forEach(stop);
  me = uid; isAdmin = false; meDoc = null; meLoaded = false; userReadyFlag = false;
  rebuild();
  if (!uid) return;
  // Se espera a tener AMBOS datos (si es admin y su perfil) antes de decidir a qué panel entra.
  let triedAdmin = false;
  const adminReady = new Promise(res => listenDoc("me:admin", FS.doc(fdb, "admins", uid), async d => {
    if (me !== uid) return res();
    if (!d && !triedAdmin && (CONFIG.adminUids || []).includes(uid)) {
      // Primer ingreso del administrador: crea su registro en «admins» (las reglas solo lo permiten a su UID).
      triedAdmin = true;
      const ok = await FS.setDoc(FS.doc(fdb, "admins", uid), { nombre: (u.email || "Admin").split("@")[0], creado: Date.now() }).then(() => true, e => { console.warn("[RAPIDIN] Registro de admin", e?.code || e); return false; });
      if (ok) return; // llegará el documento creado por esta misma escucha
      adminSetupFailed = true;
    }
    isAdmin = !!d; roleSubs(); res();
  }));
  const userReady = new Promise(res => {
    listenDoc("me:user", FS.doc(fdb, "users", uid), async d => {
      if (me !== uid) return res();
      if (!d && !meLoaded) {
        // Cuenta creada desde la consola (por ejemplo el admin): crea su perfil mínimo,
        // solo si el servidor confirma que no existe (nunca sobrescribe por una lectura de caché).
        const s = await FS.getDocFromServer(FS.doc(fdb, "users", uid)).catch(() => null);
        if (s && !s.exists()) {
          const mail = u.email || "";
          const ok = await createProfile(uid, { nombre: (mail.split("@")[0] || "Usuario").replace(/^./, c => c.toUpperCase()), correo: mail, telefono: "", whatsapp: "" }, { cliente: true }).then(() => true, e => { console.warn("[RAPIDIN] Perfil", e?.code || e); return false; });
          if (ok) return; // llegará el documento creado por esta misma escucha
        }
        // Sin conexión o sin permiso: no se queda cargando para siempre.
        meLoaded = true; res(); return;
      }
      meDoc = d; meLoaded = true; roleSubs(); res();
    });
  });
  await Promise.all([adminReady, userReady]);
  if (me === uid) { userReadyFlag = true; rebuild(); readyWaiters.splice(0).forEach(f => f()); }
}

/** Suscripciones según el rol actual (cliente, repartidor aprobado, admin). */
function roleSubs() {
  if (!me) return;
  const want = new Map();
  const C = n => FS.collection(fdb, n);
  want.set("u:perfiles", [C("perfiles"), "perfiles"]);
  want.set("u:couriers", [C("couriers"), "couriers"]);
  want.set("u:notif", [FS.query(C(`notifications/${me}/items`), FS.orderBy("t", "desc"), FS.limit(40)), `notif:${me}`]);
  if (isAdmin) {
    want.set("a:users", [C("users"), "users"]);
    want.set("a:orders", [C("orders"), "orders"]);
    want.set("a:ledger", [C("ledger"), "ledger"]);
    want.set("a:topups", [C("topups"), "topups"]);
    want.set("a:wd", [C("withdrawals"), "withdrawals"]);
    want.set("a:apps", [C("courierApplications"), "courierApplications"]);
    want.set("a:biz", [C("businessApplications"), "businessApplications"]);
    want.set("a:audit", [FS.query(C("auditLog"), FS.orderBy("t", "desc"), FS.limit(300)), "auditLog"]);
    want.set("a:events", [FS.query(C("notificationEvents"), FS.orderBy("t", "desc"), FS.limit(100)), "notificationEvents"]);
    want.set("a:notif", [FS.query(C("notifications/_admins/items"), FS.orderBy("t", "desc"), FS.limit(60)), "notif:_admins"]);
    want.set("a:prov", [C("proveedores"), "proveedores"]);
    want.set("a:prec", [C("preciosRef"), "preciosRef"]);
  } else {
    const W = (f, v) => FS.where(f, "==", v);
    want.set("c:orders", [FS.query(C("orders"), W("clienteId", me)), "orders"]);
    want.set("c:ledger", [FS.query(C("ledger"), W("uid", me)), "ledger"]);
    want.set("c:topups", [FS.query(C("topups"), W("uid", me)), "topups"]);
    want.set("c:wd", [FS.query(C("withdrawals"), W("uid", me)), "withdrawals"]);
    want.set("c:apps", [FS.query(C("courierApplications"), W("uid", me)), "courierApplications"]);
    want.set("c:biz", [FS.query(C("businessApplications"), W("uid", me)), "businessApplications"]);
    if (meDoc?.roles?.negocio === "aprobado" && meDoc.negocioId) {
      // Pedidos del Market a su local (las reglas solo dejan leer los de su local).
      want.set("n:orders", [FS.query(C("orders"), W("tiendaId", meDoc.negocioId)), "orders"]);
    }
    if (meDoc?.roles?.repartidor === "aprobado") {
      want.set("r:mine", [FS.query(C("orders"), W("courierId", me)), "orders"]);
      want.set("r:open", [FS.query(C("orders"), FS.where("estado", "in", OPEN)), "orders"]);
      want.set("r:prov", [C("proveedores"), "proveedores"]);
      want.set("r:prec", [C("preciosRef"), "preciosRef"]);
    }
  }
  Object.keys(unsubs).filter(k => !k.startsWith("pub:") && !k.startsWith("me:") && !want.has(k)).forEach(stop);
  want.forEach(([ref, coll], key) => { if (!unsubs[key]) listen(key, ref, coll); });
}

function stop(key) { try { unsubs[key]?.(); } catch (e) {} delete unsubs[key]; delete q[key]; }
function listen(key, ref, coll) {
  q[key] = { coll, docs: {} };
  unsubs[key] = FS.onSnapshot(ref, snap => {
    const docs = {};
    snap.forEach(d => { docs[d.id] = { ...d.data(), id: d.data().id || d.id }; });
    q[key] = { coll, docs, ok: true };
    schedule();
  }, err => { console.warn("[RAPIDIN] No se pudo leer", coll, err?.code || err); q[key] = { coll, docs: {}, ok: true }; schedule(); });
}
function listenDoc(key, ref, onData) {
  unsubs[key] = FS.onSnapshot(ref, snap => { onData(snap.exists() ? snap.data() : null); schedule(); },
    err => { console.warn("[RAPIDIN] No se pudo leer", key, err?.code || err); onData(null); schedule(); });
}
let pending = false;
function schedule() { if (pending) return; pending = true; queueMicrotask(() => { pending = false; rebuild(); }); }

/** Espera a que el perfil del usuario esté cargado (después de ingresar o registrarse). */
export const isUserReady = () => !me || userReadyFlag;
export function whenUserReady() { return !me || userReadyFlag ? Promise.resolve() : new Promise(r => readyWaiters.push(r)); }

/* ---------- Construcción de la vista en memoria ---------- */
function merged(coll) {
  const out = {};
  Object.values(q).forEach(x => { if (x && x.coll === coll) Object.assign(out, clone(x.docs)); });
  return out;
}
function rebuild() {
  if (!hooks) return;
  const d = hooks.empty();
  if (q.meta) {
    d.config = { ...d.config, ...(q.meta.config || {}) };
    if (q.meta.commissionRules) d.commissionRules = q.meta.commissionRules;
    if (q.meta.zones) d.zones = q.meta.zones;
    d.metaLoaded = true;
  }
  MAP_COLLS.forEach(c => { d[c] = merged(c); });
  // Usuarios: perfil público + documento completo (propio o, para el admin, todos) + contactos de pedidos.
  const users = {}, full = merged("users");
  if (meDoc) full[me] = clone(meDoc);
  const base = id => (users[id] ||= { uid: id, nombre: "Usuario", correo: "", telefono: "", whatsapp: "", foto: null, roles: { cliente: true, repartidor: null, admin: false }, estado: "activo", telefonoVerificado: true });
  Object.entries(merged("perfiles")).forEach(([id, p]) => { const u = base(id); Object.assign(u, { nombre: p.nombre || u.nombre, foto: p.foto || null, estado: p.estado || "activo" }); u.roles = { ...u.roles, ...(p.roles || {}), admin: false }; });
  Object.entries(full).forEach(([id, u]) => { users[id] = { ...base(id), ...u, uid: id, roles: { cliente: true, repartidor: null, ...(u.roles || {}), admin: false } }; });
  Object.values(d.couriers).forEach(c => { const u = base(c.uid || c.id); if (!full[u.uid]) { u.telefono = c.telefono || ""; u.whatsapp = c.whatsapp || c.telefono || ""; } });
  Object.values(d.orders).forEach(o => {
    base(o.clienteId); if (o.courierId) base(o.courierId);
    if (o.contactoCliente && !full[o.clienteId]) Object.assign(users[o.clienteId], o.contactoCliente);
  });
  if (me && users[me]) users[me].roles.admin = isAdmin;
  d.users = users;
  // Listas
  Object.entries(ARR_COLLS).forEach(([k, coll]) => { d[k] = Object.values(merged(coll)).sort((a, b) => (b.t || 0) - (a.t || 0)); });
  d.notifications = {};
  Object.values(q).forEach(x => { if (x?.coll?.startsWith("notif:")) d.notifications[x.coll.slice(6)] = Object.values(x.docs).sort((a, b) => b.t - a.t); });
  derive(d);
  db = d;
  hooks.emit();
}

/** Saldos calculados (no se guardan): recargas confirmadas − comisiones cobradas, reservas de ofertas, etc. */
export function derive(d) {
  const W = {};
  const w = id => (W[id] ||= { recargas: 0, ganancias: 0, reservado: 0, saldo: 0, retenido: 0 });
  const persisted = (d.walletLedger || []).filter(l => LEDGER_PERSIST.includes(l.tipo));
  persisted.forEach(l => { const campo = l.campo || (d.couriers[l.uid] ? "recargas" : "saldo"); w(l.uid)[campo] += +l.monto || 0; });
  const synth = [];
  Object.values(d.orders).forEach(o => {
    if (o.courierId && o.comision != null) {
      if (o.estado === "entregado") {
        w(o.courierId).recargas -= o.comision;
        synth.push({ id: `fee_${o.id}`, uid: o.courierId, tipo: "cobro_comision", monto: -o.comision, ref: o.id, t: o.entregaConfirmada?.t || o.actualizado, nota: `Comisión cobrada · ${o.codigo}` });
      } else if (ACTIVE.includes(o.estado)) w(o.courierId).reservado += o.comision;
    }
    if (OPEN.includes(o.estado)) Object.values(o.offers || {}).forEach(of => { if (of.estado === "activa") w(of.courierId).reservado += of.comision || 0; });
    if (o.pago === "Saldo RAPIDIN") {
      if (o.saldoPagado) { w(o.clienteId).saldo -= o.saldoPagado; if (o.courierId) w(o.courierId).ganancias += o.saldoPagado; synth.push({ id: `pay_${o.id}`, uid: o.clienteId, tipo: "pago_pedido", monto: -o.saldoPagado, ref: o.id, t: o.actualizado, nota: `Pago del pedido ${o.codigo}` }); }
      else if (o.retencion && o.estado !== "cancelado") w(o.clienteId).retenido += o.retencion;
    }
  });
  Object.values(W).forEach(x => Object.keys(x).forEach(k => (x[k] = r2(x[k]))));
  Object.keys(d.users || {}).forEach(id => w(id));
  d.wallets = W;
  d.walletLedger = [...persisted, ...synth].sort((a, b) => (b.t || 0) - (a.t || 0));
}

/* ---------- Escritura: acción → diferencia → Firestore ---------- */
export function tx(fn) {
  const before = db || hooks.empty(), after = clone(before);
  const result = fn(after);
  derive(after);
  const ops = diff(before, after);
  db = after; hooks.emit();
  if (ops.length) commit(ops).catch(e => { console.error("[RAPIDIN] Error al guardar", e); hooks.onError?.(e); rebuild(); });
  return result;
}

function diff(b, a) {
  const ops = [];
  // Configuración general
  if (!same(b.config, a.config) || !same(b.commissionRules, a.commissionRules) || !same(b.zones, a.zones))
    ops.push({ t: "set", path: ["meta", "app"], data: { config: a.config, commissionRules: a.commissionRules, zones: a.zones }, merge: true });
  MAP_COLLS.forEach(c => docDiff(ops, c, b[c] || {}, a[c] || {}));
  // Usuarios: solo el propio (o todos, si es admin) + su perfil público.
  const ub = b.users || {}, ua = a.users || {};
  Object.keys(ua).forEach(id => {
    if (!isAdmin && id !== me) return;
    const x = strip(ub[id]), y = strip(ua[id]);
    if (!ub[id] || !same(x, y)) docDiff(ops, "users", { [id]: x }, { [id]: y }, !ub[id]);
    const pb = pub(ub[id]), pa = pub(ua[id]);
    if (!same(pb, pa)) ops.push({ t: "set", path: ["perfiles", id], data: pa, merge: true });
  });
  // Listas (movimientos, auditoría, eventos)
  Object.entries(ARR_COLLS).forEach(([k, coll]) => {
    if (coll !== "notificationEvents" && !isAdmin) return;
    const old = new Map((b[k] || []).map(x => [x.id, x]));
    (a[k] || []).forEach(x => {
      if (coll === "ledger" && !LEDGER_PERSIST.includes(x.tipo)) return;
      if (!old.has(x.id) || !same(old.get(x.id), x)) ops.push({ t: "set", path: [coll, x.id], data: x });
    });
  });
  // Notificaciones
  Object.entries(a.notifications || {}).forEach(([to, list]) => {
    const old = new Map(((b.notifications || {})[to] || []).map(x => [x.id, x]));
    list.forEach(n => {
      if (!old.has(n.id)) ops.push({ t: "set", path: ["notifications", to, "items", n.id], data: n });
      else if (old.get(n.id).leida !== n.leida && (to === me || (to === "_admins" && isAdmin))) ops.push({ t: "update", path: ["notifications", to, "items", n.id], fields: [[["leida"], n.leida]] });
    });
  });
  return ops;
}
const strip = u => { if (!u) return u; const x = clone(u); delete x.pass; if (x.roles) x.roles = { ...x.roles, admin: false }; return x; };
const pub = u => u && ({ nombre: u.nombre || "", foto: u.foto || null, estado: u.estado || "activo", roles: { cliente: !!u.roles?.cliente, repartidor: u.roles?.repartidor ?? null } });

/** Diferencia entre documentos: nuevo → set; borrado → delete; cambiado → update por campo (y por subcampo en mapas). */
function docDiff(ops, coll, bMap, aMap, forceSet = false) {
  Object.keys(aMap).forEach(id => {
    const x = bMap[id], y = aMap[id];
    if (!x || forceSet) { ops.push({ t: "set", path: [coll, id], data: y }); return; }
    if (same(x, y)) return;
    const fields = [];
    new Set([...Object.keys(x), ...Object.keys(y)]).forEach(k => {
      const p = x[k], n = y[k];
      if (same(p, n)) return;
      if (n === undefined) return fields.push([[k], DEL]);
      if (isObj(p) && isObj(n)) {
        new Set([...Object.keys(p), ...Object.keys(n)]).forEach(sk => { if (!same(p[sk], n[sk])) fields.push([[k, sk], n[sk] === undefined ? DEL : n[sk]]); });
        return;
      }
      if (Array.isArray(p) && Array.isArray(n) && n.length > p.length && same(p, n.slice(0, p.length))) return fields.push([[k], { __union: n.slice(p.length) }]);
      fields.push([[k], n]);
    });
    if (fields.length) ops.push({ t: "update", path: [coll, id], fields });
  });
  Object.keys(bMap).forEach(id => { if (!aMap[id]) ops.push({ t: "delete", path: [coll, id] }); });
}
const DEL = { __delete: true };

async function commit(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = FS.writeBatch(fdb);
    ops.slice(i, i + 450).forEach(op => {
      const ref = FS.doc(fdb, ...op.path);
      if (op.t === "set") batch.set(ref, clone(op.data), op.merge ? { merge: true } : {});
      else if (op.t === "delete") batch.delete(ref);
      else {
        const args = [];
        op.fields.forEach(([p, v]) => { args.push(new FS.FieldPath(...p), v === DEL ? FS.deleteField() : v && v.__union ? FS.arrayUnion(...clone(v.__union)) : clone(v)); });
        batch.update(ref, ...args);
      }
    });
    await batch.commit();
  }
}

/* ---------- Autenticación ---------- */
const AUTH_ERR = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.", "auth/wrong-password": "Correo o contraseña incorrectos.", "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "Revisa tu correo: falta la @ o el dominio.", "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Ingresa o usa otro.",
  "auth/weak-password": "La contraseña es muy débil. Usa al menos 8 caracteres con letras y números.", "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a intentar.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet e intenta de nuevo.", "auth/user-disabled": "Tu cuenta está deshabilitada. Escríbenos para revisarla.",
};
export const authMessage = e => AUTH_ERR[e?.code] || e?.message || "No pudimos completar la acción.";
export async function signIn(correo, pass) {
  await startedP;
  const c = await AU.signInWithEmailAndPassword(auth, correo.trim(), pass);
  await setUser(c.user); await whenUserReady();
  return c.user.uid;
}
export async function signUp({ nombre, correo, pass, telefono, whatsapp, consentimientos = null }) {
  await startedP;
  const c = await AU.createUserWithEmailAndPassword(auth, correo.trim(), pass);
  await createProfile(c.user.uid, { nombre, correo: correo.trim().toLowerCase(), telefono, whatsapp, consentimientos });
  await setUser(c.user); await whenUserReady();
  return c.user.uid;
}
async function createProfile(uid, { nombre, correo, telefono, whatsapp, consentimientos = null }, roles = {}) {
  const u = { uid, nombre, correo, telefono, whatsapp, consentimientos, telefonoVerificado: true, roles: { cliente: true, repartidor: null, admin: false, ...roles }, estado: "activo", creado: Date.now(), direcciones: [] };
  const batch = FS.writeBatch(fdb);
  batch.set(FS.doc(fdb, "users", uid), u);
  batch.set(FS.doc(fdb, "perfiles", uid), pub(u));
  await batch.commit();
}
export async function signOut() { await startedP; await AU.signOut(auth); }
export async function resetPassword(correo) { await startedP; await AU.sendPasswordResetEmail(auth, correo.trim()); }
