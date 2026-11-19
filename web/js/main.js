import { initScene } from "./scene3d.js";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const sol = n => "S/ " + (Math.round(n*100)/100).toFixed(2);

/* ---------- Navegación ---------- */
const nav = $("#nav");
const onScroll = ()=> nav.classList.toggle("solid", scrollY > 30);
addEventListener("scroll", onScroll, {passive:true}); onScroll();
$("#burger").addEventListener("click", e=>{
  const open = nav.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", open);
});
$$("#navLinks a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");$("#burger").setAttribute("aria-expanded","false")}));

/* ---------- Tabla de comisiones (ilustrativa) ---------- */
const RATES = [[0,2,0.80],[2,4,1.20],[4,6,1.80],[6,8,2.40],[8,10,3.00]];
const COMISION_LIBRE = 1.00; // valor de ejemplo
const tb = $("#rateTable tbody");
RATES.forEach(([a,b,c],i)=>{
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${a} a ${b} km<span class="bar" style="width:${(c/3)*100}%"></span></td><td>${sol(c)}</td>`;
  tr.dataset.i = i; tb.appendChild(tr);
});
const trMore = document.createElement("tr");
trMore.innerHTML = `<td>Más de 10 km</td><td style="font-weight:500">Según configuración</td>`;
tb.appendChild(trMore);
const rateFor = km => { for (const [a,b,c] of RATES) if (km < b || b === 10 && km <= 10) return c; return RATES[RATES.length-1][2]; };

/* ---------- Calculadora ---------- */
const cDist=$("#cDist"), cFee=$("#cFee");
function calc(){
  const mode = $('input[name="cm"]:checked').value;
  const km = parseFloat(cDist.value);
  const fee = Math.max(0, parseFloat(cFee.value) || 0);
  $("#cDistOut").textContent = km.toFixed(1) + " km";
  $("#distField").style.opacity = mode==="tienda" ? 1 : .35;
  cDist.disabled = mode!=="tienda";
  const com = mode==="tienda" ? rateFor(km) : COMISION_LIBRE;
  $("#cCom").textContent = sol(com);
  const g = fee - com;
  $("#cGain").textContent = sol(g);
  $("#cGain").style.color = g < 0 ? "#FF8A5C" : "";
  $$("#rateTable tr").forEach(tr=>tr.classList.toggle("hit", mode==="tienda" && tr.dataset.i !== undefined && RATES[tr.dataset.i][2]===com));
  $("#cFoot").textContent = mode==="tienda"
    ? "Comisión según la tabla referencial. Se reserva al ofertar y se libera si no te eligen."
    : "La comisión de compra libre usa un valor de ejemplo. El valor final lo define RAPIDIN.";
}
[cDist,cFee,...$$('input[name="cm"]')].forEach(el=>el.addEventListener("input",calc));
calc();

/* ---------- Tarjetas con inclinación 3D ---------- */
if (!REDUCED && matchMedia("(pointer:fine)").matches){
  $$(".tilt, .tilt-soft").forEach(el=>{
    const max = el.classList.contains("tilt-soft") ? 4 : 9;
    el.addEventListener("pointermove", e=>{
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left)/r.width - .5, y = (e.clientY - r.top)/r.height - .5;
      el.style.transform = `perspective(900px) rotateY(${x*max*2}deg) rotateX(${-y*max*2}deg) translateZ(0)`;
    });
    el.addEventListener("pointerleave", ()=>{ el.style.transform = ""; });
  });
}

/* ---------- Diálogos ---------- */
function openDlg(id){ const d=document.getElementById(id); if(!d) return; if (d.open) return; if (d.showModal) d.showModal(); else d.setAttribute("open",""); }
function closeDlg(d){ if (typeof d==="string") d=document.getElementById(d); if (!d) return; if (d.close) d.close(); else d.removeAttribute("open"); }

// Pedir y postular exigen una cuenta con celular verificado.
const NEEDS_ACCOUNT = { dlgOrder: "pedir", dlgCourier: "postular como repartidor" };
function openAction(id, opts={}){
  if (NEEDS_ACCOUNT[id] && !session.user){
    pendingAction = id;
    renderAuth("login", { reason: `Para ${NEEDS_ACCOUNT[id]} necesitas una cuenta. Ingresa o créala en un minuto.` });
    return openDlg("dlgLogin");
  }
  if (NEEDS_ACCOUNT[id] && !session.user.telefonoVerificado){
    pendingAction = id;
    renderAuth("verify");
    return openDlg("dlgLogin");
  }
  if (id==="dlgOrder") renderOrderForm();
  if (id==="dlgCourier") renderCourierForm();
  if (id==="dlgLegal") renderLegal(opts.legal);
  if (id==="dlgLogin") renderAuth(session.user ? "account" : "login", { admin: opts.admin });
  openDlg(id);
}
$$("[data-open]").forEach(b=>b.addEventListener("click",()=>openAction(b.dataset.open,{legal:b.dataset.legal, admin:!!b.dataset.admin})));
$$("dialog").forEach(d=>{
  d.addEventListener("click",e=>{ if(e.target===d) closeDlg(d); });
  $$("[data-close]",d).forEach(x=>x.addEventListener("click",()=>closeDlg(d)));
  d.addEventListener("close",()=>{ if(d.id==="dlgOrder") clearOrderTimers(); if(d.id==="dlgLogin") clearInterval(resendTimer); });
});

/* ---------- Cuenta (simulación de Firebase Authentication) ----------
   Versión real (siguiente fase):
   - Registro con correo y contraseña: createUserWithEmailAndPassword.
   - Verificación del celular por SMS: linkWithPhoneNumber + RecaptchaVerifier,
     así el número queda ligado a la misma cuenta.
   - Perfil en Firestore users/{uid}: nombre, telefono (+51…), whatsapp,
     telefonoVerificado. El teléfono solo lo ve el repartidor asignado. */
const session = { user: null };
let pendingAction = null, resendTimer = 0, pendingCode = "";
try { const raw = sessionStorage.getItem("rapidin.demo.user"); if (raw) session.user = JSON.parse(raw); } catch(e) {}
function saveSession(){ try { session.user ? sessionStorage.setItem("rapidin.demo.user", JSON.stringify(session.user)) : sessionStorage.removeItem("rapidin.demo.user"); } catch(e) {} updateNav(); }
function updateNav(){
  const b=$("#navAccount");
  if (session.user){ b.innerHTML = `<span class="acc-dot">${initials(session.user.nombre)}</span>${session.user.nombre.split(" ")[0]}`; b.setAttribute("aria-label","Mi cuenta"); }
  else { b.textContent="Ingresar"; b.removeAttribute("aria-label"); }
}
const initials = n => n.trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase();
const normPhone = v => v.replace(/\D/g,"").replace(/^51(?=9\d{8}$)/,"");
const fmtPhone = d => `+51 ${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`;
const maskPhone = d => `+51 ${d.slice(0,3)} ••• ${d.slice(6)}`;
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function renderAuth(view, opts={}){
  const body=$("#authBody");
  clearInterval(resendTimer);
  $("#dlgLoginT").textContent = opts.admin ? "Acceso administrativo" : view==="register" ? "Crea tu cuenta" : view==="verify" ? "Verifica tu celular" : view==="account" ? "Mi cuenta" : "Ingresar";

  if (view==="login" || view==="register"){
    const up = view==="register";
    body.innerHTML = `
      <span class="demo-tag">Demostración: no se crea ninguna cuenta real</span>
      ${opts.reason?`<p class="notice">${esc(opts.reason)}</p>`:""}
      <div class="tabs" role="tablist">
        <button type="button" role="tab" id="tabIn" aria-selected="${!up}">Ingresar</button>
        <button type="button" role="tab" id="tabUp" aria-selected="${up}">Crear cuenta</button>
      </div>
      <form id="authForm" novalidate>
        ${up?`
        <div class="f"><label for="auName">Nombres y apellidos</label><input class="in" id="auName" autocomplete="name" placeholder="Ej.: María Quispe Flores"></div>
        <div class="f"><label for="auPhone">Celular con WhatsApp</label>
          <div class="phone-in"><span>+51</span><input class="in" id="auPhone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="11" placeholder="987 654 321"></div>
          <span class="hint-s">Te enviaremos un código por SMS para verificarlo. El repartidor que aceptes lo verá para llamarte o escribirte.</span>
        </div>
        <label class="check"><input type="checkbox" id="auWaDiff"> <span>Mi WhatsApp es otro número</span></label>
        <div class="f" id="fWa" hidden><label for="auWa">Número de WhatsApp</label>
          <div class="phone-in"><span>+51</span><input class="in" id="auWa" type="tel" inputmode="numeric" maxlength="11" placeholder="987 654 321"></div></div>`:""}
        <div class="f"><label for="auMail">Correo electrónico</label><input class="in" id="auMail" type="email" autocomplete="email" placeholder="tucorreo@gmail.com"></div>
        <div class="f"><label for="auPass">Contraseña</label><input class="in" id="auPass" type="password" autocomplete="${up?"new-password":"current-password"}" placeholder="${up?"Mínimo 8 caracteres":""}"></div>
        ${up?`<label class="check"><input type="checkbox" id="auTerms"> <span>Acepto los términos y la política de privacidad de RAPIDIN.</span></label>`:""}
        <p class="err" id="auErr" role="alert"></p>
        <button class="btn" type="submit" style="width:100%;justify-content:center">${up?"Crear cuenta y verificar celular":"Ingresar"}</button>
        ${up?"":`<p class="muted" style="margin-top:14px">Los administradores ingresan con esta misma pantalla. El panel se habilita según sus permisos.</p>`}
      </form>`;
    $("#tabIn").addEventListener("click",()=>renderAuth("login",{reason:opts.reason,admin:opts.admin}));
    $("#tabUp").addEventListener("click",()=>renderAuth("register",{reason:opts.reason}));
    if (up) $("#auWaDiff").addEventListener("change",e=>{ $("#fWa").hidden=!e.target.checked; });
    $("#authForm").addEventListener("submit",e=>{
      e.preventDefault();
      const err=$("#auErr"), mail=$("#auMail").value.trim(), pass=$("#auPass").value;
      if (up){
        const nombre=$("#auName").value.trim().replace(/\s+/g," ");
        const tel=normPhone($("#auPhone").value);
        const waDiff=$("#auWaDiff").checked, wa = waDiff ? normPhone($("#auWa").value) : tel;
        if (nombre.split(" ").length<2) return err.textContent="Escribe tu nombre y al menos un apellido.";
        if (!/^9\d{8}$/.test(tel)) return err.textContent="El celular debe tener 9 dígitos y empezar con 9.";
        if (!/^9\d{8}$/.test(wa)) return err.textContent="El número de WhatsApp debe tener 9 dígitos y empezar con 9.";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return err.textContent="Revisa tu correo: falta la @ o el dominio.";
        if (pass.length<8) return err.textContent="La contraseña necesita al menos 8 caracteres.";
        if (!$("#auTerms").checked) return err.textContent="Acepta los términos para crear tu cuenta.";
        session.user = { nombre, correo:mail, telefono:tel, whatsapp:wa, telefonoVerificado:false, rol:"cliente" };
        saveSession();
        renderAuth("verify");
      } else {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return err.textContent="Revisa tu correo: falta la @ o el dominio.";
        if (pass.length<8) return err.textContent="La contraseña necesita al menos 8 caracteres.";
        // Demo: cualquier correo válido ingresa como cliente de ejemplo con celular verificado.
        const nombre = mail.split("@")[0].replace(/[._-]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()) + " (demo)";
        session.user = { nombre, correo:mail, telefono:"987654321", whatsapp:"987654321", telefonoVerificado:true, rol:"cliente" };
        saveSession(); afterAuth();
      }
    });
    return;
  }

  if (view==="verify"){
    const u=session.user;
    pendingCode = String(Math.floor(100000+Math.random()*900000));
    body.innerHTML = `
      <span class="demo-tag">Demostración: no se envía ningún SMS</span>
      <p style="margin-bottom:6px">Enviamos un código de 6 dígitos por SMS a</p>
      <p class="big-phone">${fmtPhone(u.telefono)} <button type="button" class="link" id="vEdit">Cambiar</button></p>
      <p class="notice">Código de prueba: <b>${pendingCode}</b></p>
      <form id="vForm" novalidate>
        <div class="otp" id="otp">${Array.from({length:6},(_,i)=>`<input class="in" inputmode="numeric" maxlength="1" aria-label="Dígito ${i+1}" autocomplete="${i?"off":"one-time-code"}">`).join("")}</div>
        <p class="err" id="vErr" role="alert"></p>
        <button class="btn" type="submit" style="width:100%;justify-content:center">Verificar</button>
        <p class="muted" style="margin-top:14px;text-align:center"><button type="button" class="link" id="vResend" disabled>Reenviar código en <span id="vSec">30</span> s</button></p>
      </form>`;
    const boxes=$$("#otp input");
    boxes.forEach((b,i)=>{
      b.addEventListener("input",()=>{ b.value=b.value.replace(/\D/g,"").slice(-1); if(b.value && boxes[i+1]) boxes[i+1].focus(); });
      b.addEventListener("keydown",e=>{ if(e.key==="Backspace" && !b.value && boxes[i-1]) boxes[i-1].focus(); });
      b.addEventListener("paste",e=>{ const d=(e.clipboardData.getData("text")||"").replace(/\D/g,"").slice(0,6); if(!d) return; e.preventDefault(); d.split("").forEach((c,k)=>{ if(boxes[k]) boxes[k].value=c; }); boxes[Math.min(d.length,5)].focus(); });
    });
    setTimeout(()=>boxes[0].focus(),50);
    let sec=30; resendTimer=setInterval(()=>{ sec--; const s=$("#vSec"); if(s) s.textContent=sec; if(sec<=0){ clearInterval(resendTimer); const r=$("#vResend"); if(r){ r.disabled=false; r.textContent="Reenviar código"; } } },1000);
    $("#vResend").addEventListener("click",()=>renderAuth("verify"));
    $("#vEdit").addEventListener("click",()=>renderAuth("register"));
    $("#vForm").addEventListener("submit",e=>{
      e.preventDefault();
      const code=boxes.map(b=>b.value).join("");
      if (code.length<6) return $("#vErr").textContent="Escribe los 6 dígitos del código.";
      if (code!==pendingCode) return $("#vErr").textContent="El código no coincide. Revisa el SMS o pide uno nuevo.";
      session.user.telefonoVerificado=true; saveSession(); afterAuth();
    });
    return;
  }

  if (view==="account"){
    const u=session.user;
    body.innerHTML = `
      <span class="demo-tag">Demostración</span>
      <div class="acc-card">
        <span class="acc-av">${initials(u.nombre)}</span>
        <div><b>${esc(u.nombre)}</b><span>${esc(u.correo)}</span></div>
      </div>
      <dl class="acc-list">
        <div><dt>Celular</dt><dd>${fmtPhone(u.telefono)} ${u.telefonoVerificado?'<span class="ok-pill">Verificado</span>':'<button type="button" class="link" id="accVerify">Verificar</button>'}</dd></div>
        <div><dt>WhatsApp</dt><dd>${fmtPhone(u.whatsapp)}</dd></div>
        <div><dt>Tipo de cuenta</dt><dd>Cliente</dd></div>
      </dl>
      <p class="muted" style="margin:14px 0 18px">Tu número solo lo ve el repartidor cuya oferta aceptes, y solo mientras dura ese pedido.</p>
      <div class="two">
        <button class="btn" type="button" id="accOrder" style="justify-content:center">Solicitar pedido</button>
        <button class="btn dark" type="button" id="accOut" style="justify-content:center">Cerrar sesión</button>
      </div>`;
    const v=$("#accVerify"); if (v) v.addEventListener("click",()=>renderAuth("verify"));
    $("#accOrder").addEventListener("click",()=>{ closeDlg("dlgLogin"); openAction("dlgOrder"); });
    $("#accOut").addEventListener("click",()=>{ session.user=null; saveSession(); closeDlg("dlgLogin"); });
  }
}
function afterAuth(){
  const next=pendingAction; pendingAction=null;
  if (next){ closeDlg("dlgLogin"); openAction(next); }
  else renderAuth("account");
}
updateNav();

/* ---------- Legal ---------- */
function renderLegal(which){
  const priv = which!=="terminos";
  $("#dlgLegalT").textContent = priv ? "Política de privacidad" : "Términos y condiciones";
  $("#legalBody").innerHTML = priv
    ? `<span class="demo-tag">Borrador pendiente de revisión legal</span>
       <p style="margin-bottom:12px">RAPIDIN tratará los datos personales conforme a la Ley N.º 29733, Ley de Protección de Datos Personales del Perú, y su reglamento.</p>
       <p style="margin-bottom:12px">Usamos tu ubicación solo para crear y entregar tus pedidos. La ubicación del repartidor se guarda mientras atiende un pedido y se elimina al terminarlo.</p>
       <p class="muted">El texto definitivo se publicará antes del lanzamiento.</p>`
    : `<span class="demo-tag">Borrador pendiente de revisión legal</span>
       <p style="margin-bottom:12px">RAPIDIN conecta a clientes con repartidores independientes en Camaná. Solo se permiten productos legalmente permitidos.</p>
       <p style="margin-bottom:12px">El precio del pedido lo acuerdan cliente y repartidor mediante ofertas. Cualquier cambio posterior requiere autorización del cliente.</p>
       <p class="muted">El texto definitivo se publicará antes del lanzamiento.</p>`;
}

/* ---------- Pedido (simulación) ---------- */
let orderTimers=[], pinXY={x:.56,y:.52}, sortKey="precio", offersData=[], orderInfo={};
function clearOrderTimers(){ orderTimers.forEach(t=>{clearTimeout(t);clearInterval(t)}); orderTimers=[]; }
const CAM = {lat:-16.6236, lng:-72.7112}; // centro aprox. de Camaná
function renderOrderForm(){
  clearOrderTimers();
  $("#orderBody").innerHTML = `
    <span class="demo-tag">Demostración: no se envía ningún pedido</span>
    <form id="orderForm" novalidate>
      <div class="f"><span class="lbl">Modalidad</span>
        <div class="choice">
          <input type="radio" name="mod" id="mLibre" value="libre" checked><label for="mLibre"><b>Compra libre</b><span>El repartidor elige dónde comprar</span></label>
          <input type="radio" name="mod" id="mTienda" value="tienda"><label for="mTienda"><b>Tienda específica</b><span>Tú eliges el establecimiento</span></label>
        </div>
      </div>
      <div class="f" id="fTienda" hidden><label for="oTienda">Establecimiento o dirección</label><input class="in" id="oTienda" placeholder="Ej.: Pollería del centro, Jr. 28 de Julio"></div>
      <div class="f"><label for="oDesc">¿Qué necesitas?</label><textarea class="in" id="oDesc" placeholder="Ej.: 1 pollo a la brasa entero con papas y ensalada, y una gaseosa de 1.5 L"></textarea></div>
      <div class="f"><span class="lbl">Punto de entrega <span class="opt">· toca el mapa</span></span>
        <div class="minimap"><canvas id="miniMap" width="1100" height="400"></canvas></div>
        <span class="coord" id="coord"></span>
      </div>
      <div class="two">
        <div class="f"><label for="oRef">Referencia</label><input class="in" id="oRef" placeholder="Casa verde, 2.º piso"></div>
        <div class="f"><label for="oPay">Medio de pago</label>
          <select class="in" id="oPay"><option>Efectivo</option><option>Yape</option><option>Plin</option><option>Lemon</option><option>Saldo RAPIDIN</option></select></div>
      </div>
      <div class="contact-box">
        <span class="acc-av sm">${initials(session.user.nombre)}</span>
        <div><b>${esc(session.user.nombre)}</b><span>WhatsApp ${fmtPhone(session.user.whatsapp)}</span></div>
        <button type="button" class="link" id="oEditContact">Cambiar</button>
      </div>
      <p class="hint-s" style="margin:-6px 0 14px">Solo el repartidor que aceptes verá este número.</p>
      <p class="err" id="oErr" role="alert"></p>
      <button class="btn" type="submit" style="width:100%;justify-content:center">Publicar solicitud <svg><use href="#i-arrow"/></svg></button>
    </form>`;
  $$('input[name="mod"]').forEach(r=>r.addEventListener("change",()=>{ $("#fTienda").hidden = $('input[name="mod"]:checked').value!=="tienda"; }));
  $("#oEditContact").addEventListener("click",()=>{ closeDlg("dlgOrder"); openAction("dlgLogin"); });
  const cv=$("#miniMap"); drawMini(cv);
  cv.addEventListener("click",e=>{ const r=cv.getBoundingClientRect(); pinXY={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}; drawMini(cv); });
  $("#orderForm").addEventListener("submit",e=>{
    e.preventDefault();
    const desc=$("#oDesc").value.trim(), mod=$('input[name="mod"]:checked').value;
    if (desc.length<6) return $("#oErr").textContent="Cuéntanos qué necesitas con un poco más de detalle.";
    if (mod==="tienda" && !$("#oTienda").value.trim()) return $("#oErr").textContent="Escribe el nombre o la dirección del establecimiento.";
    if (pinXY.x<.2) return $("#oErr").textContent="Ese punto cae en el mar. Toca una calle de Camaná.";
    orderInfo={desc,mod,pay:$("#oPay").value};
    renderSearching();
  });
}
function drawMini(cv){
  const c=cv.getContext("2d"), W=cv.width, H=cv.height;
  c.fillStyle="#101C2C"; c.fillRect(0,0,W,H);
  c.fillStyle="#0F3A46"; c.fillRect(0,0,W*.18,H);
  c.fillStyle="#E8D3B0"; c.globalAlpha=.6; c.fillRect(W*.18,0,W*.03,H); c.globalAlpha=1;
  const cell=58; c.fillStyle="#1F3350";
  for(let x=W*.23;x<W;x+=cell) for(let y=8;y<H;y+=cell){ c.beginPath(); c.roundRect ? c.roundRect(x,y,cell-14,cell-14,6) : c.rect(x,y,cell-14,cell-14); c.fill(); }
  c.fillStyle="#1C5E52"; c.fillRect(W*.23+cell*7,8+cell*2,cell*2-14,cell-14);
  c.fillStyle="rgba(255,255,255,.45)"; c.font="600 22px Onest, sans-serif"; c.fillText("Océano Pacífico",14,H-18);
  c.fillText("Plaza de Armas",W*.23+cell*7-6,8+cell*2-8);
  const px=pinXY.x*W, py=pinXY.y*H;
  c.fillStyle="rgba(255,90,31,.25)"; c.beginPath(); c.arc(px,py,30,0,7); c.fill();
  c.fillStyle="#FF5A1F"; c.beginPath(); c.arc(px,py-22,16,0,7); c.fill();
  c.beginPath(); c.moveTo(px-12,py-14); c.lineTo(px+12,py-14); c.lineTo(px,py+2); c.fill();
  c.fillStyle="#fff"; c.beginPath(); c.arc(px,py-22,6,0,7); c.fill();
  const lat=(CAM.lat + (.5-pinXY.y)*0.012).toFixed(5), lng=(CAM.lng + (pinXY.x-.5)*0.02).toFixed(5);
  const co=$("#coord"); if(co) co.textContent=`Lat ${lat} · Lng ${lng} (aprox.). En la versión final se usa Google Maps.`;
}
const NAMES=[["Carla R.","#20C997","#101C2C"],["Luis M.","#4C6FFF","#fff"],["Jorge P.","#FF5A1F","#fff"],["Rosa Q.","#9F5BFF","#fff"]];
const MSGS=["Conozco una pollería con buen precio cerca.","Salgo ahora mismo, estoy a 3 cuadras.","Llevo bolsa térmica.","Te escribo si falta algo."];
function renderSearching(){
  offersData=[]; sortKey="precio";
  $("#orderBody").innerHTML = `
    <span class="demo-tag">Demostración: ofertas simuladas</span>
    <div class="searching"><span class="radar"></span><div><b id="srchT">Buscando repartidores en Camaná…</b><div class="muted" id="srchS">Tu solicitud está publicada.</div></div></div>
    <div class="sort" role="group" aria-label="Ordenar ofertas">
      <button type="button" data-s="precio" aria-pressed="true">Menor precio</button>
      <button type="button" data-s="tiempo" aria-pressed="false">Más rápido</button>
      <button type="button" data-s="rating" aria-pressed="false">Mejor calificado</button>
    </div>
    <div class="offers" id="offers" aria-live="polite"></div>`;
  $$(".sort button").forEach(b=>b.addEventListener("click",()=>{ sortKey=b.dataset.s; $$(".sort button").forEach(x=>x.setAttribute("aria-pressed",x===b)); drawOffers(); }));
  NAMES.forEach((n,i)=>{
    orderTimers.push(setTimeout(()=>{
      const base = orderInfo.mod==="tienda" ? 5 : 6;
      offersData.push({id:i,name:n[0],bg:n[1],fg:n[2],precio:base+Math.round(Math.random()*6)/2,tiempo:9+Math.round(Math.random()*14),rating:(4.5+Math.random()*.5).toFixed(1),pedidos:60+Math.round(Math.random()*500),msg:MSGS[i],vence:90});
      $("#srchT").textContent = `${offersData.length} ${offersData.length===1?"oferta recibida":"ofertas recibidas"}`;
      $("#srchS").textContent = "Compara y acepta la que prefieras.";
      drawOffers();
    }, 900 + i*1300));
  });
  orderTimers.push(setInterval(()=>{
    offersData.forEach(o=>o.vence=Math.max(0,o.vence-1));
    $$(".o-card .exp").forEach(el=>{ const o=offersData.find(x=>x.id==el.dataset.id); if(o) el.textContent = o.vence ? `Vence en ${o.vence} s` : "Vencida"; });
    $$(".o-card button").forEach(b=>{ const o=offersData.find(x=>x.id==b.dataset.id); if(o && !o.vence) b.disabled=true; });
  },1000));
}
function drawOffers(){
  const list=[...offersData].sort((a,b)=> sortKey==="rating" ? b.rating-a.rating : a[sortKey]-b[sortKey]);
  $("#offers").innerHTML = list.map(o=>`
    <div class="o-card">
      <span class="av" style="background:${o.bg};color:${o.fg}">${o.name.split(" ").map(s=>s[0]).join("")}</span>
      <div><b>${o.name}</b><div class="meta">★ ${o.rating} · ${o.pedidos} pedidos · ${o.tiempo} min</div><div class="msg">${o.msg}</div></div>
      <div class="r"><b>${sol(o.precio)}</b><span class="exp" data-id="${o.id}">${o.vence?`Vence en ${o.vence} s`:"Vencida"}</span><button class="btn small teal" type="button" data-id="${o.id}" ${o.vence?"":"disabled"}>Aceptar</button></div>
    </div>`).join("");
  $$("#offers button").forEach(b=>b.addEventListener("click",()=>accept(offersData.find(o=>o.id==b.dataset.id))));
}
const STATES=["Oferta aceptada","Repartidor asignado","Camino a recogida","En establecimiento","Pedido recogido","Camino a entrega","Repartidor cerca","Entregado"];
function accept(o){
  clearOrderTimers();
  const direct = orderInfo.pay!=="Efectivo" && orderInfo.pay!=="Saldo RAPIDIN";
  $("#orderBody").innerHTML = `
    <span class="demo-tag">Demostración</span>
    <div class="o-card" style="animation:none;box-shadow:inset 0 0 0 2px var(--turquesa)">
      <span class="av" style="background:${o.bg};color:${o.fg}">${o.name.split(" ").map(s=>s[0]).join("")}</span>
      <div><b>${o.name}</b><div class="meta">★ ${o.rating} · ${o.tiempo} min estimados</div></div>
      <div class="r"><b>${sol(o.precio)}</b></div>
    </div>
    <p class="muted" style="margin-top:10px">Las demás ofertas se cerraron automáticamente. ${o.name} ya puede ver tu número ${maskPhone(session.user.whatsapp)} para llamarte o escribirte por WhatsApp.</p>
    ${direct?`<div class="paybox" style="margin-top:16px"><small>Datos de cobro · visibles solo para ti y solo en este pedido</small><b>${orderInfo.pay}: 9•• ••• 412 · ${o.name}</b><small>Al pagar, marca «Ya pagué» y adjunta tu captura o código de operación.</small></div>`
      : orderInfo.pay==="Efectivo" ? `<div class="paybox" style="margin-top:16px"><small>Pago en efectivo</small><b>Paga ${sol(o.precio)} al recibir</b></div>`
      : `<div class="paybox" style="margin-top:16px"><small>Saldo RAPIDIN</small><b>${sol(o.precio)} retenidos de tu saldo</b><small>Se descuentan cuando se confirma la entrega.</small></div>`}
    <ol class="timeline" id="tl">${STATES.map(s=>`<li>${s}</li>`).join("")}</ol>
    <button class="btn dark" type="button" id="again" style="width:100%;justify-content:center">Hacer otra solicitud</button>`;
  $("#again").addEventListener("click",renderOrderForm);
  const lis=$$("#tl li"); let k=0;
  const step=()=>{ lis.forEach((li,i)=>{li.className = i<k ? "done" : i===k ? "now" : "";}); if(k===lis.length-1){ lis[k].className="done"; return; } k++; orderTimers.push(setTimeout(step, 1100)); };
  step();
}

/* ---------- Postulación ---------- */
function renderCourierForm(){
  $("#courierBody").innerHTML = `
    <span class="demo-tag">Demostración: no se suben archivos</span>
    <p class="muted" style="margin-bottom:18px">Solo pedimos lo necesario. Tus documentos los ve únicamente el equipo que revisa tu postulación.</p>
    <form id="cForm" novalidate>
      <div class="f"><label for="pNom">Nombres y apellidos</label><input class="in" id="pNom" autocomplete="name" value="${esc(session.user.nombre.replace(" (demo)",""))}"></div>
      <div class="two">
        <div class="f"><label for="pDni">DNI</label><input class="in" id="pDni" inputmode="numeric" maxlength="8" placeholder="8 dígitos"></div>
        <div class="f"><label for="pCel">Celular (WhatsApp)</label><input class="in" id="pCel" inputmode="tel" maxlength="9" placeholder="9 dígitos" value="${session.user.whatsapp}"></div>
      </div>
      <div class="f"><label for="pVeh">¿Cómo repartes?</label>
        <select class="in" id="pVeh"><option value="moto">Moto</option><option value="bici">Bicicleta</option><option value="pie">A pie</option><option value="mototaxi">Mototaxi</option></select></div>
      <div class="f"><label for="pDniF">Foto del DNI (ambas caras)</label><input class="in" id="pDniF" type="file" accept="image/*,.pdf" multiple></div>
      <div class="f" id="fLic"><label for="pLic">Licencia de conducir</label><input class="in" id="pLic" type="file" accept="image/*,.pdf"></div>
      <label class="check"><input type="checkbox" id="pOk"> <span>Acepto los términos y la política de privacidad de RAPIDIN.</span></label>
      <p class="err" id="pErr" role="alert"></p>
      <button class="btn" type="submit" style="width:100%;justify-content:center">Enviar postulación</button>
    </form>`;
  const veh=$("#pVeh"); const lic=()=>{$("#fLic").hidden = !["moto","mototaxi"].includes(veh.value)}; veh.addEventListener("change",lic); lic();
  $("#cForm").addEventListener("submit",e=>{
    e.preventDefault(); const err=$("#pErr");
    if ($("#pNom").value.trim().split(/\s+/).length<2) return err.textContent="Escribe tus nombres y apellidos.";
    if (!/^\d{8}$/.test($("#pDni").value)) return err.textContent="El DNI debe tener 8 dígitos.";
    if (!/^9\d{8}$/.test($("#pCel").value)) return err.textContent="El celular debe tener 9 dígitos y empezar con 9.";
    if (!$("#pDniF").files.length) return err.textContent="Adjunta la foto de tu DNI.";
    if (!$("#fLic").hidden && !$("#pLic").files.length) return err.textContent="Adjunta tu licencia de conducir.";
    if (!$("#pOk").checked) return err.textContent="Acepta los términos para continuar.";
    $("#courierBody").innerHTML = `
      <div class="ok-state"><svg><use href="#i-check"/></svg><h3 style="font-size:1.4rem">Postulación recibida</h3><p class="muted" style="margin-top:6px">En la versión real te avisaremos por correo y notificación.</p></div>
      <ol class="timeline"><li class="done">Datos enviados</li><li class="now">En revisión por un administrador</li><li>Aprobada: ya puedes recibir pedidos</li></ol>
      <p class="muted">Mientras tu cuenta esté pendiente no puedes ofertar ni recibir pedidos.</p>`;
  });
}

/* ---------- Contacto ---------- */
$("#contactForm").addEventListener("submit",e=>{
  e.preventDefault();
  const ok=["#ctName","#ctMail","#ctMsg"].every(s=>$(s).value.trim());
  $("#ctOut").style.color = ok ? "" : "#FF9A73";
  $("#ctOut").textContent = ok ? "Gracias. En esta demostración el mensaje no se envía; el formulario se conectará en la siguiente fase." : "Completa tu nombre, un contacto y tu mensaje.";
});

/* ---------- Logo: usa assets/rap.png; si falta, muestra el logo vectorial ---------- */
$$(".logo-img").forEach(img=>{
  const fallback=()=>{ img.hidden=true; img.nextElementSibling && (img.nextElementSibling.hidden=false); };
  if (img.complete && !img.naturalWidth) fallback(); else img.addEventListener("error",fallback);
});

initScene({reduced:REDUCED});
