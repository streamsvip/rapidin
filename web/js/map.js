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

/** Convierte un clic sobre el mapa en coordenadas normalizadas. */
export function pickPos(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return { x: Math.min(0.99, Math.max(0.01, (ev.clientX - r.left) / r.width)), y: Math.min(0.99, Math.max(0.01, (ev.clientY - r.top) / r.height)) };
}

/** Dibuja todos los mapas declarados con data-map='{...}' dentro de root. */
export function drawMapsIn(root) {
  root.querySelectorAll("canvas[data-map]").forEach(cv => {
    try { drawMap(cv, JSON.parse(cv.dataset.map)); } catch (e) { console.error(e); }
  });
}
export const mapAttr = cfg => `data-map='${JSON.stringify(cfg).replace(/'/g, "&#39;")}'`;
