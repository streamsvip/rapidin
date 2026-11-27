/* =========================================================
   RAPIDIN · Mapa referencial de Camaná (DEMOSTRACIÓN)
   Dibuja calles, mar y marcadores en un <canvas>. En la versión
   real se reemplaza por Google Maps (Maps JavaScript en la web,
   SDK nativo en las apps) con los mismos tipos de marcador.
   ========================================================= */
import { MAP } from "./demo/store.js";

const C = { noche: "#101C2C", manzana: "#1D3150", calle: "#13233A", mar: "#0D3B4A", arena: "#5B5244", plaza: "#166B58", naranja: "#FF5A1F", turquesa: "#20C997", blanco: "#FFFFFF", texto: "rgba(255,255,255,.55)" };

export function drawMap(canvas, { markers = [], route = null, plaza = null } = {}) {
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
    g.fillStyle = "rgba(32,201,151,.25)"; g.beginPath(); g.arc(x, y, 15, 0, 7); g.fill();
    g.fillStyle = C.blanco; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill();
    g.fillStyle = C.turquesa; g.beginPath(); g.arc(x, y, 6.5, 0, 7); g.fill();
  } else if (m.type === "punto") {
    g.fillStyle = C.blanco; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore();
  } else { // establecimiento de la lista
    g.fillStyle = "rgba(255,255,255,.35)"; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  if (m.label) {
    g.font = "600 11px Onest, system-ui, sans-serif";
    const tw = g.measureText(m.label).width + 12, ty = m.type === "entrega" ? y - 44 : y - 28;
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
  if (m.label) { const l = document.createElement("span"); l.textContent = m.label; d.appendChild(l); }
  return d;
}
function paintGoogle(g, cfg, fit) {
  g.marks.forEach(m => (m.map = null)); g.marks = [];
  (cfg.markers || []).forEach(m => g.marks.push(new google.maps.marker.AdvancedMarkerElement({ map: g.map, position: toLL(m.pos), content: pinEl(m), title: m.label || "" })));
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
