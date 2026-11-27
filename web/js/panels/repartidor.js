/* RAPIDIN · Panel del repartidor (incluye la postulación) */
import * as api from "../core/api.js";
import { roadKm, isOpen, statusLabel, hoursLabel } from "../core/store.js";
import { $, esc, sol, payLogo, payTag, fixBrokenLogos, fmtPhone, normPhone, waLink, run, modal, closeModal, num, chip, payChip, left, ago, empty, avatar, stars, firstName, shortName, contactButtons, telLink, shrinkImage, toast } from "../ui.js";
import { timeline, orderMap, orderSummaryRows, vehLabel, itemsList, catOf, catIcon, chatShell, chatHandlers, openChat, sendChat } from "./common.js";
import { mapBox } from "../map.js";
import { ledgerList, topupModal, reportModal, perfilView, photoPicker, photoBtns, bindPhoto } from "./cliente.js";
import { openAuth } from "../auth.js";

const isMine = (o, uid) => o.courierId === uid;
const myOffer = (o, uid) => Object.values(o.offers).filter(x => x.courierId === uid).sort((a, b) => b.creado - a.creado)[0];
const NEXT_LABEL = {
  camino_a_recogida: "Voy camino a recoger", en_establecimiento: "Llegué al establecimiento", pedido_recogido: "Ya recogí el pedido",
  camino_a_entrega: "Salgo a entregar", por_confirmar: "Entregué el pedido",
};

/* ---------- Postulación ---------- */
const postulacion = {
  title: "Trabaja con RAPIDIN", static: true,
  render(ctx) {
    const u = ctx.user, st = u.roles.repartidor, db = ctx.db;
    const app = Object.values(db.courierApplications).filter(a => a.uid === u.uid).sort((a, b) => b.creado - a.creado)[0];
    if (st === "pendiente") return `<section class="card narrow">
      <div class="ok-state"><svg class="ic big" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <h2>Tu postulación está en revisión</h2><p class="muted">Un administrador revisa tus documentos. Te avisaremos por notificación cuando termine.</p></div>
      <ol class="timeline"><li class="done"><span>Datos y documentos enviados</span>${app ? `<time>${ago(app.creado)}</time>` : ""}</li><li class="now"><span>En revisión por un administrador</span></li><li><span>Aprobada: ya puedes recibir pedidos</span></li></ol>
      <p class="hint-s">Mientras tu cuenta esté pendiente no puedes ver pedidos ni ofertar.</p></section>
      <div style="margin-top:20px">${conditionsHtml(db)}</div>`;
    return `
      ${st === "rechazado" ? `<div class="banner bad">Tu postulación anterior no fue aprobada${app?.nota ? `: ${esc(app.nota)}` : ""}. Puedes corregir tus datos y volver a postular.</div>` : ""}
      ${u.telefonoVerificado ? "" : `<div class="banner warn">Verifica tu celular antes de postular. <button class="link" type="button" data-act="verify">Verificar ahora</button></div>`}
      <div class="grid-2 wide-left">
      <form class="card" data-form="postular" novalidate>
        <h2 class="card-t">Postula como repartidor</h2>
        <p class="muted" style="margin-bottom:18px">Solo pedimos lo necesario. Tus documentos los ve únicamente el equipo que revisa tu postulación.</p>
        <div class="f"><span class="lbl">Foto de perfil <span class="opt">· de frente y con buena luz: el cliente la ve al elegir tu oferta</span></span>
          <div class="person big ph-row${u.foto ? "" : " need"}">${photoPicker(u)}<div><b>${u.foto ? "Foto lista" : "Sube tu foto"}</b><span>${u.foto ? "Puedes cambiarla cuando quieras." : "Obligatoria para postular."}</span>${photoBtns(u)}</div></div></div>
        <div class="two">
          <div class="f"><label for="aNom">Nombres y apellidos</label><input class="in" id="aNom" value="${esc(u.nombre)}" disabled></div>
          <div class="f"><label for="aDni">DNI</label><input class="in" id="aDni" name="dni" inputmode="numeric" maxlength="8" placeholder="8 dígitos"></div>
        </div>
        <div class="two">
          <div class="f"><label for="aVeh">¿Cómo repartes?</label><select class="in" id="aVeh" name="veh" data-change="veh"><option value="moto">Moto</option><option value="mototaxi">Mototaxi</option><option value="bicicleta">Bicicleta</option><option value="pie">A pie</option></select></div>
          <div class="f"><label for="aYape">Yape para cobrar</label><div class="phone-in"><span>+51</span><input class="in" id="aYape" name="yape" inputmode="numeric" maxlength="9" value="${esc(u.telefono)}"></div></div>
        </div>
        <div class="f"><label for="aDniF">Foto del DNI (ambas caras)</label><input class="in" id="aDniF" name="dniF" type="file" accept="image/*,.pdf" multiple></div>
        <div class="f" id="aLicBox"><label for="aLic">Licencia de conducir</label><input class="in" id="aLic" name="lic" type="file" accept="image/*,.pdf"></div>
        <label class="check"><input type="checkbox" id="aOk" name="ok"> <span>Declaro que mis datos son verdaderos y acepto los términos de RAPIDIN.</span></label>
        <p class="err" id="aErr" role="alert"></p>
        <button class="btn" type="submit" ${u.telefonoVerificado ? "" : "disabled"}>Enviar postulación</button>
        <p class="hint-s" style="margin-top:10px">Por ahora guardamos solo el nombre de los archivos. Al revisar tu postulación te pediremos las fotos por WhatsApp.</p>
      </form>
      <aside class="card soft">
        <h2 class="card-t">Cómo funciona</h2>
        <ol class="steps-list"><li><b>Postulas</b><span>DNI y, si usas moto o mototaxi, tu licencia.</span></li><li><b>Te aprobamos</b><span>Un administrador revisa tus documentos.</span></li><li><b>Recargas tu billetera</b><span>La comisión se reserva al ofertar y se cobra solo si completas el pedido.</span></li><li><b>Ofertas y entregas</b><span>Tú pones tu tarifa. El cliente te paga directo.</span></li></ol>
      </aside></div>
      <div style="margin-top:20px">${conditionsHtml(db)}</div>`;
  },
  mount(root, ctx) { bindPhoto(root, ctx); },
  changes: { veh(el) { $("#aLicBox").hidden = !["moto", "mototaxi"].includes(el.value); } },
  actions: { verify(b, ctx) { openAuth("verify", { uid: ctx.uid }); }, delphoto(b, ctx) { if (run(() => api.updateProfile(ctx.uid, { foto: null }))) ctx.rerender(); } },
  forms: {
    postular(f, ctx) {
      const err = $("#aErr"); err.textContent = "";
      const veh = f.veh.value, docs = [...f.dniF.files].map(x => x.name);
      if (!/^\d{8}$/.test(f.dni.value)) return (err.textContent = "El DNI debe tener 8 dígitos.");
      if (!/^9\d{8}$/.test(normPhone(f.yape.value))) return (err.textContent = "Tu Yape debe tener 9 dígitos y empezar con 9.");
      if (!ctx.user.foto) return (err.textContent = "Sube tu foto de perfil.");
      if (!docs.length) return (err.textContent = "Adjunta la foto de tu DNI.");
      if (["moto", "mototaxi"].includes(veh)) { if (!f.lic.files.length) return (err.textContent = "Adjunta tu licencia de conducir."); docs.push(f.lic.files[0].name); }
      if (!f.ok.checked) return (err.textContent = "Acepta los términos para continuar.");
      if (run(() => api.submitCourierApplication(ctx.uid, { dni: f.dni.value, vehiculo: veh, docs, yape: normPhone(f.yape.value) }), "Postulación enviada.")) ctx.rerender();
    },
  },
};

