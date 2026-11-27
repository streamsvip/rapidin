import { CONFIG } from "./config.js";
import { initApp, goPanel, openAccount } from "./app.js";
import { initShop } from "./shop.js";
import { openLegal, initCookies } from "./legal.js";
import { openBusinessForm } from "./business.js";
import { fixBrokenLogos } from "./ui.js";

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const sol = n => "S/ " + (Math.round(n*100)/100).toFixed(2);

/* ---------- Navegación ---------- */
const nav = $("#nav");
const onScroll = ()=> nav.classList.toggle("scrolled", scrollY > 10);
addEventListener("scroll", onScroll, {passive:true}); onScroll();
$("#burger").addEventListener("click", e=>{
  const open = nav.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", open);
});
$$("#navLinks a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");$("#burger").setAttribute("aria-expanded","false")}));

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
  if (id==="dlgOrder") return goPanel("#cliente-nuevo", "Ingresa o crea tu cuenta para pedir lo que quieras.");
  if (id==="dlgCourier") return goPanel("#repartidor-postulacion", "Para postular como repartidor necesitas una cuenta con tu celular verificado.");
  if (id==="dlgLogin") return openAccount(!!b.dataset.admin);
  if (id==="dlgBiz") return goPanel("#negocio-solicitud", "Ingresa o crea tu cuenta para registrar tu negocio. Así podrás administrarlo desde tu Panel de negocio.");
  if (id==="dlgLegal") return openLegal(b.dataset.legal);
  if (id==="dlgNeg") return goPanel("#negocio-pedidos", "Ingresa con la cuenta de tu negocio para ver tus pedidos.");
  openDlg(id);
}));
$$("dialog").forEach(d=>{
  d.addEventListener("click",e=>{ if(e.target===d) closeDlg(d); });
  $$("[data-close]",d).forEach(x=>x.addEventListener("click",()=>closeDlg(d)));
});

/* ---------- Contacto ---------- */
$("#contactForm").addEventListener("submit",e=>{
  e.preventDefault();
  const ok=["#ctName","#ctMail","#ctMsg"].every(s=>$(s).value.trim());
  $("#ctOut").style.color = ok ? "" : "#FF9A73";
  if (!ok) { $("#ctOut").textContent = "Completa tu nombre, un contacto y tu mensaje."; return; }
  const num = String(CONFIG.soporteWhatsapp || CONFIG.adminWhatsapp || "").replace(/\D/g, "");
  const txt = `Hola, RAPIDIN. Soy ${$("#ctName").value.trim()} (${$("#ctMail").value.trim()}).\n${$("#ctMsg").value.trim()}`;
  window.open(`https://wa.me/51${num}?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  $("#ctOut").textContent = "Abrimos WhatsApp con tu mensaje listo. Solo pulsa enviar.";
});

/* ---------- Logo: usa assets/rap.png; si falta, muestra el logo vectorial ---------- */
$$(".logo-img").forEach(img=>{
  const fallback=()=>{ img.hidden=true; img.nextElementSibling && (img.nextElementSibling.hidden=false); };
  if (img.complete && !img.naturalWidth) fallback(); else img.addEventListener("error",fallback);
});

initApp();
initShop();
initCookies();
