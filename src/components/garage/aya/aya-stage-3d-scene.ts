// =============================================================================
// AYA 3D — scene Three.js (dimuat lazy oleh aya-stage-3d.tsx, tidak pernah di bundel awal).
//
// Karakter = layer resmi AYA V5 (docs/design-references/aya-v5/svg, disalin ke
// public/garage-brand/aya/v5/layers/): badan dan helm sebagai bidang bertekstur yang disusun
// berlapis di ruang 3D (badan → helm → wajah), sehingga kepala bisa menoleh/menunduk dengan
// paralaks nyata, melayang, bernapas, melompat. Wajah (mata & mulut) digambar ulang di kanvas
// dari koordinat layer wajah resmi supaya bisa berkedip dan bergerak saat bicara.
// Bukan model GLB: paket V5 hanya berisi SVG; identitas visual tidak diubah.
//
// Performa: pixel ratio ≤ 1,5, satu draw call per layer, loop hanya saat aktif & terlihat,
// 15 fps saat tidur, satu frame statis saat reduced-motion, context dilepas saat dispose.
// =============================================================================
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type Texture,
} from "three";

import { isBlinking, presenceFace, talkEnvelope, type AyaFace, type AyaPresence } from "./aya-presence";

export type AyaSceneController = {
  setPresence: (presence: AyaPresence) => void;
  /** Arah lirik -1..1 (pointer/target). */
  setLook: (x: number, y: number) => void;
  /** Arah tunjuk untuk pointing/guide: -1 kiri, 1 kanan. */
  setPointDir: (dir: -1 | 1) => void;
  resize: (width: number, height: number) => void;
  setActive: (active: boolean) => void;
  dispose: () => void;
};

const LAYER_BASE = "/garage-brand/aya/v5/layers";
const SVG = 480; // ruang koordinat layer V5
const PLANE = 2.4; // ukuran bidang di dunia 3D
const PX = PLANE / SVG;
// Leher (poros kepala) di koordinat SVG.
const NECK = { x: 256, y: 300 };

async function svgTexture(url: string, size = 768): Promise<Texture> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(image, 0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function canvasPlane(size: number, planeSize: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new Mesh(new PlaneGeometry(planeSize, planeSize), material);
  return { canvas, ctx: canvas.getContext("2d")!, texture, mesh };
}

function radialPlane(size: number, inner: string, outer: string, planeSize: number, additive = false) {
  const plane = canvasPlane(size, planeSize);
  const g = plane.ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  plane.ctx.fillStyle = g;
  plane.ctx.fillRect(0, 0, size, size);
  plane.texture.needsUpdate = true;
  if (additive) (plane.mesh.material as MeshBasicMaterial).blending = AdditiveBlending;
  return plane;
}

const FACE_LIGHT = "#FFECEA";
const FACE_GLOW = "rgba(255, 96, 86, 0.95)";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  ctx.fill();
}