/* ---------- Pedidos disponibles ---------- */
const disponibles = {
  title: "Pedidos disponibles",
  render(ctx) { return ctx.live("disp", () => dispList(ctx)); },
  actions: {
    avail(b, ctx) { run(() => api.setAvailability(ctx.uid, b.dataset.on === "1"), b.dataset.on === "1" ? "Estás disponible. Te avisaremos de pedidos nuevos." : "Dejaste de estar disponible."); },
    offer(b, ctx) { offerModal(ctx, b.dataset.id); },
    withdraw(b, ctx) { run(() => api.withdrawOffer(ctx.uid, b.dataset.id, b.dataset.of), "Retiraste tu oferta. Liberamos la comisión."); },
    topup(b, ctx) { topupModal(ctx, "tu saldo para comisiones"); },
  },
};
function dispList(ctx) {
  const db = ctx.db, c = db.couriers[ctx.uid], w = db.wallets[ctx.uid];
  const open = Object.values(db.orders).filter(o => api.OPEN_STATES.includes(o.estado) && o.clienteId !== ctx.uid).sort((a, b) => b.creado - a.creado);
  const disp = api.walletDisponible(w);
  const head = `<div class="avail-bar ${c.disponible ? "on" : ""}">
      <div><b>${c.disponible ? "Estás disponible" : "No estás disponible"}</b><span>${c.disponible ? "Recibes pedidos de Camaná y puedes ofertar." : "Actívate para ver pedidos y enviar ofertas."}</span></div>
      <button class="switch" type="button" role="switch" aria-checked="${c.disponible}" data-act="avail" data-on="${c.disponible ? "0" : "1"}" aria-label="Disponible"><i></i></button>
    </div>
    <div class="kpis">
      <div class="kpi"><small>Saldo para comisiones · <a class="link" href="#repartidor-condiciones">ver comisiones</a></small><b>${sol(disp)}</b>${disp < api.libreRule(db.commissionRules).min ? `<button class="btn small" type="button" data-act="topup">Recargar</button>` : `<span class="muted">Reservado: ${sol(w.reservado)}</span>`}</div>
      <div class="kpi"><small>Pedidos abiertos</small><b>${open.length}</b><span class="muted">En tu zona: Camaná</span></div>
      <div class="kpi"><small>Tu calificación</small><b>${c.ratingCount ? `★ ${c.rating.toFixed(1)}` : "Nuevo"}</b><span class="muted">${c.completados} pedidos completados</span></div>
    </div>`;
  if (!c.disponible) return head + empty("Activa «Disponible» para ver pedidos", "Mientras no estés disponible no recibes pedidos ni puedes ofertar.");
  if (!open.length) return head + empty("No hay pedidos abiertos ahora", "Te avisaremos apenas un cliente publique una solicitud.");
  return head + `<div class="cards">${open.map(o => {
    const mineOf = myOffer(o, ctx.uid);
    const com = api.commissionFor(db, o.modalidad, o.distanciaKm);
    const n = Object.values(o.offers).filter(x => x.estado === "activa").length;
    const kmEntrega = o.tienda ? roadKm(o.tienda.pos, o.entrega.pos) : null;
    return `<article class="order-card static ${ctx.state.focus === o.id ? "focus" : ""}">
      <div class="oc-top"><b>${o.codigo}</b><span class="chip ${{ libre: "accent", tienda: "info", catalogo: "ok" }[o.modalidad]}">${api.MODALIDAD[o.modalidad]}</span></div>
      ${o.modalidad === "catalogo" ? itemsList(o, { compact: true }) : `<p class="oc-desc">${esc(o.descripcion)}</p>${o.nota ? `<p class="oc-note"><b>Indicaciones:</b> ${esc(o.nota)}</p>` : ""}`}
      <dl class="kv sm">
        ${o.tienda ? `<div><dt>Recoger en</dt><dd>${esc(o.tienda.nombre)}<small>${esc(o.tienda.direccion)} · ${o.distanciaKm.toFixed(1)} km del centro</small></dd></div>` : `<div><dt>Recoger en</dt><dd>Donde tú elijas</dd></div>`}
        <div><dt>Entrega</dt><dd>${esc(o.entrega.referencia || "Ver mapa")}${kmEntrega != null ? `<small>${kmEntrega.toFixed(1)} km desde la tienda</small>` : ""}</dd></div>
        ${o.modalidad === "catalogo" ? `<div><dt>Precio del local (fijo)</dt><dd><b>${sol(o.subtotal)}</b><small>Lo pagas en el local</small></dd></div>` : ""}
        <div><dt>Pago</dt><dd>${payTag(o.pago)}</dd></div>
        <div><dt>Comisión si te eligen</dt><dd><b>${o.modalidad === "libre" ? libreTxt(db) : sol(com)}</b>${o.modalidad === "libre" ? `<small>Lo que ahorres en las compras es tuyo</small>` : ""}</dd></div>
      </dl>
      <div class="oc-foot"><span class="muted">${ago(o.creado)} · ${n} ${n === 1 ? "oferta" : "ofertas"}</span>
      ${mineOf && mineOf.estado === "activa" ? `<span class="mine">Tu oferta: <b>${sol(mineOf.total)}</b> · vence ${left(mineOf.vence)} <button class="link" type="button" data-act="withdraw" data-id="${o.id}" data-of="${mineOf.id}">Retirar</button></span>`
        : mineOf && mineOf.estado !== "retirada" && mineOf.estado !== "vencida" ? `<span class="muted">Ya ofertaste</span>` : disp < com ? `<button class="btn small ghost-dark" type="button" data-act="topup" title="Necesitas ${sol(com)} disponibles para reservar la comisión">Recargar para ofertar · ${sol(com)}</button>` : `<button class="btn small" type="button" data-act="offer" data-id="${o.id}">Ofertar</button>`}</div>
    </article>`;
  }).join("")}</div>`;
}
function offerModal(ctx, orderId) {
  const db = ctx.db, o = db.orders[orderId], w = db.wallets[ctx.uid];
  const sel = {};
  const renderGuide = body => {
    const q = body.querySelector("#gq").value.trim();
    const list = q ? guideSearch(db, q, 6) : suggestFor(db, o.descripcion);
    body.querySelector("#gRes").innerHTML = list.length
      ? `<p class="hint-s">${q ? "Resultados" : "Sugeridos para este pedido"} · toca + para sumar</p><ul class="g-res">${list.map(({ r, pv }) => `<li><div><b>${esc(r.nombre)}</b> <span class="muted">${esc(r.presentacion || "")}</span><small>${esc(pv.nombre)} · ${isOpen(pv) ? "abierto" : "cerrado"}</small></div><b>${sol(r.precio)}</b><button type="button" class="add-btn sm" data-mact="gadd" data-id="${r.id}" aria-label="Sumar ${esc(r.nombre)}">+</button></li>`).join("")}</ul>`
      : `<p class="hint-s">${q ? "No encontramos ese producto en la guía." : "Escribe un producto para ver precios de referencia."}</p>`;
  };
  const applyGuide = body => {
    const lines = Object.entries(sel).map(([id, n]) => ({ r: db.preciosRef[id], n })).filter(l => l.r);
    const total = Math.round(lines.reduce((s, l) => s + l.r.precio * l.n, 0) * 100) / 100;
    body.querySelector("#gSel").innerHTML = lines.length ? `<ul class="items editable g-sel">${lines.map(l => `<li><span class="it-name">${esc(l.r.nombre)}<small>${esc(db.proveedores[l.r.provId]?.nombre || "")}</small></span><div class="stepper sm"><button type="button" data-mact="gdec" data-id="${l.r.id}" aria-label="Quitar uno">−</button><b>${l.n}</b><button type="button" data-mact="ginc" data-id="${l.r.id}" aria-label="Agregar uno">+</button></div><b>${sol(l.r.precio * l.n)}</b></li>`).join("")}</ul>
      <div class="items-total"><span>Costo estimado (se copió arriba)</span><b>${sol(total)}</b></div>` : "";
    const c = body.querySelector("#ofC"); if (c && !c.disabled) c.value = total ? total.toFixed(2) : "";
    calc(body);
  };
  const com = api.commissionFor(db, o.modalidad, o.distanciaKm, (o.modalidad === "catalogo" ? o.subtotal : 0) + 6);
  const calc = body => {
    const costo = num(body.querySelector("#ofC").value) || 0, tarifa = num(body.querySelector("#ofT").value) || 0;
    const c = api.commissionFor(db, o.modalidad, o.distanciaKm, costo + tarifa);
    body.querySelector("#ofTot").textContent = sol(costo + tarifa);
    const cEl = body.querySelector("#ofCom"); if (cEl) cEl.textContent = sol(c);
    const rEl = body.querySelector("#ofRes"); if (rEl) rEl.textContent = sol(c);
    const g = tarifa - c; const el = body.querySelector("#ofG"); el.textContent = sol(g); el.className = g < 0 ? "neg" : "pos";
  };
  modal(`Ofertar en ${o.codigo}`, `<form data-mform="of" novalidate>
    ${o.modalidad === "catalogo" ? `<p class="m-text"><b>${esc(o.tienda.nombre)}</b></p>${itemsList(o, { compact: true })}` : `<p class="m-text">${esc(o.descripcion)}</p>`}
    <div class="two">
      ${o.modalidad === "catalogo" ? `<div class="f"><label for="ofC">Precio del local (S/)</label><input class="in" id="ofC" name="c" value="${o.subtotal.toFixed(2)}" disabled><span class="hint-s">Fijado por el catálogo del local. Solo pones tu tarifa de envío.</span></div>`
      : `<div class="f"><label for="ofC">Costo de productos (S/)</label><input class="in" id="ofC" name="c" inputmode="decimal" placeholder="0.00"><span class="hint-s">${o.modalidad === "libre" ? "Lo que estimas pagar por las compras." : "Precio en la tienda. Pon 0 si el cliente ya pagó."}</span></div>`}
      <div class="f"><label for="ofT">Tu tarifa de envío (S/)</label><input class="in" id="ofT" name="t" inputmode="decimal" value="6.00"></div>
    </div>
    <div class="two">
      <div class="f"><label for="ofMin">Tiempo estimado (min)</label><input class="in" id="ofMin" name="m" inputmode="numeric" value="20"></div>
      <div class="f"><label for="ofMsg">Mensaje <span class="opt">· opcional</span></label><input class="in" id="ofMsg" name="msg" maxlength="140" placeholder="Salgo ahora mismo"></div>
    </div>
    ${o.modalidad !== "catalogo" ? `<details class="guide-calc" ${o.modalidad === "libre" ? "open" : ""}>
      <summary>Calcular el costo con la Guía de precios</summary>
      <input class="in" id="gq" type="search" placeholder="Busca: arroz, gaseosa, paracetamol…" autocomplete="off">
      <div id="gRes"></div><div id="gSel"></div>
    </details>` : ""}
    <div class="calc-box">
      <div><small>Precio total para el cliente</small><b id="ofTot">S/ 6.00</b></div>
      <div><small>Comisión RAPIDIN${o.modalidad === "libre" ? ` · ${api.libreRule(db.commissionRules).pct} %` : ""}</small><b id="ofCom">${sol(com)}</b></div>
      <div><small>Tu ganancia estimada${o.modalidad === "libre" ? " + lo que ahorres" : ""}</small><b id="ofG" class="pos">${sol(6 - com)}</b></div>
    </div>
    <p class="hint-s">Al enviar reservamos <b id="ofRes">${sol(com)}</b> de tu billetera (disponible: ${sol(api.walletDisponible(w))}). Si no te eligen o la oferta vence en ${Math.round(db.config.ofertaVenceSeg / 60)} min, la liberamos.</p>
    <p class="err" id="ofErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Enviar oferta</button></div></form>`,
    {
      mount(body) {
        calc(body);
        const q = body.querySelector("#gq"); if (!q) return;
        q.addEventListener("keydown", ev => { if (ev.key === "Enter") ev.preventDefault(); });
        renderGuide(body);
      },
      input(el, body) { if (el.id === "gq") renderGuide(body); else calc(body); },
      gadd(b, body) { sel[b.dataset.id] = (sel[b.dataset.id] || 0) + 1; applyGuide(body); },
      ginc(b, body) { sel[b.dataset.id]++; applyGuide(body); },
      gdec(b, body) { if (--sel[b.dataset.id] <= 0) delete sel[b.dataset.id]; applyGuide(body); },
      of: f => {
        const c = o.modalidad === "catalogo" ? o.subtotal : num(f.c.value || "0"), t = num(f.t.value), m = num(f.m.value);
        if (isNaN(c) || isNaN(t) || isNaN(m)) return ($("#ofErr").textContent = "Revisa los montos: usa solo números.");
        if (run(() => api.submitOffer(ctx.uid, orderId, { costoProductos: c, tarifa: t, tiempo: m, mensaje: f.msg.value }), "Oferta enviada. Te avisaremos si te eligen.")) closeModal();
      },
    });
}

