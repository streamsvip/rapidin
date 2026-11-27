/* =========================================================
   RAPIDIN · «Registra tu negocio» (web pública)
   No pide cuenta. La solicitud llega al panel administrativo
   (Negocios nuevos + campana) y el negocio avisa por WhatsApp
   al número del administrador (CONFIG.adminWhatsapp).
   En producción el aviso por WhatsApp lo envía una Cloud Function
   con la WhatsApp Business Cloud API, sin depender del usuario.
   ========================================================= */
import * as api from "./core/api.js";
import { CONFIG } from "./config.js";
import { getSessionUid } from "./auth.js";
import { locationField } from "./location.js";
import { posToLatLng } from "./map.js";
import { $, esc, modal, closeModal, run, normPhone, fmtPhone, imageField, bindImageFields } from "./ui.js";

const DIAS = [[1, "L", "lunes"], [2, "M", "martes"], [3, "M", "miércoles"], [4, "J", "jueves"], [5, "V", "viernes"], [6, "S", "sábado"], [0, "D", "domingo"]];

export function openBusinessForm() {
  const img = { logo: null, portada: null };
  let loc;
  modal("Registra tu negocio", `<form data-mform="biz" class="biz-form" novalidate>
    <p class="m-lead">Suma tu local a RAPIDIN en Camaná. Te contactamos por WhatsApp para confirmar los datos y cargar tu catálogo.</p>
    <fieldset><legend><span>1</span>Tu negocio</legend>
      <div class="two"><div class="f"><label for="bzN">Nombre del negocio</label><input class="in" id="bzN" name="negocio" maxlength="60" autocomplete="organization" placeholder="Ej.: Pollería El Sabor"></div>
      <div class="f"><label for="bzC">Rubro</label><select class="in" id="bzC" name="categoria"><option value="">Elige…</option>${api.BIZ_CATS.map(c => `<option>${c}</option>`).join("")}</select></div></div>
      <div class="f"><label for="bzDs">¿Qué vendes? <span class="opt">· opcional</span></label><input class="in" id="bzDs" name="descripcion" maxlength="90" placeholder="Ej.: Pollo a la brasa, parrillas y bebidas."></div>
      <div class="img-pair">${imageField("portada", "portada", null, "Portada", "opcional · foto horizontal")}${imageField("logo", "logo", null, "Logo", "opcional")}</div>
    </fieldset>
    <fieldset><legend><span>2</span>Contacto</legend>
      <div class="two"><div class="f"><label for="bzR">Tu nombre y apellido</label><input class="in" id="bzR" name="responsable" maxlength="60" autocomplete="name"></div>
      <div class="f"><label for="bzT">Celular con WhatsApp</label><div class="phone-in"><span>+51</span><input class="in" id="bzT" name="celular" inputmode="numeric" maxlength="9" autocomplete="tel-national" placeholder="9XX XXX XXX"></div></div></div>
    </fieldset>
    <fieldset><legend><span>3</span>Ubicación y horario</legend>
      <div class="two"><div class="f"><label for="bzD">Dirección del local</label><input class="in" id="bzD" name="direccion" maxlength="120" autocomplete="street-address" placeholder="Calle y número"></div>
      <div class="f"><label for="bzRf">Referencia <span class="opt">· opcional</span></label><input class="in" id="bzRf" name="referencia" maxlength="80" placeholder="Ej.: Frente a la plaza"></div></div>
      <div id="bzLoc"></div>
      <span class="lbl" style="margin-top:14px">Días de atención</span>
      <div class="days" role="group" aria-label="Días de atención">${DIAS.map(([d, l, n]) => `<label title="${n}"><input type="checkbox" name="dia" value="${d}" ${d ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
      <div class="two" style="margin-top:12px"><div class="f"><label for="bzA">Abre</label><input class="in" id="bzA" name="abre" type="time" value="08:00"></div><div class="f"><label for="bzCi">Cierra</label><input class="in" id="bzCi" name="cierra" type="time" value="20:00"></div></div>
    </fieldset>
    <label class="cfg-row"><div><b>Quiero vender por catálogo en el Market</b><span>Publicas tus productos con tu precio. Los repartidores solo ofertan el envío.</span></div><input type="checkbox" class="sw-in" name="mercado" checked></label>
    <label class="check-row"><input type="checkbox" name="acepta"><span>Acepto que RAPIDIN me contacte por WhatsApp y use estos datos para registrar mi negocio, según la <a class="link" href="#" data-legal-open>política de privacidad</a>.</span></label>
    <p class="err" id="bzErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Cancelar</button><button class="btn" type="submit">Enviar solicitud</button></div>
  </form>`, {
    mount(body) {
      const errEl = body.querySelector("#bzErr");
      bindImageFields(body, img, m => (errEl.textContent = m));
      body.querySelector("[data-legal-open]").addEventListener("click", e => { e.preventDefault(); closeModal(); document.querySelector('[data-legal="privacidad"]')?.click(); });
      requestAnimationFrame(() => { loc = locationField(body.querySelector("#bzLoc"), { direccion: body.querySelector("#bzD"), height: 240 }); });
    },
    biz(f) {
      const errEl = $("#bzErr"); errEl.textContent = "";
      const dias = [...f.querySelectorAll("input[name=dia]:checked")].map(x => +x.value);
      if (!dias.length) return (errEl.textContent = "Elige al menos un día de atención.");
      const data = {
        negocio: f.negocio.value, categoria: f.categoria.value, descripcion: f.descripcion.value, responsable: f.responsable.value, celular: normPhone(f.celular.value),
        direccion: f.direccion.value, referencia: f.referencia.value, pos: loc?.pos || null, ubicacionFuente: loc?.fuente || "",
        horario: { dias, abre: f.abre.value, cierra: f.cierra.value }, mercado: f.mercado.checked, acepta: f.acepta.checked, logo: img.logo, portada: img.portada,
      };
      const a = run(() => api.submitBusinessApplication(getSessionUid(), data));
      if (a) done(a);
    },
  });
}

/** Mensaje que recibe el administrador en su WhatsApp. */
export function adminWhatsappText(a) {
  const p = a.pos && posToLatLng(a.pos);
  const ll = p ? `\nUbicación: https://maps.google.com/?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}` : "";
  return `Hola RAPIDIN, quiero registrar mi negocio.\n\n*${a.negocio}* (${a.categoria})\nResponsable: ${a.responsable}\nCelular: ${fmtPhone(a.celular)}\nDirección: ${a.direccion}${a.referencia ? ` (${a.referencia})` : ""}${ll}\nMarket: ${a.mercado ? "sí, por catálogo" : "no"}\nCódigo de solicitud: ${a.id.slice(-6).toUpperCase()}`;
}

function done(a) {
  const wa = `https://wa.me/51${CONFIG.adminWhatsapp}?text=${encodeURIComponent(adminWhatsappText(a))}`;
  modal("¡Solicitud recibida!", `<div class="ok-state biz-ok">
    <svg class="ic big" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
    <h2>${esc(a.negocio)} ya está en revisión</h2>
    <p class="m-text">El equipo de RAPIDIN ya la ve en su panel. Para atenderte más rápido, envíanos el aviso por WhatsApp: el mensaje ya está escrito.</p>
    <a class="btn wa" href="${wa}" target="_blank" rel="noopener" data-mclose>Avisar por WhatsApp</a>
    <p class="hint-s">Código de solicitud: <b>${a.id.slice(-6).toUpperCase()}</b></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Listo</button></div></div>`);
}
