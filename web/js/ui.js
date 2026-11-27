/* RAPIDIN · utilidades de interfaz compartidas */
import { ApiError, ESTADO_LABEL, PAGO_LABEL } from "./demo/api.js";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const sol = n => "S/ " + (Math.round((+n || 0) * 100) / 100).toFixed(2);
export const fmtPhone = d => d ? `+51 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : "";
export const maskPhone = d => d ? `+51 ${d.slice(0, 3)} ••• ${d.slice(6)}` : "";
export const normPhone = v => String(v || "").replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, "");
export const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase();
export const firstName = n => String(n || "").split(" ")[0];
export const shortName = n => { const p = String(n || "").split(" "); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0]; };
export const waLink = d => `https://wa.me/51${d}`;
const COLORS = ["#20C997", "#4C6FFF", "#FF5A1F", "#9F5BFF", "#E8A400", "#0EA5C6", "#E0457B"];
export const avatarColor = id => COLORS[[...String(id)].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
/** La app registra cómo encontrar la foto de un usuario; si no tiene, se muestran sus iniciales. */
let photoOf = () => null;
export const setPhotoResolver = fn => { photoOf = fn; };
export const avatar = (id, nombre, cls = "") => { const f = photoOf(id); return f ? `<span class="av photo ${cls}"><img src="${f}" alt="" loading="lazy"></span>` : `<span class="av ${cls}" style="background:${avatarColor(id)}">${esc(initials(nombre))}</span>`; };

/* ---------- Llamar y WhatsApp como botones ---------- */
const IC_CALL = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/></svg>';
const IC_WA = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.4-4A8 8 0 1 1 8.5 19L4 20Z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2L9 9.5Z"/></svg>';
export const IC_CHAT = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9.5h8M8 12.5h5"/></svg>';
export const telHref = d => `tel:+51${String(d || "").replace(/\D/g, "")}`;
/** Número como enlace que abre la llamada. */
export const telLink = d => d ? `<a class="tel-link" href="${telHref(d)}">${IC_CALL}${fmtPhone(d)}</a>` : "";
/** Botones grandes: Llamar, WhatsApp y (opcional) Chat dentro de RAPIDIN. */
export function contactButtons({ tel, wa, chat = false, nombre = "" } = {}) {
  return `<div class="contact-btns">
    ${chat ? `<button class="cbtn chat" type="button" data-act="chatOpen">${IC_CHAT}<span>Chat</span></button>` : ""}
    ${tel ? `<a class="cbtn call" href="${telHref(tel)}" aria-label="Llamar${nombre ? " a " + esc(nombre) : ""}">${IC_CALL}<span>Llamar</span></a>` : ""}
    ${wa ? `<a class="cbtn wa" href="${waLink(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp${nombre ? " de " + esc(nombre) : ""}">${IC_WA}<span>WhatsApp</span></a>` : ""}
  </div>`;
}

const dtf = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const fmtDate = t => dtf.format(new Date(t));
export function timeAgo(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return fmtDate(t);
}
export const secondsLeft = t => Math.max(0, Math.round((t - Date.now()) / 1000));
export const fmtLeft = t => { const s = secondsLeft(t); return s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "Vencida"; };

const TONE = {
  buscando_repartidor: "warn", ofertas_recibidas: "accent", oferta_aceptada: "info", repartidor_asignado: "info",
  camino_a_recogida: "info", en_establecimiento: "info", pedido_recogido: "info", camino_a_entrega: "info",
  repartidor_cerca: "accent", entregado: "ok", cancelado: "muted", en_revision: "bad",
};
export const chip = estado => `<span class="chip ${TONE[estado] || "muted"}">${esc(ESTADO_LABEL[estado] || estado)}</span>`;
export const payChip = e => `<span class="chip ${e === "confirmado" ? "ok" : e === "en_revision" ? "bad" : e === "marcado" || e === "retenido" ? "info" : "warn"}">${esc(PAGO_LABEL[e] || e)}</span>`;
export const stars = n => `<span class="stars" aria-label="${n} de 5">★ ${(+n).toFixed(1)}</span>`;

/* ---------- Avisos ---------- */
export function toast(msg, tone = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; box.setAttribute("role", "status"); document.body.appendChild(box); }
  while (box.children.length >= 3) box.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast ${tone}`; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3800);
  setTimeout(() => el.remove(), 4300);
}
/** Ejecuta una acción del backend y muestra el error de forma amable. */
export function run(fn, okMsg) {
  try { const r = fn(); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) {
    if (e instanceof ApiError) toast(e.message, "bad");
    else { console.error(e); toast("Algo salió mal. Intenta de nuevo.", "bad"); }
    return false;
  }
}

/* ---------- Ventana modal de la app ---------- */
let modalHandlers = {};
export function modal(title, html, handlers = {}) {
  const d = $("#appModal");
  $("#appModalT").textContent = title;
  $("#appModalBody").innerHTML = html;
  modalHandlers = handlers;
  if (!d.open) d.showModal ? d.showModal() : d.setAttribute("open", "");
  const f = $("#appModalBody input, #appModalBody textarea, #appModalBody select");
  if (f) setTimeout(() => f.focus(), 30);
  handlers.mount?.($("#appModalBody"));
  setTimeout(() => fixBrokenLogos?.($("#appModalBody")), 300);
}
export function closeModal() { const d = $("#appModal"); if (d.open) d.close ? d.close() : d.removeAttribute("open"); }
export function initModal() {
  const d = $("#appModal");
  d.addEventListener("click", e => {
    if (e.target === d) return closeModal();
    const b = e.target.closest("[data-mact]");
    if (b && modalHandlers[b.dataset.mact]) modalHandlers[b.dataset.mact](b, $("#appModalBody"));
    if (e.target.closest("[data-mclose]")) closeModal();
  });
  d.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target.closest("form[data-mform]");
    if (f && modalHandlers[f.dataset.mform]) modalHandlers[f.dataset.mform](f, $("#appModalBody"));
  });
  d.addEventListener("input", e => modalHandlers.input?.(e.target, $("#appModalBody")));
}
export function confirmModal(title, texto, label, onOk, tone = "") {
  modal(title, `<p class="m-text">${esc(texto)}</p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button>
    <button class="btn ${tone}" type="button" data-mact="ok">${esc(label)}</button></div>`, { ok: () => { closeModal(); onOk(); } });
}
export const formData = f => Object.fromEntries(new FormData(f).entries());
export const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? NaN : n; };
/** Contadores que se actualizan solos cada segundo (sin volver a dibujar la vista). */
export const left = ts => `<span class="left" data-left="${ts}"></span>`;
export const ago = ts => `<span data-ago="${ts}"></span>`;
export const empty = (titulo, texto, extra = "") => `<div class="empty"><b>${esc(titulo)}</b><p>${esc(texto)}</p>${extra}</div>`;

/* ---------- Imágenes subidas (logo, portada, productos) ----------
   Recorta al centro y reduce en el navegador antes de guardar. En producción
   el archivo resultante se sube a Firebase Storage y se guarda solo su URL. */
export const IMG = { logo: { w: 256, h: 256, q: 0.85 }, portada: { w: 960, h: 480, q: 0.74 }, producto: { w: 320, q: 0.78 } };
export function shrinkImage(file, { w, h, q = 0.8 } = IMG.producto) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type)) return rej(new Error("No es una imagen."));
    if (file.size > 12e6) return rej(new Error("La imagen pesa más de 12 MB."));
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      let sx = 0, sy = 0, sw = im.width, sh = im.height, cw, ch;
      if (h) { // recorte al centro con la proporción pedida
        const r = w / h;
        if (sw / sh > r) { sw = sh * r; sx = (im.width - sw) / 2; } else { sh = sw / r; sy = (im.height - sh) / 2; }
        const k = Math.min(1, w / sw); cw = Math.round(sw * k); ch = Math.round(sh * k);
      } else { const k = Math.min(1, w / Math.max(sw, sh)); cw = Math.round(sw * k); ch = Math.round(sh * k); }
      const c = document.createElement("canvas"); c.width = cw; c.height = ch;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cw, ch); g.drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", q));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("No pudimos leer esa imagen.")); };
    im.src = url;
  });
}
/** Campo de imagen con vista previa. kind: "logo" | "portada". Llama onPick(dataUrl|null). */
export function imageField(name, kind, current, label, hint) {
  return `<div class="f img-f k-${kind}"><span class="lbl">${esc(label)} <span class="opt">· ${esc(hint)}</span></span>
    <div class="img-drop k-${kind}${current ? " has" : ""}" data-imgf="${name}" data-kind="${kind}" ${current ? `style="background-image:url('${current}')"` : ""}>
      <label><input type="file" accept="image/*" data-imgin="${name}"><span>${current ? "Cambiar" : kind === "logo" ? "Subir logo" : "Subir portada"}</span></label>
      ${current ? `<button type="button" class="img-del" data-imgdel="${name}" aria-label="Quitar ${esc(label.toLowerCase())}">Quitar</button>` : ""}
    </div></div>`;
}
/** Conecta los campos imageField dentro de root. state[name] guarda el dataUrl. */
export function bindImageFields(root, state, onErr) {
  root.querySelectorAll("[data-imgin]").forEach(inp => inp.addEventListener("change", async () => {
    const name = inp.dataset.imgin, box = root.querySelector(`[data-imgf="${name}"]`), kind = box.dataset.kind;
    try { state[name] = await shrinkImage(inp.files[0], IMG[kind]); paint(box, state[name]); }
    catch (e) { onErr?.(e.message + " Prueba con otra (JPG o PNG)."); }
  }));
  root.addEventListener("click", e => {
    const b = e.target.closest("[data-imgdel]"); if (!b) return;
    e.preventDefault(); state[b.dataset.imgdel] = null; paint(root.querySelector(`[data-imgf="${b.dataset.imgdel}"]`), null);
  });
  function paint(box, url) {
    const kind = box.dataset.kind, name = box.dataset.imgf;
    box.classList.toggle("has", !!url); box.style.backgroundImage = url ? `url('${url}')` : "";
    box.querySelector("label span").textContent = url ? "Cambiar" : kind === "logo" ? "Subir logo" : "Subir portada";
    let del = box.querySelector(".img-del");
    if (url && !del) box.insertAdjacentHTML("beforeend", `<button type="button" class="img-del" data-imgdel="${name}">Quitar</button>`);
    if (!url && del) del.remove();
  }
}

/* ---------- Logos de medios de pago ----------
   Coloca los archivos en web/assets/: yape.png, plin.png, lemon.png y wallet.png (saldo RAPIDIN).
   Si alguno falta, se muestra una insignia de color con la inicial. */
const PAY = {
  Efectivo: { img: null, fb: "S/", c: "#2F855A" },
  Yape: { img: "assets/yape.png", fb: "Y", c: "#742A8C" },
  Plin: { img: "assets/plin.png", fb: "P", c: "#0EA5C6" },
  Lemon: { img: "assets/lemon.png", fb: "L", c: "#1F1F1F" },
  "Saldo RAPIDIN": { img: "assets/wallet.png", fb: "R", c: "#FF5A1F" },
};
const CASH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/></svg>';
export function payLogo(m, cls = "") {
  const p = PAY[m] || { fb: String(m || "?")[0], c: "#4A5568" };
  if (!p.img) return `<span class="pay-logo fb cash ${cls}" style="--pc:${p.c}">${CASH_SVG}</span>`;
  return `<span class="pay-logo ${cls}" style="--pc:${p.c}"><img src="${p.img}" alt="" data-fb="${p.fb}" loading="lazy"></span>`;
}
export const payName = m => (m === "Saldo RAPIDIN" ? "Saldo RAPIDIN" : m);
/** Etiqueta en línea: logo + nombre del medio. */
export const payTag = (m, cls = "xs") => `<span class="pay-tag">${payLogo(m, cls)}${esc(payName(m))}</span>`;
function useFallback(img) {
  const box = img.parentElement; if (!box) return;
  box.classList.add("fb"); box.textContent = img.dataset.fb;
}
export function fixBrokenLogos(root = document) {
  root.querySelectorAll("img[data-fb]").forEach(img => { if (img.complete && !img.naturalWidth) useFallback(img); });
}
document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG" && t.dataset && "fb" in t.dataset) useFallback(t); }, true);