/* ---------- Comisiones y reglas (información solo para repartidores) ---------- */
const libreTxt = db => { const L = api.libreRule(db.commissionRules); return L.pct ? `${L.pct} % (S/ ${L.min.toFixed(2)} a ${L.max.toFixed(2)})` : sol(L.min); };
function conditionsHtml(db, withCalc = false) {
  const r = db.commissionRules;
  let prev = 0;
  const rows = r.tramos.map(t => { const row = `<tr><td>${prev} a ${t.hasta} km</td><td><b>${sol(t.monto)}</b></td></tr>`; prev = t.hasta; return row; }).join("") + `<tr><td>Más de ${prev} km</td><td><b>${sol(r.masDe10)}</b></td></tr>`;
  return `<div class="banner info-dark"><b>Información solo para repartidores.</b> El cliente ve únicamente tu precio total; la comisión es un acuerdo entre tú y RAPIDIN.</div>
  <div class="grid-2">
    <section class="card">
      <h2 class="card-t">Comisión por pedido completado</h2>
      <dl class="kv"><div><dt>Compra libre</dt><dd><b>${libreTxt(db)}</b><small>Del total de tu oferta. Lo que ahorres al comprar más barato es 100 % tuyo.</small></dd></div></dl>
      <p class="lbl" style="margin:14px 0 6px">Market y tienda específica, según la distancia de la tienda</p>
      <table class="table"><thead><tr><th>Distancia de la tienda</th><th>Comisión</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="hint-s" style="margin-top:10px">La distancia se mide por carretera desde ${esc(db.config.puntoEstrategico.nombre)} hasta la tienda. Antes de enviar cada oferta ves la comisión exacta de ese pedido.</p>
    </section>
    <section class="card">
      <h2 class="card-t">Cómo se cobra</h2>
      <ol class="steps-list">
        <li><b>Al ofertar se reserva</b><span>Necesitas tener la comisión disponible en tu billetera (saldo de recargas).</span></li>
        <li><b>Si no te eligen, se libera</b><span>También si la oferta vence, la retiras o el cliente cancela.</span></li>
        <li><b>Solo se cobra al completar</b><span>Cuando confirmas la entrega, la reserva pasa a ser el cobro.</span></li>
        <li><b>Tus ganancias son tuyas</b><span>Lo que el cliente paga con saldo va a tus ganancias y lo puedes retirar. Las recargas solo sirven para comisiones.</span></li>
      </ol>
      ${withCalc ? `<div class="calc-box mini" id="cdCalc">
        <div class="f"><label for="cdMod">Modalidad</label><select class="in" id="cdMod" data-change="cd"><option value="tienda">Market o tienda</option><option value="libre">Compra libre</option></select></div>
        <div class="f"><label for="cdKm">Distancia (km)</label><input class="in" id="cdKm" inputmode="decimal" value="3" data-input="cd"></div>
        <div class="f"><label for="cdFee">Tu tarifa (S/)</label><input class="in" id="cdFee" inputmode="decimal" value="6" data-input="cd"></div>
        <div class="cd-out" id="cdOut"></div>
      </div>` : ""}
    </section>
  </div>`;
}
function cdCalc(db) {
  const mod = $("#cdMod")?.value, km = num($("#cdKm")?.value), fee = num($("#cdFee")?.value) || 0;
  const out = $("#cdOut"); if (!out) return;
  $("#cdKm").disabled = mod === "libre";
  const lbl = document.querySelector('label[for="cdFee"]'); if (lbl) lbl.textContent = mod === "libre" ? "Total de tu oferta (S/)" : "Tu tarifa (S/)";
  const com = api.commissionFor(db, mod, isNaN(km) ? 0 : km, fee);
  out.innerHTML = mod === "libre" ? `<div><small>Comisión</small><b>${sol(com)}</b></div><div><small>Tu ganancia</small><b class="pos">Envío − ${sol(com)} + ahorro</b></div>` : `<div><small>Comisión</small><b>${sol(com)}</b></div><div><small>Tu ganancia</small><b class="${fee - com < 0 ? "neg" : "pos"}">${sol(fee - com)}</b></div>`;
}
const condiciones = {
  title: "Comisiones y reglas", static: true,
  render(ctx) { return conditionsHtml(ctx.db, true); },
  mount(root, ctx) { cdCalc(ctx.db); },
  changes: { cd(el, ctx) { cdCalc(ctx.db); } },
  inputs: { cd(el, ctx) { cdCalc(ctx.db); } },
};