/** Wajah dari koordinat layer resmi aya-face-*.svg (ruang 480). */
function drawFace(ctx: CanvasRenderingContext2D, face: AyaFace, tMs: number, look: { x: number; y: number }, animate: boolean) {
  const scale = ctx.canvas.width / SVG;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, look.x * 7 * scale, look.y * 4 * scale);
  ctx.fillStyle = FACE_LIGHT;
  ctx.strokeStyle = FACE_LIGHT;
  ctx.shadowColor = FACE_GLOW;
  ctx.shadowBlur = 12 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const blink = animate && isBlinking(tMs);

  const stroke = (width: number, draw: () => void) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    draw();
    ctx.stroke();
  };

  switch (face) {
    case "happy":
      stroke(8, () => {
        ctx.moveTo(196, 193);
        ctx.quadraticCurveTo(211, 172, 228, 193);
        ctx.moveTo(284, 192);
        ctx.quadraticCurveTo(299, 172, 316, 193);
      });
      ctx.beginPath();
      ctx.moveTo(246, 228);
      ctx.quadraticCurveTo(264, 259, 282, 227);
      ctx.closePath();
      ctx.fill();
      break;
    case "listening": {
      const xs = [212, 226, 240, 255, 270, 284, 298];
      const hs = [11, 35, 22, 58, 22, 44, 13];
      xs.forEach((x, i) => {
        const k = animate ? 0.55 + 0.45 * Math.abs(Math.sin(tMs / 160 + i * 0.9)) : 1;
        const h = hs[i] * k;
        stroke(5.5, () => {
          ctx.moveTo(x, 193 - h / 2);
          ctx.lineTo(x, 193 + h / 2);
        });
      });
      break;
    }
    case "speaking": {
      stroke(8, () => {
        ctx.moveTo(195, 194);
        ctx.quadraticCurveTo(208, 174, 221, 194);
      });
      const xs = [244, 256, 269, 282, 294];
      const hs = [9, 34, 49, 31, 9];
      xs.forEach((x, i) => {
        const env = animate ? talkEnvelope(tMs + i * 70) : 1;
        const h = Math.max(6, hs[i] * (0.3 + 0.7 * env));
        stroke(5.8, () => {
          ctx.moveTo(x, 200.5 - h / 2);
          ctx.lineTo(x, 200.5 + h / 2);
        });
      });
      break;
    }
    case "thinking":
      [220, 257, 294].forEach((cx, i) => {
        const phase = animate ? (tMs / 420 - i * 0.33) % 1 : 0.5;
        const lift = animate ? Math.max(0, Math.sin(phase * Math.PI * 2)) * 7 : 0;
        ctx.globalAlpha = animate ? 0.45 + 0.55 * (lift / 7) : 1;
        ctx.beginPath();
        ctx.arc(cx, 204 - lift, 7.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      break;
    case "sleep":
      stroke(6, () => {
        ctx.moveTo(200, 192);
        ctx.quadraticCurveTo(212, 199, 224, 192);
        ctx.moveTo(295, 191);
        ctx.quadraticCurveTo(307, 198, 319, 191);
      });
      stroke(5, () => {
        ctx.moveTo(256, 232);
        ctx.lineTo(272, 232);
      });
      break;
    case "error":
      stroke(6.5, () => {
        for (const [cx, cy] of [[211, 190], [306, 189]]) {
          ctx.moveTo(cx - 11, cy - 11);
          ctx.lineTo(cx + 11, cy + 11);
          ctx.moveTo(cx + 11, cy - 11);
          ctx.lineTo(cx - 11, cy + 11);
        }
      });
      stroke(5.5, () => {
        ctx.moveTo(244, 234);
        ctx.quadraticCurveTo(252, 226, 260, 234);
        ctx.quadraticCurveTo(268, 242, 276, 234);
      });
      break;
    default:
      if (blink) {
        roundRect(ctx, 202, 188, 19, 6, 3);
        roundRect(ctx, 297, 187, 19, 6, 3);
      } else {
        roundRect(ctx, 204, 169, 15, 43, 8);
        roundRect(ctx, 299, 168, 15, 43, 8);
      }
      stroke(7, () => {
        ctx.moveTo(251, 227);
        ctx.quadraticCurveTo(263, 242, 278, 226);
      });
  }
}

const SPARK = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.24, y - r * 0.24);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.24, y + r * 0.24);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.24, y + r * 0.24);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.24, y - r * 0.24);
  ctx.closePath();
  ctx.fill();
};

