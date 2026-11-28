/* =========================================================
   RAPIDIN · Ingreso, registro y recuperación de contraseña
   Firebase Authentication (correo y contraseña) + perfil en
   Firestore users/{uid}. Al registrarse se guardan los
   consentimientos (mayor de edad, términos, tiempos estimados).
   En el modo de prueba local (solo localhost) hay cuentas de prueba.
   ========================================================= */
import * as api from "./core/api.js";
import { load, TEST_ACCOUNTS, DEMO_PASSWORD, IS_FB, fbs } from "./core/store.js";
import { $, $$, esc, fmtPhone, normPhone, toast } from "./ui.js";
import { openLegal, LEGAL_VERSION, cookieChoice } from "./legal.js";

const IC = {
  user: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.6A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
};
const ic = n => `<svg class="fi-ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

const KEY = "rapidin.session";
let memorySession = null;
let onLogin = () => {};
let resendTimer = 0, pendingCode = "", ctxOpts = {};

export function getSessionUid() {
  if (IS_FB) return fbs.currentUid();
  try { const v = sessionStorage.getItem(KEY); if (v) return v; } catch (e) { /* sin almacenamiento */ }
  return memorySession;
}
export function setSessionUid(uid) {
  if (IS_FB) { if (!uid) fbs.signOut().catch(() => {}); return; }
  memorySession = uid;
  try { uid ? sessionStorage.setItem(KEY, uid) : sessionStorage.removeItem(KEY); } catch (e) { /* queda en memoria */ }
}
export function initAuth(opts) { onLogin = opts.onLogin; $("#dlgLogin").addEventListener("close", () => clearInterval(resendTimer)); }

function dlgOpen() { const d = $("#dlgLogin"); if (!d.open) d.showModal ? d.showModal() : d.setAttribute("open", ""); }
export function closeAuth() { const d = $("#dlgLogin"); if (d.open) d.close ? d.close() : d.removeAttribute("open"); }

/** view: "login" | "register" | "verify"; opts: { reason, admin, uid } */
export function openAuth(view = "login", opts = {}) { ctxOpts = { ...ctxOpts, ...opts }; render(view); dlgOpen(); }

function finish(uid) { closeAuth(); const o = ctxOpts; ctxOpts = {}; onLogin(uid, o); }

function render(view) {
  const body = $("#authBody"), o = ctxOpts;
  clearInterval(resendTimer);
  $("#dlgLoginT").textContent = o.admin ? "Acceso administrativo" : { register: "Crea tu cuenta", verify: "Verifica tu celular", forgot: "Recupera tu contraseña" }[view] || "Ingresa a tu cuenta";

  if (view === "forgot") {
    $("#authSub").textContent = "Te enviaremos un enlace a tu correo.";
    body.innerHTML = `
      ${IS_FB ? "" : `<span class="demo-tag">Prueba local: no se envía ningún correo</span>`}
      <p class="muted" style="margin-bottom:16px">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
      <form id="fgForm" novalidate>
        <div class="f"><label for="fgMail">Correo electrónico</label><input class="in" id="fgMail" type="email" autocomplete="email"></div>
        <p class="err" id="fgErr" role="alert"></p>
        <button class="btn" type="submit" style="width:100%;justify-content:center">Enviar enlace</button>
        <p class="muted" style="margin-top:14px;text-align:center"><button type="button" class="link" id="fgBack">Volver a ingresar</button></p>
      </form>`;
    $("#fgBack").addEventListener("click", () => render("login"));
    $("#fgForm").addEventListener("submit", async e => {
      e.preventDefault();
      const m = $("#fgMail").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) return ($("#fgErr").textContent = "Revisa tu correo: falta la @ o el dominio.");
      if (IS_FB) { try { await fbs.resetPassword(m); } catch (ex) { if (ex?.code !== "auth/user-not-found") return ($("#fgErr").textContent = fbs.authMessage(ex)); } }
      body.innerHTML = `<div class="ok-state"><svg><use href="#i-check"/></svg><h3 style="font-size:1.3rem">Revisa tu correo</h3>
        <p class="muted" style="margin-top:8px">Si ${esc(m)} tiene una cuenta, recibirá el enlace en unos minutos. Revisa también la carpeta de spam.${IS_FB || !DEMO_PASSWORD ? "" : ` En la prueba local las cuentas usan la contraseña <b>${DEMO_PASSWORD}</b>.`}</p></div>
        <button class="btn" type="button" id="fgOk" style="width:100%;justify-content:center;margin-top:16px">Volver a ingresar</button>`;
      $("#fgOk").addEventListener("click", () => render("login"));
    });
    return;
  }

  if (view === "login" || view === "register") {
    const up = view === "register";
    $("#authSub").textContent = o.admin ? "Solo para el equipo de RAPIDIN." : up ? "Crea tu cuenta en un minuto y pide en Camaná." : "Qué bueno verte. Ingresa para continuar.";
    body.innerHTML = `
      ${o.reason ? `<p class="auth-note">${esc(o.reason)}</p>` : ""}
      ${up || IS_FB || !TEST_ACCOUNTS.length ? "" : `
      <div class="test-accounts">
        <div class="ta-head"><b>Cuentas de prueba (solo en tu PC)</b><span>Contraseña: <code>${DEMO_PASSWORD}</code></span></div>
        <div class="ta-grid">${TEST_ACCOUNTS.map(a => `<button type="button" class="ta" data-mail="${a.correo}"><b>${a.rol}</b><span>${esc(a.detalle)}</span></button>`).join("")}</div>
      </div>`}
      ${o.admin ? "" : `<div class="auth-tabs" role="tablist">
        <button type="button" role="tab" id="tabIn" aria-selected="${!up}">Ingresar</button>
        <button type="button" role="tab" id="tabUp" aria-selected="${up}">Crear cuenta</button>
      </div>`}
      <form id="authForm" class="auth-form" novalidate>
        ${up ? `
        <div class="f"><label for="auName">Nombres y apellidos</label><div class="fi">${ic("user")}<input class="in" id="auName" autocomplete="name" placeholder="Ej.: María Quispe Flores"></div></div>
        <div class="f-2">
          <div class="f"><label for="auPhone">Celular</label>
            <div class="phone-in"><span>🇵🇪 +51</span><input class="in" id="auPhone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" placeholder="987 654 321"></div></div>
          <div class="f" id="fWa" hidden><label for="auWa">WhatsApp</label>
            <div class="phone-in"><span>🇵🇪 +51</span><input class="in" id="auWa" type="tel" inputmode="numeric" maxlength="11" placeholder="987 654 321"></div></div>
        </div>
        <label class="check sm"><input type="checkbox" id="auWaDiff"> <span>Mi WhatsApp es otro número</span></label>
        <p class="hint-s" style="margin:-8px 0 14px">Solo el repartidor que aceptes verá tu número, y solo durante tu pedido.</p>` : ""}
        <div class="f"><label for="auMail">Correo electrónico</label><div class="fi">${ic("mail")}<input class="in" id="auMail" type="email" autocomplete="email" placeholder="tucorreo@gmail.com"></div></div>
        <div class="f"><label for="auPass">Contraseña</label>
          <div class="fi">${ic("lock")}<input class="in" id="auPass" type="password" autocomplete="${up ? "new-password" : "current-password"}" placeholder="${up ? "Mínimo 8 caracteres, con letras y números" : "Tu contraseña"}">
          <button type="button" class="fi-eye" id="auShow" aria-label="Mostrar contraseña" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true">${IC.eye}</svg></button></div>
          ${up ? `<div class="pw-meter" id="pwMeter" aria-hidden="true"><i></i><i></i><i></i></div>` : ""}</div>
        ${up ? `
        <div class="consent">
          <label class="check sm"><input type="checkbox" id="auTerms"> <span>Declaro que soy <b>mayor de 18 años</b> y acepto los <button type="button" class="link" data-lg="terminos">Términos y condiciones</button> y la <button type="button" class="link" data-lg="privacidad">Política de privacidad</button>.</span></label>
          <label class="check sm"><input type="checkbox" id="auTimes"> <span>Entiendo que los <b>tiempos de entrega son estimados</b> y que pueden variar por tráfico, clima o el local, y que los productos y precios dependen de cada local.</span></label>
          <label class="check sm"><input type="checkbox" id="auPromo"> <span>Quiero recibir promociones de locales de Camaná por WhatsApp (opcional).</span></label>
        </div>` : `<p class="auth-forgot"><button type="button" class="link" id="auForgot">¿Olvidaste tu contraseña?</button></p>`}
        <p class="err" id="auErr" role="alert"></p>
        <button class="btn auth-submit" type="submit">${up ? (IS_FB ? "Crear mi cuenta" : "Crear cuenta y verificar celular") : "Ingresar"}</button>
        ${o.admin ? "" : `<p class="auth-switch">${up ? `¿Ya tienes cuenta? <button type="button" class="link" data-to="login">Ingresa</button>` : `¿Eres nuevo en RAPIDIN? <button type="button" class="link" data-to="register">Crea tu cuenta gratis</button>`}</p>`}
      </form>`;
    $("#tabIn")?.addEventListener("click", () => render("login"));
    $("#tabUp")?.addEventListener("click", () => render("register"));
    $$("[data-to]", body).forEach(b => b.addEventListener("click", () => render(b.dataset.to)));
    $$("[data-lg]", body).forEach(b => b.addEventListener("click", e => { e.preventDefault(); openLegal(b.dataset.lg); }));
    $("#auShow").addEventListener("click", e => { const i = $("#auPass"), show = i.type === "password"; i.type = show ? "text" : "password"; const b = e.currentTarget; b.setAttribute("aria-pressed", show); b.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña"); b.querySelector("svg").innerHTML = show ? IC.eyeOff : IC.eye; });
    $$(".ta", body).forEach(b => b.addEventListener("click", () => { $("#auMail").value = b.dataset.mail; $("#auPass").value = DEMO_PASSWORD; $("#authForm").requestSubmit(); }));
    if (up) {
      $("#auWaDiff").addEventListener("change", e => { $("#fWa").hidden = !e.target.checked; });
      $("#auPass").addEventListener("input", e => { const v = e.target.value; const n = (v.length >= 8) + (/\d/.test(v) && /[A-Za-z]/.test(v)) + (v.length >= 12 || /[^A-Za-z0-9]/.test(v)); $("#pwMeter").dataset.n = v ? n : 0; });
    } else $("#auForgot").addEventListener("click", () => render("forgot"));
    setTimeout(() => (up ? $("#auName") : $("#auMail"))?.focus(), 60);
    $("#authForm").addEventListener("submit", async e => {
      e.preventDefault();
      const err = $("#auErr"), mail = $("#auMail").value.trim(), pass = $("#auPass").value;
      const btn = e.target.querySelector("button[type=submit]");
      const label = btn.textContent;
      err.textContent = "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return (err.textContent = "Revisa tu correo: falta la @ o el dominio.");
      if (pass.length < 8) return (err.textContent = "La contraseña necesita al menos 8 caracteres.");
      try {
        if (up) {
          const nombre = $("#auName").value.trim().replace(/\s+/g, " ");
          const tel = normPhone($("#auPhone").value);
          const wa = $("#auWaDiff").checked ? normPhone($("#auWa").value) : tel;
          if (nombre.split(" ").length < 2) return (err.textContent = "Escribe tu nombre y al menos un apellido.");
          if (!/^9\d{8}$/.test(tel)) return (err.textContent = "El celular debe tener 9 dígitos y empezar con 9.");
          if (!/^9\d{8}$/.test(wa)) return (err.textContent = "El número de WhatsApp debe tener 9 dígitos y empezar con 9.");
          if (!/(?=.*\d)(?=.*[A-Za-z])/.test(pass)) return (err.textContent = "Usa letras y números en tu contraseña.");
          if (!$("#auTerms").checked) return (err.textContent = "Para crear tu cuenta confirma que eres mayor de edad y aceptas los términos.");
          if (!$("#auTimes").checked) return (err.textContent = "Confirma que entiendes que los tiempos de entrega son estimados.");
          const consentimientos = { version: LEGAL_VERSION, mayorEdad: true, terminos: true, privacidad: true, tiemposEstimados: true, promociones: $("#auPromo").checked, cookies: cookieChoice()?.v ? { analitica: !!cookieChoice().analitica, promociones: !!cookieChoice().promociones } : null, t: Date.now() };
          if (IS_FB) {
            btn.disabled = true; btn.textContent = "Creando tu cuenta…";
            const id = await fbs.signUp({ nombre, correo: mail, pass, telefono: tel, whatsapp: wa, consentimientos });
            return finish(id);
          }
          const id = api.signUp({ nombre, correo: mail, pass, telefono: tel, whatsapp: wa, consentimientos });
          setSessionUid(id);
          ctxOpts.uid = id;
          render("verify");
        } else {
          let id;
          if (IS_FB) { btn.disabled = true; btn.textContent = "Ingresando…"; id = await fbs.signIn(mail, pass); }
          else id = api.signIn(mail, pass);
          const u = load().users[id];
          if (!u || u.estado !== "activo") { if (IS_FB) await fbs.signOut(); return (err.textContent = u ? "Tu cuenta está suspendida. Escríbenos para revisarla." : "No pudimos cargar tu cuenta. Revisa tu conexión e intenta otra vez."); }
          if (ctxOpts.admin && !u.roles.admin) { if (IS_FB) await fbs.signOut(); return (err.textContent = "Esta cuenta no tiene acceso administrativo."); }
          if (!IS_FB) setSessionUid(id);
          if (!IS_FB && !u.telefonoVerificado) { ctxOpts.uid = id; return render("verify"); }
          finish(id);
        }
      } catch (ex) { err.textContent = IS_FB ? fbs.authMessage(ex) : ex.message || "No pudimos completar la acción."; }
      finally { if (btn?.isConnected) { btn.disabled = false; btn.textContent = label; } }
    });
    return;
  }

  if (view === "verify") {
    const id = ctxOpts.uid || getSessionUid();
    const u = load().users[id];
    if (!u) return render("login");
    $("#authSub").textContent = "Un último paso para proteger tu cuenta.";
    pendingCode = String(Math.floor(100000 + Math.random() * 900000));
    body.innerHTML = `
      <span class="demo-tag">Prueba local: no se envía ningún SMS</span>
      <p style="margin-bottom:6px">Enviamos un código de 6 dígitos por SMS a</p>
      <p class="big-phone">${fmtPhone(u.telefono)}</p>
      <p class="notice">Código de prueba: <b>${pendingCode}</b></p>
      <form id="vForm" novalidate>
        <div class="otp" id="otp">${Array.from({ length: 6 }, (_, i) => `<input class="in" inputmode="numeric" maxlength="1" aria-label="Dígito ${i + 1}" autocomplete="${i ? "off" : "one-time-code"}">`).join("")}</div>
        <p class="err" id="vErr" role="alert"></p>
        <button class="btn" type="submit" style="width:100%;justify-content:center">Verificar</button>
        <p class="muted" style="margin-top:14px;text-align:center"><button type="button" class="link" id="vResend" disabled>Reenviar código en <span id="vSec">30</span> s</button></p>
      </form>`;
    const boxes = $$("#otp input");
    boxes.forEach((b, i) => {
      b.addEventListener("input", () => { b.value = b.value.replace(/\D/g, "").slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); });
      b.addEventListener("keydown", e => { if (e.key === "Backspace" && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
      b.addEventListener("paste", e => { const d = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6); if (!d) return; e.preventDefault(); d.split("").forEach((c, k) => { if (boxes[k]) boxes[k].value = c; }); boxes[Math.min(d.length, 5)].focus(); });
    });
    setTimeout(() => boxes[0].focus(), 50);
    let sec = 30;
    resendTimer = setInterval(() => { sec--; const s = $("#vSec"); if (s) s.textContent = sec; if (sec <= 0) { clearInterval(resendTimer); const r = $("#vResend"); if (r) { r.disabled = false; r.textContent = "Reenviar código"; } } }, 1000);
    $("#vResend").addEventListener("click", () => { render("verify"); toast("Te enviamos un código nuevo."); });
    $("#vForm").addEventListener("submit", e => {
      e.preventDefault();
      const code = boxes.map(b => b.value).join("");
      if (code.length < 6) return ($("#vErr").textContent = "Escribe los 6 dígitos del código.");
      if (code !== pendingCode) return ($("#vErr").textContent = "El código no coincide. Revisa el SMS o pide uno nuevo.");
      api.verifyPhone(id);
      toast("Celular verificado.");
      finish(id);
    });
  }
}