/* ---------- Guía de precios (solo repartidores) ---------- */
const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function guideSearch(db, q, limit = 50) {
  const toks = norm(q).split(/\s+/).filter(Boolean);
  const out = [];
  Object.values(db.preciosRef).forEach(r => {
    const pv = db.proveedores[r.provId];
    if (!pv?.activo || !r.disponible) return;
    const hay = norm(`${r.nombre} ${r.presentacion} ${r.seccion} ${pv.nombre} ${pv.categoria}`);
    if (toks.every(t => hay.includes(t))) out.push({ r, pv });
  });
  return out.sort((a, b) => isOpen(b.pv) - isOpen(a.pv) || a.r.precio - b.r.precio).slice(0, limit);
}
function suggestFor(db, text) {
  const words = [...new Set(norm(text).split(/[^a-zñ0-9]+/).filter(w => w.length >= 4))];
  const seen = new Set(), out = [];
  words.forEach(w => guideSearch(db, w.replace(/s$/, ""), 3).forEach(x => { if (!seen.has(x.r.id)) { seen.add(x.r.id); out.push(x); } }));
  return out.slice(0, 6);
}
const phoneLinks = tel => `${contactButtons({ tel, wa: tel })}<span class="muted tel-sub">${fmtPhone(tel)}</span>`;
const ago2 = t => { const d = Math.floor((Date.now() - t) / 86400e3); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };

