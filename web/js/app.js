/* =========================================================
   RAPIDIN · Aplicación web (paneles de cliente, repartidor y
   administración). Enrutador por #hash, sesión y barra lateral.
   ========================================================= */
import * as S from "./core/store.js";
import * as api from "./core/api.js";
import { getTheme, setTheme, toggleTheme, applyTheme } from "./theme.js";
import { $, $$, esc, toast, initModal, closeModal, firstName, timeAgo, fmtLeft, secondsLeft, avatar, confirmModal, fixBrokenLogos, setPhotoResolver } from "./ui.js";
import { drawMapsIn, initMaps } from "./map.js";
import { CONFIG } from "./config.js";
import { initAuth, openAuth, getSessionUid, setSessionUid, closeAuth } from "./auth.js";
import cliente from "./panels/cliente.js";
import repartidor from "./panels/repartidor.js";
import admin from "./panels/admin.js";
import negocio from "./panels/negocio.js";

const PANELS = { cliente, repartidor, negocio, admin };
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2Z"/><path d="M16 14h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 3 7 3 7H3s3-1 3-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7Z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a4 4 0 0 0 0-8h-4a4 4 0 0 1 0-8h6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2.4.6 4 2.3 4 5.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  store: '<path d="M4 10v10h16V10M3 10l2-6h14l2 6H3Z"/><path d="M9 20v-5h6v5"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  log: '<path d="M6 3h9l4 4v14H6V3Z"/><path d="M9 10h7M9 14h7M9 18h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  moto: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M8.5 16.5h5l3-6h-4M14 6h3l1.5 4.5M5.5 16.5l3-5h4"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/>',
  chat: '<path d="M4 20l1.5-4A8 8 0 1 1 9 19.5L4 20Z"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
};
export const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;

const app = { db: null, uid: null, user: null, panel: null, viewId: null, state: {}, live: new Map(), pending: null };
let raf = 0;
// Fotos de perfil: en producción son URLs de Firebase Storage guardadas en users/{uid}.foto.
setPhotoResolver(id => app.db?.users?.[id]?.foto || null);

export const ctx = {
  get db() { return app.db; }, get user() { return app.user; }, get uid() { return app.uid; }, get state() { return app.state; },
  icon,
  go(hash, state = {}) { app.state = state; if (location.hash === hash) render(); else location.hash = hash; },
  live(key, fn) { app.live.set(key, fn); return `<div data-live="${key}">${fn()}</div>`; },
  rerender: () => render(),
  refresh: () => refreshLive(),
};

/* ---------- Sesión ---------- */
function loadSession() {
  app.db = S.load();
  app.uid = getSessionUid();
  app.user = app.uid ? app.db.users[app.uid] : null;
  if (app.uid && (!app.user || app.user.estado !== "activo")) {
    if (app.user) toast("Tu cuenta fue suspendida. Escríbenos para revisarla.", "bad");
    setSessionUid(null); app.uid = null; app.user = null;
  }
}
export function homeFor(u) {
  if (!u) return "#inicio";
  if (u.roles.admin) return "#admin-resumen";
  if (u.roles.negocio === "aprobado") return "#negocio-pedidos";
  if (u.roles.repartidor === "aprobado") return "#repartidor-disponibles";
  if (u.roles.repartidor === "pendiente") return "#repartidor-postulacion";
  return "#cliente-market";
}
export function logout() {
  setSessionUid(null); app.uid = null; app.user = null; closeModal();
  toast("Cerraste sesión.");
  location.hash = "#inicio";
  updateLandingNav();
}
/** Llamado desde la web pública: abre un panel o pide ingresar primero. */
export function goPanel(hash, reason) {
  loadSession();
  if (!app.user) { app.pending = hash; openAuth("login", { reason }); return; }
  location.hash = hash;
}
export function openAccount(admin = false) {
  loadSession();
  if (app.user && (!admin || app.user.roles.admin)) { location.hash = admin ? "#admin-resumen" : homeFor(app.user); return; }
  if (admin) app.pending = "#admin-resumen";
  openAuth("login", { admin });
}

