/* =========================================================
   RAPIDIN · Panel de negocio
   El dueño de un local aprobado recibe los pedidos del Market,
   confirma el pago (Yape, Plin o Lemon directo a su número),
   avisa cuando está listo, administra su menú, su horario,
   sus fotos y sus datos de cobro.
   Antes de ser aprobado, el panel muestra la solicitud.
   ========================================================= */
import * as api from "../core/api.js";
import { isOpen, statusLabel, hoursLabel, ESPECIALIDADES } from "../core/store.js";
import { $, esc, sol, fmtPhone, normPhone, run, modal, closeModal, confirmModal, num, chip, ago, empty, avatar, firstName, telLink, waLink, imageField, bindImageFields, shrinkImage, IMG, payLogo, toast } from "../ui.js";
import { itemsList, storeLogo, productThumb, coverStyle, timeline } from "./common.js";
import { openBusinessForm } from "../business.js";

const DIAS = [[1, "L", "lunes"], [2, "M", "martes"], [3, "M", "miércoles"], [4, "J", "jueves"], [5, "V", "viernes"], [6, "S", "sábado"], [0, "D", "domingo"]];
const myStore = ctx => ctx.db.establishments[ctx.user.negocioId];
const storeOrders = ctx => Object.values(ctx.db.orders).filter(o => o.tiendaId === ctx.user.negocioId && o.gestionado);
const isToday = t => new Date(t).toDateString() === new Date().toDateString();
const EN_CURSO = o => !["esperando_local", "cancelado", "entregado"].includes(o.estado);

/* ---------- Solicitud (antes de la aprobación) ---------- */
const solicitud = {
  title: "Registra tu negocio", static: true,
  render(ctx) {
    const apps = Object.values(ctx.db.businessApplications || {}).filter(a => a.uid === ctx.uid).sort((a, b) => b.creado - a.creado);
    const last = apps[0];
    if (last?.estado === "pendiente") return `<section class="card narrow">
      <div class="ok-state"><svg class="ic big" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <h2>${esc(last.negocio)} está en revisión</h2><p class="muted">El equipo de RAPIDIN revisa tus datos. Cuando lo aprobemos se activará aquí tu Panel de negocio.</p></div>
      <ol class="timeline"><li class="done"><span>Solicitud enviada</span><time>${ago(last.creado)}</time></li><li class="now"><span>Revisión y llamada de confirmación</span></li><li><span>Aprobado: cargas tu menú y recibes pedidos</span></li></ol>
      <p class="hint-s">Código de solicitud: <b>${last.id.slice(-6).toUpperCase()}</b>. ¿Dudas? Escríbenos con el botón de soporte.</p></section>`;
    return `${last?.estado === "rechazada" ? `<div class="banner bad">Tu solicitud anterior no fue aprobada${last.nota ? `: ${esc(last.nota)}` : ""}. Puedes corregir los datos y enviarla otra vez.</div>` : ""}
      <div class="grid-2 wide-left">
      <section class="card biz-hero">
        <span class="eyebrow-s">Panel de negocio</span>
        <h2>Vende en RAPIDIN y recibe pedidos de todo Camaná</h2>
        <p class="muted">Publicas tu menú con tus precios y fotos. El cliente te paga directo por Yape, Plin o Lemon, tú confirmas y RAPIDIN le consigue un repartidor.</p>
        <button class="btn" type="button" data-act="apply" style="margin-top:18px">Registrar mi negocio</button>
      </section>
      <aside class="card soft">
        <h2 class="card-t">Cómo funciona</h2>
        <ol class="steps-list"><li><b>Envías tu solicitud</b><span>Datos del local, ubicación, horario y, si quieres, tu logo y portada.</span></li><li><b>Te aprobamos</b><span>Revisamos los datos y se activa tu Panel de negocio.</span></li><li><b>Cargas tu menú</b><span>Productos, precios, fotos y tus números de Yape, Plin o Lemon.</span></li><li><b>Recibes pedidos</b><span>Confirmas el pago con un toque y avisas cuando esté listo.</span></li></ol>
      </aside></div>`;
  },
  actions: { apply(b, ctx) { openBusinessForm(ctx.user); } },
};

