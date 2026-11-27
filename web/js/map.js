/* =========================================================
   RAPIDIN · Mapas
   Sin API key: mapa referencial de Camaná dibujado en <canvas>.
   Con API key (config.js): Google Maps con los mismos marcadores.
   El repartidor se muestra como un motorizado con su caja RAPIDIN
   que avanza suave entre una ubicación y la siguiente.
   ========================================================= */
import { MAP } from "./core/store.js";

const C = { noche: "#101C2C", manzana: "#1D3150", calle: "#13233A", mar: "#0D3B4A", arena: "#5B5244", plaza: "#166B58", naranja: "#FF5A1F", turquesa: "#20C997", blanco: "#FFFFFF", texto: "rgba(255,255,255,.55)" };

/* ---------- Motorizado con caja RAPIDIN (SVG, mirando a la derecha) ---------- */
export const RIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 60">
<ellipse cx="36" cy="55" rx="27" ry="3.5" fill="rgba(0,0,0,.28)"/>
<rect x="5" y="13" width="23" height="21" rx="4" fill="#FF5A1F" stroke="#101C2C" stroke-width="2"/>
<rect x="5" y="13" width="23" height="6" rx="3" fill="#E04812"/>
<path d="M12.5 21.5h5.2a3.4 3.4 0 0 1 .9 6.7l2.6 3.8h-3.3l-2.3-3.5h-.6v3.5h-2.5Z" fill="#fff"/>
<path d="M27 37h17l7-10h6" fill="none" stroke="#101C2C" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M20 38c0-4 3-6 8-6h14l5 6Z" fill="#101C2C"/>
<path d="M44 33l8 1 3 6h-9Z" fill="#FF5A1F" stroke="#101C2C" stroke-width="1.6" stroke-linejoin="round"/>
<circle cx="18" cy="46" r="7" fill="#101C2C"/><circle cx="18" cy="46" r="3" fill="#C9D2DE"/>
<circle cx="55" cy="46" r="7" fill="#101C2C"/><circle cx="55" cy="46" r="3" fill="#C9D2DE"/>
<path d="M33 31l-3-11c-.4-1.6.6-3 2.2-3.2l6-.7c1.6-.2 2.8 1 2.8 2.6V27l7 2" fill="#20C997" stroke="#101C2C" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
<circle cx="37" cy="10" r="7" fill="#FF5A1F" stroke="#101C2C" stroke-width="1.8"/>
<path d="M38 8.5h5.5a1.5 1.5 0 0 1 0 3H38Z" fill="#101C2C"/>
</svg>`;
const riderImg = new Image();
let riderReady = false;
riderImg.onload = () => { riderReady = true; document.querySelectorAll("canvas.map-canvas").forEach(c => c._cfg && drawMap(c, c._cfg)); };
riderImg.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(RIDER_SVG);

/** Dibuja el mapa. Si el repartidor cambió de lugar, lo mueve suave hasta la nueva posición. */
export function drawMap(canvas, cfg = {}) {
  const rep = (cfg.markers || []).find(m => m.type === "repartidor");
  const prev = canvas._repPos;
  canvas._cfg = cfg;
  if (rep && prev && (prev.x !== rep.pos.x || prev.y !== rep.pos.y) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cancelAnimationFrame(canvas._anim);
    const from = { ...prev }, to = { ...rep.pos }, t0 = performance.now(), dur = 1200;
    const dir = to.x === from.x ? (rep.dir || 1) : to.x > from.x ? 1 : -1;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const pos = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      canvas._repPos = pos;
      paint(canvas, { ...cfg, markers: cfg.markers.map(m => m === rep ? { ...m, pos, dir, moving: k < 1 } : m) });
      if (k < 1) canvas._anim = requestAnimationFrame(step);
    };
    canvas._anim = requestAnimationFrame(step);
    return;
  }
  if (rep) canvas._repPos = { ...rep.pos };
  paint(canvas, cfg);
}
function paint(canvas, { markers = [], route = null, plaza = null } = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 600, h = canvas.clientHeight || 260;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const X = x => x * w, Y = y => y * h;

  g.fillStyle = C.calle; g.fillRect(0, 0, w, h);
  // Mar y playa
  g.fillStyle = C.mar; g.fillRect(0, 0, X(MAP.mar), h);
  g.fillStyle = C.arena; g.fillRect(X(MAP.mar), 0, X(0.03), h);
  // Manzanas
  const bx = 0.052, by = 0.075, gap = 0.012;
  g.fillStyle = C.manzana;
  for (let x = MAP.mar + 0.045; x < 0.99; x += bx) for (let y = 0.01; y < 0.99; y += by) {
    if (Math.abs(x + bx / 2 - 0.5) < 0.02 || Math.abs(y + by / 2 - 0.55) < 0.03) continue; // avenidas
    roundRect(g, X(x), Y(y), X(bx - gap), Y(by - gap * 1.4), 3); g.fill();
  }
  // Avenidas principales
  g.fillStyle = "rgba(255,255,255,.06)";
  g.fillRect(X(0.49), 0, X(0.022), h); g.fillRect(X(MAP.mar + 0.03), Y(0.535), w, Y(0.032));
  if (plaza) { g.fillStyle = C.plaza; roundRect(g, X(plaza.x) - 16, Y(plaza.y) - 12, 32, 24, 4); g.fill(); }
  g.fillStyle = C.texto; g.font = "600 11px Onest, system-ui, sans-serif";
  g.save(); g.translate(X(0.09), h / 2); g.rotate(-Math.PI / 2); g.textAlign = "center"; g.fillText("Océano Pacífico", 0, 0); g.restore();

  if (route && route.length > 1) {
    g.strokeStyle = C.turquesa; g.lineWidth = 3.5; g.setLineDash([7, 6]); g.lineCap = "round";
    g.beginPath();
    route.forEach((p, i) => {
      if (i === 0) return g.moveTo(X(p.x), Y(p.y));
      const prev = route[i - 1];
      g.lineTo(X(p.x), Y(prev.y)); g.lineTo(X(p.x), Y(p.y));
    });
    g.stroke(); g.setLineDash([]);
  }
  markers.forEach(m => marker(g, X(m.pos.x), Y(m.pos.y), m));
}

function marker(g, x, y, m) {
  if (m.type === "entrega") {
    g.fillStyle = "rgba(255,90,31,.22)"; g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill();
    g.fillStyle = C.naranja; g.beginPath(); g.arc(x, y - 18, 11, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x - 8, y - 12); g.lineTo(x + 8, y - 12); g.lineTo(x, y); g.fill();
    g.fillStyle = C.blanco; g.beginPath(); g.arc(x, y - 18, 4, 0, 7); g.fill();
  } else if (m.type === "tienda") {
    g.fillStyle = C.turquesa; roundRect(g, x - 11, y - 11, 22, 22, 6); g.fill();
    g.strokeStyle = C.noche; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x - 5, y - 1); g.lineTo(x + 5, y - 1); g.lineTo(x + 4, y + 5); g.lineTo(x - 4, y + 5); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(x - 2, y - 1); g.lineTo(x, y - 5); g.lineTo(x + 2, y - 1); g.stroke();
  } else if (m.type === "repartidor") {
    // Halo y motorizado con su caja RAPIDIN, mirando hacia donde va.
    g.fillStyle = "rgba(32,201,151,.22)"; g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill();
    g.fillStyle = "rgba(32,201,151,.35)"; g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill();
    if (riderReady) {
      const W = 58, H = 48, bob = m.moving ? Math.sin(performance.now() / 70) * 0.8 : 0;
      g.save(); g.translate(x, y - 14 + bob); if ((m.dir || 1) < 0) g.scale(-1, 1);
      g.drawImage(riderImg, -W / 2, -H / 2, W, H); g.restore();
    } else {
      g.fillStyle = C.blanco; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
      g.fillStyle = C.naranja; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill();
    }
  } else if (m.type === "punto") {
    g.fillStyle = C.blanco; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore();
  } else { // establecimiento de la lista
    g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  if (m.label) {
    g.font = "600 11px Onest, system-ui, sans-serif";
    const tw = g.measureText(m.label).width + 12, ty = m.type === "entrega" ? y - 44 : m.type === "repartidor" ? y - 62 : y - 28;
    g.fillStyle = "rgba(16,28,44,.85)"; roundRect(g, x - tw / 2, ty, tw, 18, 6); g.fill();
    g.fillStyle = C.blanco; g.textAlign = "center"; g.fillText(m.label, x, ty + 13); g.textAlign = "left";
  }
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** Convierte un clic sobre el canvas en coordenadas normalizadas. */
export function pickPos(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.min(0.99, Math.max(0.01, (ev.clientX - r.left) / r.width)), y: Math.min(0.99, Math.max(0.01, (ev.clientY - r.top) / r.height)) };
}

/* =========================================================
   Motor de mapas: Google Maps si hay API key; si no, el mapa
   referencial. Las vistas solo usan mapBox(), drawMapsIn() y
   createPicker(), así que el cambio de motor no las afecta.
   ========================================================= */
let engine = "canvas";          // "canvas" | "loading" | "google"
const gCache = new Map();       // un mapa de Google por clave: evita cobrar una carga nueva en cada actualización
const toLL = p => ({ lat: MAP.latTop + (MAP.latBottom - MAP.latTop) * p.y, lng: MAP.lngLeft + (MAP.lngRight - MAP.lngLeft) * p.x });
const fromLL = ll => ({ x: (ll.lng - MAP.lngLeft) / (MAP.lngRight - MAP.lngLeft), y: (ll.lat - MAP.latTop) / (MAP.latBottom - MAP.latTop) });
export const mapEngine = () => engine;
export { toLL as posToLatLng, fromLL as latLngToPos };
/** true si el punto normalizado cae dentro del rectángulo de cobertura. */
export const inZone = p => !!p && p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99;

/** Busca una dirección escrita con Google (Geocoding API), limitada a Perú y priorizando Camaná.
 *  Devuelve [{ pos, lat, lng, direccion, exacta }] o lanza un Error con un mensaje amable. */
export async function geocodeAddress(texto) {
  if (engine !== "google") throw new Error("sin-google");
  const { Geocoder } = await google.maps.importLibrary("geocoding");
  const bounds = new google.maps.LatLngBounds(toLL({ x: 0.99, y: 0.99 }), toLL({ x: 0.01, y: 0.01 }));
  const q = /caman[aá]/i.test(texto) ? texto : `${texto}, Camaná, Arequipa, Perú`;
  let res;
  try { ({ results: res } = await new Geocoder().geocode({ address: q, bounds, region: "pe", language: "es", componentRestrictions: { country: "PE" } })); }
  catch (e) { throw new Error(/ZERO_RESULTS/.test(e?.code || e?.message || "") ? "No encontramos esa dirección. Agrega una referencia o el número de la cuadra." : "No pudimos consultar Google Maps. Revisa que la Geocoding API esté activada."); }
  return (res || []).slice(0, 4).map(r => {
    const ll = r.geometry.location.toJSON();
    return { pos: fromLL(ll), lat: ll.lat, lng: ll.lng, direccion: r.formatted_address, exacta: ["ROOFTOP", "RANGE_INTERPOLATED"].includes(r.geometry.location_type) };
  });
}

/** HTML de un mapa de solo lectura. key identifica el mapa para reutilizarlo (por ejemplo, el id del pedido). */
export function mapBox(cfg, { height = 300, key = "", label = "Mapa" } = {}) {
  return `<div class="map" style="height:${height}px" data-key="${key}" data-map='${JSON.stringify(cfg).replace(/'/g, "&#39;")}' role="img" aria-label="${label}"></div>`;
}
/** Compatibilidad con vistas antiguas que usan atributos sueltos. */
export const mapAttr = cfg => `data-map='${JSON.stringify(cfg).replace(/'/g, "&#39;")}'`;

