// =============================================================================
// Member V6 — scene Three.js kartu member (dimuat lazy, tidak pernah di bundel awal halaman login).
//
// Kartu = geometri nyata (RoundedBoxGeometry: tebal, bevel, sudut membulat) + material PBR
// (MeshPhysicalMaterial: logam hitam brushed, clearcoat kristal) + muka bertekstur kanvas (logo resmi,
// nama tier). Tidak ada chip/magstripe/NFC: kartu ini identitas membership, bukan kartu bayar
// (CLAUDE.md aturan 15). Lingkungan: pantulan RoomEnvironment (PMREM), lampu rim per tier, laser
// merah aditif, partikel instanced ringan, lantai reflektif (hanya kualitas tinggi).
//
// Kamera: dolly masuk (intro), orbit & tilt terbatas mengikuti pointer dengan damping, kembali
// netral saat pointer keluar. Loop berhenti saat tab/elemen tidak terlihat; reduced-motion = satu
// frame statis. Semua GPU resource dilepas di dispose().
// =============================================================================
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type CardTier = "silver" | "gold" | "platinum" | "ultra";

export type MemberCardSceneOptions = {
  mode: "showcase" | "success";
  /** Tier kartu utama (mode success = tier hasil backend). */
  tier?: CardTier;
  reducedMotion: boolean;
  quality: "high" | "low";
  logoUrl?: string;
  emblemUrl?: string;
};

export type MemberCardSceneController = {
  resize: (width: number, height: number) => void;
  /** Pointer ternormalisasi -1..1; null = pointer keluar (kembali netral). */
  setPointer: (x: number | null, y?: number) => void;
  setActive: (active: boolean) => void;
  dispose: () => void;
};

const CARD_W = 3.4;
const CARD_H = 2.14;
const CARD_D = 0.07;

type TierStyle = { label: string; base: [string, string]; accent: string; text: string; rim: number; glow: string };

const TIER_STYLE: Record<CardTier, TierStyle> = {
  silver: { label: "SILVER", base: ["#1b1d22", "#0b0c0e"], accent: "#d9dbe0", text: "#e9eaee", rim: 0xdfe4ff, glow: "rgba(220,228,255,0.9)" },
  gold: { label: "GOLD", base: ["#1c1610", "#0a0806"], accent: "#e2b45e", text: "#f1c977", rim: 0xffb44a, glow: "rgba(255,186,84,0.95)" },
  platinum: { label: "PLATINUM", base: ["#16171b", "#08090b"], accent: "#c8c9cd", text: "#eceef2", rim: 0xff2638, glow: "rgba(255,38,56,0.95)" },
  ultra: { label: "ULTRA", base: ["#1a0b0d", "#070506"], accent: "#ff5362", text: "#ffffff", rim: 0xff2638, glow: "rgba(255,38,56,0.95)" },
};