const guia = {
  title: "Guía de precios",
  render(ctx) {
    const cats = ["Todos", ...new Set(Object.values(ctx.db.proveedores).filter(p => p.activo).map(p => p.categoria))];
    const c = ctx.state.gcat || "Todos";
    return `<section class="mk-hero guide-hero">
        <div><span class="mk-eyebrow">Solo para repartidores</span><h2>Guía de precios de Camaná</h2><p>Consulta precios de referencia y llama al local para pedir y pasar a recoger. Úsala para cotizar pedidos de compra libre.</p></div>
        <label class="mk-search"><span class="sr-only">Buscar producto o local</span><input class="in" type="search" placeholder="Busca: arroz, pañales, gaseosa 3 L…" value="${esc(ctx.state.gq || "")}" data-input="gq"></label>
      </section>
      <div class="chips-filter" style="margin-bottom:18px">${cats.map(k => `<button type="button" data-act="gcat" data-c="${esc(k)}" aria-pressed="${c === k}">${esc(k)}</button>`).join("")}</div>
      ${ctx.live("guia", () => guideBody(ctx))}
      <p class="hint-s" style="margin-top:16px">Precios referenciales que RAPIDIN revisa periódicamente. Confirma con el local antes de comprar; si cambian, propón el cambio al cliente.</p>`;
  },
  actions: { gcat(b, ctx) { ctx.state.gcat = b.dataset.c; ctx.rerender(); }, prov(b, ctx) { ctx.go("#repartidor-proveedor", { ...ctx.state, prov: b.dataset.id }); } },
  inputs: { gq(el, ctx) { ctx.state.gq = el.value; ctx.refresh(); } },
};
function guideBody(ctx) {
  const db = ctx.db, q = (ctx.state.gq || "").trim(), c = ctx.state.gcat || "Todos";
  if (q) {
    const res = guideSearch(db, q).filter(x => c === "Todos" || x.pv.categoria === c);
    if (!res.length) return empty("Sin resultados", `No encontramos «${q}». Prueba con otra palabra o revisa los locales.`);
    return `<section class="card"><div class="table-wrap"><table class="table click"><thead><tr><th>Producto</th><th>Local</th><th>Precio ref.</th><th>Actualizado</th></tr></thead><tbody>
      ${res.map(({ r, pv }) => `<tr data-act="prov" data-id="${pv.id}" tabindex="0"><td><b>${esc(r.nombre)}</b><small>${esc(r.presentacion || "")}</small></td><td>${esc(pv.nombre)}<small class="${isOpen(pv) ? "pos" : ""}">${esc(statusLabel(pv))} · ${fmtPhone(pv.telefono)}</small></td><td><b>${sol(r.precio)}</b></td><td>${ago2(r.actualizado)}</td></tr>`).join("")}
    </tbody></table></div></section>`;
  }
  const list = Object.values(db.proveedores).filter(p => p.activo && (c === "Todos" || p.categoria === c)).sort((a, b) => isOpen(b) - isOpen(a) || a.nombre.localeCompare(b.nombre));
  if (!list.length) return empty("Aún no hay locales en la guía", "El administrador los agregará pronto.");
  return `<div class="store-grid">${list.map(pv => {
    const items = Object.values(db.preciosRef).filter(r => r.provId === pv.id && r.disponible);
    const last = Math.max(0, ...items.map(r => r.actualizado));
    return `<button type="button" class="store-card${isOpen(pv) ? "" : " closed"}" data-act="prov" data-id="${pv.id}">
      <span class="sc-cover sm" style="--cat:${catOf(pv.categoria).c}">${catIcon(pv.categoria, "xl")}<span class="sc-status ${isOpen(pv) ? "on" : ""}">${esc(statusLabel(pv))}</span></span>
      <span class="sc-body"><b>${esc(pv.nombre)}</b><span class="sc-meta">${esc(pv.categoria)} · ${items.length} precios · ${last ? `actualizado ${ago2(last)}` : "sin precios"}</span>
      <span class="sc-addr">${esc(pv.direccion)}</span>${pv.pedidosTelefono ? `<span class="chip ok sm" style="justify-self:start;margin-top:4px">Pedidos por teléfono</span>` : ""}</span>
    </button>`;
  }).join("")}</div>`;
}
const proveedor = {
  title: "Local de la guía", parent: "guia",
  render(ctx) {
    const pv = ctx.db.proveedores[ctx.state.prov];
    if (!pv || !pv.activo) return empty("Este local no está en la guía", "Vuelve a la Guía de precios.", `<a class="btn small" href="#repartidor-guia">Guía de precios</a>`);
    return `<a class="back" href="#repartidor-guia">← Guía de precios</a>${ctx.live("pv", () => {
      const db = ctx.db, items = Object.values(db.preciosRef).filter(r => r.provId === pv.id).sort((a, b) => a.orden - b.orden);
      const secs = [...new Set(items.map(r => r.seccion))];
      return `<section class="store-head" style="--cat:${catOf(pv.categoria).c}">
        <span class="sh-ic">${catIcon(pv.categoria, "xl")}</span>
        <div class="sh-main"><span class="sc-status ${isOpen(pv) ? "on" : ""}">${esc(statusLabel(pv))}</span><h2>${esc(pv.nombre)}</h2>
          <div class="sh-meta"><span>${esc(pv.direccion)}</span><span>${esc(hoursLabel(pv))}</span></div></div>
      </section>
      <div class="grid-2 wide-left">
        <div class="stack">${secs.map(sec => `<section class="card"><h2 class="card-t">${esc(sec)}</h2><ul class="rows">${items.filter(r => r.seccion === sec).map(r => `<li class="${r.disponible ? "" : "off"}"><div><b>${esc(r.nombre)}</b><small>${esc(r.presentacion || "")} · actualizado ${ago2(r.actualizado)}${r.disponible ? "" : " · agotado"}</small></div><b>${sol(r.precio)}</b></li>`).join("")}</ul></section>`).join("") || empty("Sin precios", "Este local todavía no tiene precios en la guía.")}</div>
        <aside class="stack">
          <section class="card"><h2 class="card-t">Contacto del local</h2>
            ${phoneLinks(pv.telefono)}
            ${pv.pedidosTelefono ? `<p class="banner ok" style="margin:12px 0 0">Acepta pedidos por teléfono: pide, y pasa a recoger.</p>` : `<p class="banner warn" style="margin:12px 0 0">No toma pedidos por teléfono: hay que ir al local.</p>`}
            ${pv.notas ? `<p class="hint-s" style="margin-top:10px">${esc(pv.notas)}</p>` : ""}</section>
          <section class="card">${mapBox({ markers: [{ pos: pv.pos, type: "tienda", label: pv.nombre }] }, { height: 220, key: `pv-${pv.id}`, label: `Ubicación de ${pv.nombre}` })}</section>
        </aside>
      </div>`;
    })}`;
  },
};

/* ---------- Mis ofertas ---------- */
const ofertas = {
  title: "Mis ofertas",
  render(ctx) {
    return ctx.live("ofs", () => {
      const db = ctx.db, rows = [];
      Object.values(db.orders).forEach(o => Object.values(o.offers).forEach(of => { if (of.courierId === ctx.uid) rows.push({ o, of }); }));
      rows.sort((a, b) => b.of.creado - a.of.creado);
      if (!rows.length) return empty("Aún no enviaste ofertas", "Revisa los pedidos disponibles y envía tu primera oferta.", `<a class="btn small" href="#repartidor-disponibles">Ver pedidos</a>`);
      const L = { activa: ["Esperando al cliente", "warn"], aceptada: ["Aceptada", "ok"], rechazada: ["No elegida", "muted"], vencida: ["Vencida", "muted"], retirada: ["Retirada", "muted"] };
      return `<div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Total</th><th>Comisión</th><th>Estado</th><th>Enviada</th></tr></thead><tbody>
        ${rows.map(({ o, of }) => `<tr><td><b>${o.codigo}</b><small>${esc(o.descripcion.slice(0, 48))}${o.descripcion.length > 48 ? "…" : ""}</small></td><td>${sol(of.total)}</td><td>${sol(of.comision)}<small>${of.estado === "activa" ? "Reservada" : of.estado === "aceptada" ? (o.estado === "entregado" ? "Cobrada" : "Reservada") : "Liberada"}</small></td>
        <td><span class="chip ${L[of.estado][1]}">${L[of.estado][0]}</span>${of.estado === "activa" ? `<small>Vence ${left(of.vence)}</small>` : ""}</td><td>${ago(of.creado)}</td></tr>`).join("")}
      </tbody></table></div>`;
    });
  },
};

