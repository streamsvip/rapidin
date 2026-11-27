/* RAPIDIN · piezas compartidas entre paneles */
import * as api from "../demo/api.js";
import { ESTADOS, ESTADO_LABEL, MODALIDAD } from "../demo/api.js";
import { $, esc, fmtDate, sol, avatar, stars, payTag, run, contactButtons, IC_CHAT } from "../ui.js";
import { espIcon } from "../demo/store.js";
import { mapBox } from "../map.js";

const FLOW = ["solicitado", "ofertas_recibidas", "oferta_aceptada", "camino_a_recogida", "en_establecimiento", "pedido_recogido", "camino_a_entrega", "repartidor_cerca", "por_confirmar", "entregado"];

/** Línea de tiempo con la hora de cada estado alcanzado. */
export function timeline(o) {
  const at = {};
  o.events.forEach(e => { at[e.estado] ||= e.t; });
  if (o.estado === "cancelado") {
    const ev = o.events.filter(e => e.estado === "cancelado").pop();
    return `<ol class="timeline">${o.events.filter(e => FLOW.includes(e.estado)).map(e => `<li class="done"><span>${esc(ESTADO_LABEL[e.estado])}</span><time>${fmtDate(e.t)}</time></li>`).join("")}
      <li class="cancel"><span>Cancelado${ev?.nota ? ` · ${esc(ev.nota)}` : ""}</span><time>${ev ? fmtDate(ev.t) : ""}</time></li></ol>`;
  }
  const cur = ESTADOS.indexOf(o.estado);
  return `<ol class="timeline">${FLOW.map(s => {
    const i = ESTADOS.indexOf(s);
    const cls = s === o.estado ? (s === "entregado" ? "done" : "now") : i < cur ? "done" : "";
    const label = s === "en_establecimiento" && o.modalidad === "libre" ? "Comprando tu pedido" : ESTADO_LABEL[s];
    return `<li class="${cls}"><span>${esc(label)}</span>${at[s] ? `<time>${fmtDate(at[s])}</time>` : ""}</li>`;
  }).join("")}</ol>`;
}

/** Configuración del mapa de un pedido: recogida, entrega, repartidor y ruta. */
export function orderMap(o, db, { showCourier = true, height = 300 } = {}) {
  const markers = [];
  const pick = o.tienda?.pos || o.recogida;
  if (pick) markers.push({ pos: pick, type: "tienda", label: o.tienda ? o.tienda.nombre : "Recogida" });
  markers.push({ pos: o.entrega.pos, type: "entrega", label: "Entrega" });
  let route = null;
  if (showCourier && o.tracking?.pos) {
    markers.push({ pos: o.tracking.pos, type: "repartidor", label: shortFirst(db.users[o.courierId]?.nombre) });
    const target = ["repartidor_asignado", "camino_a_recogida", "en_establecimiento"].includes(o.estado) && pick ? pick : o.entrega.pos;
    route = o.estado === "en_establecimiento" ? (pick ? [pick, o.entrega.pos] : null) : [o.tracking.pos, target];
  } else if (pick && !["entregado", "cancelado"].includes(o.estado)) route = [pick, o.entrega.pos];
  return `${mapBox({ markers, route, plaza: db.config.puntoEstrategico.pos }, { height, key: `o-${o.id}`, label: `Mapa del pedido: recogida, entrega${o.tracking ? " y ubicación del repartidor" : ""}` })}
    <div class="map-legend"><span><i class="lgd tienda"></i>Recogida</span><span><i class="lgd entrega"></i>Entrega</span>${showCourier && o.tracking ? `<span><i class="lgd rep"></i>Repartidor</span>` : ""}<span class="lg-note">Mapa referencial</span></div>`;
}
const shortFirst = n => String(n || "").split(" ")[0];

export function courierMini(db, id, extra = "") {
  const u = db.users[id], c = db.couriers[id];
  if (!u) return "";
  const veh = { moto: "Moto", mototaxi: "Mototaxi", bicicleta: "Bicicleta", pie: "A pie" }[c?.vehiculo] || "";
  return `<div class="person">${avatar(id, u.nombre)}<div><b>${esc(u.nombre)}</b><span>${c ? `${stars(c.rating, c.ratingCount)} · ${c.completados} pedidos${veh ? ` · ${veh}` : ""}` : ""}</span></div>${extra}</div>`;
}

