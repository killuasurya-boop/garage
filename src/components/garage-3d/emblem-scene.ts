// =============================================================================
// Adegan Three.js "Emblem Garage 3D + laser" (website "/" dan hero /order).
//
// - Emblem = segitiga resmi (garage-coffee-emblem.png) ditumpuk 12–26 lapis sehingga punya ketebalan nyata dari
//   sudut mana pun (parallax saat miring), muka depan memantulkan lingkungan studio (chrome), lampu merah di belakang.
// - Laser = cincin torus bershader (inti terang + ekor), sinar melintang, percikan api (Points, GPU).
// - Tanpa postprocessing: cahaya "bloom" dari sprite gradien aditif — ringan untuk HP.
// - Dimuat malas (dynamic import) oleh GarageEmblemCanvas; berhenti saat tak terlihat / tab tersembunyi; menurunkan
//   kualitas sendiri bila bingkai lambat. Logo tidak diubah bentuknya — hanya diberi kedalaman.
// =============================================================================
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointLight,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { adaptAction, clamp01, damp, fitDistance, type SceneQuality } from "./scene-math";

export type SceneOptions = {
  emblemUrl: string;
  quality: SceneQuality;
  /** false = satu bingkai diam (reduced-motion). */
  animate: boolean;
  /** Jari-jari isi adegan yang harus muat di layar (satuan dunia). */
  viewRadius: number;
  /** Geser isi adegan sebagai pecahan setengah-layar: [x, y] (y positif = ke atas). */
  offset?: [number, number];
  /** Sinar laser melintang (cocok untuk latar lebar). */
  beams?: boolean;
  /** Skala emblem. */
  scale?: number;
};

export type GarageSceneHandle = {
  setVisible: (visible: boolean) => void;
  setPointer: (x: number, y: number) => void;
  setScroll: (progress: number) => void;
  /** Hidup/matikan animasi di adegan yang sama (mis. preferensi "kurangi gerak" berubah); tidak membuat konteks baru. */
  setAnimate: (on: boolean) => void;
  resize: () => void;
  dispose: () => void;
};

const FOV = 32;

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
// Segmen cahaya yang berjalan: kepala terang + ekor memudar + inti putih tipis.
const RING_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime; uniform float uSpeed; uniform float uPhase; uniform float uAlpha; uniform vec3 uColor;
  void main() {
    float t = fract(vUv.x - uTime * uSpeed + uPhase);
    float tail = (1.0 - smoothstep(0.0, 0.34, t)) * smoothstep(0.0, 0.012, t);
    float core = smoothstep(0.0, 0.004, t) * (1.0 - smoothstep(0.004, 0.02, t));
    float base = 0.22;
    vec3 col = uColor * (base + tail * 2.4) + vec3(1.0, 0.9, 0.85) * core * 2.0;
    float a = clamp(base + tail + core, 0.0, 1.0) * uAlpha;
    gl_FragColor = vec4(col, a);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float aSeed; attribute float aSize;
  uniform float uTime; uniform float uPixel;
  varying float vFlicker;
  void main() {
    vec3 p = position;
    float life = fract(uTime * (0.035 + aSeed * 0.05) + aSeed * 7.0);
    p.y += life * 3.2 - 1.0;
    p.x += sin(uTime * 0.6 + aSeed * 40.0) * 0.12;
    p.z += cos(uTime * 0.5 + aSeed * 23.0) * 0.1;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel * (1.0 - life * 0.6) / -mv.z;
    vFlicker = 0.55 + 0.45 * sin(uTime * (3.0 + aSeed * 5.0) + aSeed * 60.0);
    vFlicker *= smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.7, 1.0, life));
  }
`;
const SPARK_FRAG = /* glsl */ `
  varying float vFlicker;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vFlicker;
    gl_FragColor = vec4(vec3(1.0, 0.45, 0.3) * (0.7 + a * 0.6), a);
  }