/* ---------- Mis entregas ---------- */
const asignados = {
  title: "Mis entregas",
  render(ctx) {
    return ctx.live("asg", () => {
      const db = ctx.db, all = Object.values(db.orders).filter(o => isMine(o, ctx.uid)).sort((a, b) => b.actualizado - a.actualizado);
      const act = all.filter(o => api.ACTIVE_STATES.includes(o.estado)), done = all.filter(o => !api.ACTIVE_STATES.includes(o.estado));
      const card = o => `<button type="button" class="order-card" data-act="open" data-id="${o.id}">
        <div class="oc-top"><b>${o.codigo}</b>${chip(o.estado)}</div><p class="oc-desc">${esc(o.descripcion)}</p>
        <div class="oc-meta"><span>${esc(shortName(db.users[o.clienteId].nombre))}</span><span>${ago(o.actualizado)}</span></div>
        <div class="oc-foot"><b>${sol(o.precioTotal)}</b><span class="muted">${esc(o.pago)}</span></div></button>`;
      return `<h2 class="sec-t">En curso</h2>${act.length ? `<div class="cards">${act.map(card).join("")}</div>` : empty("No tienes entregas en curso", "Cuando un cliente acepte tu oferta, el pedido aparecerá aquí.")}
        <h2 class="sec-t">Historial</h2>${done.length ? `<div class="cards">${done.map(card).join("")}</div>` : `<p class="muted">Todavía no completas pedidos.</p>`}`;
    });
  },
  actions: { open(b, ctx) { ctx.go("#repartidor-entrega", { id: b.dataset.id }); } },
};

/* ---------- Detalle de entrega ---------- */
const CHAT_R = chatHandlers("repartidor");
const entrega = {
  title: "Entrega", parent: "asignados",
  render(ctx) {
    const o = ctx.db.orders[ctx.state.id];
    if (!o || o.courierId !== ctx.uid) return empty("No encontramos esta entrega", "Vuelve a tu lista de entregas.", `<a class="btn small" href="#repartidor-asignados">Mis entregas</a>`);
    return `<a class="back" href="#repartidor-asignados">← Mis entregas</a>${ctx.live("ent", () => entregaDetail(ctx))}${chatShell(ctx, "repartidor")}`;
  },
  afterLive: CHAT_R.afterLive,
  forms: CHAT_R.forms,
  actions: {
    ...CHAT_R.actions,
    askPay(b, ctx) { const o = ctx.db.orders[ctx.state.id]; if (sendChat(ctx, `Hola, ¿ya pudiste enviar el ${o.pago} de ${sol(o.precioTotal)}? Cuando lo envíes, toca «Ya pagué» en tu pedido.`)) { toast("Le escribimos al cliente por el chat."); openChat(ctx); } },
    next(b, ctx) {
      const o = ctx.db.orders[ctx.state.id], nuevo = b.dataset.next;
      if (nuevo !== "por_confirmar") return run(() => api.advanceOrderState(ctx.uid, o.id, nuevo), "Estado actualizado. Avisamos al cliente.");
      const cl = ctx.db.users[o.clienteId];
      modal("Marcar como entregado", `<form data-mform="d" novalidate>
        <p class="m-text">${esc(firstName(cl.nombre))} confirmará en su app que recibió el pedido. <b>No necesitas foto ni comprobante.</b></p>
        ${o.pago === "Efectivo" ? `<label class="check"><input type="checkbox" name="cash"> <span>Recibí ${sol(o.precioTotal)} en efectivo.</span></label>` : ""}
        <p class="hint-s">La comisión de ${sol(o.comision)} se cobra cuando ${esc(firstName(cl.nombre))} confirme. Si no responde en ${ctx.db.config.autoConfirmarMin || 30} minutos, se confirma sola.</p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn teal" type="submit">Sí, lo entregué</button></div></form>`,
        { d: f => { if (run(() => api.advanceOrderState(ctx.uid, o.id, "por_confirmar", { efectivoRecibido: !!f.cash?.checked }), "Listo. Esperamos la confirmación del cliente.")) closeModal(); } });
    },
    pay(b, ctx) { run(() => api.confirmOrderPayment(ctx.uid, ctx.state.id, b.dataset.ok === "1"), b.dataset.ok === "1" ? "Pago confirmado." : "Enviamos el pago a revisión."); },
    change(b, ctx) {
      const o = ctx.db.orders[ctx.state.id];
      modal("Proponer un cambio", `<form data-mform="ch" novalidate>
        <p class="m-text">El cliente debe aprobar cualquier cambio de producto o precio. Precio actual: <b>${sol(o.precioTotal)}</b>.</p>
        <div class="f"><label for="chT">Nuevo precio total (S/)</label><input class="in" id="chT" name="t" inputmode="decimal"></div>
        <div class="f"><label for="chM">Motivo</label><textarea class="in" id="chM" name="m" rows="3" placeholder="Ej.: No había gaseosa de 1.5 L, solo de 2 L (+S/ 1.50)."></textarea></div>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Enviar al cliente</button></div></form>`,
        { ch: f => { if (run(() => api.proposeOrderChange(ctx.uid, o.id, { nuevoTotal: num(f.t.value), motivo: f.m.value }), "Enviamos el cambio al cliente.")) closeModal(); } });
    },
    report(b, ctx) { reportModal(ctx, ctx.state.id); },
  },
};
function entregaDetail(ctx) {
  const db = ctx.db, o = db.orders[ctx.state.id]; if (!o) return "";
  const cl = db.users[o.clienteId], of = o.offers[o.ofertaAceptadaId];
  const next = api.nextStateFor(o.estado);
  const active = api.ACTIVE_STATES.includes(o.estado);
  const needsPay = next === "por_confirmar" && api.METODOS_DIRECTOS.includes(o.pago) && o.estadoPago !== "confirmado";
  const pend = o.cambios.find(c => c.estado === "pendiente");
  let pago = "";
  if (api.METODOS_DIRECTOS.includes(o.pago)) pago = `<div class="pay-state"><div>${payLogo(o.pago, "sm")}<b>${sol(o.precioTotal)} por ${esc(o.pago)}</b>${payChip(o.estadoPago)}</div>
    ${o.estadoPago === "marcado" ? `<p class="pay-alert">${esc(firstName(cl.nombre))} dice que ya te pagó. Abre tu ${esc(o.pago)} y revisa que llegaron <b>${sol(o.precioTotal)}</b>.</p><div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="pay" data-ok="0">Aún no me llega</button><button class="btn small teal" type="button" data-act="pay" data-ok="1">Sí, recibí el pago</button></div>`
      : o.estadoPago === "pendiente" ? `<p class="muted">${esc(firstName(cl.nombre))} aún no toca «Ya pagué». Si ya te llegó, confírmalo; si no, recuérdale por el chat.</p><div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="askPay">Recordar el pago</button><button class="btn small teal" type="button" data-act="pay" data-ok="1">Ya me llegó</button></div>`
      : o.estadoPago === "en_revision" ? `<p class="muted">Le avisamos a ${esc(firstName(cl.nombre))} que no ves el pago. Si te llega, confírmalo.</p><div class="row-btns"><button class="btn small ghost-dark" type="button" data-act="askPay">Escribir al cliente</button><button class="btn small teal" type="button" data-act="pay" data-ok="1">Ya me llegó</button></div>` : ""}</div>`;
  else if (o.pago === "Efectivo") pago = `<div class="pay-state"><div>${payLogo("Efectivo", "sm")}<b>Cobra ${sol(o.precioTotal)} en efectivo</b>${payChip(o.estadoPago)}</div><p class="muted">Confirmarás el cobro al marcar la entrega.</p></div>`;
  else pago = `<div class="pay-state"><div>${payLogo("Saldo RAPIDIN", "sm")}<b>${sol(o.precioTotal)} con saldo RAPIDIN</b>${payChip(o.estadoPago)}</div><p class="muted">Se acredita a tus ganancias cuando confirmes la entrega.</p></div>`;
  return `
  <div class="det-head"><div><span class="muted">${o.codigo} · ${api.MODALIDAD[o.modalidad]}</span><h2>${o.modalidad === "catalogo" ? `Pedido del Market · ${esc(o.tienda.nombre)}` : esc(o.descripcion)}</h2></div>${chip(o.estado)}</div>
  <div class="grid-2">
    <div class="stack">
      ${active ? `<section class="card action-card">
        <small>Siguiente paso</small>
        ${o.estado === "camino_a_entrega" ? `<p>Vas camino al cliente. Cuando estés a menos de ${db.config.umbralCercaM} m le avisamos que estás cerca.</p>` : ""}
        ${needsPay ? `<p>Para cerrar la entrega primero confirma el pago del cliente.</p>` : ""}
        ${next ? `<button class="btn big" type="button" data-act="next" data-next="${next}" ${needsPay ? "disabled" : ""}>${NEXT_LABEL[next]}</button>` : ""}
      </section>` : ""}
      ${o.estado === "por_confirmar" ? `<section class="card action-card wait"><small>Entregado · por confirmar</small><p>Esperando que ${esc(firstName(cl.nombre))} confirme que recibió el pedido. Si no responde en ${db.config.autoConfirmarMin || 30} minutos, se confirma solo.</p>${contactButtons({ chat: true })}</section>` : ""}
      ${o.estado === "en_revision" && o.entregaMarcada ? `<section class="card action-card"><small>Entrega en revisión</small><p>${esc(firstName(cl.nombre))} indica que no recibió el pedido. Escríbele por el chat; un administrador lo revisará.</p>${contactButtons({ chat: true, tel: cl.telefono })}</section>` : ""}
      ${o.items ? `<section class="card"><h2 class="card-t">Qué recoger en ${esc(o.tienda.nombre)}</h2>${itemsList(o)}</section>` : ""}
      ${o.tienda?.id && db.establishments[o.tienda.id]?.telefono && active ? `<section class="card"><h2 class="card-t">Llama al local para pedir y pasar a recoger</h2><p class="hint-s" style="margin:-6px 0 10px">${esc(o.tienda.nombre)} · ${esc(o.tienda.direccion || "")}</p>${phoneLinks(db.establishments[o.tienda.id].telefono)}</section>` : ""}
      ${o.modalidad === "libre" && active ? `<a class="free-banner" href="#repartidor-guia"><div><b>¿Dónde comprar?</b><span>Revisa la Guía de precios y llama al local para que te lo separen.</span></div><span class="btn small">Abrir guía</span></a>` : ""}
      <section class="card"><h2 class="card-t">Cliente</h2>
        <div class="person">${avatar(cl.uid, cl.nombre)}<div><b>${esc(cl.nombre)}</b><span>${esc(o.entrega.referencia || "Sin referencia")}</span></div></div>
        ${active ? `${contactButtons({ tel: cl.telefono, wa: cl.whatsapp, chat: true, nombre: firstName(cl.nombre) })}
        <p class="hint-s">Solo puedes contactar al cliente mientras atiendes este pedido.</p>` : api.chatOpen(o) ? contactButtons({ chat: true }) : ""}
      </section>
      <section class="card"><h2 class="card-t">Cobro</h2>${pago}
        <dl class="kv" style="margin-top:12px">${of?.costoProductos ? `<div><dt>${o.modalidad === "catalogo" ? "Precio del local" : "Productos"}</dt><dd>${sol(of.costoProductos)}</dd></div>` : ""}<div><dt>Tu tarifa</dt><dd>${sol(of?.tarifa || 0)}</dd></div><div><dt>Comisión RAPIDIN</dt><dd>${sol(o.comision)} <small>${o.estado === "entregado" ? "Cobrada" : "Reservada"}</small></dd></div><div><dt>Tu ganancia</dt><dd><b class="pos">${sol((of?.tarifa || 0) - o.comision)}</b></dd></div></dl>
      </section>
      ${pend ? `<div class="banner warn">Esperando que el cliente apruebe el cambio a ${sol(pend.nuevoTotal)}.</div>` : ""}
      ${o.cambios.filter(c => c.estado !== "pendiente").slice(-1).map(c => `<div class="banner ${c.estado === "aprobado" ? "ok" : "bad"}">El cliente ${c.estado === "aprobado" ? "aprobó" : "rechazó"} el cambio a ${sol(c.nuevoTotal)}.</div>`).join("")}
      <div class="row-btns">
        ${active && api.ESTADOS.indexOf(o.estado) < api.ESTADOS.indexOf("camino_a_entrega") && !pend ? `<button class="btn small ghost-dark" type="button" data-act="change">Proponer cambio de precio o producto</button>` : ""}
        <button class="btn small ghost-dark" type="button" data-act="report">Reportar un problema</button>
      </div>
      ${o.calificacion ? `<div class="banner ok">El cliente te calificó con ${"★".repeat(o.calificacion.estrellas)}${o.calificacion.comentario ? ` · «${esc(o.calificacion.comentario)}»` : ""}</div>` : ""}
    </div>
    <div class="stack">
      <section class="card">${orderMap(o, db)}</section>
      <section class="card"><h2 class="card-t">Detalle</h2>${orderSummaryRows(o)}</section>
      <section class="card"><h2 class="card-t">Estado</h2>${timeline(o)}</section>
    </div>
  </div>`;
}