function fontFamily(variable: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Muka kartu: logam brushed + garis diagonal tier + logo resmi + nama tier. Sudut transparan mengikuti radius badan. */
function drawCardFace(canvas: HTMLCanvasElement, tier: CardTier, logo: HTMLImageElement | null, emblem: HTMLImageElement | null) {
  const style = TIER_STYLE[tier];
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const r = (0.14 / CARD_W) * w;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  roundedRect(ctx, 0, 0, w, h, r);
  ctx.clip();
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, style.base[0]);
  base.addColorStop(1, style.base[1]);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Serat logam brushed (deterministik, tanpa Math.random agar tiap render sama).
  for (let i = 0; i < 260; i += 1) {
    const y = (i * 37.17) % h;
    ctx.fillStyle = `rgba(255,255,255,${0.012 + ((i * 13) % 7) * 0.003})`;
    ctx.fillRect(0, y, w, 1);
  }
  // Pita diagonal tier (kanan) + emblem segitiga resmi.
  ctx.save();
  ctx.translate(w * 0.6, h * 0.5);
  ctx.rotate(-0.42);
  const band = ctx.createLinearGradient(-w * 0.12, 0, w * 0.12, 0);
  band.addColorStop(0, "rgba(255,255,255,0)");
  band.addColorStop(0.45, style.accent);
  band.addColorStop(0.55, "#ffffff");
  band.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = band;
  ctx.fillRect(-w * 0.07, -h, w * 0.14, h * 2);
  ctx.restore();
  if (emblem) {
    const eh = h * 0.5;
    const ew = (emblem.width / emblem.height) * eh;
    ctx.globalAlpha = 0.22;
    ctx.drawImage(emblem, w * 0.16 - ew / 2, h * 0.62 - eh / 2, ew, eh);
    ctx.globalAlpha = 1;
  }
  // Kilau atas (crystal coating).
  const gloss = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  gloss.addColorStop(0, "rgba(255,255,255,0.14)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h * 0.55);
  // Logo resmi (object-contain, tidak dipotong).
  if (logo) {
    const lw = w * 0.42;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (w - lw) / 2, h * 0.12, lw, lh);
  }
  // Nama tier + MEMBER.
  const display = fontFamily("--font-montserrat", "Montserrat, Arial, sans-serif");
  ctx.fillStyle = style.text;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.font = `800 ${Math.round(h * (style.label.length > 6 ? 0.135 : 0.16))}px ${display}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  const label = style.label.split("").join(String.fromCharCode(8202));
  ctx.fillText(label, w * 0.92, h * 0.74);
  ctx.shadowBlur = 0;
  ctx.font = `600 ${Math.round(h * 0.055)}px ${display}`;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText("M E M B E R", w * 0.92, h * 0.86);
  ctx.textAlign = "left";
  // Tepi bercahaya tipis.
  ctx.restore();
  roundedRect(ctx, 2, 2, w - 4, h - 4, r);
  ctx.strokeStyle = style.accent;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const GLOW_MARGIN = 0.32;
const GLOW_W = CARD_W + GLOW_MARGIN * 2;
const GLOW_H = CARD_H + GLOW_MARGIN * 2;

function drawGlow(canvas: HTMLCanvasElement, color: string) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const pad = (GLOW_MARGIN / GLOW_W) * w;
  ctx.shadowColor = color;
  ctx.shadowBlur = w * 0.05;
  ctx.strokeStyle = color;
  ctx.lineWidth = w * 0.006;
  for (let i = 0; i < 3; i += 1) {
    roundedRect(ctx, pad, pad, w - pad * 2, h - pad * 2, (0.16 / CARD_W) * (w - pad * 2));
    ctx.stroke();
  }
}

function laserTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 512, 0);
  g.addColorStop(0, "rgba(255,38,56,0)");
  g.addColorStop(0.35, "rgba(255,38,56,0.85)");
  g.addColorStop(0.5, "rgba(255,190,196,1)");
  g.addColorStop(0.65, "rgba(255,38,56,0.85)");
  g.addColorStop(1, "rgba(255,38,56,0)");
  ctx.fillStyle = g;
  const v = ctx.createLinearGradient(0, 0, 0, 32);
  ctx.fillRect(0, 0, 512, 32);
  v.addColorStop(0, "rgba(0,0,0,1)");
  v.addColorStop(0.5, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,1)");
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 512, 32);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

type CardRig = { group: Group; tier: CardTier; base: { x: number; y: number; z: number; ry: number; rz: number }; phase: number };

export async function createMemberCardScene(canvas: HTMLCanvasElement, options: MemberCardSceneOptions): Promise<MemberCardSceneController> {
  const high = options.quality === "high";
  const renderer = new WebGLRenderer({ canvas, antialias: high, alpha: true, powerPreference: high ? "high-performance" : "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.fog = new Fog(0x08090b, 9, 22);
  const pmrem = new PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTexture;

  const camera = new PerspectiveCamera(32, 1, 0.1, 60);
  const disposables: Array<{ dispose: () => void }> = [pmrem, envTexture];
  const textures: Texture[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const [logo, emblem] = await Promise.all([
    loadImage(options.logoUrl ?? "/garage-brand/garage-coffee-logo.png"),
    loadImage(options.emblemUrl ?? "/garage-brand/garage-coffee-icon.png"),
  ]);
  try {
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  } catch {
    /* font fallback */
  }

  const bodyGeometry = track(new RoundedBoxGeometry(CARD_W, CARD_H, CARD_D, 5, 0.14));
  const faceGeometry = track(new PlaneGeometry(CARD_W, CARD_H));
  const glowGeometry = track(new PlaneGeometry(GLOW_W, GLOW_H));

  function buildCard(tier: CardTier): Group {
    const style = TIER_STYLE[tier];
    const group = new Group();
    const body = new Mesh(
      bodyGeometry,
      track(
        new MeshPhysicalMaterial({
          color: new Color(tier === "gold" ? "#2a2116" : "#111216"),
          metalness: 0.92,
          roughness: 0.32,
          clearcoat: 1,
          clearcoatRoughness: 0.12,
          envMapIntensity: 1.1,
          sheen: 0.2,
          sheenColor: new Color(style.accent),
        }),
      ),
    );
    group.add(body);
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = high ? 1024 : 640;
    faceCanvas.height = Math.round(faceCanvas.width * (CARD_H / CARD_W));
    drawCardFace(faceCanvas, tier, logo, emblem);
    const faceTexture = new CanvasTexture(faceCanvas);
    faceTexture.colorSpace = SRGBColorSpace;
    faceTexture.anisotropy = high ? 8 : 2;
    textures.push(faceTexture);
    const face = new Mesh(
      faceGeometry,
      track(
        new MeshPhysicalMaterial({
          map: faceTexture,
          transparent: true,
          metalness: 0.55,
          roughness: 0.28,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          envMapIntensity: 0.85,
        }),
      ),
    );
    face.position.z = CARD_D / 2 + 0.002;
    group.add(face);
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 512;
    glowCanvas.height = Math.round(512 * (GLOW_H / GLOW_W));
    drawGlow(glowCanvas, style.glow);
    const glowTexture = new CanvasTexture(glowCanvas);
    textures.push(glowTexture);
    const glow = new Mesh(
      glowGeometry,
      track(new MeshBasicMaterial({ map: glowTexture, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0.85 })),
    );
    glow.position.z = -CARD_D / 2 - 0.02;
    group.add(glow);
    return group;
  }

  const root = new Group();
  scene.add(root);
  const rigs: CardRig[] = [];
  if (options.mode === "showcase") {
    const layout: Array<{ tier: CardTier; x: number; y: number; z: number; ry: number; rz: number }> = [
      { tier: "platinum", x: 2.35, y: 1.25, z: -1.9, ry: -0.32, rz: 0.04 },
      { tier: "gold", x: 0.2, y: 0.72, z: -0.9, ry: -0.1, rz: 0.05 },
      { tier: "silver", x: -1.9, y: 0.12, z: 0.25, ry: 0.3, rz: -0.06 },
    ];
    layout.forEach((item, index) => {
      const group = buildCard(item.tier);
      group.position.set(item.x, item.y, item.z);
      group.rotation.set(-0.08, item.ry, item.rz);
      root.add(group);
      rigs.push({ group, tier: item.tier, base: item, phase: index * 1.7 });
    });
  } else {
    const tier = options.tier ?? "silver";
    const group = buildCard(tier);
    group.position.set(0, 0.35, 0);
    group.rotation.set(-0.05, -0.35, 0.03);
    root.add(group);
    rigs.push({ group, tier, base: { x: 0, y: 0.35, z: 0, ry: -0.35, rz: 0.03 }, phase: 0 });
  }

  // Pedestal batu gelap + garis laser di tepinya.
  const slab = new Mesh(
    track(new BoxGeometry(options.mode === "showcase" ? 7.6 : 4.2, 0.32, 2.6)),
    track(new MeshStandardMaterial({ color: 0x101012, roughness: 0.82, metalness: 0.15 })),
  );
  slab.position.set(0.1, -1.15, -0.5);
  scene.add(slab);
  const laserTex = laserTexture();
  textures.push(laserTex);
  const laserMat = track(new MeshBasicMaterial({ map: laserTex, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  const slabLaser = new Mesh(track(new PlaneGeometry(options.mode === "showcase" ? 7.4 : 4, 0.06)), laserMat);
  slabLaser.position.set(0.1, -1.0, 0.82);
  scene.add(slabLaser);
  const lasers: Mesh[] = [];
  for (let i = 0; i < 2; i += 1) {
    const beam = new Mesh(track(new PlaneGeometry(16, 0.05)), laserMat);
    beam.position.set(0, 2.6 - i * 0.9, -4.5 - i);
    beam.rotation.z = 0.32 - i * 0.12;
    scene.add(beam);
    lasers.push(beam);
  }

  // Lantai logam gelap mengkilap (pantulan lingkungan lemah) + vinyet supaya tepi menyatu dengan latar.
  const floor = new Mesh(
    track(new PlaneGeometry(30, 30)),
    track(new MeshPhysicalMaterial({ color: 0x060607, metalness: 0.9, roughness: high ? 0.2 : 0.35, envMapIntensity: 0.12, clearcoat: high ? 1 : 0, clearcoatRoughness: 0.2 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.31;
  scene.add(floor);
  const dimCanvas = document.createElement("canvas");
  dimCanvas.width = dimCanvas.height = 256;
  const dctx = dimCanvas.getContext("2d")!;
  const radial = dctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  radial.addColorStop(0, "rgba(8,9,11,0)");
  radial.addColorStop(0.45, "rgba(8,9,11,0.55)");
  radial.addColorStop(1, "rgba(8,9,11,1)");
  dctx.fillStyle = radial;
  dctx.fillRect(0, 0, 256, 256);
  const dimTexture = new CanvasTexture(dimCanvas);
  textures.push(dimTexture);
  const dim = new Mesh(track(new PlaneGeometry(14, 10)), track(new MeshBasicMaterial({ map: dimTexture, transparent: true, depthWrite: false })));
  dim.rotation.x = -Math.PI / 2;
  dim.position.set(0, -1.3, -0.5);
  scene.add(dim);

  // Lampu: key putih, rim merah, hangat untuk gold, sapuan cahaya bergerak.
  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(3, 5, 6);
  scene.add(key);
  const redRim = new PointLight(0xff2638, 22, 12, 2);
  redRim.position.set(-4, 2.4, -3);
  scene.add(redRim);
  const warm = new PointLight(0xffb44a, options.mode === "showcase" || options.tier === "gold" ? 14 : 4, 8, 2);
  warm.position.set(0.5, 2.2, 1.4);
  scene.add(warm);
  const sweep = new PointLight(0xffffff, 18, 6, 2);
  sweep.position.set(-5, 1.2, 2.2);
  scene.add(sweep);

  // Partikel debu halus (instanced Points).
  const count = high ? 260 : 90;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const f = seed - Math.floor(seed);
    positions[i * 3] = (f - 0.5) * 16;
    positions[i * 3 + 1] = ((Math.sin(i * 7.31) + 1) / 2) * 6 - 1.2;
    positions[i * 3 + 2] = (Math.cos(i * 3.17) * 0.5 - 0.5) * 8;
  }
  const dustGeometry = track(new BufferGeometry());
  dustGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  const dust = new Points(
    dustGeometry,
    track(new PointsMaterial({ color: 0xff6b75, size: high ? 0.03 : 0.04, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false })),
  );
  scene.add(dust);

  // Kamera & state gerak.
  const success = options.mode === "success";
  const camBase = success ? { x: 0, y: 0.6, z: 6.4 } : { x: 0.1, y: 0.9, z: 10.2 };
  const camStart = success ? { x: 0.6, y: 0.9, z: 9 } : { x: -0.8, y: 1.6, z: 14.5 };
  const lookAt = success ? { x: 0, y: 0.3, z: 0 } : { x: 0.1, y: 0.25, z: -0.6 };
  let introT = options.reducedMotion ? 1 : 0;
  const introDuration = success ? 1.4 : 1.8;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let width = 1;
  let height = 1;
  let active = true;
  let raf = 0;
  let last = performance.now();
  let elapsed = 0;
  let disposed = false;

  const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

  function frame(dt: number) {
    elapsed += dt;
    if (introT < 1) introT = Math.min(1, introT + dt / introDuration);
    const k = easeOutCubic(introT);
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
    // Dolly + orbit terbatas (±0,6 unit) mengikuti pointer.
    camera.position.set(
      camStart.x + (camBase.x - camStart.x) * k + pointer.x * 0.6,
      camStart.y + (camBase.y - camStart.y) * k + pointer.y * 0.3,
      camStart.z + (camBase.z - camStart.z) * k,
    );
    camera.lookAt(lookAt.x, lookAt.y, lookAt.z);
    const motion = options.reducedMotion ? 0 : 1;
    rigs.forEach((rig, index) => {
      // Kartu masuk dari kedalaman berurutan + melayang pelan + tilt mengikuti pointer.
      const enter = easeOutCubic(Math.min(1, Math.max(0, introT * 1.6 - index * 0.18)));
      const float = Math.sin(elapsed * 0.9 + rig.phase) * 0.06 * motion;
      rig.group.position.set(rig.base.x, rig.base.y + float - (1 - enter) * 0.6, rig.base.z - (1 - enter) * 3);
      rig.group.rotation.y = rig.base.ry + pointer.x * 0.18 + (success ? Math.sin(elapsed * 0.5) * 0.12 * motion : 0);
      rig.group.rotation.x = -0.08 - pointer.y * 0.1;
      rig.group.rotation.z = rig.base.rz;
      rig.group.scale.setScalar(0.85 + enter * 0.15);
    });
    // Sapuan cahaya melintasi kartu (siklus 6 dtk) + laser bergerak.
    const sweepT = ((elapsed * motion) % 6) / 6;
    sweep.position.x = -6 + sweepT * 12;
    lasers.forEach((beam, index) => {
      beam.position.x = Math.sin(elapsed * 0.25 + index) * 1.5 * motion;
      (beam.material as MeshBasicMaterial).opacity = 0.55 + Math.sin(elapsed * 1.3 + index) * 0.15 * motion;
    });
    dust.rotation.y = elapsed * 0.02 * motion;
    dust.position.y = Math.sin(elapsed * 0.2) * 0.1 * motion;
    renderer.render(scene, camera);
  }

  function loop(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    if (active && !options.reducedMotion) raf = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(raf);
    last = performance.now();
    if (options.reducedMotion) {
      frame(0);
      return;
    }
    raf = requestAnimationFrame(loop);
  }

  const onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (active) start();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const controller: MemberCardSceneController = {
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Layar sempit: mundurkan kamera agar ketiga kartu tetap masuk bingkai.
      camera.fov = width / height < 1.1 ? 42 : 32;
      camera.updateProjectionMatrix();
      if (options.reducedMotion || !active) frame(0);
    },
    setPointer(x, y = 0) {
      if (options.reducedMotion) return;
      pointer.tx = x === null ? 0 : Math.max(-1, Math.min(1, x));
      pointer.ty = x === null ? 0 : Math.max(-1, Math.min(1, y));
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      if (active && !document.hidden) start();
      else cancelAnimationFrame(raf);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      textures.forEach((texture) => texture.dispose());
      disposables.forEach((item) => item.dispose());
      scene.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m: Material) => m.dispose());
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  start();
  return controller;
}
