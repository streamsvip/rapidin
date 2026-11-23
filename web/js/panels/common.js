/* RAPIDIN · piezas compartidas entre paneles */
import { ESTADOS, ESTADO_LABEL } from "../demo/api.js";
import { esc, fmtDate, sol, avatar, stars } from "../ui.js";
import { mapAttr } from "../map.js";

const FLOW = ["solicitado", "ofertas_recibidas", "oferta_aceptada", "camino_a_recogida", "en_establecimiento", "pedido_recogido", "camino_a_entrega", "repartidor_cerca", "entregado"];

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
  return `<canvas class="map" style="height:${height}px" ${mapAttr({ markers, route, plaza: db.config.puntoEstrategico.pos })} role="img" aria-label="Mapa del pedido: recogida, entrega${o.tracking ? " y ubicación del repartidor" : ""}"></canvas>
    <div class="map-legend"><span><i class="lgd tienda"></i>Recogida</span><span><i class="lgd entrega"></i>Entrega</span>${showCourier && o.tracking ? `<span><i class="lgd rep"></i>Repartidor</span>` : ""}<span class="lg-note">Mapa referencial</span></div>`;
}
const shortFirst = n => String(n || "").split(" ")[0];

export function courierMini(db, id, extra = "") {
  const u = db.users[id], c = db.couriers[id];
  if (!u) return "";
  const veh = { moto: "Moto", mototaxi: "Mototaxi", bicicleta: "Bicicleta", pie: "A pie" }[c?.vehiculo] || "";
  return `<div class="person">${avatar(id, u.nombre)}<div><b>${esc(u.nombre)}</b><span>${c ? `${stars(c.rating)} · ${c.completados} pedidos${veh ? ` · ${veh}` : ""}` : ""}</span></div>${extra}</div>`;
}

export function orderSummaryRows(o) {
  return `<dl class="kv">
    <div><dt>Modalidad</dt><dd>${o.modalidad === "libre" ? "Compra libre" : "Tienda específica"}</dd></div>
    ${o.tienda ? `<div><dt>Establecimiento</dt><dd>${esc(o.tienda.nombre)}<small>${esc(o.tienda.direccion || "")}</small></dd></div>` : ""}
    ${o.distanciaKm != null ? `<div><dt>Distancia de referencia</dt><dd>${o.distanciaKm.toFixed(1)} km</dd></div>` : ""}
    <div><dt>Referencia de entrega</dt><dd>${esc(o.entrega.referencia || "—")}</dd></div>
    <div><dt>Medio de pago</dt><dd>${esc(o.pago)}</dd></div>
    ${o.precioTotal != null ? `<div><dt>Precio total</dt><dd><b>${sol(o.precioTotal)}</b></dd></div>` : ""}
    <div><dt>Creado</dt><dd>${fmtDate(o.creado)}</dd></div>
  </dl>`;
}
export const vehLabel = v => ({ moto: "Moto", mototaxi: "Mototaxi", bicicleta: "Bicicleta", pie: "A pie" }[v] || v);
