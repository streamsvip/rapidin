/* =========================================================
   RAPIDIN · Textos legales y aviso de cookies
   Términos y condiciones, Política de privacidad (Ley N.º 29733)
   y Política de cookies. Se abren en una ventana con pestañas
   desde el pie de página, el registro y el aviso de cookies.
   ========================================================= */
import { CONFIG } from "./config.js";

export const LEGAL_VERSION = "2026-11-27.2";
const FECHA = "27 de noviembre de 2026";
const $ = (s, r = document) => r.querySelector(s);
const WA = String(CONFIG.soporteWhatsapp || CONFIG.adminWhatsapp || "").replace(/\D/g, "");
const WA_TXT = WA.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");

const DOCS = {
  terminos: {
    t: "Términos y condiciones",
    h: `
<p class="lg-intro">Estos términos regulan el uso de la web y las apps de RAPIDIN en Camaná, Arequipa, Perú. Al crear una cuenta o hacer un pedido los aceptas.</p>
<h4>1. Qué es RAPIDIN</h4>
<p>RAPIDIN es una plataforma que conecta a clientes con repartidores independientes y con locales de Camaná. Los repartidores ofrecen el precio del envío y el cliente elige la oferta que prefiere. RAPIDIN no vende los productos de los locales ni es empleador de los repartidores.</p>
<h4>2. Quién puede usarla</h4>
<p>Debes ser <b>mayor de 18 años</b> y dar datos verdaderos (nombre, celular y correo). Eres responsable de lo que se haga con tu cuenta y de mantener tu contraseña en reserva. Por ahora el servicio funciona <b>solo dentro de la zona de cobertura de Camaná</b>.</p>
<h4>3. Precios, tiempos y disponibilidad</h4>
<ul>
<li>Los precios de los productos los fija cada local. El precio del envío lo propone el repartidor en su oferta y lo ves antes de aceptar.</li>
<li><b>Los tiempos de entrega son estimados</b> y pueden variar por tráfico, clima, demora del local, cambios de dirección u otras causas ajenas a RAPIDIN.</li>
<li>La disponibilidad de productos puede cambiar. Si falta algo o cambia un precio en una compra libre, el repartidor debe pedirte autorización antes de continuar.</li>
<li>Las distancias y ubicaciones en el mapa son referenciales.</li>
</ul>
<h4>4. Pagos</h4>
<ul>
<li><b>Envío y compras libres:</b> pagas al repartidor en efectivo, Yape, Plin o Lemon (o con saldo RAPIDIN cuando esté activo). En pagos digitales tocas «Ya pagué» y el repartidor confirma que recibió el dinero.</li>
<li><b>Pedidos a locales con panel en RAPIDIN:</b> los productos se pagan <b>directo al local</b> por Yape, Plin o Lemon antes de que el local acepte el pedido. Por ahora estos locales no reciben efectivo ni saldo RAPIDIN. Al repartidor solo le pagas el envío. RAPIDIN no recibe ni administra el dinero de los productos.</li>
<li>Verifica siempre el nombre del titular y el número antes de transferir.</li>
</ul>
<h4>5. Cancelaciones</h4>
<ul>
<li><b>Compra libre o local sin panel:</b> puedes cancelar mientras el repartidor no haya llegado al local. Desde que está en el local comprando o esperando tu pedido, o ya lo lleva, el pedido no se puede cancelar.</li>
<li><b>Local con panel:</b> puedes cancelar solo mientras el local no haya aceptado tu pedido. Si cancelas después de pagar, o si el local rechaza el pedido, el local te devuelve el dinero por el mismo medio. Una vez aceptado, el local empieza a prepararlo y ya no se puede cancelar.</li>
<li>Si un pedido ya pagado al local no consigue repartidor, el equipo de RAPIDIN te contacta para coordinar la entrega o el reembolso con el local.</li>
<li>Una vez recogido, el pedido solo puede revisarse mediante un reporte.</li>
</ul>
<h4>5.1 Reportes y bloqueo de cuentas</h4>
<p>Clientes y repartidores pueden reportarse entre sí desde el pedido (por ejemplo: no recibió el pedido, dirección falsa, no pagó, cobro incorrecto o trato inadecuado). El equipo de RAPIDIN revisa cada reporte, contacta a las partes y puede suspender o bloquear la cuenta que incumpla estos términos. También puedes escribirnos por WhatsApp al <b>${WA_TXT}</b>.</p>
<h4>6. Uso correcto</h4>
<p>Está prohibido pedir o transportar productos ilegales, armas, drogas, animales vivos sin las condiciones adecuadas o cualquier cosa peligrosa. También está prohibido usar la plataforma para fraudes, acoso o suplantación. Podemos suspender cuentas que incumplan estos términos.</p>
<h4>7. Repartidores y locales</h4>
<p>Los repartidores son verificados antes de trabajar y pagan a RAPIDIN una comisión por cada pedido entregado. Los locales son responsables de la calidad, el estado, el empaque y el precio de sus productos.</p>
<p>Los locales que administran su negocio en RAPIDIN (Panel de negocio) se registran con una cuenta propia y son aprobados por RAPIDIN. Se comprometen a confirmar solo pagos realmente recibidos, a mantener su menú, precios, horario y disponibilidad actualizados y a devolver el dinero de los pedidos que no acepten o que se cancelen antes de aceptarlos.</p>
<h4>8. Responsabilidad</h4>
<p>RAPIDIN responde por el funcionamiento de la plataforma. No responde por demoras o fallas causadas por terceros (locales, operadores de pago, conexión a internet) ni por la calidad de los productos de los locales, sin perjuicio de los derechos que te reconoce el Código de Protección y Defensa del Consumidor (Ley N.º 29571).</p>
<h4>9. Cambios</h4>
<p>Podemos actualizar estos términos. Te avisaremos en la web o en la app y, si el cambio es importante, te pediremos aceptarlo de nuevo.</p>
<p class="lg-date">Última actualización: ${FECHA}.</p>`,
  },
  privacidad: {
    t: "Política de privacidad",
    h: `
<p class="lg-intro">En RAPIDIN cuidamos tus datos personales conforme a la Ley N.º 29733, Ley de Protección de Datos Personales, y su reglamento.</p>
<h4>1. Qué datos usamos</h4>
<ul>
<li><b>Cuenta:</b> nombre, correo, celular, WhatsApp y foto de perfil si la subes.</li>
<li><b>Pedidos:</b> direcciones y ubicación de entrega, productos, montos, medios de pago elegidos y mensajes del chat del pedido.</li>
<li><b>Repartidores:</b> además, DNI, licencia y vehículo para verificar su identidad, y su ubicación solo mientras atienden un pedido.</li>
<li><b>Técnicos:</b> datos guardados en tu navegador para mantener tu sesión, tu carrito y tus preferencias (ver Política de cookies).</li>
</ul>
<h4>2. Para qué los usamos</h4>
<p>Para crear y entregar tus pedidos, mostrar tu nombre y ubicación de entrega al repartidor que aceptes, procesar pagos y comisiones, darte soporte, prevenir fraudes y cumplir obligaciones legales. Solo con tu permiso te enviaremos promociones.</p>
<h4>3. Con quién se comparten</h4>
<p>Tu celular y tu dirección solo los ve el repartidor que aceptas, y solo para ese pedido. Si pides a un local con panel, ese local ve tu nombre y tu pedido para verificar tu pago. Usamos proveedores tecnológicos (Google Firebase para cuentas y datos, y Google Maps para mapas) que procesan la información por encargo de RAPIDIN. No vendemos tus datos.</p>
<h4>4. Cuánto tiempo</h4>
<p>Mientras tengas tu cuenta y, después, solo el tiempo que exijan las normas contables, tributarias o de defensa del consumidor. La ubicación en vivo del repartidor se deja de compartir al terminar el pedido.</p>
<h4>5. Tus derechos</h4>
<p>Puedes pedir acceso, rectificación, cancelación u oposición al uso de tus datos escribiéndonos por WhatsApp al <b>${WA_TXT}</b>. Respondemos dentro de los plazos de ley. Si no estás conforme, puedes acudir a la Autoridad Nacional de Protección de Datos Personales.</p>
<h4>6. Menores de edad</h4>
<p>RAPIDIN es solo para mayores de 18 años. Si detectamos una cuenta de un menor, la cerraremos.</p>
<p class="lg-date">Última actualización: ${FECHA}.</p>`,
  },
  cookies: {
    t: "Política de cookies",
    h: `
<p class="lg-intro">Usamos cookies y el almacenamiento de tu navegador para que RAPIDIN funcione y, si lo aceptas, para entender cómo se usa.</p>
<h4>Necesarias (siempre activas)</h4>
<p>Mantienen tu sesión, tu carrito, el tema claro u oscuro y tu elección sobre cookies. Sin ellas la web no funciona.</p>
<h4>Analítica (opcional)</h4>
<p>Nos dirían qué secciones se usan más para mejorar el servicio, de forma agregada. Hoy no las usamos; si las activamos, solo funcionarán si las aceptaste.</p>
<h4>Promociones (opcional)</h4>
<p>Permitirían mostrarte ofertas de locales de Camaná según lo que te interesa. Solo con tu permiso.</p>
<h4>Cómo cambiar tu elección</h4>
<p>En cualquier momento desde «Preferencias de cookies» al pie de la página. También puedes borrar los datos del sitio desde tu navegador.</p>
<p class="lg-date">Última actualización: ${FECHA}.</p>`,
  },
};

