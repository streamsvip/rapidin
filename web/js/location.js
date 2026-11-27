/* =========================================================
   RAPIDIN · Campo de ubicación de un local
   Cuatro formas de marcar dónde está el negocio:
     1. Escribir la dirección → Google la busca (Geocoding API).
     2. Usar la ubicación del celular (GPS), ideal estando en el local.
     3. Pegar un enlace o coordenadas copiadas de Google Maps.
     4. Tocar el mapa (siempre disponible para ajustar).
   Siempre se puede abrir el punto en Google Maps para confirmarlo.
   ========================================================= */
import { createPicker, geocodeAddress, mapEngine, posToLatLng, latLngToPos, inZone } from "./map.js";
import { MAP } from "./demo/store.js";
import { esc } from "./ui.js";

const gmUrl = p => { const ll = posToLatLng(p); return `https://www.google.com/maps/search/?api=1&query=${ll.lat.toFixed(6)},${ll.lng.toFixed(6)}`; };
const gmSearchUrl = t => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(/caman[aá]/i.test(t) ? t : `${t}, Camaná, Arequipa`)}`;

/** Lee coordenadas de un enlace largo de Google Maps o de un texto «-16.62, -72.71». */
export function parseMapsInput(txt) {
  const s = String(txt || "").trim();
  if (!s) return { error: "Pega un enlace de Google Maps o las coordenadas." };
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(s)) return { error: "Ese es un enlace corto. Ábrelo en el navegador y copia el enlace largo de la barra de direcciones, o mantén presionado el punto en Google Maps y copia las coordenadas." };
  const num = "(-?\\d{1,3}\\.\\d+)";
  const pats = [new RegExp(`!3d${num}!4d${num}`), new RegExp(`[?&](?:q|query|ll|destination|center)=${num},\\s*${num}`), new RegExp(`@${num},${num}`), new RegExp(`^${num}\\s*,\\s*${num}$`)];
  for (const re of pats) {
    const m = s.match(re);
    if (m) { const lat = +m[1], lng = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }; }
  }
  return { error: "No encontramos coordenadas en ese texto. Copia el enlace completo o las coordenadas (por ejemplo -16.6241, -72.7110)." };
}

/**
 * Monta el campo dentro de `el`.
 * opts: { pos, direccion (input de dirección a sincronizar), others() → marcadores extra, onChange(pos, fuente), height }
 * Devuelve { get pos(), get fuente(), setPos(pos, fuente) }.
 */
export function locationField(el, opts = {}) {
  let pos = opts.pos ? { ...opts.pos } : null, fuente = opts.fuente || (pos ? "guardada" : "");
  const google = mapEngine() === "google";
  el.classList.add("loc");
  el.innerHTML = `
    <div class="loc-search">
      <input class="in" type="search" data-l="q" placeholder="Escribe la dirección del local (ej.: Av. Lima 345)" aria-label="Dirección para buscar" autocomplete="street-address">
      <button class="btn small" type="button" data-l="find">${google ? "Buscar" : "Buscar en Google Maps"}</button>
    </div>
    <div class="loc-results" data-l="res" hidden></div>
    <div class="loc-tools">
      <button class="loc-chip" type="button" data-l="gps">Usar mi ubicación</button>
      <button class="loc-chip" type="button" data-l="paste">Pegar enlace o coordenadas</button>
    </div>
    <div class="loc-paste" data-l="pbox" hidden>
      <input class="in" data-l="pin" placeholder="https://www.google.com/maps/…  o  -16.6241, -72.7110" aria-label="Enlace o coordenadas de Google Maps">
      <button class="btn small ghost-dark" type="button" data-l="pok">Usar</button>
    </div>
    <div class="loc-map" data-l="map" style="height:${opts.height || 260}px" role="img" aria-label="Mapa: toca el punto exacto del local"></div>
    <div class="loc-status" data-l="st" role="status"></div>`;
  const q = s => el.querySelector(`[data-l="${s}"]`);
  const status = () => {
    const st = q("st");
    if (!pos) { st.className = "loc-status"; st.innerHTML = `<span>Aún no marcas la ubicación. Busca la dirección o toca el mapa en la puerta del local.</span>`; return; }
    const ll = posToLatLng(pos), F = { google: "encontrada en Google Maps", gps: "tomada del GPS", enlace: "tomada de Google Maps", mapa: "marcada en el mapa", guardada: "guardada" };
    st.className = "loc-status ok";
    st.innerHTML = `<span><b>Ubicación ${F[fuente] || "marcada"}</b> · ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}. Si el pin no está en la puerta, toca el punto exacto.</span><a class="link" href="${gmUrl(pos)}" target="_blank" rel="noopener">Confirmar en Google Maps ↗</a>`;
  };
  const err = msg => { const st = q("st"); st.className = "loc-status bad"; st.innerHTML = `<span>${esc(msg)}</span>`; };
  const set = (p, f, { focus = true } = {}) => {
    if (!inZone(p)) return err("Ese punto está fuera de la zona de cobertura de Camaná."), false;
    if (!google && p.x < MAP.mar + 0.03) return err("Ese punto cae en el mar. Toca una calle de Camaná."), false;
    pos = { x: +p.x.toFixed(5), y: +p.y.toFixed(5) }; fuente = f;
    picker.redraw(); if (focus) picker.focus(pos); status(); opts.onChange?.(pos, fuente);
    return true;
  };
  const picker = createPicker(q("map"), () => ({ markers: [...(opts.others?.() || []), ...(pos ? [{ pos, type: "tienda", label: "Aquí" }] : [])] }), p => {
    if (!p) return err("Ese punto está fuera de la zona de cobertura de Camaná.");
    set(p, "mapa", { focus: false });
  });
  if (pos) picker.focus(pos, 17);
  status();

  // 1. Dirección escrita
  // El buscador copia lo que se escribe en «Dirección» hasta que el usuario lo edite a mano.
  if (opts.direccion?.value) q("q").value = opts.direccion.value;
  q("q").addEventListener("input", () => (q("q").dataset.own = "1"));
  opts.direccion?.addEventListener("input", () => { if (!q("q").dataset.own) q("q").value = opts.direccion.value; });
  const find = async () => {
    const txt = (q("q").value.trim() || opts.direccion?.value.trim() || "");
    q("q").value = txt;
    if (txt.length < 4) return err("Escribe la dirección con calle y número o una referencia.");
    if (opts.direccion && !opts.direccion.value.trim()) opts.direccion.value = txt;
    if (!google) {
      window.open(gmSearchUrl(txt), "_blank", "noopener");
      q("pbox").hidden = false;
      return err("Abrimos Google Maps con esa dirección. Copia el enlace (o mantén presionado el punto y copia las coordenadas) y pégalo abajo en «Usar».");
    }
    const box = q("res"); box.hidden = false; box.innerHTML = `<p class="hint-s">Buscando en Google Maps…</p>`;
    try {
      const list = (await geocodeAddress(txt)).filter(r => inZone(r.pos));
      if (!list.length) { box.hidden = true; return err("Google encontró esa dirección, pero fuera de Camaná. Revisa el texto o marca el punto en el mapa."); }
      if (list.length === 1) { box.hidden = true; return pick(list[0]); }
      box.innerHTML = `<p class="hint-s">Elige la dirección correcta:</p>${list.map((r, i) => `<button type="button" class="loc-opt" data-i="${i}">${esc(r.direccion)}${r.exacta ? "" : ` <small>aproximada</small>`}</button>`).join("")}`;
      box.onclick = e => { const b = e.target.closest(".loc-opt"); if (b) { box.hidden = true; pick(list[+b.dataset.i]); } };
    } catch (e) { box.hidden = true; err(e.message === "sin-google" ? "La búsqueda no está disponible." : e.message); }
  };
  const pick = r => {
    if (set(r.pos, "google") && opts.direccion && (!opts.direccion.value.trim() || opts.direccion.value.trim() === q("q").value.trim())) opts.direccion.value = r.direccion.replace(/, Perú$/, "");
    if (!r.exacta) err("Google ubicó la calle, pero no el número exacto. Toca la puerta del local en el mapa para afinar.");
  };
  q("find").addEventListener("click", find);
  q("q").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); find(); } });

  // 2. GPS
  q("gps").addEventListener("click", () => {
    if (!navigator.geolocation) return err("Este navegador no permite usar tu ubicación.");
    q("gps").disabled = true; q("st").innerHTML = `<span>Obteniendo tu ubicación…</span>`;
    navigator.geolocation.getCurrentPosition(
      g => { q("gps").disabled = false; set(latLngToPos({ lat: g.coords.latitude, lng: g.coords.longitude }), "gps"); if (g.coords.accuracy > 60) err(`Tu GPS tiene un margen de ±${Math.round(g.coords.accuracy)} m. Toca la puerta del local para afinar.`); },
      e => { q("gps").disabled = false; err(e.code === 1 ? "No diste permiso de ubicación. Actívalo en tu navegador o usa otra opción." : "No pudimos obtener tu ubicación. Intenta de nuevo o usa otra opción."); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });

  // 3. Enlace o coordenadas
  q("paste").addEventListener("click", () => { q("pbox").hidden = !q("pbox").hidden; if (!q("pbox").hidden) q("pin").focus(); });
  const usePaste = () => { const r = parseMapsInput(q("pin").value); if (r.error) return err(r.error); if (set(latLngToPos(r), "enlace")) { q("pin").value = ""; q("pbox").hidden = true; } };
  q("pok").addEventListener("click", usePaste);
  q("pin").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); usePaste(); } });

  return { get pos() { return pos; }, get fuente() { return fuente; }, setPos: (p, f = "mapa") => set(p, f), redraw: () => picker.redraw() };
}