/** Efek di sekitar AYA: zzz (tidur), kilau (sapa/senang), "?" (error), panah (tunjuk/pandu). */
function drawFx(ctx: CanvasRenderingContext2D, presence: AyaPresence, tMs: number, pointDir: -1 | 1, animate: boolean) {
  const scale = ctx.canvas.width / SVG;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const t = animate ? tMs / 1000 : 0.6;
  if (presence === "sleep") {
    ctx.fillStyle = "#D8D2CC";
    ctx.font = "800 30px system-ui, sans-serif";
    for (let i = 0; i < 3; i += 1) {
      const p = (t / 2.4 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      ctx.font = `800 ${18 + i * 7}px system-ui, sans-serif`;
      ctx.fillText("z", 368 + p * 40 + i * 6, 120 - p * 70);
    }
    ctx.globalAlpha = 1;
  } else if (presence === "greeting" || presence === "happy") {
    ctx.fillStyle = "#E9BD65";
    const spots: Array<[number, number, number]> = [[120, 110, 16], [372, 92, 13], [400, 210, 10], [92, 236, 11]];
    spots.forEach(([x, y, r], i) => {
      const k = animate ? 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i * 1.7)) : 1;
      ctx.globalAlpha = k;
      SPARK(ctx, x, y, r * k);
    });
    ctx.globalAlpha = 1;
  } else if (presence === "error") {
    ctx.fillStyle = "#F0443E";
    ctx.font = "900 54px system-ui, sans-serif";
    ctx.globalAlpha = animate ? 0.6 + 0.4 * Math.abs(Math.sin(t * 4)) : 1;
    ctx.fillText("?", 372, 112);
    ctx.globalAlpha = 1;
  } else if (presence === "pointing" || presence === "guide") {
    const bob = animate ? Math.sin(t * 6) * 8 : 0;
    const x = pointDir < 0 ? 58 - bob : 422 + bob;
    ctx.fillStyle = "#D43A3A";
    ctx.shadowColor = "rgba(240, 68, 62, 0.85)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(x + pointDir * 26, 300);
    ctx.lineTo(x - pointDir * 10, 276);
    ctx.lineTo(x - pointDir * 10, 324);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * Math.min(1, dt * rate);

export async function createAyaScene(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; onContextLost?: () => void }): Promise<AyaSceneController> {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 20);
  camera.position.set(0, 0.05, 5.6);

  const [bodyTex, headTex] = await Promise.all([svgTexture(`${LAYER_BASE}/aya-body.svg`), svgTexture(`${LAYER_BASE}/aya-head-shell.svg`)]);
  const layerMaterial = (map: Texture) => new MeshBasicMaterial({ map, transparent: true, depthWrite: false });

  const root = new Group();
  scene.add(root);

  // Glow merah lembut di belakang + bayangan lantai.
  const glow = radialPlane(256, "rgba(212, 58, 58, 0.55)", "rgba(212, 58, 58, 0)", 3.6, true);
  glow.mesh.position.set(0, 0.25, -0.6);
  scene.add(glow.mesh);
  const shadow = radialPlane(128, "rgba(0, 0, 0, 0.55)", "rgba(0, 0, 0, 0)", 1.6);
  shadow.mesh.scale.set(1, 0.22, 1);
  shadow.mesh.position.set(0.05, -1.18, -0.2);
  scene.add(shadow.mesh);

  const body = new Mesh(new PlaneGeometry(PLANE, PLANE), layerMaterial(bodyTex));
  root.add(body);

  const head = new Group();
  head.position.set((NECK.x - SVG / 2) * PX, (SVG / 2 - NECK.y) * PX, 0.06);
  root.add(head);
  const offset = { x: -head.position.x, y: -head.position.y };
  const shell = new Mesh(new PlaneGeometry(PLANE, PLANE), layerMaterial(headTex));
  shell.position.set(offset.x, offset.y, 0);
  head.add(shell);
  const face = canvasPlane(512, PLANE);
  face.mesh.position.set(offset.x, offset.y, 0.05);
  head.add(face.mesh);

  const fx = canvasPlane(384, PLANE);
  fx.mesh.position.set(0, 0, 0.3);
  root.add(fx.mesh);

  let presence: AyaPresence = "idle";
  let presenceAt = performance.now();
  const look = { x: 0, y: 0 };
  const lookDrawn = { x: 0, y: 0 };
  let pointDir: -1 | 1 = 1;
  let active = true;
  let raf = 0;
  let last = performance.now();
  let lastFrame = 0;
  let disposed = false;
  const rot = { headX: 0, headY: 0, headZ: 0, rootY: 0, rootZ: 0, lift: 0 };

  function frame(now: number) {
    const animate = !opts.reducedMotion;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const since = (now - presenceAt) / 1000;

    // Target pose per state.
    let headX = -look.y * 0.18;
    let headY = look.x * 0.32;
    let headZ = 0;
    let rootY = animate ? Math.sin(t * 0.7) * 0.1 : 0;
    let rootZ = 0;
    let lift = animate ? Math.sin(t * 1.6) * 0.045 : 0;
    let breathe = animate ? Math.sin(t * 2) * 0.008 : 0;
    switch (presence) {
      case "greeting":
        lift += animate ? Math.abs(Math.sin(since * 6)) * 0.14 * Math.max(0, 1 - since / 2.2) : 0;
        headZ = 0.14;
        break;
      case "happy":
        lift += animate ? Math.abs(Math.sin(since * 7)) * 0.08 * Math.max(0, 1 - since / 1.6) : 0;
        headZ = -0.08;
        break;
      case "talking":
        headX += animate ? Math.sin(t * 7) * 0.035 : 0;
        headZ = animate ? Math.sin(t * 2.3) * 0.04 : 0;
        break;
      case "listening":
        headZ = -0.12;
        headX += 0.06;
        break;
      case "thinking":
        headZ = 0.12;
        headX -= 0.12;
        headY += 0.12;
        break;
      case "pointing":
      case "guide":
        rootY = pointDir * 0.35;
        rootZ = -pointDir * 0.06;
        headY = pointDir * 0.3;
        break;
      case "sleep":
        headX = 0.22;
        headZ = 0.1;
        lift = animate ? Math.sin(t * 0.8) * 0.02 : 0;
        breathe = animate ? Math.sin(t * 0.9) * 0.014 : 0;
        break;
      case "error":
        headY = animate && since < 0.7 ? Math.sin(since * 30) * 0.16 : 0;
        headZ = 0.1;
        break;
      default:
        break;
    }

    const rate = animate ? 7 : 1000;
    rot.headX = damp(rot.headX, headX, rate, dt || 1);
    rot.headY = damp(rot.headY, headY, rate, dt || 1);
    rot.headZ = damp(rot.headZ, headZ, rate, dt || 1);
    rot.rootY = damp(rot.rootY, rootY, rate * 0.6, dt || 1);
    rot.rootZ = damp(rot.rootZ, rootZ, rate * 0.6, dt || 1);
    rot.lift = damp(rot.lift, lift, rate * 1.4, dt || 1);
    lookDrawn.x = damp(lookDrawn.x, look.x, rate, dt || 1);
    lookDrawn.y = damp(lookDrawn.y, look.y, rate, dt || 1);

    head.rotation.set(rot.headX, rot.headY, rot.headZ);
    root.rotation.set(0, rot.rootY, rot.rootZ);
    root.position.y = rot.lift;
    body.scale.set(1 - breathe * 0.5, 1 + breathe, 1);
    shadow.mesh.scale.set(1 - rot.lift * 0.9, 0.22 * (1 - rot.lift * 0.9), 1);
    (shadow.mesh.material as MeshBasicMaterial).opacity = 1 - rot.lift * 1.8;
    (glow.mesh.material as MeshBasicMaterial).opacity = presence === "error" ? 0.35 : presence === "sleep" ? 0.35 : 0.75 + (animate ? Math.sin(t * 1.3) * 0.15 : 0);

    drawFace(face.ctx, presenceFace(presence), now, lookDrawn, animate);
    face.texture.needsUpdate = true;
    drawFx(fx.ctx, presence, now, pointDir, animate);
    fx.texture.needsUpdate = true;

    renderer.render(scene, camera);
  }

  function loop(now: number) {
    raf = 0;
    if (disposed || !active) return;
    // Tidur = 15 fps; selain itu mengikuti layar.
    if (presence !== "sleep" || now - lastFrame > 66) {
      lastFrame = now;
      frame(now);
    }
    if (!opts.reducedMotion) raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (disposed) return;
    if (opts.reducedMotion) {
      frame(performance.now());
      return;
    }
    if (active && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  const onLost = (event: Event) => {
    event.preventDefault();
    opts.onContextLost?.();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  kick();

  return {
    setPresence(next) {
      if (next === presence) return;
      presence = next;
      presenceAt = performance.now();
      kick();
    },
    setLook(x, y) {
      look.x = Math.max(-1, Math.min(1, x));
      look.y = Math.max(-1, Math.min(1, y));
      if (opts.reducedMotion) kick();
    },
    setPointDir(dir) {
      pointDir = dir;
      kick();
    },
    resize(width, height) {
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      kick();
      if (!active) frame(performance.now());
    },
    setActive(next) {
      active = next;
      if (!next && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (next) kick();
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const material = object.material as MeshBasicMaterial;
          material.map?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