/* ---------- Pedidos ---------- */
const pedidos = {
  title: "Pedidos",
  render(ctx) { return ctx.live("ped", () => pedidosHtml(ctx)); },
  actions: {
    accept(b, ctx) {
      const o = ctx.db.orders[b.dataset.id]; if (!o) return;
      confirmModal("Confirmar pago y aceptar", `Confirma que recibiste ${sol(o.pagoLocal.monto)} por ${o.pagoLocal.metodo} de ${o.clienteNombre || "el cliente"}. Al aceptar, el pedido ya no se puede cancelar y buscamos repartidor.`, "Sí, recibí el pago", () => run(() => api.storeAcceptOrder(ctx.uid, o.id), "Pedido aceptado. Ya buscamos repartidor."));
    },
    reject(b, ctx) {
      const o = ctx.db.orders[b.dataset.id]; if (!o) return;
      const MOT = ["No recibí el pago", "El monto no coincide", "Se agotó un producto", "Ya cerramos por hoy"];
      modal(`Rechazar ${o.codigo}`, `<form data-mform="rj" novalidate>
        <p class="m-text">El cliente verá el motivo. Si ya te pagó, devuélvele el dinero por el mismo medio.</p>
        <div class="pick-chips" role="group" aria-label="Motivo">${MOT.map(m => `<button type="button" class="pchip" data-mot="${esc(m)}">${esc(m)}</button>`).join("")}</div>
        <div class="f"><label for="rjT">Motivo</label><input class="in" id="rjT" name="t" maxlength="160" placeholder="Escribe o elige un motivo"></div>
        <p class="err" id="rjErr" role="alert"></p>
        <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn danger" type="submit">Rechazar pedido</button></div></form>`,
        {
          mount(body) { body.querySelectorAll("[data-mot]").forEach(x => x.addEventListener("click", () => { body.querySelector("#rjT").value = x.dataset.mot; })); },
          rj: f => { if (run(() => api.storeRejectOrder(ctx.uid, o.id, f.t.value), "Pedido rechazado. Avisamos al cliente.")) closeModal(); },
        });
    },
    ready(b, ctx) { run(() => api.storeMarkReady(ctx.uid, b.dataset.id), "Avisamos que el pedido está listo."); },
  },
};
function pedidosHtml(ctx) {
  const e = myStore(ctx); if (!e) return empty("No encontramos tu local", "Escríbenos por soporte para revisarlo.");
  const list = storeOrders(ctx).sort((a, b) => b.creado - a.creado);
  const nuevos = list.filter(o => o.estado === "esperando_local").sort((a, b) => a.creado - b.creado);
  const curso = list.filter(EN_CURSO);
  const hoy = list.filter(o => isToday(o.creado) && o.estado !== "cancelado" && o.localAceptado);
  const cobros = api.storeAccounts(e);
  return `${!cobros.length ? `<div class="banner warn">Registra tu Yape, Plin o Lemon en <a href="#negocio-local">Mi local</a>. Sin un número de cobro, los clientes no pueden pagarte directo y tus pedidos no llegan a este panel.</div>` : ""}
    ${!e.activo ? `<div class="banner bad">Tu local está desactivado por administración. Escríbenos por soporte.</div>` : ""}
    <div class="kpis">
      <div class="kpi kpi-main"><small>${esc(e.nombre)}</small><b class="${isOpen(e) ? "pos" : ""}">${esc(statusLabel(e))}</b><a class="btn small ghost-dark" href="#negocio-local">Abrir o cerrar</a></div>
      <div class="kpi"><small>Por confirmar</small><b>${nuevos.length}</b><span class="muted">Revisa el pago y acepta</span></div>
      <div class="kpi"><small>Ventas de hoy</small><b>${sol(hoy.reduce((s, o) => s + (o.subtotal || 0), 0))}</b><span class="muted">${hoy.length} pedido${hoy.length === 1 ? "" : "s"}</span></div>
    </div>
    <section class="card" style="margin-top:18px">
      <div class="card-head"><h2 class="card-t">Nuevos · confirma el pago</h2>${nuevos.length ? `<span class="chip warn">${nuevos.length}</span>` : ""}</div>
      ${nuevos.length ? `<div class="so-list">${nuevos.map(o => newOrderCard(ctx, e, o)).join("")}</div>` : `<p class="muted">Sin pedidos nuevos. Te avisaremos con una notificación.</p>`}
    </section>
    <section class="card" style="margin-top:18px">
      <div class="card-head"><h2 class="card-t">En curso</h2>${curso.length ? `<span class="chip info">${curso.length}</span>` : ""}</div>
      ${curso.length ? `<div class="so-list">${curso.map(o => liveOrderCard(ctx, o)).join("")}</div>` : `<p class="muted">Aquí verás los pedidos que aceptaste hasta que se entreguen.</p>`}
    </section>`;
}
function newOrderCard(ctx, e, o) {
  const acc = api.storeAccounts(e).find(c => c.tipo === o.pagoLocal.metodo);
  return `<article class="so-card new">
    <div class="so-head"><div><b>${esc(o.codigo)}</b><small>${ago(o.creado)} · ${esc(o.clienteNombre || "Cliente")}</small></div><b class="so-amt">${sol(o.pagoLocal.monto)}</b></div>
    ${itemsList(o)}
    <div class="so-pay">${payLogo(o.pagoLocal.metodo)}<div><b>El cliente dice que pagó por ${esc(o.pagoLocal.metodo)}</b><small>Revisa en tu ${esc(o.pagoLocal.metodo)}${acc ? ` (${fmtPhone(acc.numero)})` : ""} un pago de ${sol(o.pagoLocal.monto)} a nombre de ${esc(o.clienteNombre || "el cliente")}.</small></div></div>
    <div class="row-btns end"><button class="btn small ghost-dark" type="button" data-act="reject" data-id="${o.id}">Rechazar</button><button class="btn small teal" type="button" data-act="accept" data-id="${o.id}">Confirmar pago y aceptar</button></div>
  </article>`;
}
function liveOrderCard(ctx, o) {
  const db = ctx.db, cu = o.courierId ? db.users[o.courierId] : null, c = o.courierId ? db.couriers[o.courierId] : null;
  const tel = c?.telefono || cu?.telefono;
  const rider = !o.courierId ? `<span class="muted">Buscando repartidor…</span>`
    : `<span class="so-rider">${avatar(o.courierId, cu?.nombre || "Repartidor", "sm")}<span><b>${esc(firstName(cu?.nombre || "Repartidor"))}</b><small>${o.estado === "en_establecimiento" ? "Está en tu local" : api.ESTADOS.indexOf(o.estado) < api.ESTADOS.indexOf("en_establecimiento") ? "Va camino a tu local" : "Ya recogió el pedido"}</small></span>${tel ? telLink(tel) : ""}</span>`;
  const before = api.ESTADOS.indexOf(o.estado) < api.ESTADOS.indexOf("pedido_recogido");
  return `<article class="so-card">
    <div class="so-head"><div><b>${esc(o.codigo)}</b><small>Aceptado ${ago(o.localAceptado)} · ${esc(o.clienteNombre || "Cliente")}</small></div>${chip(o.estado)}</div>
    ${itemsList(o, { compact: true })}
    <div class="so-foot">${rider}
      ${before ? (o.listoLocal ? `<span class="chip ok">Listo para recoger</span>` : `<button class="btn small" type="button" data-act="ready" data-id="${o.id}">Pedido listo</button>`) : ""}</div>
  </article>`;
}

