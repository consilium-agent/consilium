// Voxel stage: ~600 brushed chrome cubes that re-form per section (data-form on sections),
// lean toward the cursor and push away from it. Formation list mirrors the page story.
import * as THREE from "../vendor/three.module.js";
import { RoomEnvironment } from "../vendor/RoomEnvironment.js";

const canvas = document.getElementById("stage");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const N = 600;
const STONE = new THREE.Color("#e4e6eb");
const EMBER = new THREE.Color("#e2531c");
const GRAPHITE = new THREE.Color("#45474d");
const MORPH_MS = 1500;
const SIZE = 15; // every formation is scaled to this many units across

// ---------- formation builders: each returns [{p:[x,y,z], s, c}] ----------
const cube = (x, y, z, s = 1, c = 0) => ({ p: [x, y, z], s, c });
function box(out, x0, y0, z0, w, h, d, c = 0, s = 1) {
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) out.push(cube(x0 + x, y0 + y, z0 + z, s, c));
  return out;
}
function glyph(rows, depth = 2, c = 0) {
  const out = [];
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== " ") for (let z = 0; z < depth; z++) out.push(cube(i, rows.length - j, z, 1, ch === "o" ? 1 : c)); }));
  return out;
}
const rand = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

const SHAPES = {
  candles() {
    const out = [];
    const lows = [0, 1, 1, 2, 3, 3, 4, 5, 6];
    const bodies = [3, 2, 4, 3, 2, 4, 3, 4, 5];
    lows.forEach((lo, i) => {
      const last = i === lows.length - 1;
      box(out, i * 3, lo + 1, 0, 2, bodies[i], 2, last ? 1 : 0);
      out.push(cube(i * 3 + 0.5, lo, 0.5, 0.45), cube(i * 3 + 0.5, lo + bodies[i] + 1, 0.5, 0.45), cube(i * 3 + 0.5, lo + bodies[i] + 2, 0.5, 0.45));
    });
    return out;
  },
  scatter() {
    return Array.from({ length: 220 }, (_, i) => cube((rand(i) - 0.5) * 18, rand(i + 9) * 12, (rand(i + 3) - 0.5) * 12, 0.35 + rand(i + 5) * 0.8, i % 37 === 0 ? 1 : 0));
  },
  stairs() {
    const out = [];
    for (let i = 0; i < 8; i++) box(out, i * 2, 0, 0, 2, i + 1, 3, i === 7 ? 1 : 0);
    return out;
  },
  wave() {
    const out = [];
    for (let x = 0; x < 22; x++) {
      const h = Math.round(4 + Math.sin(x / 2.2) * 3);
      for (let z = 0; z < 3; z++) { out.push(cube(x, h, z, 0.92, h >= 7 || h <= 1 ? 1 : 0)); out.push(cube(x, h - 1, z, 0.6)); }
    }
    return out;
  },
  wall() {
    const out = [];
    const n = 11;
    for (let y = 0; y < 3; y++) for (let i = 0; i < n; i++) for (const [x, z] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) out.push(cube(x, y, z));
    for (let x = 1; x < n - 1; x++) for (let z = 1; z < n - 1; z++) out.push(cube(x, -0.6, z, 0.92));
    out.push(cube(5, 0.5, 5, 1.2, 1));
    return out;
  },
  book() {
    const out = [];
    for (let i = 0; i < 7; i++) {
      box(out, 6 - i, 0, 0, 1, 2 + i, 3);
      box(out, 9 + i, 0, 0, 1, 2 + Math.round(i * 1.3), 3);
    }
    box(out, 7.5, 0, 1, 1, 1, 1, 1, 0.9);
    return out;
  },
  council() {
    const out = [];
    for (const [x, z] of [[0, 0], [10, 0], [0, 10], [10, 10]]) box(out, x, 0, z, 2, 6, 2);
    box(out, 5, 0, 5, 2, 2, 2, 1);
    for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; out.push(cube(6 + Math.cos(t) * 7.5, -0.6, 6 + Math.sin(t) * 7.5, 0.7)); }
    return out;
  },
  screen() {
    const out = [];
    for (let x = 0; x < 16; x++) for (let y = 0; y < 9; y++) out.push(cube(x, y + 2, 0, 0.94));
    for (const [x, y] of [[7, 5], [7, 6], [7, 7], [8, 6]]) out.push(cube(x, y + 2, -1, 1, 1));
    box(out, 6, 0, 0, 4, 1, 2);
    return out;
  },
  prompt() {
    return glyph([
      "x      ",
      " x     ",
      "  x    ",
      "   x   ",
      "  x    ",
      " x     ",
      "x  oooo",
    ], 3);
  },
  arrow() {
    return glyph([
      "  xxx  ",
      "  xxx  ",
      "  xxx  ",
      "  xxx  ",
      "xxxxxxx",
      " xxxxx ",
      "  xxx  ",
      "   o   ",
    ], 3);
  },
  doors() {
    const out = [];
    for (let k = 0; k < 3; k++) { const x0 = k * 6; box(out, x0, 0, 0, 1, 6, 2); box(out, x0 + 3, 0, 0, 1, 6, 2); box(out, x0, 6, 0, 4, 1, 2, k === 1 ? 1 : 0); }
    return out;
  },
  mark() {
    const out = [];
    const cells = [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [1, 2], [2, 2]];
    for (const [cx, cy] of cells) box(out, cx * 4, (2 - cy) * 4, 0, 3, 3, 3);
    box(out, 4, 4, 0, 3, 3, 3, 1);
    return out;
  },
  steps() {
    const out = [];
    for (let i = 0; i < 4; i++) box(out, i * 4, i * 1.5, 0, 3, 1, 3, i === 0 ? 1 : 0);
    return out;
  },
};