/* ---------- Billetera ---------- */
const billetera = {
  title: "Billetera",
  render(ctx) {
    return ctx.live("bw", () => {
      const db = ctx.db, w = db.wallets[ctx.uid];
      const wds = Object.values(db.withdrawals).filter(x => x.uid === ctx.uid).sort((a, b) => b.creado - a.creado);
      const tops = Object.values(db.topups).filter(x => x.uid === ctx.uid).sort((a, b) => b.creado - a.creado);
      const ST = { pendiente: ["Por revisar", "warn"], pagado: ["Pagado", "ok"], rechazado: ["Rechazado", "bad"], confirmada: ["Verificada", "ok"], rechazada: ["Rechazada", "bad"] };
      return `<div class="kpis">
        <div class="kpi kpi-main"><small>Saldo para comisiones</small><b>${sol(api.walletDisponible(w))}</b><button class="btn small" type="button" data-act="topup">Recargar</button></div>
        <div class="kpi"><small>Reservado en ofertas</small><b>${sol(w.reservado)}</b><span class="muted">Se libera si no te eligen</span></div>
        <div class="kpi"><small>Ganancias retirables</small><b class="pos">${sol(w.ganancias)}</b>${db.config.retirosHabilitados ? `<button class="btn small ghost-dark" type="button" data-act="withdraw">Solicitar retiro</button>` : `<span class="muted">Retiros pausados</span>`}</div>
      </div>
      <p class="hint-s" style="margin:-6px 0 18px">Las recargas solo sirven para pagar comisiones. Los retiros salen únicamente de tus ganancias (pedidos pagados con saldo RAPIDIN).</p>
      <div class="grid-3">
        <section class="card"><h2 class="card-t">Recargas</h2>${tops.length ? `<ul class="rows">${tops.map(t => `<li><div><b>${sol(t.monto)} · ${esc(t.metodo)}</b><small>Op. ${esc(t.operacion)} · ${ago(t.creado)}</small></div><span class="chip ${ST[t.estado][1]}">${ST[t.estado][0]}</span></li>`).join("")}</ul>` : `<p class="muted">Sin recargas.</p>`}</section>
        <section class="card"><h2 class="card-t">Retiros</h2>${wds.length ? `<ul class="rows">${wds.map(t => `<li><div><b>${sol(t.monto)}</b><small>${esc(t.cuenta)} · ${ago(t.creado)}</small></div><span class="chip ${ST[t.estado][1]}">${ST[t.estado][0]}</span></li>`).join("")}</ul>` : `<p class="muted">Sin retiros.</p>`}</section>
        <section class="card"><h2 class="card-t">Movimientos</h2>${ledgerList(db.walletLedger.filter(l => l.uid === ctx.uid).slice(0, 25))}</section>
      </div>`;
    });
  },
  actions: {
    topup(b, ctx) { topupModal(ctx, "tu saldo para comisiones"); },
    withdraw(b, ctx) {
      const c = ctx.db.couriers[ctx.uid], w = ctx.db.wallets[ctx.uid];
      modal("Solicitar retiro", `<form data-mform="w" novalidate>
        <p class="m-text">Disponible para retirar: <b>${sol(w.ganancias)}</b>. Un administrador aprueba y envía el dinero.</p>
        <div class="two"><div class="f"><label for="wM">Monto (S/)</label><input class="in" id="wM" name="m" inputmode="decimal" placeholder="20.00"></div>
        <div class="f"><label for="wC">Cuenta</label><select class="in" id="wC" name="c">${c.cuentasCobro.map(x => `<option>${esc(x.tipo)} ${fmtPhone(x.numero).replace("+51 ", "")}</option>`).join("")}</select></div></div>
        <p class="err" id="wErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Solicitar retiro</button></div></form>`,
        { w: f => { const m = num(f.m.value); if (!(m > 0)) return ($("#wErr").textContent = "Escribe el monto."); if (run(() => api.requestWithdrawal(ctx.uid, { monto: m, cuenta: f.c.value }), "Solicitud enviada.")) closeModal(); } });
    },
  },
};

