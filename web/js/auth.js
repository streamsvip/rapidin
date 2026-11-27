/* =========================================================
   RAPIDIN · Ingreso, registro y verificación del celular
   DEMOSTRACIÓN: valida igual que la versión real, pero no envía
   SMS ni crea cuentas en Firebase. Versión real:
   createUserWithEmailAndPassword + linkWithPhoneNumber (SMS) +
   perfil en Firestore users/{uid}.
   ========================================================= */
import * as api from "./demo/api.js";
import { load, TEST_ACCOUNTS, DEMO_PASSWORD, IS_FB, fbs } from "./demo/store.js";
import { $, $$, esc, fmtPhone, normPhone, toast } from "./ui.js";

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
  $("#dlgLoginT").textContent = o.admin ? "Acceso administrativo" : { register: "Crea tu cuenta", verify: "Verifica tu celular", forgot: "Recupera tu contraseña" }[view] || "Ingresar";

  if (view === "forgot") {
    body.innerHTML = `
      ${IS_FB ? "" : `<span class="demo-tag">Demostración: no se envía ningún correo</span>`}
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
        <p class="muted" style="margin-top:8px">Si ${esc(m)} tiene una cuenta, recibirá el enlace en unos minutos. Revisa también la carpeta de spam.${IS_FB ? "" : ` En esta demostración las cuentas de prueba usan la contraseña <b>${DEMO_PASSWORD}</b>.`}</p></div>
        <button class="btn" type="button" id="fgOk" style="width:100%;justify-content:center;margin-top:16px">Volver a ingresar</button>`;
      $("#fgOk").addEventListener("click", () => render("login"));
    });
    return;
  }

  if (view === "login" || view === "register") {
    const up = view === "register";
    body.innerHTML = `
      ${o.reason ? `<p class="notice">${esc(o.reason)}</p>` : ""}
      ${up || IS_FB ? "" : `
      <div class="test-accounts">
        <div class="ta-head"><b>Cuentas de prueba</b><span>Contraseña: <code>${DEMO_PASSWORD}</code></span></div>
        <div class="ta-grid">${TEST_ACCOUNTS.map(a => `<button type="button" class="ta" data-mail="${a.correo}"><b>${a.rol}</b><span>${esc(a.detalle)}</span></button>`).join("")}</div>
      </div>`}
      <div class="tabs" role="tablist">
        <button type="button" role="tab" id="tabIn" aria-selected="${!up}">Ingresar</button>
        <button type="button" role="tab" id="tabUp" aria-selected="${up}">Crear cuenta</button>
      </div>
      <form id="authForm" novalidate>
        ${up ? `
        <div class="f"><label for="auName">Nombres y apellidos</label><input class="in" id="auName" autocomplete="name" placeholder="Ej.: María Quispe Flores"></div>
        <div class="f"><label for="auPhone">Celular con WhatsApp</label>
          <div class="phone-in"><span>+51</span><input class="in" id="auPhone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" placeholder="987 654 321"></div>
          <span class="hint-s">${IS_FB ? "" : "Te enviaremos un código por SMS. "}Solo el repartidor que aceptes verá este número.</span>
        </div>
        <label class="check"><input type="checkbox" id="auWaDiff"> <span>Mi WhatsApp es otro número</span></label>
        <div class="f" id="fWa" hidden><label for="auWa">Número de WhatsApp</label>
          <div class="phone-in"><span>+51</span><input class="in" id="auWa" type="tel" inputmode="numeric" maxlength="11" placeholder="987 654 321"></div></div>` : ""}
        <div class="f"><label for="auMail">Correo electrónico</label><input class="in" id="auMail" type="email" autocomplete="email" placeholder="tucorreo@gmail.com"></div>
        <div class="f"><label for="auPass">Contraseña</label>
          <div class="pass-in"><input class="in" id="auPass" type="password" autocomplete="${up ? "new-password" : "current-password"}" placeholder="${up ? "Mínimo 8 caracteres" : ""}">
          <button type="button" class="link" id="auShow" aria-label="Mostrar contraseña">Mostrar</button></div></div>
        ${up ? `<label class="check"><input type="checkbox" id="auTerms"> <span>Acepto los términos y la política de privacidad de RAPIDIN.</span></label>` : `<p style="margin:-6px 0 12px;text-align:right"><button type="button" class="link" id="auForgot">¿Olvidaste tu contraseña?</button></p>`}
        <p class="err" id="auErr" role="alert"></p>
        <button class="btn" type="submit" style="width:100%;justify-content:center">${up ? (IS_FB ? "Crear cuenta" : "Crear cuenta y verificar celular") : "Ingresar"}</button>
      </form>`;
    $("#tabIn").addEventListener("click", () => render("login"));
    $("#tabUp").addEventListener("click", () => render("register"));
    $("#auShow").addEventListener("click", e => { const i = $("#auPass"); i.type = i.type === "password" ? "text" : "password"; e.target.textContent = i.type === "password" ? "Mostrar" : "Ocultar"; });
    $$(".ta", body).forEach(b => b.addEventListener("click", () => { $("#auMail").value = b.dataset.mail; $("#auPass").value = DEMO_PASSWORD; $("#authForm").requestSubmit(); }));
    if (up) $("#auWaDiff").addEventListener("change", e => { $("#fWa").hidden = !e.target.checked; });
    else $("#auForgot").addEventListener("click", () => render("forgot"));
    $("#authForm").addEventListener("submit", async e => {
      e.preventDefault();
      const err = $("#auErr"), mail = $("#auMail").value.trim(), pass = $("#auPass").value;
      const btn = e.target.querySelector("button[type=submit]");
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
          if (!$("#auTerms").checked) return (err.textContent = "Acepta los términos para crear tu cuenta.");
          if (IS_FB) {
            btn.disabled = true; btn.textContent = "Creando tu cuenta…";
            const id = await fbs.signUp({ nombre, correo: mail, pass, telefono: tel, whatsapp: wa });
            return finish(id);
          }
          const id = api.signUp({ nombre, correo: mail, pass, telefono: tel, whatsapp: wa });
          setSessionUid(id);
          ctxOpts.uid = id;
          render("verify");
        } else {
          let id;
          if (IS_FB) { btn.disabled = true; btn.textContent = "Ingresando…"; id = await fbs.signIn(mail, pass); }
          else id = api.signIn(mail, pass);
          const u = load().users[id];
          if (!u || u.estado !== "activo") { if (IS_FB) await fbs.signOut(); return (err.textContent = "Tu cuenta está suspendida. Escríbenos para revisarla."); }
          if (ctxOpts.admin && !u.roles.admin) return (err.textContent = "Esta cuenta no tiene acceso administrativo.");
          if (!IS_FB) setSessionUid(id);
          if (!IS_FB && !u.telefonoVerificado) { ctxOpts.uid = id; return render("verify"); }
          finish(id);
        }
      } catch (ex) { err.textContent = IS_FB ? fbs.authMessage(ex) : ex.message || "No pudimos completar la acción."; }
      finally { if (btn?.isConnected) { btn.disabled = false; btn.textContent = up ? (IS_FB ? "Crear cuenta" : "Crear cuenta y verificar celular") : "Ingresar"; } }
    });
    return;
  }

  if (view === "verify") {
    const id = ctxOpts.uid || getSessionUid();
    const u = load().users[id];
    if (!u) return render("login");
    pendingCode = String(Math.floor(100000 + Math.random() * 900000));
    body.innerHTML = `
      <span class="demo-tag">Demostración: no se envía ningún SMS</span>
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