// data-form index on each section → formation
const FORMS = ["candles", "scatter", "stairs", "wave", "wall", "book", "council", "screen", "council", "prompt", "arrow", "doors", "wall", "mark", "steps", "mark"];

// Center on x/z, sit on the floor, scale to SIZE, pad with hidden dust up to N.
function normalize(list) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const c of list) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c.p[k]); max[k] = Math.max(max[k], c.p[k]); }
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) + 1;
  const k = SIZE / span;
  const out = list.slice(0, N).map((c) => ({
    p: [(c.p[0] - (min[0] + max[0]) / 2) * k, (c.p[1] - min[1]) * k + k / 2, (c.p[2] - (min[2] + max[2]) / 2) * k],
    s: c.s * k * 0.92, c: c.c,
  }));
  for (let i = out.length; i < N; i++) {
    // a few loose cubes around the subject; the rest wait hidden
    const t = rand(i) * Math.PI * 2, r = 9 + rand(i + 1) * 4;
    out.push({ p: [Math.cos(t) * r, 1 + rand(i + 2) * 10, Math.sin(t) * r - 2], s: rand(i + 4) < 0.06 ? 0.28 : 0, c: 0 });
  }
  return out;
}
const cache = {};
const formation = (name) => (cache[name] ||= normalize(SHAPES[name]()));

// ---------- scene ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch {
  renderer = null;
}
if (renderer) init();