/* ---------- Soporte por WhatsApp: mensaje automático según el panel y la sección ---------- */
const SOPORTE = {
  negocio: {
    pedidos: () => "necesito ayuda con los pedidos de mi local",
    menu: () => "necesito ayuda con el menú de mi local",
    local: () => "necesito cambiar datos de mi local",
    historial: () => "tengo una consulta sobre las ventas de mi local",
    solicitud: () => "quiero saber sobre la solicitud de mi negocio",
    _: () => "necesito ayuda con mi negocio",
  },
  cliente: {
    pedido: o => `necesito ayuda con mi pedido${o ? ` ${o.codigo}` : ""}`,
    pedidos: () => "tengo una consulta sobre mis pedidos",
    nuevo: () => "necesito ayuda para hacer un pedido",
    market: () => "tengo una consulta sobre los locales del Market",
    tienda: () => "tengo una consulta sobre un local del Market",
    checkout: () => "necesito ayuda para confirmar mi pedido",
    billetera: () => "tengo una consulta sobre mi saldo o una recarga",
    perfil: () => "necesito ayuda con mi cuenta",
    _: () => "necesito ayuda",
  },
  repartidor: {
    entrega: o => `necesito ayuda con la entrega${o ? ` ${o.codigo}` : ""}`,
    asignados: () => "tengo una consulta sobre mis entregas",
    disponibles: () => "tengo una consulta sobre los pedidos disponibles",
    ofertas: () => "tengo una consulta sobre mis ofertas",
    billetera: () => "tengo una consulta sobre mi recarga para comisiones o un retiro",
    condiciones: () => "tengo una consulta sobre las comisiones",
    guia: () => "tengo una consulta sobre la guía de precios",
    proveedor: () => "tengo una consulta sobre la guía de precios",
    postulacion: () => "quiero saber cómo va mi postulación como repartidor",
    perfil: () => "necesito ayuda con mi perfil o mis datos de cobro",
    _: () => "necesito ayuda",
  },
};
function supportHref() {
  const P = app.panel, u = app.user;
  const num = String(CONFIG.soporteWhatsapp || CONFIG.adminWhatsapp || "").replace(/\D/g, "");
  if (!P || !u || !num || !SOPORTE[P.id]) return null;
  const M = SOPORTE[P.id], o = app.state?.id ? app.db?.orders?.[app.state.id] : null;
  const que = (M[app.viewId] || M._)(o);
  const rol = P.id === "negocio" ? `negocio${u.negocioId && app.db?.establishments?.[u.negocioId] ? ` ${app.db.establishments[u.negocioId].nombre}` : ""}` : P.id === "cliente" ? "cliente" : "repartidor";
  const txt = `Hola, soporte RAPIDIN. Soy ${u.nombre} (${rol}${u.correo ? `, ${u.correo}` : ""}) y ${que}: `;
  return `https://wa.me/51${num}?text=${encodeURIComponent(txt)}`;
}

/* ---------- Enrutador ---------- */
function parse() {
  const h = location.hash.slice(1);
  const i = h.indexOf("-");
  return i < 0 ? { panel: h, view: "" } : { panel: h.slice(0, i), view: h.slice(i + 1) };
}
function route() {
  const { panel } = parse();
  if (!PANELS[panel]) return exitApp();
  loadSession();
  if (!app.user) { app.pending = location.hash; exitApp(); history.replaceState(null, "", "#inicio"); openAuth("login"); return; }
  // Firebase: espera a saber el rol (admin, repartidor, cliente) antes de decidir el acceso.
  if (S.IS_FB && !S.fbs.isUserReady()) { S.fbs.whenUserReady().then(route); return; }
  const P = PANELS[panel];
  if (!P.allowed(app.user)) { toast("Tu cuenta no tiene acceso a esa sección.", "bad"); location.hash = homeFor(app.user); return; }
  enterApp();
  render();
}
/** Altura real de la cabecera del panel: las barras fijas (secciones del local) se pegan justo debajo, sin rendijas. */
function syncTopbarH() { const t = document.querySelector("#app .topbar"); if (t) document.documentElement.style.setProperty("--tb-h", `${Math.round(t.getBoundingClientRect().height)}px`); }
addEventListener("resize", () => requestAnimationFrame(syncTopbarH));
/** Cada sección se abre desde arriba (también al volver a tocar la misma en el menú). */
function toTop() { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); const c = $("#appContent"); if (c) c.scrollTop = 0; }
document.addEventListener("click", e => {
  const a = e.target.closest?.(".side-link, .bottom-nav a"); if (!a) return;
  if (a.getAttribute("href") === location.hash) { e.preventDefault(); toTop(); $("#side")?.classList.remove("open"); }
});
function enterApp() {
  if (!document.body.classList.contains("in-app")) { document.body.classList.add("in-app"); $("#app").hidden = false; window.scrollTo(0, 0); applyTheme(); }
}
function exitApp() {
  document.body.classList.remove("in-app"); $("#app").hidden = true; applyTheme();
  updateLandingNav();
}