/* ---------- Historial ---------- */
const historial = {
  title: "Historial",
  render(ctx) {
    return ctx.live("hist", () => {
      const list = storeOrders(ctx).filter(o => ["entregado", "cancelado"].includes(o.estado)).sort((a, b) => b.creado - a.creado);
      if (!list.length) return empty("Aún no hay pedidos terminados", "Aquí verás los pedidos entregados y cancelados de tu local.");
      const vendido = list.filter(o => o.estado === "entregado").reduce((s, o) => s + (o.subtotal || 0), 0);
      return `<div class="kpis"><div class="kpi"><small>Entregados</small><b>${list.filter(o => o.estado === "entregado").length}</b></div><div class="kpi"><small>Vendido</small><b>${sol(vendido)}</b><span class="muted">Precio del local, sin envío</span></div><div class="kpi"><small>Cancelados</small><b>${list.filter(o => o.estado === "cancelado").length}</b></div></div>
        <section class="card" style="margin-top:18px"><div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Fecha</th><th>Productos</th><th>Pago</th><th>Monto</th><th>Estado</th></tr></thead><tbody>
        ${list.map(o => `<tr><td><b>${esc(o.codigo)}</b></td><td>${new Date(o.creado).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</td><td>${esc(o.descripcion)}</td><td>${esc(o.pagoLocal?.metodo || "")}</td><td>${sol(o.subtotal)}</td><td>${chip(o.estado)}${o.localRechazo ? `<small class="muted" style="display:block">${esc(o.localRechazo.motivo)}</small>` : ""}</td></tr>`).join("")}
        </tbody></table></div></section>`;
    });
  },
};

/* ---------- Menú ---------- */
const menu = {
  title: "Mi menú",
  render(ctx) {
    const e = myStore(ctx); if (!e) return empty("No encontramos tu local", "Escríbenos por soporte.");
    return `<div class="toolbar"><p class="hint-s" style="max-width:60ch">Lo que publiques aquí lo ven los clientes en el Market. Marca «Agotado» cuando se termine un plato: deja de poder pedirse al instante.</p><button class="btn small" type="button" data-act="prod">Agregar producto</button></div>
      ${ctx.live("menu", () => {
        const prods = Object.values(ctx.db.products).filter(p => p.tiendaId === e.id).sort((a, b) => (a.orden || 0) - (b.orden || 0));
        if (!prods.length) return empty("Tu menú está vacío", "Agrega tus platos o productos con su precio y una foto.", `<button class="btn small" type="button" data-act="prod">Agregar el primero</button>`);
        const secs = [...new Set(prods.map(p => p.seccion))];
        return secs.map(sec => `<section class="card" style="margin-bottom:16px"><h2 class="card-t">${esc(sec)}</h2><div class="prod-list">${prods.filter(p => p.seccion === sec).map(p => `
          <article class="prod${p.disponible ? "" : " off"}">${productThumb(p, e.categoria)}
            <div class="pr-main"><b>${esc(p.nombre)}</b>${p.descripcion ? `<span>${esc(p.descripcion)}</span>` : ""}<strong>${sol(p.precio)}</strong></div>
            <div class="row-btns"><label class="avail-t"><button class="switch sm" type="button" role="switch" aria-checked="${p.disponible}" data-act="avail" data-id="${p.id}" aria-label="Disponible: ${esc(p.nombre)}"><i></i></button><span>${p.disponible ? "Disponible" : "Agotado"}</span></label>
            <button class="link" type="button" data-act="prod" data-id="${p.id}">Editar</button><button class="link danger-t" type="button" data-act="del" data-id="${p.id}">Eliminar</button></div>
          </article>`).join("")}</div></section>`).join("");
      })}`;
  },
  actions: {
    avail(b, ctx) { run(() => api.toggleMyProduct(ctx.uid, b.dataset.id)); },
    del(b, ctx) { const p = ctx.db.products[b.dataset.id]; confirmModal("Eliminar producto", `«${p.nombre}» dejará de aparecer en el Market. Los pedidos anteriores no cambian.`, "Eliminar", () => run(() => api.deleteMyProduct(ctx.uid, p.id), "Producto eliminado."), "danger"); },
    prod(b, ctx) { productModal(ctx, b.dataset.id); },
  },
};
function productModal(ctx, id) {
  const e = myStore(ctx);
  const p = id ? ctx.db.products[id] : { nombre: "", descripcion: "", precio: "", seccion: "", img: null };
  const secs = [...new Set(Object.values(ctx.db.products).filter(x => x.tiendaId === e.id).map(x => x.seccion))];
  let img = p.img;
  modal(id ? "Editar producto" : "Nuevo producto", `<form data-mform="p" novalidate>
    <div class="f"><label for="pI">Foto <span class="opt">· recomendada, se reduce sola</span></label><div class="img-row"><span id="pPrev">${productThumb({ img }, e.categoria)}</span><input class="in" id="pI" type="file" accept="image/*"></div></div>
    <div class="two"><div class="f"><label for="pN">Nombre</label><input class="in" id="pN" name="n" maxlength="60" value="${esc(p.nombre)}" placeholder="Ej.: 1/4 de pollo a la brasa"></div>
    <div class="f"><label for="pP">Precio (S/)</label><input class="in" id="pP" name="p" inputmode="decimal" value="${p.precio === "" ? "" : (+p.precio).toFixed(2)}" placeholder="0.00"></div></div>
    <div class="f"><label for="pS">Sección</label><input class="in" id="pS" name="s" list="pSecs" maxlength="40" value="${esc(p.seccion)}" placeholder="Ej.: Pollos, Bebidas"><datalist id="pSecs">${secs.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
    <div class="f"><label for="pD">Descripción <span class="opt">· opcional</span></label><input class="in" id="pD" name="d" maxlength="160" value="${esc(p.descripcion)}" placeholder="Ej.: Con papas fritas y ensalada"></div>
    <p class="err" id="pErr" role="alert"></p>
    <div class="m-actions"><button class="btn ghost-dark" type="button" data-mclose>Volver</button><button class="btn" type="submit">Guardar producto</button></div></form>`,
    {
      mount(body) {
        body.querySelector("#pI").addEventListener("change", async ev => {
          const f = ev.target.files[0]; if (!f) return;
          try { img = await shrinkImage(f, IMG.producto); body.querySelector("#pPrev").innerHTML = productThumb({ img }, e.categoria); }
          catch (x) { body.querySelector("#pErr").textContent = "No pudimos leer esa imagen. Prueba con otra (JPG o PNG)."; }
        });
      },
      p: f => {
        const precio = num(f.p.value);
        if (isNaN(precio)) return ($("#pErr").textContent = "Escribe el precio con números, por ejemplo 12.50.");
        if (run(() => api.upsertMyProduct(ctx.uid, { id: id || undefined, nombre: f.n.value, precio, seccion: f.s.value, descripcion: f.d.value, img }), "Producto guardado.")) closeModal();
      },
    });
}

/* ---------- Mi local ---------- */
const local = {
  title: "Mi local", static: true,
  render(ctx) {
    const e = myStore(ctx); if (!e) return empty("No encontramos tu local", "Escríbenos por soporte.");
    const forz = e.forzado && e.forzado.hasta > Date.now() ? e.forzado.estado : null;
    const cob = t => (e.cobros || []).find(c => c.tipo === t) || {};
    return `<div class="grid-2 wide-left"><div class="stack">
      <section class="card">
        <div class="card-head"><h2 class="card-t">Estado ahora</h2><span class="chip ${isOpen(e) ? "ok" : "muted"}">${esc(statusLabel(e))}</span></div>
        <p class="muted">Tu horario: ${esc(hoursLabel(e))}. Si hoy abres antes o cierras antes, cámbialo aquí; mañana vuelve solo a tu horario.</p>
        <div class="seg-pro" role="group" aria-label="Estado del local" style="margin-top:14px">
          <button type="button" data-act="ov" data-m="abrir" aria-pressed="${forz === "abierto"}">Abrir ahora</button>
          <button type="button" data-act="ov" data-m="auto" aria-pressed="${!forz}">Según mi horario</button>
          <button type="button" data-act="ov" data-m="cerrar" aria-pressed="${forz === "cerrado"}">Cerrar por hoy</button>
        </div>
      </section>
      <form class="card" data-form="info" novalidate>
        <h2 class="card-t">Datos del local</h2>
        <div class="person big" style="margin-bottom:14px">${storeLogo(e, "lg")}<div><b>${esc(e.nombre)}</b><span>${esc(e.direccion)}</span><small class="muted">Para cambiar el nombre o la ubicación, escríbenos por soporte.</small></div></div>
        <div class="img-pair">${imageField("portada", "portada", e.portada, "Portada", "foto horizontal de tu local o tus platos")}${imageField("logo", "logo", e.logo, "Logo", "cuadrado")}</div>
        <div class="f"><label for="lD">Descripción</label><input class="in" id="lD" name="desc" maxlength="200" value="${esc(e.descripcion || "")}" placeholder="Ej.: Pollo a la brasa y parrillas al carbón."></div>
        <div class="two"><div class="f"><label for="lT">Celular del local</label><div class="phone-in"><span>+51</span><input class="in" id="lT" name="tel" inputmode="numeric" maxlength="9" value="${esc(e.telefono || "")}"></div></div>
        <div class="f"><label for="lP">Tiempo de preparación (min)</label><input class="in" id="lP" name="prep" inputmode="numeric" maxlength="3" value="${e.tiempoPrep || ""}"></div></div>
        <span class="lbl">Especialidades <span class="opt">· hasta 4, para que te encuentren por categoría</span></span>
        <div class="days tags" role="group" aria-label="Especialidades">${ESPECIALIDADES.map(([n, i]) => `<label><input type="checkbox" name="tag" value="${esc(n)}" ${(e.etiquetas || []).includes(n) ? "checked" : ""}><span>${i} ${esc(n)}</span></label>`).join("")}</div>
        <span class="lbl" style="margin-top:16px">Días de atención</span>
        <div class="days" role="group" aria-label="Días de atención">${DIAS.map(([d, l, n]) => `<label title="${n}"><input type="checkbox" name="dia" value="${d}" ${e.horario?.dias.includes(d) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
        <div class="two" style="margin-top:12px"><div class="f"><label for="lA">Abre</label><input class="in" id="lA" name="abre" type="time" value="${e.horario?.abre || "08:00"}"></div><div class="f"><label for="lC">Cierra</label><input class="in" id="lC" name="cierra" type="time" value="${e.horario?.cierra || "20:00"}"></div></div>
        <p class="err" id="lErr" role="alert"></p>
        <button class="btn" type="submit">Guardar cambios</button>
      </form></div>
      <form class="card" data-form="cobros" novalidate>
        <h2 class="card-t">Cómo te pagan los clientes</h2>
        <p class="muted">Los clientes pagan tus productos directo a estos números antes de que aceptes el pedido. RAPIDIN no toca ese dinero. Por ahora no hay pago en efectivo al local.</p>
        ${api.METODOS_DIRECTOS.map(t => `<fieldset class="cob-f"><legend>${payLogo(t)} ${t} <span class="opt">· opcional</span></legend>
          <div class="two"><div class="f"><label for="cN${t}">Número</label><div class="phone-in"><span>+51</span><input class="in" id="cN${t}" name="n${t}" inputmode="numeric" maxlength="9" value="${esc(cob(t).numero || "")}"></div></div>
          <div class="f"><label for="cT${t}">Titular</label><input class="in" id="cT${t}" name="t${t}" maxlength="60" value="${esc(cob(t).titular || "")}" placeholder="Como aparece en ${t}"></div></div></fieldset>`).join("")}
        <p class="err" id="cErr" role="alert"></p>
        <button class="btn" type="submit">Guardar cobros</button>
      </form></div>`;
  },
  mount(root, ctx) {
    const e = myStore(ctx); if (!e) return;
    ctx.state.img = { logo: e.logo || null, portada: e.portada || null };
    bindImageFields(root, ctx.state.img, m => ($("#lErr").textContent = m));
    root.querySelectorAll(".days.tags input").forEach(i => i.addEventListener("change", () => { const n = root.querySelectorAll(".days.tags input:checked"); if (n.length > 4) { i.checked = false; toast("Elige hasta 4 especialidades.", "bad"); } }));
  },
  actions: {
    ov(b, ctx) {
      const m = b.dataset.m;
      if (run(() => api.setStoreOverride(ctx.uid, m), m === "abrir" ? "Tu local aparece abierto." : m === "cerrar" ? "Tu local aparece cerrado por hoy." : "Volviste a tu horario normal.")) ctx.rerender();
    },
  },
  forms: {
    info(f, ctx) {
      const err = $("#lErr"); err.textContent = "";
      const dias = [...f.querySelectorAll("input[name=dia]:checked")].map(x => +x.value);
      if (!dias.length) return (err.textContent = "Elige al menos un día de atención.");
      const tel = normPhone(f.tel.value);
      const patch = { descripcion: f.desc.value, telefono: tel, tiempoPrep: +f.prep.value || 0, etiquetas: [...f.querySelectorAll("input[name=tag]:checked")].map(x => x.value), horario: { dias, abre: f.abre.value, cierra: f.cierra.value }, logo: ctx.state.img.logo, portada: ctx.state.img.portada };
      try { api.updateMyStore(ctx.uid, patch); toast("Datos del local guardados."); } catch (x) { err.textContent = x.message; }
    },
    cobros(f, ctx) {
      const err = $("#cErr"); err.textContent = "";
      const cobros = api.METODOS_DIRECTOS.map(t => ({ tipo: t, numero: normPhone(f["n" + t].value), titular: f["t" + t].value })).filter(c => c.numero || c.titular.trim());
      if (!cobros.length) return (err.textContent = "Registra al menos un número para que los clientes puedan pagarte.");
      try { api.updateMyStore(ctx.uid, { cobros }); toast("Datos de cobro guardados."); ctx.rerender(); } catch (x) { err.textContent = x.message; }
    },
  },
};

export default {
  id: "negocio", label: "Panel de negocio", icon: "store",
  allowed: u => !u.roles.admin,
  switchable: u => !!u.roles.negocio,
  home: u => (u.roles.negocio === "aprobado" ? "#negocio-pedidos" : "#negocio-solicitud"),
  defaultView: u => (u.roles.negocio === "aprobado" ? "pedidos" : "solicitud"),
  resolve(v, u) {
    if (u.roles.negocio !== "aprobado") return v === "solicitud" ? null : "solicitud";
    if (v === "solicitud") return "pedidos";
    return null;
  },
  nav(u, db) {
    if (u.roles.negocio !== "aprobado") return [{ id: "solicitud", label: "Mi solicitud", icon: "store" }];
    const nuevos = Object.values(db.orders).filter(o => o.tiendaId === u.negocioId && o.gestionado && o.estado === "esperando_local").length;
    return [
      { id: "pedidos", label: "Pedidos", short: "Pedidos", icon: "list", badge: nuevos || "" },
      { id: "menu", label: "Mi menú", short: "Menú", icon: "tag" },
      { id: "local", label: "Mi local", short: "Local", icon: "store" },
      { id: "historial", label: "Historial", short: "Historial", icon: "log" },
    ];
  },
  views: { solicitud, pedidos, menu, local, historial },
};