export function drawMapsIn(root) {
  root.querySelectorAll("[data-map]").forEach(el => {
    let cfg; try { cfg = JSON.parse(el.dataset.map); } catch (e) { return; }
    if (el.tagName === "CANVAS") return drawMap(el, cfg);
    if (engine === "google") return drawGoogle(el, cfg);
    let cv = el.querySelector("canvas");
    if (!cv) { cv = document.createElement("canvas"); cv.className = "map-canvas"; el.appendChild(cv); }
    drawMap(cv, cfg);
  });
}

/** Mapa para elegir un punto. getCfg() devuelve marcadores y ruta; onPick(pos) recibe el punto o null si cae fuera de la zona. */
export function createPicker(el, getCfg, onPick) {
  el.classList.add("map", "pick");
  const api = { redraw() {}, focus() {}, engine };
  if (engine === "google") {
    const g = googleFor(el, null, true);
    g.map.addListener("click", ev => { const p = fromLL(ev.latLng.toJSON()); onPick(inZone(p) ? p : null, "google"); });
    api.redraw = () => paintGoogle(g, getCfg(), false);
    api.focus = (p, zoom = 18) => { if (!p) return; g.map.panTo(toLL(p)); if (g.map.getZoom() < zoom) g.map.setZoom(zoom); };
  } else {
    el.innerHTML = ""; const cv = document.createElement("canvas"); cv.className = "map-canvas"; el.appendChild(cv);
    cv.addEventListener("click", ev => onPick(pickPos(cv, ev), "canvas"));
    api.redraw = () => drawMap(cv, getCfg());
  }
  api.redraw();
  return api;
}

