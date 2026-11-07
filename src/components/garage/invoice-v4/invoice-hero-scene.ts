// =============================================================================
// CinematicInvoiceHero — scene Three.js (dimuat lazy, tidak pernah di bundel awal).
// Emblem segitiga Garage (bentuk ikon resmi, merah + bingkai krom) masuk dengan
// sapuan cahaya merah ±2 detik, lalu BERHENTI merender (satu frame statis):
// tidak ada loop GPU terus-menerus. Reduced-motion → komponen tidak memuat scene.
// =============================================================================
import {
  AmbientLight,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  PerspectiveCamera,
  PointLight,
  Scene,
  Shape,
  WebGLRenderer,
} from "three";

export type HeroSceneController = { resize: (width: number, height: number) => void; dispose: () => void };

function triangle(size: number) {
  const h = (Math.sqrt(3) / 2) * size;
  const shape = new Shape();
  shape.moveTo(0, (2 / 3) * h);
  shape.lineTo(size / 2, -h / 3);
  shape.lineTo(-size / 2, -h / 3);
  shape.closePath();
  return shape;
}

function trianglePath(size: number) {
  const h = (Math.sqrt(3) / 2) * size;
  const path = new Path();
  path.moveTo(0, (2 / 3) * h);
  path.lineTo(-size / 2, -h / 3);
  path.lineTo(size / 2, -h / 3);
  path.closePath();
  return path;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function createHeroScene(canvas: HTMLCanvasElement, width: number, height: number): HeroSceneController {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.setSize(width, height, false);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, width / height, 0.1, 50);
  camera.position.set(0, 0, 7);

  const emblem = new Group();
  const chromeShape = triangle(2.6);
  chromeShape.holes.push(trianglePath(2.05));
  const chrome = new Mesh(
    new ExtrudeGeometry(chromeShape, { depth: 0.28, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 3 }),
    new MeshStandardMaterial({ color: 0xc9c9cf, metalness: 0.95, roughness: 0.22 }),
  );
  const core = new Mesh(
    new ExtrudeGeometry(triangle(1.75), { depth: 0.22, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 3 }),
    new MeshStandardMaterial({ color: 0xd92532, metalness: 0.55, roughness: 0.32, emissive: 0x2a0306 }),
  );
  core.position.z = 0.04;
  emblem.add(chrome, core);
  emblem.position.set(0, -0.1, 0);
  scene.add(emblem);

  scene.add(new AmbientLight(0xffffff, 0.35));
  const key = new DirectionalLight(0xfff3e6, 1.6);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const rim = new PointLight(0xff2a3a, 26, 12, 1.6);
  rim.position.set(-4, 1.5, 2.5);
  scene.add(rim);

  const DURATION = 2100;
  let start = 0;
  let frame = 0;
  let disposed = false;

  const render = (now: number) => {
    if (disposed) return;
    if (!start) start = now;
    const t = Math.min(1, (now - start) / DURATION);
    const e = easeOutCubic(t);
    emblem.rotation.y = -0.9 + e * 1.15;
    emblem.rotation.x = 0.25 - e * 0.15;
    emblem.scale.setScalar(0.82 + e * 0.18);
    rim.position.x = -4 + e * 8;
    renderer.render(scene, camera);
    if (t < 1) frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);

  return {
    resize(nextWidth, nextHeight) {
      if (disposed || nextWidth <= 0 || nextHeight <= 0) return;
      renderer.setSize(nextWidth, nextHeight, false);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera); // satu frame on-demand
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          (object.material as MeshStandardMaterial).dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
