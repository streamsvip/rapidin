/* =========================================================
   RAPIDIN · Escena 3D del inicio
   Camaná en miniatura: el cliente publica (pin naranja), los
   repartidores ofertan (burbujas), se acepta una oferta y el
   repartidor elegido recorre la ruta hasta la entrega.
   Requiere Three.js r128 cargado como script global (window.THREE).
   ========================================================= */

export function initScene({ reduced = false } = {}) {
  const stage = document.getElementById("stage");
  const bubbleLayer = document.getElementById("bubbles");
  const heroCopy = document.querySelector(".hero-copy");
  const hudItems = [...document.querySelectorAll("#hudList li")];
  if (!stage) return;

  const THREE = window.THREE;
  if (!THREE) { stage.classList.add("no-webgl"); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch (e) { stage.classList.add("no-webgl"); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.prepend(renderer.domElement);

  /* ---------- Escena, cámara y luces ---------- */
  const NIGHT = 0x101c2c;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(NIGHT, 18, 40);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  const CAM_BASE = new THREE.Vector3(12, 13.5, 15.5);
  const LOOK = new THREE.Vector3(0, 0.3, 0);

  scene.add(new THREE.HemisphereLight(0x8fb7e6, 0x07101c, 0.55));
  const key = new THREE.DirectionalLight(0xffe9d6, 0.85);
  key.position.set(7, 14, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x20c997, 0.3);
  rim.position.set(-10, 5, -8);
  scene.add(rim);

  const city = new THREE.Group();
  scene.add(city);

  const CELL = 1.4;
  const N = 5;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------- Suelo y resplandor bajo el pin ---------- */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0b1522, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  city.add(ground);

  const glowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, "rgba(255,90,31,.55)");
    grd.addColorStop(.45, "rgba(255,90,31,.12)");
    grd.addColorStop(1, "rgba(255,90,31,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();

  /* ---------- Calles ---------- */
  const streetPts = [];
  for (let k = -N; k < N; k++) {
    const p = (k + 0.5) * CELL;
    streetPts.push(-N * CELL + 0.7, 0.01, p, N * CELL + 0.7, 0.01, p);
    streetPts.push(p, 0.01, -N * CELL - 0.7, p, 0.01, N * CELL + 0.7);
  }
  const streetGeo = new THREE.BufferGeometry();
  streetGeo.setAttribute("position", new THREE.Float32BufferAttribute(streetPts, 3));
  city.add(new THREE.LineSegments(streetGeo, new THREE.LineBasicMaterial({ color: 0x20c997, transparent: true, opacity: 0.12 })));

  /* ---------- Manzanas ---------- */
  const palette = [0x15243a, 0x1a2c46, 0x122033, 0x1d3150];
  const mats = palette.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.15 }));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x5fe3bd, transparent: true, opacity: 0.16 });
  const boxGeo = new THREE.BoxGeometry(0.98, 1, 0.98);
  const edgeGeo = new THREE.EdgesGeometry(boxGeo);
  const winGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const winMats = [new THREE.MeshBasicMaterial({ color: 0xffb38a }), new THREE.MeshBasicMaterial({ color: 0xffe7c2 })];

  for (let i = -N + 1; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      if (i === 0 && j === 0) continue; // manzana del cliente: queda libre para el pin
      if (i === 3 && j === -2) { // Plaza de Armas
        const plaza = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1), new THREE.MeshStandardMaterial({ color: 0x166b58, roughness: 0.9 }));
        plaza.position.set(i * CELL, 0.03, j * CELL);
        city.add(plaza);
        continue;
      }
      const d = Math.hypot(i, j);
      const h = 0.16 + rnd() * rnd() * (d < 3 ? 1.9 : 1.1);
      const m = new THREE.Mesh(boxGeo, mats[Math.floor(rnd() * mats.length)]);
      m.scale.set(1, h, 1);
      m.position.set(i * CELL, h / 2, j * CELL);
      city.add(m);
      const e = new THREE.LineSegments(edgeGeo, edgeMat);
      e.scale.copy(m.scale); e.position.copy(m.position);
      city.add(e);
      const wins = Math.floor(rnd() * 3);
      for (let w = 0; w < wins; w++) {
        const win = new THREE.Mesh(winGeo, winMats[rnd() < 0.5 ? 0 : 1]);
        win.position.set(i * CELL + (rnd() - 0.5) * 0.6, Math.max(0.1, h * (0.25 + rnd() * 0.55)), j * CELL + 0.495);
        city.add(win);
      }
    }
  }

  /* ---------- Litoral (Camaná mira al Pacífico) ---------- */
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(CELL * 0.8, (2 * N + 3) * CELL),
    new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 1 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(-N * CELL, 0.004, 0);
  city.add(beach);

  const seaGeo = new THREE.PlaneGeometry(20, (2 * N + 10) * CELL, 40, 50);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x0a2c38, roughness: 0.45, metalness: 0.25 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-N * CELL - 0.4 - 10, -0.06, 0);
  city.add(sea);
  const seaBase = seaGeo.attributes.position.array.slice();

  /* ---------- Pin del cliente ---------- */
  const P = new THREE.Vector3(0, 0, 0); // centro de la manzana libre
  const pin = new THREE.Group();
  pin.position.copy(P);
  city.add(pin);

  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02;
  pin.add(glow);

  const pinMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff5a1f, emissiveIntensity: 0.45, roughness: 0.35 });
  const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 20), pinMat); pinHead.position.y = 2.55;
  const pinTip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 32), pinMat); pinTip.rotation.x = Math.PI; pinTip.position.y = 2.13;
  const pinDot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })); pinDot.position.set(0, 2.6, 0.26);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.9, 8), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.55 }));
  stem.position.y = 0.95;
  const pinTop = new THREE.Group(); pinTop.add(pinHead, pinTip, pinDot);
  pin.add(pinTop, stem);
  const pinLight = new THREE.PointLight(0xff5a1f, 1.2, 5); pinLight.position.y = 0.8; pin.add(pinLight);

  const rings = [0, 1].map(() => {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 48), new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.y = 0.03; pin.add(r); return r;
  });

  /* ---------- Repartidores, rutas y ofertas ---------- */
  // Esquinas en unidades de cruce; el destino (0,0) es la esquina junto al pin.
  const X = k => (k + 0.5) * CELL;
  const ROUTES = [
    [[4, -4], [4, -1], [-0.5, -1], [-0.5, -0.5]],
    [[-1, -4], [-1, -1], [-0.5, -1], [-0.5, -0.5]],
    [[4, 3], [0, 3], [0, -0.5], [-0.5, -0.5]],
    [[2, -3], [2, -1], [-0.5, -1], [-0.5, -0.5]],
  ];
  const OFFERS = [
    { p: "S/ 7.50", m: "18 min · ★ 4.7" },
    { p: "S/ 6.00", m: "12 min · ★ 4.9" },
    { p: "S/ 8.00", m: "10 min · ★ 4.6" },
    { p: "S/ 6.50", m: "15 min · ★ 4.8" },
  ];
  const WIN = 1;
  const tealMat = new THREE.MeshStandardMaterial({ color: 0x20c997, emissive: 0x20c997, emissiveIntensity: 0.55, roughness: 0.35 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0xfff7ed, roughness: 0.6 });

  const couriers = ROUTES.map((rt, idx) => {
    const pts = rt.map(([a, b]) => new THREE.Vector3(X(a), 0.16, X(b)));
    const segs = []; let L = 0;
    for (let s = 0; s < pts.length - 1; s++) { const l = pts[s].distanceTo(pts[s + 1]); segs.push(l); L += l; }

    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.24), tealMat); body.position.y = 0.04;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.22), crateMat); crate.position.set(-0.12, 0.23, 0);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.33, 32), new THREE.MeshBasicMaterial({ color: 0x20c997, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.14;
    g.add(body, crate, halo);
    g.position.copy(pts[0]);
    city.add(g);

    const rMat = new THREE.MeshBasicMaterial({ color: idx === WIN ? 0x20c997 : 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1], len = a.distanceTo(b);
      if (len < 0.01) continue;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.12, 0.12), rMat);
      pl.rotation.x = -Math.PI / 2;
      pl.position.set((a.x + b.x) / 2, 0.025, (a.z + b.z) / 2);
      if (Math.abs(a.x - b.x) < 0.01) pl.rotation.z = Math.PI / 2;
      city.add(pl);
    }

    const el = document.createElement("div");
    el.className = "bubble";
    el.innerHTML = `<span class="bp">${OFFERS[idx].p}</span><span class="bm">${OFFERS[idx].m}</span>`;
    bubbleLayer.appendChild(el);
    return { pts, segs, L, g, rMat, el, meta: el.querySelector(".bm"), idx };
  });

  const doneEl = document.createElement("div");
  doneEl.className = "bubble done";
  doneEl.innerHTML = `<span class="bp">Entregado</span><span class="bm">Pago confirmado</span>`;
  bubbleLayer.appendChild(doneEl);

  /* ---------- Utilidades de animación ---------- */
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const backOut = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

  function along(c, s) {
    let d = s * c.L;
    for (let k = 0; k < c.segs.length; k++) {
      if (d <= c.segs[k] || k === c.segs.length - 1) {
        const a = c.pts[k], b = c.pts[k + 1];
        const t = c.segs[k] ? Math.min(1, d / c.segs[k]) : 1;
        return { p: new THREE.Vector3().lerpVectors(a, b, t), dir: new THREE.Vector3().subVectors(b, a) };
      }
      d -= c.segs[k];
    }
  }

  let lastHud = -1;
  function setHud(k) {
    if (k === lastHud) return; lastHud = k;
    hudItems.forEach((li, i) => { li.classList.toggle("on", i === k); li.classList.toggle("past", i < k); });
  }

  /* ---------- Tamaño y zona protegida del texto ---------- */
  let W = 1, H = 1, safeLeft = 0, desktop = false;
  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    desktop = W > 860;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = desktop ? 30 : 38;
    if (desktop) camera.setViewOffset(W, H, -W * 0.25, 0, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // Las burbujas no deben tapar el titular ni los botones.
    safeLeft = desktop && heroCopy ? heroCopy.getBoundingClientRect().right - r.left + 24 : -Infinity;
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const ptr = { x: 0, y: 0 }, ptrS = { x: 0, y: 0 };
  window.addEventListener("pointermove", e => { ptr.x = e.clientX / innerWidth - 0.5; ptr.y = e.clientY / innerHeight - 0.5; }, { passive: true });

  const tmp = new THREE.Vector3();
  function place(obj, yOff, el, show) {
    obj.getWorldPosition(tmp); tmp.y += yOff; tmp.project(camera);
    const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
    const blocked = x - 70 < safeLeft || y < 70;
    el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
    el.style.opacity = blocked ? 0 : show;
  }

  /* ---------- Bucle ---------- */
  const T = 12.5;
  function frame(time) {
    const t = time % T;

    ptrS.x += (ptr.x - ptrS.x) * 0.05; ptrS.y += (ptr.y - ptrS.y) * 0.05;
    const sc = Math.min(window.scrollY, 900);
    city.rotation.y = -0.1 + sc * 0.0004 + Math.sin(time * 0.12) * 0.035;
    camera.position.set(CAM_BASE.x + ptrS.x * 2, CAM_BASE.y - ptrS.y * 1.3 + sc * 0.003, CAM_BASE.z);
    camera.lookAt(LOOK);

    const pos = seaGeo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 2] = Math.sin(seaBase[i] * 0.9 + time * 1.3) * 0.06 + Math.cos(seaBase[i + 1] * 0.7 + time) * 0.05;
    }
    seaGeo.attributes.position.needsUpdate = true;
    seaGeo.computeVertexNormals();

    // Pin: cae, rebota y pulsa
    const drop = backOut(span(t, 0, 0.9));
    pinTop.position.y = (1 - drop) * 3 + Math.sin(time * 2.2) * 0.06;
    pin.scale.setScalar(0.001 + drop * 0.999);
    stem.material.opacity = 0.55 * drop;
    glow.material.opacity = drop;
    rings.forEach((r, i) => { const k = (time * 0.6 + i * 0.5) % 1; r.scale.setScalar(1 + k * 3); r.material.opacity = (1 - k) * 0.6 * drop; });
    const delivered = t > 9.8 && t < 11.6;
    pinMat.color.setHex(delivered ? 0x20c997 : 0xff5a1f);
    pinMat.emissive.copy(pinMat.color);
    pinLight.color.copy(pinMat.color);

    const fadeOut = 1 - span(t, 11.6, 12.3);
    let winS = 0;
    couriers.forEach(c => {
      const appear = backOut(span(t, 0.9 + c.idx * 0.18, 1.5 + c.idx * 0.18));
      let s = 0.3 * ease(span(t, 1.1, 4.4));
      let vis = appear * fadeOut;
      if (c.idx === WIN) { s = 0.3 + 0.7 * ease(span(t, 5.2, 9.6)); winS = s; }
      else vis *= 1 - span(t, 5.0, 5.6);

      const a = along(c, Math.min(s, 0.995));
      c.g.position.copy(a.p);
      c.g.position.y = 0.16 + Math.abs(Math.sin(time * 9 + c.idx)) * 0.02;
      if (a.dir.lengthSq() > 0) c.g.rotation.y = Math.atan2(-a.dir.z, a.dir.x);
      c.g.scale.setScalar(Math.max(0.001, vis));

      c.rMat.opacity = c.idx === WIN
        ? 0.8 * span(t, 4.7, 5.2) * (1 - span(t, 9.6, 10.4))
        : 0.14 * span(t, 1.4, 2) * (1 - span(t, 4.6, 5.1));

      const bt = 1.7 + c.idx * 0.65;
      let show = span(t, bt, bt + 0.25);
      if (c.idx === WIN) {
        const active = t > 4.6 && t < 9.6;
        c.el.classList.toggle("win", active);
        c.meta.textContent = !active ? OFFERS[WIN].m : t < 5.2 ? "Oferta aceptada" : s > 0.85 ? "Repartidor cerca" : "En camino";
        show *= 1 - span(t, 9.4, 9.7);
      } else show *= 1 - span(t, 4.8, 5.1);
      place(c.g, 0.7, c.el, show * fadeOut);
    });
    place(pinTop, 0.75, doneEl, span(t, 9.8, 10.1) * (1 - span(t, 11.6, 12)));

    setHud(t < 1.7 ? 0 : t < 4.6 ? 1 : t < 5.2 ? 2 : t < 9.6 ? (winS > 0.85 ? 4 : 3) : 5);
    renderer.render(scene, camera);
  }

  // Sin animación: se muestra un cuadro fijo con las ofertas a la vista.
  if (reduced) {
    frame(4.2);
    new ResizeObserver(() => frame(4.2)).observe(stage);
    return;
  }

  let running = false, raf = 0;
  const t0 = performance.now();
  const loop = now => { frame((now - t0) / 1000); raf = requestAnimationFrame(loop); };
  const start = () => { if (running) return; running = true; raf = requestAnimationFrame(loop); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  new IntersectionObserver(es => es.forEach(e => (e.isIntersecting ? start() : stop()))).observe(stage);
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  frame(4.2);
  start();
}