/* ---------- Render ---------- */
function render() {
  loadSession();
  if (!app.user) return route();
  const { panel, view } = parse();
  const P = PANELS[panel];
  if (!P) return;
  let viewId = view && P.views[view] ? view : P.defaultView(app.user, app.db);
  const resolved = P.resolve?.(viewId, app.user, app.db);
  if (resolved && resolved !== viewId) { history.replaceState(null, "", `#${panel}-${resolved}`); viewId = resolved; }
  app.panel = P; app.viewId = viewId;
  const V = P.views[viewId];
  const viewKey = `${P.id}-${viewId}`, newView = app.lastView !== viewKey; app.lastView = viewKey;
  app.live = new Map();
  renderShell(P, viewId, V);
  syncTopbarH();
  const content = $("#appContent");
  content.innerHTML = V.render(ctx);
  content.dataset.view = `${P.id}-${viewId}`;
  $$("[data-live]", content).forEach(el => { const fn = app.live.get(el.dataset.live); if (fn) el._html = fn(); });
  drawMapsIn(content);
  V.mount?.(content, ctx);
  fixBrokenLogos(content);
  tickCountdowns();
  document.title = `${V.title} · RAPIDIN`;
  if (newView) toTop();
  setTimeout(fixConfigOnce, 300);
}
function renderShell(P, viewId, V) {
  const u = app.user, db = app.db;
  const unread = notifList(db, u).filter(n => !n.leida).length;
  const nav = P.nav(u, db).map(it => `<a class="side-link${it.id === viewId || V.parent === it.id ? " on" : ""}" href="#${P.id}-${it.id}">${icon(it.icon)}<span>${esc(it.label)}</span>${it.badge ? `<b class="badge">${it.badge}</b>` : ""}</a>`).join("");
  const others = Object.values(PANELS).filter(p => p !== P && p.allowed(u) && p.switchable?.(u) !== false);
  $("#app").innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <a class="side-logo" href="#inicio" aria-label="Ir a la web pública">
        <img class="logo-img" src="assets/rap.png" alt="" width="34" height="34" hidden>
        <span class="logo-word">RAPID<b>IN</b></span>
      </a>
      <div class="side-label">${esc(P.label)}</div>
      <nav class="side-nav" aria-label="${esc(P.label)}">${nav}</nav>
      <div class="side-foot">
        ${SOPORTE[P.id] ? `<button type="button" class="side-switch side-support" data-support>${icon("chat")} Soporte por WhatsApp</button>` : ""}
        ${others.map(p => `<a class="side-switch" href="${p.home(u, db)}">${icon(p.icon)} Ir a ${esc(p.label.toLowerCase())}</a>`).join("")}
        <a class="side-switch" href="#inicio">${icon("home")} Web pública</a>
      </div>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <button class="icon-btn only-mobile" type="button" id="sideToggle" aria-label="Abrir menú">${icon("menu")}</button>
        <div class="top-title"><span class="top-crumb">${esc(P.label)}</span><h1>${esc(V.title)}</h1></div>
        ${S.IS_FB ? "" : `<span class="demo-pill" title="Modo de prueba local: los datos se guardan solo en este navegador">Prueba local</span>`}
        <button class="icon-btn theme-btn" type="button" id="themeBtn" aria-label="Cambiar tema claro u oscuro" title="Tema claro / oscuro"><svg class="ic ic-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg><svg class="ic ic-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
        ${SOPORTE[P.id] ? `<button class="icon-btn sup-btn" type="button" data-support aria-label="Soporte por WhatsApp" title="Soporte por WhatsApp"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.2A8.5 8.5 0 1 1 20.5 11.6Z"/><path d="M9 8.6c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .5.5.9 1.3 1.7 2.3 2.2.2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.6-.1l1.6.7c.3.1.4.3.4.5 0 .5-.2 1.3-1 1.6-.7.3-1.9.4-3.7-.5a8.3 8.3 0 0 1-3.6-3.9c-.6-1.3-.4-2.3-.1-2.9Z"/></svg></button>` : ""}
        <div class="notif-wrap">
          <button class="icon-btn" type="button" id="bellBtn" aria-label="Notificaciones${unread ? `: ${unread} sin leer` : ""}" aria-expanded="false">${icon("bell")}${unread ? `<b class="dot">${unread > 9 ? "9+" : unread}</b>` : ""}</button>
          <div class="notif-pop" id="notifPop" hidden></div>
        </div>
        <button class="user-chip" type="button" id="userBtn" aria-expanded="false">${avatar(u.uid, u.nombre)}<span>${esc(firstName(u.nombre))}</span></button>
        <div class="user-pop" id="userPop" hidden>
          <div class="up-head"><b>${esc(u.nombre)}</b><span>${esc(u.correo)}</span></div>
          <a href="${u.roles.cliente ? "#cliente-perfil" : u.roles.repartidor === "aprobado" ? "#repartidor-perfil" : homeFor(u)}">${icon("user")} Mi perfil</a>
          <a href="#inicio">${icon("home")} Web pública</a>
          ${SOPORTE[P.id] ? `<button type="button" data-support>${icon("chat")} Soporte por WhatsApp</button>` : ""}
          <div class="up-theme" role="radiogroup" aria-label="Tema">${[["light", "Claro"], ["dark", "Oscuro"], ["system", "Sistema"]].map(([k, l]) => `<button type="button" data-theme-set="${k}" aria-pressed="${getTheme() === k}">${l}</button>`).join("")}</div>
          ${S.IS_FB ? "" : `<button type="button" id="resetBtn">${icon("refresh")} Restablecer datos de prueba</button>`}
          <button type="button" id="logoutBtn">${icon("out")} Cerrar sesión</button>
        </div>
      </header>
      <main class="content" id="appContent" tabindex="-1"></main>
    </div>
    <nav class="bottom-nav" aria-label="Accesos rápidos">${P.nav(u, db).slice(0, 4).map(it => `<a class="${it.id === viewId || V.parent === it.id ? "on" : ""}" href="#${P.id}-${it.id}">${icon(it.icon)}<span>${esc(it.short || it.label)}</span>${it.badge ? `<b class="badge">${it.badge}</b>` : ""}</a>`).join("")}</nav>
    <div class="side-scrim" id="sideScrim"></div>
  </div>`;
  const img = $(".side-logo .logo-img");
  img.addEventListener("load", () => { img.hidden = false; });
  if (img.complete && img.naturalWidth) img.hidden = false;
}

/* Datos nuevos: solo se actualizan las zonas «en vivo» y los contadores, sin borrar lo que el usuario escribe. */
function refreshChrome() {
  const P = app.panel, V = P?.views[app.viewId], u = app.user, db = app.db;
  if (!P || !V) return;
  const items = P.nav(u, db);
  $$(".side-link").forEach(a => { const it = items.find(i => a.getAttribute("href") === `#${P.id}-${i.id}`); const b = a.querySelector(".badge"); const val = it?.badge || ""; if (b && !val) b.remove(); else if (val) { if (b) b.textContent = val; else a.insertAdjacentHTML("beforeend", `<b class="badge">${val}</b>`); } });
  $$(".bottom-nav a").forEach(a => { const it = items.find(i => a.getAttribute("href") === `#${P.id}-${i.id}`); const b = a.querySelector(".badge"); const val = it?.badge || ""; if (b && !val) b.remove(); else if (val) { if (b) b.textContent = val; else a.insertAdjacentHTML("beforeend", `<b class="badge">${val}</b>`); } });
  const unread = notifList(db, u).filter(n => !n.leida).length;
  const bell = $("#bellBtn");
  if (bell) { const d = bell.querySelector(".dot"); if (!unread) d?.remove(); else if (d) d.textContent = unread > 9 ? "9+" : unread; else bell.insertAdjacentHTML("beforeend", `<b class="dot">${unread > 9 ? "9+" : unread}</b>`); }
}
function refreshLive(scope = $("#appContent")) {
  if (!scope) return;
  const V = app.panel?.views[app.viewId];
  app.live.forEach((fn, key) => {
    const el = scope.querySelector(`[data-live="${key}"]`);
    if (!el) return;
    const act = document.activeElement;
    if (el.contains(act) && /INPUT|TEXTAREA|SELECT/.test(act.tagName)) return;
    const html = fn();
    if (el._html === html) return;
    el._html = html; el.innerHTML = html;
    drawMapsIn(el); fixBrokenLogos(el);
    V?.afterLive?.(el, key, ctx);
  });
}
/* Una sola vez: en Firebase cargado antes de esta versión, deja encendidos el Saldo RAPIDIN y los retiros (como en el diseño original). */
/* Primera vez que el admin entra con Firebase: registra solo los datos iniciales (configuración, Puerto en Llamas y su carta).
   No se repite: si después eliminas o cambias el local, se respeta. */