function init() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  // a hard spotlight from above, like a single studio lamp over the object
  const key = new THREE.DirectionalLight("#ffffff", 3.4);
  key.position.set(-4, 30, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight("#ff7a45", 1.4);
  rim.position.set(16, 8, -14);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight("#e6e8ee", "#0a0a0b", 0.45));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Fine stone grain so the cubes read as material, not plastic.
  const grain = document.createElement("canvas");
  grain.width = grain.height = 128;
  const g = grain.getContext("2d");
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 215 + Math.random() * 40; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(grain);
  tex.colorSpace = THREE.SRGBColorSpace;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.34, metalness: 0.7, envMapIntensity: 1.5 });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  // per-cube state: from → to with a stagger
  const cur = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), s: 0, c: STONE.clone() }));
  const from = cur.map(() => ({ p: new THREE.Vector3(), s: 0, c: new THREE.Color() }));
  const to = cur.map(() => ({ p: new THREE.Vector3(), s: 0, c: new THREE.Color() }));
  const push = new Float32Array(N);
  let morphStart = 0;
  let formName = null;

  function setForm(name, instant) {
    if (name === formName) return;
    formName = name;
    const f = formation(name);
    for (let i = 0; i < N; i++) {
      from[i].p.copy(cur[i].p); from[i].s = cur[i].s; from[i].c.copy(cur[i].c);
      to[i].p.set(...f[i].p); to[i].s = f[i].s;
      to[i].c.copy(f[i].c ? EMBER : name === "scatter" && i % 5 === 0 ? GRAPHITE : STONE);
    }
    morphStart = instant ? -1e9 : performance.now();
  }

  // layout: subject sits right of the copy on wide screens, centered behind it on phones
  let wide = true;
  function resize() {
    const w = innerWidth, h = innerHeight;
    wide = w > 900;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 13, wide ? 44 : 58);
    camera.lookAt(0, 7, 0);
    camera.setViewOffset(w, h, wide ? -w * 0.2 : 0, wide ? 0 : -h * 0.08, w, h);
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();

  // pointer
  const mouse = { x: 0, y: 0, sx: -9999, sy: -9999, active: false };
  if (matchMedia("(pointer: fine)").matches) {
    addEventListener("pointermove", (e) => {
      mouse.x = (e.clientX / innerWidth) * 2 - 1;
      mouse.y = (e.clientY / innerHeight) * 2 - 1;
      mouse.sx = e.clientX; mouse.sy = e.clientY; mouse.active = true;
    });
    document.addEventListener("pointerleave", () => { mouse.active = false; });
  }

  // which section is in charge
  const sections = [...document.querySelectorAll("[data-form]")];
  function pickForm() {
    const mid = innerHeight * 0.5;
    let best = sections[0], bestD = Infinity;
    for (const s of sections) {
      const r = s.getBoundingClientRect();
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = s; }
    }
    setForm(FORMS[Number(best.dataset.form) % FORMS.length]);
  }
  addEventListener("scroll", pickForm, { passive: true });
  setForm("scatter", true);
  for (let i = 0; i < N; i++) { cur[i].p.copy(to[i].p).multiplyScalar(2.2); cur[i].s = 0; }
  pickForm();

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), proj = new THREE.Vector3();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  let spin = 0, last = performance.now(), running = true;

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    spin += dt * (reduce ? 0 : 0.08);
    const ry = spin + (mouse.active ? mouse.x * 0.45 : 0);
    group.rotation.y += (ry - group.rotation.y) * 0.06;
    group.rotation.x += ((mouse.active ? mouse.y * 0.08 : 0) - group.rotation.x) * 0.06;

    const tAll = (now - morphStart) / MORPH_MS;
    for (let i = 0; i < N; i++) {
      const delay = (i / N) * 0.45;
      const t = reduce ? 1 : ease(Math.min(1, Math.max(0, (tAll - delay) / 0.55)));
      const c = cur[i];
      c.p.lerpVectors(from[i].p, to[i].p, t);
      c.s = from[i].s + (to[i].s - from[i].s) * t;
      c.c.copy(from[i].c).lerp(to[i].c, t);
      // a small arc so cubes fly rather than slide
      c.p.y += Math.sin(t * Math.PI) * 2.2 * (1 - (i % 7) / 10);

      // cursor repel in screen space
      let target = 0;
      if (mouse.active && c.s > 0.05) {
        pv.copy(c.p).applyMatrix4(group.matrixWorld);
        proj.copy(pv).project(camera);
        const sx = (proj.x * 0.5 + 0.5) * innerWidth, sy = (-proj.y * 0.5 + 0.5) * innerHeight;
        const d = Math.hypot(sx - mouse.sx, sy - mouse.sy);
        if (d < 110) target = (1 - d / 110);
      }
      push[i] += (target - push[i]) * 0.15;
      const pushK = push[i];
      sv.setScalar(c.s * (1 + pushK * 0.12));
      pv.copy(c.p);
      if (pushK > 0.001) { pv.x *= 1 + pushK * 0.08; pv.z *= 1 + pushK * 0.08; pv.y += pushK * 0.9; }
      q.setFromAxisAngle(sv.set(0, 1, 0), pushK * 0.5);
      sv.setScalar(c.s * (1 + pushK * 0.12));
      m4.compose(pv, q, sv);
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });
  requestAnimationFrame((t) => { last = t; frame(t); canvas.classList.add("on"); });
}