/* ---------- Perfil y cuentas de cobro ---------- */
const basePerfil = perfilView("");
const perfil = {
  title: "Perfil y cobros", static: true,
  render(ctx) {
    const c = ctx.db.couriers[ctx.uid];
    const get = t => c.cuentasCobro.find(x => x.tipo === t);
    return `<div class="grid-2">${basePerfil.render(ctx)}
      <div class="stack">
        <form class="card" data-form="cuentas" novalidate>
          <h2 class="card-t">Cuentas de cobro</h2>
          <p class="hint-s" style="margin-bottom:14px">El cliente las ve solo después de aceptar tu oferta y solo para ese pedido. RAPIDIN las verifica antes de mostrarlas.</p>
          ${["Yape", "Plin", "Lemon"].map(t => `<div class="f"><label for="cc${t}" class="lbl-logo">${payLogo(t, "xs")}${t} ${get(t) ? (get(t).verificada ? `<span class="ok-pill">Verificada</span>` : `<span class="chip warn">Por verificar</span>`) : ""}</label><div class="phone-in"><span>+51</span><input class="in" id="cc${t}" name="${t}" inputmode="numeric" maxlength="9" value="${esc(get(t)?.numero || "")}" placeholder="Opcional"></div></div>`).join("")}
          <p class="err" id="ccErr" role="alert"></p>
          <button class="btn" type="submit">Guardar cuentas</button>
        </form>
        <section class="card soft"><h2 class="card-t">Tu cuenta de repartidor</h2>
          <dl class="kv"><div><dt>Vehículo</dt><dd>${vehLabel(c.vehiculo)}</dd></div><div><dt>Zona</dt><dd>Camaná</dd></div><div><dt>Calificación</dt><dd>${stars(c.rating, c.ratingCount)} (${c.ratingCount})</dd></div><div><dt>Pedidos completados</dt><dd>${c.completados}</dd></div></dl></section>
      </div></div>`;
  },
  actions: basePerfil.actions,
  mount: basePerfil.mount,
  forms: {
    ...basePerfil.forms,
    cuentas(f, ctx) {
      const cuentas = ["Yape", "Plin", "Lemon"].map(t => ({ tipo: t, numero: normPhone(f[t].value), titular: ctx.user.nombre })).filter(x => x.numero);
      if (!cuentas.length) return ($("#ccErr").textContent = "Registra al menos una cuenta para cobrar.");
      if (run(() => api.updatePayoutAccounts(ctx.uid, cuentas), "Cuentas guardadas. Las nuevas quedan por verificar.")) ctx.rerender();
    },
  },
};

export default {
  id: "repartidor", label: "Panel de repartidor", icon: "moto",
  allowed: u => !u.roles.admin || !!u.roles.repartidor,
  switchable: u => !!u.roles.repartidor,
  home: u => (u.roles.repartidor === "aprobado" ? "#repartidor-disponibles" : "#repartidor-postulacion"),
  defaultView: u => (u.roles.repartidor === "aprobado" ? "disponibles" : "postulacion"),
  resolve(v, u) {
    if (u.roles.repartidor !== "aprobado") return "postulacion";
    if (v === "postulacion") return "disponibles";
    return null;
  },
  nav(u, db) {
    if (u.roles.repartidor !== "aprobado") return [{ id: "postulacion", label: "Mi postulación", icon: "log" }];
    const open = Object.values(db.orders).filter(o => api.OPEN_STATES.includes(o.estado) && o.clienteId !== u.uid && !myOffer(o, u.uid)).length;
    const act = Object.values(db.orders).filter(o => o.courierId === u.uid && api.ACTIVE_STATES.includes(o.estado)).length;
    return [
      { id: "disponibles", label: "Pedidos disponibles", short: "Pedidos", icon: "list", badge: db.couriers[u.uid]?.disponible ? open || "" : "" },
      { id: "asignados", label: "Mis entregas", short: "Entregas", icon: "route", badge: act || "" },
      { id: "guia", label: "Guía de precios", short: "Guía", icon: "store" },
      { id: "ofertas", label: "Mis ofertas", short: "Ofertas", icon: "tag" },
      { id: "billetera", label: "Billetera", short: "Billetera", icon: "wallet" },
      { id: "condiciones", label: "Comisiones y reglas", icon: "percent" },
      { id: "perfil", label: "Perfil y cobros", short: "Perfil", icon: "user" },
    ];
  },
  views: { postulacion, disponibles, guia, proveedor, ofertas, asignados, entrega, billetera, condiciones, perfil },
};