let seedDone = false;
function autoSeedOnce() {
  if (seedDone || !S.IS_FB || !app.user?.roles?.admin || !S.fbs.publicReady()) return;
  seedDone = true;
  const db = S.load(), data = S.initialData();
  if (db.config.sembrado) return;
  const falta = Object.keys(data.establishments).some(id => !db.establishments[id]);
  if (db.metaLoaded && !falta) return;
  try { api.seedInitialData(app.uid, data); toast("Registramos en tu Firestore la configuración, Puerto en Llamas y su carta."); } catch (e) { seedDone = false; }
}
let cfgFixed = false;
function fixConfigOnce() {
  autoSeedOnce();
  if (cfgFixed || !S.IS_FB || !app.user?.roles?.admin) return;
  const db = S.load(); if (!db.metaLoaded) return;
  cfgFixed = true;
  if (db.config.cfgSaldo >= 2) return;
  try { api.updatePlatformConfig(app.uid, { saldoClienteHabilitado: true, retirosHabilitados: true, cfgSaldo: 2 }); } catch (e) { cfgFixed = false; }
}
function onData() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (!document.body.classList.contains("in-app")) { updateLandingNav(); return; }
    const had = !!app.user;
    loadSession();
    if (!app.user) { if (had) location.hash = "#inicio"; return; }
    if (S.IS_FB && !S.fbs.isUserReady()) return;
    const { panel } = parse();
    if (PANELS[panel] && !PANELS[panel].allowed(app.user)) { location.hash = homeFor(app.user); return; }
    // Si cambió el estado de la cuenta (por ejemplo, postulación aprobada), la vista puede pedir un cambio.
    const P = app.panel, want = P?.resolve?.(app.viewId, app.user, app.db);
    if (want && want !== app.viewId) { location.hash = `#${P.id}-${want}`; return; }
    fixConfigOnce();
    refreshChrome();
    refreshLive();
    tickCountdowns();
  });
}