export function orderSummaryRows(o) {
  return `<dl class="kv">
    <div><dt>Modalidad</dt><dd>${MODALIDAD[o.modalidad]}</dd></div>
    ${o.tienda ? `<div><dt>Establecimiento</dt><dd>${esc(o.tienda.nombre)}<small>${esc(o.tienda.direccion || "")}</small></dd></div>` : ""}
    ${o.distanciaKm != null ? `<div><dt>Distancia de referencia</dt><dd>${o.distanciaKm.toFixed(1)} km</dd></div>` : ""}
    <div><dt>Referencia de entrega</dt><dd>${esc(o.entrega.referencia || "—")}</dd></div>
    <div><dt>Medio de pago</dt><dd>${payTag(o.pago)}</dd></div>
    ${o.precioTotal != null ? `<div><dt>Precio total</dt><dd><b>${sol(o.precioTotal)}</b></dd></div>` : ""}
    <div><dt>Creado</dt><dd>${fmtDate(o.creado)}</dd></div>
  </dl>`;
}
export const vehLabel = v => ({ moto: "Moto", mototaxi: "Mototaxi", bicicleta: "Bicicleta", pie: "A pie" }[v] || v);

/* ---------- Market: productos del pedido, portadas y fichas ---------- */
export function itemsList(o, { compact = false } = {}) {
  if (!o.items?.length) return "";
  const rows = compact ? o.items.slice(0, 4) : o.items;
  return `<ul class="items${compact ? " compact" : ""}">${rows.map(i => `<li><span class="qty">${i.cantidad}×</span><span class="it-name">${esc(i.nombre)}</span><b>${sol(i.total)}</b></li>`).join("")}
    ${compact && o.items.length > 4 ? `<li class="more">y ${o.items.length - 4} más</li>` : ""}</ul>
    ${compact ? "" : `<div class="items-total"><span>Subtotal (precio del local)</span><b>${sol(o.subtotal)}</b></div>`}
    ${o.nota && !compact ? `<p class="hint-s" style="margin-top:8px"><b>Nota:</b> ${esc(o.nota)}</p>` : ""}`;
}
export const CAT = {
  Comida: { c: "#FF5A1F", i: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M8 7c0-1.5 1-2 1-3M12 7c0-1.5 1-2 1-3M16 7c0-1.5 1-2 1-3"/>' },
  Mercado: { c: "#16A37A", i: '<path d="M3 9h18l-2 10H5L3 9Z"/><path d="M8 9l4-5 4 5"/>' },
  Farmacia: { c: "#4C6FFF", i: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>' },
  Regalos: { c: "#E0457B", i: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1Zm0 0c2-4 6-4 6-1s-6 1-6 1Z"/>' },
  Ferretería: { c: "#D08A00", i: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L11 18.8a2 2 0 0 1-2.8-2.8l8.4-8.4"/><path d="M14.5 5.5l2.2-2.2 4 4-2.2 2.2"/>' },
  Mascotas: { c: "#9F5BFF", i: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2-4 2s-4 0-4-2Z"/>' },
  Otros: { c: "#0EA5C6", i: '<path d="M3 7l9-4 9 4v10l-9 4-9-4V7Z"/><path d="M3 7l9 4 9-4M12 11v10"/>' },
};
export const catOf = c => CAT[c] || CAT.Otros;
export const catIcon = (c, cls = "") => `<svg class="cat-ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${catOf(c).i}</svg>`;
/** Logo del local o, si no tiene, la insignia de su categoría. cls: "" | "lg" | "xl". */
export function storeLogo(e, cls = "") {
  return e.logo ? `<span class="cat-badge logo ${cls}"><img src="${e.logo}" alt="Logo de ${esc(e.nombre || "")}" loading="lazy"></span>`
    : (e.etiquetas || []).length ? `<span class="cat-badge emo ${cls}" style="--cat:${catOf(e.categoria).c}" aria-hidden="true">${espIcon(e.etiquetas[0])}</span>`
    : `<span class="cat-badge ${cls}" style="--cat:${catOf(e.categoria).c}">${catIcon(e.categoria, cls === "xl" ? "xl" : "")}</span>`;
}
/** Estilo de fondo para portadas: foto del local o degradado de su categoría. */
export const coverStyle = e => `--cat:${catOf(e.categoria).c}${e.portada ? `;background-image:linear-gradient(180deg,rgba(16,28,44,.05),rgba(16,28,44,.55)),url('${e.portada}')` : ""}`;
/** Imagen del producto o, si no tiene, un mosaico con el ícono de la categoría del local. */
export function productThumb(p, cat) {
  return p.img ? `<img class="thumb" src="${p.img}" alt="" loading="lazy">` : `<span class="thumb ph" style="--cat:${catOf(cat).c}">${catIcon(cat)}</span>`;
}

/* =========================================================
   Chat del pedido: botón flotante + panel de mensajes
   ========================================================= */
const QUICK = {
  cliente: [["Ya te pagué", "Ya te envié el {pago}."], ["¿Cuánto falta?", "¿Cuánto falta para que llegues?"], ["Ya salgo", "Ya salgo a recibirlo."], ["Déjalo en la puerta", "Déjalo en la puerta, por favor."]],
  repartidor: [["Estoy afuera", "Ya estoy afuera."], ["Llego en 5 min", "Llego en 5 minutos."], ["¿Ya pagaste?", "¿Ya pudiste enviar el {pago}? Cuando lo envíes, toca «Ya pagué» en tu pedido."], ["No encuentro la dirección", "No encuentro la dirección, ¿me das una referencia?"]],
};
const hhmm = t => new Date(t).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
const otherOf = (o, uid) => (uid === o.clienteId ? o.courierId : o.clienteId);
export function chatShell(ctx, role) {
  return `${ctx.live("chatfab", () => {
    const o = ctx.db.orders[ctx.state.id];
    if (!o?.courierId || o.estado === "cancelado") return "";
    const n = api.chatUnread(o, ctx.uid), other = ctx.db.users[otherOf(o, ctx.uid)];
    return `<button class="chat-fab${n ? " has" : ""}" type="button" data-act="chatOpen" aria-label="Abrir chat con ${esc(other?.nombre || "")}${n ? `, ${n} sin leer` : ""}">${IC_CHAT}<span>Chat</span>${n ? `<b class="badge">${n}</b>` : ""}</button>`;
  })}
  <div class="chat-sheet" id="chatSheet" hidden role="dialog" aria-label="Chat del pedido">
    <div class="chat-head">${ctx.live("chathead", () => {
      const o = ctx.db.orders[ctx.state.id]; if (!o?.courierId) return "";
      const id = otherOf(o, ctx.uid), u = ctx.db.users[id];
      return `<div class="person sm">${avatar(id, u.nombre)}<div><b>${esc(u.nombre.split(" ").slice(0, 2).join(" "))}</b><span>${role === "cliente" ? "Tu repartidor" : "Cliente"} · ${o.codigo}</span></div></div>
        ${api.chatOpen(o) ? contactButtons({ tel: u.telefono }) : ""}`;
    })}<button class="x" type="button" data-act="chatClose" aria-label="Cerrar chat"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div>
    <div class="chat-body" id="chatBody">${ctx.live("chatmsgs", () => {
      const o = ctx.db.orders[ctx.state.id]; if (!o) return "";
      const msgs = o.chat || [];
      return `${msgs.length ? msgs.map((m, i) => `${i === 0 || new Date(m.t).toDateString() !== new Date(msgs[i - 1].t).toDateString() ? `<p class="chat-day">${new Date(m.t).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</p>` : ""}<div class="msg ${m.por === ctx.uid ? "me" : "them"}"><p>${esc(m.texto)}</p><time>${hhmm(m.t)}</time></div>`).join("")
        : `<div class="chat-empty">${IC_CHAT}<p>Coordina la entrega o el pago por aquí. Los mensajes quedan guardados en el pedido.</p></div>`}
        ${api.chatOpen(o) ? "" : `<p class="chat-closed">El chat se cerró al terminar el pedido.</p>`}`;
    })}</div>
    <div class="chat-quick">${QUICK[role].map(([l], i) => `<button type="button" class="sug" data-act="chatQuick" data-q="${i}">${esc(l)}</button>`).join("")}</div>
    <form class="chat-form" data-form="chat" novalidate><input class="in" name="m" id="chatIn" maxlength="300" placeholder="Escribe un mensaje…" autocomplete="off" aria-label="Mensaje"><button class="btn small" type="submit" aria-label="Enviar"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7-7-1Z"/></svg></button></form>
  </div>`;
}
const scrollChat = () => { const b = $("#chatBody"); if (b) b.scrollTop = b.scrollHeight; };
export function openChat(ctx) {
  const s = $("#chatSheet"); if (!s) return;
  s.hidden = false; document.body.classList.add("chat-on");
  api.markChatRead(ctx.uid, ctx.state.id); requestAnimationFrame(scrollChat);
  if (matchMedia("(pointer:fine)").matches) setTimeout(() => $("#chatIn")?.focus(), 60);
}
export function sendChat(ctx, texto) { return run(() => api.sendChatMessage(ctx.uid, ctx.state.id, texto)); }
export function chatHandlers(role) {
  return {
    actions: {
      chatOpen(b, ctx) { openChat(ctx); },
      chatClose() { const s = $("#chatSheet"); if (s) s.hidden = true; document.body.classList.remove("chat-on"); },
      chatQuick(b, ctx) { const o = ctx.db.orders[ctx.state.id]; if (sendChat(ctx, QUICK[role][+b.dataset.q][1].replace("{pago}", o.pago))) openChat(ctx); },
    },
    forms: { chat(f, ctx) { const v = f.m.value.trim(); if (!v) return; if (sendChat(ctx, v)) { f.m.value = ""; f.m.focus(); } } },
    afterLive(el, key, ctx) { if (key === "chatmsgs") { scrollChat(); if (!$("#chatSheet")?.hidden) api.markChatRead(ctx.uid, ctx.state.id); } },
  };
}

/* =========================================================
   Locales: calificación, especialidades y tarjeta profesional
   ========================================================= */
export const ratingTag = e => e.ratingCount ? `<span class="rt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></svg>${(+e.rating).toFixed(1)} <small>(${e.ratingCount})</small></span>` : `<span class="rt new">Nuevo</span>`;
export const tagsLine = e => (e.etiquetas || []).map(t => `${espIcon(t)} ${esc(t)}`).join(" · ") || esc(e.categoria);

/** Fila horizontal de categorías con flechas. items: [[nombre, emoji, cantidad]]. */
export function catBar(items, active, act, { all = "Todo", keep = 0, label = "Categorías" } = {}) {
  const chip = (n, ic, c) => `<button type="button" class="cat-chip" data-act="${act}" data-c="${esc(n)}" aria-pressed="${active === n}"><span class="cc-ic">${ic}</span><span class="cc-t">${esc(n || all)}${c != null ? `<small>${c}</small>` : ""}</span></button>`;
  return `<div class="hs cat-bar" data-keep="${keep || ""}" role="group" aria-label="${esc(label)}">
    <button type="button" class="hs-arrow prev" data-hs-dir="-1" aria-label="Ver categorías anteriores" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
    <div class="hs-track">${chip("", "✨")}${items.map(([n, ic, c]) => chip(n, ic, c)).join("")}</div>
    <button type="button" class="hs-arrow next" data-hs-dir="1" aria-label="Ver más categorías" tabindex="-1"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
  </div>`;
}
/** Interruptor profesional (switch) con etiqueta y contador opcional. */
export const switchCtl = (change, checked, label, count) => `<label class="sw-ctl"><input type="checkbox" role="switch" data-change="${change}" ${checked ? "checked" : ""}><span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span><span class="sw-txt">${esc(label)}${count != null ? ` <b>${count}</b>` : ""}</span></label>`;