/* ---------- Google Maps ---------- */
export function initMaps(CONFIG, onReady) {
  if (!CONFIG?.googleMapsApiKey || engine !== "canvas") return;
  engine = "loading";
  const fail = why => { console.warn("Google Maps no disponible, se usa el mapa referencial:", why); engine = "canvas"; gCache.clear(); onReady?.(); };
  window.gm_authFailure = () => fail("la API key fue rechazada (revisa restricciones y facturación)");
  window.__rapidinMapsReady = async () => {
    try {
      await google.maps.importLibrary("maps"); await google.maps.importLibrary("marker");
      engine = "google"; mapId = CONFIG.googleMapId || "DEMO_MAP_ID"; onReady?.();
    } catch (e) { fail(e.message); }
  };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.googleMapsApiKey)}&v=weekly&language=es&region=PE&loading=async&callback=__rapidinMapsReady`;
  s.async = true; s.onerror = () => fail("no se pudo cargar el script");
  document.head.appendChild(s);
}
let mapId = "DEMO_MAP_ID";
function googleFor(el, key, picking) {
  if (key && gCache.has(key)) { const g = gCache.get(key); if (g.el !== el) { g.el.style.height = el.style.height; el.replaceWith(g.el); } return g; }
  const inner = picking ? el : document.createElement("div");
  if (!picking) { inner.className = el.className; inner.style.cssText = el.style.cssText; inner.setAttribute("role", "img"); inner.setAttribute("aria-label", el.getAttribute("aria-label") || "Mapa"); el.replaceWith(inner); }
  inner.innerHTML = "";
  // En los mapas para marcar, un solo dedo mueve el mapa (greedy) y hay botón de pantalla completa: es más fácil tocar el punto exacto.
  const map = new google.maps.Map(inner, { center: toLL({ x: 0.6, y: 0.45 }), zoom: 15, mapId, disableDefaultUI: true, zoomControl: true, fullscreenControl: !!picking, gestureHandling: picking ? "greedy" : "cooperative", clickableIcons: false });
  const g = { el: inner, map, marks: [], line: null, fitted: false };
  if (key) gCache.set(key, g);
  return g;
}
function drawGoogle(el, cfg) { const g = googleFor(el, el.dataset.key || null, false); paintGoogle(g, cfg, true); }
function pinEl(m) {
  const d = document.createElement("div");
  d.className = `gm-pin ${m.type}`;
  if (m.type === "repartidor") { const r = document.createElement("i"); r.className = "gm-rider" + ((m.dir || 1) < 0 ? " left" : ""); r.innerHTML = RIDER_SVG; d.appendChild(r); }
  if (m.label) { const l = document.createElement("span"); l.textContent = m.label; d.appendChild(l); }
  return d;
}
function paintGoogle(g, cfg, fit) {
  g.marks.forEach(m => (m.map = null)); g.marks = [];
  (cfg.markers || []).forEach(m => {
    const mk = new google.maps.marker.AdvancedMarkerElement({ map: g.map, position: toLL(m.pos), content: pinEl(m), title: m.label || "" });
    g.marks.push(mk);
    // El motorizado avanza suave desde su ubicación anterior.
    if (m.type === "repartidor") {
      const from = g.repPos, to = toLL(m.pos); g.repPos = to;
      if (from && (from.lat !== to.lat || from.lng !== to.lng) && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const t0 = performance.now(), dur = 1200;
        mk.position = from;
        const step = now => { const k = Math.min(1, (now - t0) / dur), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          mk.position = { lat: from.lat + (to.lat - from.lat) * e, lng: from.lng + (to.lng - from.lng) * e }; if (k < 1 && mk.map) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }
    }
  });
  if (g.line) g.line.setMap(null);
  if (cfg.route && cfg.route.length > 1) {
    // Ruta referencial. En producción la calcula RoutingService (Cloud Functions) una sola vez por pedido.
    const path = []; cfg.route.forEach((p, i) => { if (i) path.push(toLL({ x: p.x, y: cfg.route[i - 1].y })); path.push(toLL(p)); });
    g.line = new google.maps.Polyline({ map: g.map, path, strokeColor: "#20C997", strokeOpacity: 0, icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeWeight: 4, scale: 3 }, offset: "0", repeat: "14px" }] });
  }
  if (fit && !g.fitted && cfg.markers?.length) {
    const b = new google.maps.LatLngBounds(); cfg.markers.forEach(m => b.extend(toLL(m.pos)));
    if (cfg.markers.length > 1) g.map.fitBounds(b, 48); else g.map.setCenter(toLL(cfg.markers[0].pos));
    g.fitted = true;
  }
}
