import { initScene } from "./scene3d.js";
import { initApp, goPanel, openAccount } from "./app.js";
import { load, subscribe } from "./demo/store.js";

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

/* ---------- Tabla de comisiones y calculadora (lee la configuración del panel) ---------- */
const cDist=$("#cDist"), cFee=$("#cFee");
let RULES = load().commissionRules;
function renderRates(){
  RULES = load().commissionRules;
  const tb = $("#rateTable tbody"), max = Math.max(...RULES.tramos.map(t=>t.monto), RULES.masDe10, .01);
  let prev = 0;
  tb.innerHTML = RULES.tramos.map((t,i)=>{ const row = `<tr data-i="${i}"><td>${prev} a ${t.hasta} km<span class="bar" style="width:${(t.monto/max)*100}%"></span></td><td>${sol(t.monto)}</td></tr>`; prev = t.hasta; return row; }).join("")
    + `<tr><td>Más de ${prev} km</td><td>${sol(RULES.masDe10)}</td></tr>`;
  const last = RULES.tramos[RULES.tramos.length-1]?.hasta || 10;
  cDist.max = Math.max(10, last); $(".range-row span:last-child").textContent = `${cDist.max} km`;
  calc();
}
function calc(){
  const mode = $('input[name="cm"]:checked').value;
  const km = parseFloat(cDist.value);
  const fee = Math.max(0, parseFloat(cFee.value) || 0);
  $("#cDistOut").textContent = km.toFixed(1) + " km";
  $("#distField").style.opacity = mode==="tienda" ? 1 : .35;
  cDist.disabled = mode!=="tienda";
  const idx = RULES.tramos.findIndex(t => km <= t.hasta);
  const com = mode==="tienda" ? (idx >= 0 ? RULES.tramos[idx].monto : RULES.masDe10) : RULES.libre;
  $("#cCom").textContent = sol(com);
  const g = fee - com;
  $("#cGain").textContent = sol(g);
  $("#cGain").style.color = g < 0 ? "#FF8A5C" : "";
  $$("#rateTable tr").forEach(tr=>tr.classList.toggle("hit", mode==="tienda" && tr.dataset.i !== undefined && +tr.dataset.i === idx));
  $("#cFoot").textContent = mode==="tienda"
    ? "Comisión según la tabla vigente. Se reserva al ofertar y se libera si no te eligen."
    : "Comisión fija de compra libre. Se cobra solo si completas el pedido.";
}
[cDist,cFee,...$$('input[name="cm"]')].forEach(el=>el.addEventListener("input",calc));
renderRates();
subscribe(() => { if (!document.body.classList.contains("in-app")) renderRates(); });
window.addEventListener("hashchange", () => { if (!/^#(cliente|repartidor|admin)/.test(location.hash)) renderRates(); });

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

/* ---------- Diálogos de la web pública ---------- */
function openDlg(id){ const d=document.getElementById(id); if(!d || d.open) return; if (d.showModal) d.showModal(); else d.setAttribute("open",""); }
function closeDlg(d){ if (typeof d==="string") d=document.getElementById(d); if (!d) return; if (d.close) d.close(); else d.removeAttribute("open"); }
$$("[data-open]").forEach(b=>b.addEventListener("click",()=>{
  const id=b.dataset.open;
  if (id==="dlgOrder") return goPanel("#cliente-nuevo", "Para pedir necesitas una cuenta. Ingresa o créala en un minuto.");
  if (id==="dlgCourier") return goPanel("#repartidor-postulacion", "Para postular como repartidor necesitas una cuenta con tu celular verificado.");
  if (id==="dlgLogin") return openAccount(!!b.dataset.admin);
  if (id==="dlgLegal") renderLegal(b.dataset.legal);
  openDlg(id);
}));
$$("dialog").forEach(d=>{
  d.addEventListener("click",e=>{ if(e.target===d) closeDlg(d); });
  $$("[data-close]",d).forEach(x=>x.addEventListener("click",()=>closeDlg(d)));
});

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
initApp();