/** Abre la ventana legal en la pestaña indicada ("terminos" | "privacidad" | "cookies"). */
export function openLegal(which = "terminos") {
  const d = $("#dlgLegal"); if (!d) return;
  const k = DOCS[which] ? which : "terminos";
  $("#dlgLegalT").textContent = "Información legal";
  $("#legalBody").innerHTML = `<div class="lg-tabs" role="tablist">${Object.entries(DOCS).map(([id, v]) => `<button type="button" role="tab" data-lg="${id}" aria-selected="${id === k}">${v.t}</button>`).join("")}</div>
    <article class="lg-doc">${DOCS[k].h}</article>`;
  $("#legalBody").onclick = e => { const b = e.target.closest("[data-lg]"); if (b) openLegal(b.dataset.lg); };
  if (!d.open) d.showModal ? d.showModal() : d.setAttribute("open", "");
  $(".lg-doc", d)?.scrollTo?.(0, 0); d.querySelector(".dlg-body")?.scrollTo?.(0, 0);
}

/* ---------- Aviso de cookies ---------- */
const CK = "rapidin.cookies";
export function cookieChoice() { try { return JSON.parse(localStorage.getItem(CK) || "null"); } catch (e) { return null; } }
function saveChoice(analitica, promociones) {
  try { localStorage.setItem(CK, JSON.stringify({ v: LEGAL_VERSION, necesarias: true, analitica, promociones, t: Date.now() })); } catch (e) {}
  $("#ckBanner")?.remove(); syncHeight();
}
export function openCookieSettings() { showBanner(true); }
/** Mientras el aviso está visible, la barra «Ver mi pedido» sube para no quedar tapada. */
function syncHeight() { const el = $("#ckBanner"); document.documentElement.style.setProperty("--ck-h", el ? `${el.offsetHeight + 12}px` : "0px"); }
window.addEventListener("resize", syncHeight);
function showBanner(settings = false) {
  $("#ckBanner")?.remove();
  const c = cookieChoice() || {};
  const el = document.createElement("section");
  el.id = "ckBanner"; el.className = "ck"; el.setAttribute("aria-label", "Preferencias de cookies"); el.setAttribute("role", "region");
  el.innerHTML = `<div class="ck-in">
    <div class="ck-txt"><b>🍪 Tu privacidad importa</b>
      <p>Usamos cookies necesarias para que RAPIDIN funcione (sesión, carrito y preferencias) y, solo si lo aceptas, cookies de analítica y promociones. <button type="button" class="link" data-ck="leer">Política de cookies</button></p></div>
    <div class="ck-set" ${settings ? "" : "hidden"}>
      <label class="ck-row"><span><b>Necesarias</b><small>Siempre activas</small></span><input type="checkbox" checked disabled></label>
      <label class="ck-row"><span><b>Analítica</b><small>Nos ayuda a mejorar el servicio</small></span><input type="checkbox" id="ckA" ${c.analitica ? "checked" : ""}></label>
      <label class="ck-row"><span><b>Promociones</b><small>Ofertas de locales de Camaná</small></span><input type="checkbox" id="ckP" ${c.promociones ? "checked" : ""}></label>
    </div>
    <div class="ck-btns">
      ${settings ? `<button type="button" class="btn small ghost-dark" data-ck="guardar">Guardar mi elección</button>` : `<button type="button" class="btn small ghost-dark" data-ck="config">Configurar</button><button type="button" class="btn small ghost-dark" data-ck="nec">Solo necesarias</button>`}
      <button type="button" class="btn small" data-ck="todas">Aceptar todas</button>
    </div></div>`;
  document.body.appendChild(el);
  syncHeight();
  el.addEventListener("click", e => {
    const b = e.target.closest("[data-ck]"); if (!b) return;
    const a = b.dataset.ck;
    if (a === "leer") return openLegal("cookies");
    if (a === "config") return showBanner(true);
    if (a === "nec") return saveChoice(false, false);
    if (a === "todas") return saveChoice(true, true);
    if (a === "guardar") return saveChoice(!!$("#ckA", el)?.checked, !!$("#ckP", el)?.checked);
  });
}
export function initCookies() {
  const c = cookieChoice();
  if (!c || c.v !== LEGAL_VERSION) showBanner(false);
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-legal-open]"); if (b) { e.preventDefault(); openLegal(b.dataset.legalOpen); }
    if (e.target.closest("[data-cookie-settings]")) { e.preventDefault(); openCookieSettings(); }
  });
}