`;

function glowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,70,60,0.85)");
    g.addColorStop(0.35, "rgba(200,25,35,0.38)");
    g.addColorStop(1, "rgba(120,10,20,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export async function createGarageScene(canvas: HTMLCanvasElement, opts: SceneOptions): Promise<GarageSceneHandle> {
  const high = opts.quality === "high";
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: high, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1.25);
  renderer.setPixelRatio(pixelRatio);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);

  // Lingkungan studio untuk pantulan chrome.
  const pmrem = new PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envTarget = pmrem.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.9;
  envScene.dispose();

  const key = new DirectionalLight(0xff5a4a, 2.4);
  key.position.set(3, 3, 4);
  const fill = new DirectionalLight(0x9fb4ff, 0.7);
  fill.position.set(-4, 1, 3);
  const rim = new PointLight(0xff2020, 22, 12, 2);
  rim.position.set(0, 0, -2.4);
  scene.add(key, fill, rim);

  const loader = new TextureLoader();
  const tex = await loader.loadAsync(opts.emblemUrl);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const content = new Group();
  scene.add(content);
  const emblem = new Group();
  content.add(emblem);

  const imgAspect = (tex.image as { width: number; height: number }).width / (tex.image as { width: number; height: number }).height;
  const W = 2.7 * (opts.scale ?? 1);
  const planeGeo = new PlaneGeometry(W, W / imgAspect);
  const disposables: { dispose: () => void }[] = [planeGeo, tex, envTarget, pmrem];

  // Badan: lapisan gelap bertingkat (makin dalam makin gelap) → ketebalan.
  const layers = high ? 26 : 12;
  const depth = 0.36;
  for (let i = 0; i < layers; i += 1) {
    const t = i / (layers - 1);
    const shade = 0.72 - 0.4 * t;
    const mat = new MeshStandardMaterial({
      map: tex,
      color: new Color(shade, shade * 0.62, shade * 0.62),
      emissive: new Color(0.42, 0.04, 0.05),
      emissiveMap: tex,
      emissiveIntensity: 0.55 * (1 - t * 0.6),
      alphaTest: 0.45,
      metalness: 0.6,
      roughness: 0.46,
    });
    disposables.push(mat);
    const mesh = new Mesh(planeGeo, mat);
    mesh.position.z = -depth * (0.04 + t);
    emblem.add(mesh);
  }
  // Muka depan: logam yang memantulkan lingkungan.
  const frontMat = new MeshStandardMaterial({ map: tex, emissive: new Color(0.6, 0.12, 0.12), emissiveMap: tex, emissiveIntensity: 0.55, alphaTest: 0.45, metalness: 0.32, roughness: 0.34, envMapIntensity: 1.5 });
  disposables.push(frontMat);
  const front = new Mesh(planeGeo, frontMat);
  front.position.z = 0.004;
  emblem.add(front);

  // Cahaya merah yang "bocor" di belakang emblem (pengganti bloom).
  const glowTex = glowTexture();
  const glowMat = new MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.9 });
  const glowGeo = new PlaneGeometry(W * 2.3, W * 2.3);
  disposables.push(glowTex, glowMat, glowGeo);
  const glow = new Mesh(glowGeo, glowMat);
  glow.position.z = -0.7;
  content.add(glow);

  // Cincin laser.
  const ringShaders: ShaderMaterial[] = [];
  const rings = new Group();
  content.add(rings);
  const ringDefs = [
    { r: 1.95, tilt: [1.15, 0.2], speed: 0.11, phase: 0.0, alpha: 0.95 },
    { r: 2.35, tilt: [-0.45, 0.9], speed: -0.08, phase: 0.33, alpha: 0.85 },
    { r: 2.8, tilt: [0.2, -1.1], speed: 0.06, phase: 0.66, alpha: 0.7 },
  ].slice(0, high ? 3 : 2);
  for (const def of ringDefs) {
    const geo = new TorusGeometry(def.r * (opts.scale ?? 1), 0.016 * (opts.scale ?? 1), 8, high ? 280 : 160);
    const mat = new ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: def.speed },
        uPhase: { value: def.phase },
        uAlpha: { value: def.alpha },
        uColor: { value: new Color(1.0, 0.16, 0.14) },
      },
    });
    ringShaders.push(mat);
    disposables.push(geo, mat);
    const ring = new Mesh(geo, mat);
    ring.rotation.set(def.tilt[0], def.tilt[1], 0);
    rings.add(ring);
  }

  // Sinar laser melintang (latar lebar).
  const beamMats: ShaderMaterial[] = [];
  if (opts.beams) {
    const beamDefs = [
      { y: 0.9, z: -1.2, rot: 0.1, speed: 0.07, phase: 0.1 },
      { y: -1.1, z: -0.9, rot: -0.07, speed: -0.055, phase: 0.55 },
    ];
    for (const def of beamDefs) {
      const geo = new PlaneGeometry(22, 0.07);
      const mat = ringShaders[0].clone();
      mat.uniforms = {
        uTime: { value: 0 },
        uSpeed: { value: def.speed },
        uPhase: { value: def.phase },
        uAlpha: { value: 0.9 },
        uColor: { value: new Color(1.0, 0.12, 0.12) },
      };
      beamMats.push(mat);
      disposables.push(geo, mat);
      const beam = new Mesh(geo, mat);
      beam.position.set(0, def.y, def.z);
      beam.rotation.z = def.rot;
      content.add(beam);
    }
  }

  // Percikan api.
  const sparkCount = high ? 320 : 110;
  const positions = new Float32Array(sparkCount * 3);
  const seeds = new Float32Array(sparkCount);
  const sizes = new Float32Array(sparkCount);
  for (let i = 0; i < sparkCount; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.1 + Math.random() * 2.6;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.4;
    positions[i * 3 + 2] = (Math.random() - 0.3) * 2.2;
    seeds[i] = Math.random();
    sizes[i] = 0.55 + Math.random() * 1.25;
  }
  const sparkGeo = new BufferGeometry();
  sparkGeo.setAttribute("position", new BufferAttribute(positions, 3));
  sparkGeo.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  sparkGeo.setAttribute("aSize", new BufferAttribute(sizes, 1));
  const sparkMat = new ShaderMaterial({
    vertexShader: SPARK_VERT,
    fragmentShader: SPARK_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixel: { value: pixelRatio * 42 } },
  });
  disposables.push(sparkGeo, sparkMat);
  const sparks = new Points(sparkGeo, sparkMat);
  content.add(sparks);

  // ------------------------------------------------------------ keadaan & loop
  let visible = true;
  let raf = 0;
  let stopped = false;
  let animating = opts.animate;
  let time = opts.animate ? 0 : 1.4;
  let last = performance.now();
  let px = 0;
  let py = 0;
  let scroll = 0;
  let rx = 0;
  let ry = 0;
  let frames = 0;
  let frameSum = 0;
  let downgraded = false;
  const offset = opts.offset ?? [0, 0];

  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const d = fitDistance(FOV, camera.aspect, opts.viewRadius) * (1 + scroll * 0.18);
    camera.position.set(0, 0, d);
    camera.updateProjectionMatrix();
    const halfH = d * Math.tan((FOV * Math.PI) / 360);
    content.position.set(offset[0] * halfH * camera.aspect, offset[1] * halfH, 0);
    sparkMat.uniforms.uPixel.value = pixelRatio * 42;
    if (!animating || stopped) render();
  }

  function render() {
    const t = time;
    for (const m of ringShaders) m.uniforms.uTime.value = t;
    for (const m of beamMats) m.uniforms.uTime.value = t;
    sparkMat.uniforms.uTime.value = t;
    renderer.render(scene, camera);
  }

  function step(dt: number) {
    time += dt;
    // Goyang pelan + mengikuti kursor; dibatasi agar punggung emblem tidak terlihat.
    const targetY = Math.sin(time * 0.45) * 0.5 + px * 0.42;
    const targetX = Math.sin(time * 0.33 + 1.2) * 0.1 - py * 0.22 + scroll * 0.5;
    ry = damp(ry, targetY, 5, dt);
    rx = damp(rx, targetX, 5, dt);
    emblem.rotation.set(rx, ry, 0);
    rings.rotation.y += dt * 0.12;
    rings.rotation.x = Math.sin(time * 0.2) * 0.15 + rx * 0.4;
    glow.scale.setScalar(1 + Math.sin(time * 1.3) * 0.04);
    rim.intensity = 22 + Math.sin(time * 2.1) * 4;
    sparks.rotation.y += dt * 0.03;
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    render();
    // Adaptif: bingkai lambat → turunkan resolusi & matikan percikan; tetap lambat → berhenti animasi.
    frames += 1;
    frameSum += dt;
    if (frames >= 120) {
      const action = adaptAction(frameSum / frames, downgraded);
      frames = 0;
      frameSum = 0;
      if (action === "downgrade") {
        downgraded = true;
        pixelRatio = 1;
        renderer.setPixelRatio(1);
        sparks.visible = false;
        resize();
      } else if (action === "stop") {
        stopped = true;
        cancelAnimationFrame(raf);
        render();
      }
    }
  }

  resize();
  if (animating) {
    raf = requestAnimationFrame((now) => {
      last = now;
      frame(now);
    });
  } else {
    step(0);
    render();
  }

  return {
    setVisible(next) {
      visible = next;
      if ((!animating || stopped) && next) render();
    },
    setPointer(x, y) {
      px = Math.max(-1, Math.min(1, x));
      py = Math.max(-1, Math.min(1, y));
    },
    setScroll(progress) {
      const next = clamp01(progress);
      if (Math.abs(next - scroll) < 0.002) return;
      scroll = next;
      if (!animating || stopped) {
        step(0);
        resize();
      }
    },
    setAnimate(on) {
      if (on === animating) return;
      animating = on;
      cancelAnimationFrame(raf);
      if (on && !stopped) {
        raf = requestAnimationFrame((now) => {
          last = now;
          frame(now);
        });
      } else {
        render();
      }
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