function tickCountdowns() {
  $$("[data-left]").forEach(el => {
    const t = +el.dataset.left;
    el.textContent = fmtLeft(t);
    el.classList.toggle("expired", !secondsLeft(t));
    el.classList.toggle("soon", secondsLeft(t) > 0 && secondsLeft(t) < 20);
  });
  $$("[data-ago]").forEach(el => { el.textContent = timeAgo(+el.dataset.ago); });
}

/* ---------- Eventos globales de la app ---------- */
function bindAppEvents() {
  document.addEventListener("rapidin:rerender", () => { if (document.body.classList.contains("in-app") && app.user) render(); });
  const root = $("#app");
  root.addEventListener("click", e => {
    const t = e.target;
    if (t.closest("#sideToggle")) { $("#side").classList.toggle("open"); return; }
    if (t.closest("#sideScrim") || t.closest(".side-link")) $("#side")?.classList.remove("open");
    if (t.closest("#themeBtn")) { toggleTheme(); $$("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeSet === getTheme()))); return; }
    const ts = t.closest("[data-theme-set]"); if (ts) { setTheme(ts.dataset.themeSet); $$("[data-theme-set]").forEach(b => b.setAttribute("aria-pressed", String(b === ts))); return; }
    if (t.closest("#bellBtn")) { toggleNotif(); return; }
    if (t.closest("#userBtn")) { const p = $("#userPop"); p.hidden = !p.hidden; $("#userBtn").setAttribute("aria-expanded", String(!p.hidden)); return; }
    if (t.closest("[data-support]")) { const h = supportHref(); if (h) window.open(h, "_blank", "noopener"); else toast("No pudimos abrir el soporte.", "bad"); return; }
    if (t.closest("#logoutBtn")) return logout();
    if (t.closest("#resetBtn")) return confirmModal("Restablecer datos de prueba", "Se borran los pedidos, cuentas y movimientos creados en este navegador (modo de prueba local). Tu sesión se cerrará.", "Restablecer", () => { S.reset(); logout(); }, "danger");
    const n = t.closest("[data-notif]");
    if (n) { openNotif(n.dataset.notif); return; }
    if (!t.closest(".notif-wrap")) { const p = $("#notifPop"); if (p) p.hidden = true; }
    if (!t.closest("#userPop") && !t.closest("#userBtn")) { const p = $("#userPop"); if (p) p.hidden = true; }
    const a = t.closest("[data-act]");
    if (a && root.contains(a)) {
      const V = app.panel?.views[app.viewId];
      const fn = V?.actions?.[a.dataset.act] || app.panel?.actions?.[a.dataset.act];
      if (fn) { e.preventDefault(); fn(a, ctx, e); }
    }
  });
  root.addEventListener("submit", e => {
    const f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    const V = app.panel?.views[app.viewId];
    V?.forms?.[f.dataset.form]?.(f, ctx, e);
  });
  root.addEventListener("change", e => {
    const V = app.panel?.views[app.viewId];
    const el = e.target.closest("[data-change]");
    if (el) V?.changes?.[el.dataset.change]?.(el, ctx, e);
  });
  root.addEventListener("input", e => {
    const V = app.panel?.views[app.viewId];
    const el = e.target.closest("[data-input]");
    if (el) V?.inputs?.[el.dataset.input]?.(el, ctx, e);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { $("#side")?.classList.remove("open"); const p = $("#notifPop"); if (p) p.hidden = true; } });
}
/** Avisos del usuario + bandeja compartida de administradores. */
function notifList(db, u) {
  if (!u) return [];
  const own = db.notifications[u.uid] || [];
  return u.roles.admin ? [...own, ...(db.notifications[api.ADMINS] || [])].sort((a, b) => b.t - a.t) : own;
}
function toggleNotif() {
  const p = $("#notifPop"); if (!p) return;
  if (!p.hidden) { p.hidden = true; return; }
  const list = notifList(app.db, app.user);
  p.innerHTML = `<div class="np-head"><b>Notificaciones</b>${list.some(n => !n.leida) ? `<span>${list.filter(n => !n.leida).length} nuevas</span>` : ""}</div>
    ${list.length ? `<ul>${list.slice(0, 15).map(n => `<li><button type="button" class="${n.leida ? "" : "unread"}" data-notif="${n.id}"><span>${esc(n.texto)}</span><small data-ago="${n.t}">${timeAgo(n.t)}</small></button></li>`).join("")}</ul>` : `<p class="np-empty">No tienes notificaciones todavía.</p>`}`;
  p.hidden = false;
  $("#bellBtn").setAttribute("aria-expanded", "true");
  if (list.some(n => !n.leida)) setTimeout(() => api.markNotificationsRead(app.uid), 1200);
}
function openNotif(id) {
  const n = notifList(app.db, app.user).find(x => x.id === id);
  $("#notifPop").hidden = true;
  if (!n?.orderId) return;
  const o = app.db.orders[n.orderId];
  if (!o) return;
  if (o.clienteId === app.uid && app.user.roles.cliente) ctx.go("#cliente-pedido", { id: o.id });
  else if (o.courierId === app.uid) ctx.go("#repartidor-entrega", { id: o.id });
  else if (app.user.roles.repartidor === "aprobado" && api.OPEN_STATES.includes(o.estado)) ctx.go("#repartidor-disponibles", { focus: o.id });
  else if (app.user.roles.admin) ctx.go("#admin-pedido", { id: o.id });
}

/* ---------- Botón de cuenta en la web pública ---------- */
export function updateLandingNav() {
  const b = $("#navAccount"); if (!b) return;
  const uid = getSessionUid(); const u = uid ? S.load().users[uid] : null;
  if (u) { b.innerHTML = `<span class="acc-dot">${esc(u.nombre.split(" ").slice(0, 2).map(w => w[0]).join(""))}</span><span class="acc-t">Mi panel</span>`; b.classList.add("logged"); b.setAttribute("aria-label", `Abrir el panel de ${u.nombre}`); }
  else { b.textContent = "Ingresar"; b.removeAttribute("aria-label"); b.classList.remove("logged"); }
}

/* ---------- Inicio ---------- */
export async function initApp() {
  initModal();
  if (S.IS_FB) {
    const boot = document.createElement("div");
    boot.className = "boot"; boot.innerHTML = `<span class="boot-spin" aria-hidden="true"></span><b>Conectando…</b>`;
    boot.setAttribute("role", "status");
    const slow = setTimeout(() => { boot.querySelector("b").textContent = "Está tardando más de lo normal. Revisa tu conexión."; }, 12000);
    if (/^#(cliente|repartidor|admin)/.test(location.hash)) document.body.appendChild(boot);
    try { await S.start(e => toast(e?.code === "permission-denied" ? "No tienes permiso para guardar ese cambio." : "No pudimos guardar el cambio. Revisa tu conexión e intenta de nuevo.", "bad")); }
    catch (e) { console.error(e); clearTimeout(slow); boot.querySelector("b").textContent = "No pudimos conectar con RAPIDIN. Revisa tu internet y recarga la página."; document.body.appendChild(boot); return; }
    clearTimeout(slow); boot.remove();
    if (S.fbs.adminPending()) setTimeout(() => toast("Tu cuenta es de administrador, pero falta publicar las reglas nuevas en Firestore (Firestore Database → Reglas → Publicar). Luego recarga la página.", "bad"), 400);
  }
  S.load();
  initAuth({
    onLogin: (uid, opts) => {
      const u = S.load().users[uid];
      if (!u) { toast("No pudimos cargar tu cuenta. Revisa tu conexión y vuelve a ingresar.", "bad"); return; }
      if (S.IS_FB && S.fbs.adminPending()) toast("Tu cuenta es de administrador, pero falta publicar las reglas nuevas en Firestore (Firestore Database → Reglas → Publicar). Luego vuelve a ingresar.", "bad");
      else toast(`Hola, ${firstName(u.nombre)}.`);
      const target = app.pending || (opts.admin ? "#admin-resumen" : homeFor(u));
      app.pending = null;
      const P = PANELS[target.slice(1).split("-")[0]];
      location.hash = P && !P.allowed(u) ? homeFor(u) : target;
      if (location.hash === target) route();
      updateLandingNav();
    },
  });
  $("#dlgLogin").addEventListener("close", () => { if (!getSessionUid()) app.pending = null; });
  bindAppEvents();
  S.subscribe(onData);
  window.addEventListener("hashchange", () => { closeModal(); document.body.classList.remove("chat-on", "sheet-on"); $("#catSheet")?.remove(); route(); });
  window.addEventListener("resize", () => { const c = $("#appContent"); if (c) drawMapsIn(c); });
  setInterval(() => { tickCountdowns(); try { api.runScheduled(app.uid); } catch (e) { /* reintenta en el próximo segundo */ } }, 1000);
  // Google Maps se activa solo si hay API key en config.js; si falla, sigue el mapa referencial.
  initMaps(CONFIG, () => { if (document.body.classList.contains("in-app")) render(); });
  updateLandingNav();
  route();
}
export { closeAuth };
