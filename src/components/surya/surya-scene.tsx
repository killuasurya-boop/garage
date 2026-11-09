"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SURYA_MODULES, SURYA_CORE, type SuryaModuleId } from "./surya-data";

export type SuryaSceneControl = { progress: number; focus: SuryaModuleId | null };

type Props = { control: React.MutableRefObject<SuryaSceneControl>; mobile: boolean; onReady: () => void };

const W = 100;
const H = 70;
const toWorld = (x: number, y: number) => new THREE.Vector3(x - W / 2, H / 2 - y, 0);

/** Adegan 3D Garage OS: platform inti + 5 modul. Kamera ortografis agar posisi cocok dengan label HTML. */
export default function SuryaScene({ control, mobile, onReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // Tanpa WebGL: diagram SVG/HTML tetap tampil.
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;";
    renderer.domElement.setAttribute("aria-hidden", "true");

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -200, 200);
    camera.position.set(0, 0, 100);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T) => (disposables.push(o), o);

    const metal = track(new THREE.MeshStandardMaterial({ color: 0x1a1a1e, metalness: 0.85, roughness: 0.38 }));
    const chrome = track(new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 1, roughness: 0.22 }));
    const redGlow = track(new THREE.MeshBasicMaterial({ color: 0xff3045 }));
    const edgeMat = track(new THREE.LineBasicMaterial({ color: 0xd11a2a, transparent: true, opacity: 0.55 }));

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffe2c2, 1.6);
    key.position.set(-30, 40, 80);
    scene.add(key);
    const redLight = new THREE.PointLight(0xff3045, 900, 120);
    redLight.position.set(0, 0, 30);
    scene.add(redLight);
    const amber = new THREE.PointLight(0xd69a55, 400, 140);
    amber.position.set(40, 30, 40);
    scene.add(amber);

    const root = new THREE.Group();
    root.rotation.x = -0.32; // sudut kamera ilustrasi
    scene.add(root);

    const modules = new Map<string, THREE.Group>();

    // Inti GARAGE OS
    const core = new THREE.Group();
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(17, 0.18, 8, 96)), redGlow);
    ring.scale.y = 0.55;
    core.add(ring);
    const ring2 = new THREE.Mesh(track(new THREE.TorusGeometry(21, 0.1, 8, 96)), chrome);
    ring2.scale.y = 0.55;
    core.add(ring2);
    core.position.copy(toWorld(SURYA_CORE.x, SURYA_CORE.y));
    root.add(core);

    // Debu partikel halus (hanya desktop)
    let dust: THREE.Points | null = null;
    if (!mobile) {
      const n = 90;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * W;
        pos[i * 3 + 1] = (Math.random() - 0.5) * H;
        pos[i * 3 + 2] = Math.random() * 20;
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      dust = new THREE.Points(geo, track(new THREE.PointsMaterial({ color: 0xff6070, size: 0.5, transparent: true, opacity: 0.45 })));
      root.add(dust);
    }

    const size = () => {
      const r = host.getBoundingClientRect();
      if (r.width < 2) return;
      renderer.setSize(r.width, r.height, false);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    // Parallax mouse (desktop saja)
    const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      mouse.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    if (!mobile) host.addEventListener("pointermove", onMove, { passive: true });

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = false;
    let raf = 0;
    const clock = new THREE.Clock();
    let intro = reduce ? 1 : 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      intro = Math.min(1, intro + dt / 1.4);
      const ease = 1 - Math.pow(1 - intro, 3);
      mouse.sx += (mouse.x - mouse.sx) * 0.06;
      mouse.sy += (mouse.y - mouse.sy) * 0.06;
      const p = control.current.progress; // 0..1 melalui section
      const zoom = 1 + Math.sin(p * Math.PI) * 0.06;
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      root.rotation.x = -0.32 + mouse.sy * 0.04;
      root.rotation.y = mouse.sx * 0.06;
      core.position.z = 2 * ease + (reduce ? 0 : Math.sin(t * 0.9) * 0.4);
      redLight.intensity = 800 + (reduce ? 0 : Math.sin(t * 1.4) * 160);
      ring.scale.setScalar(1);
      ring.scale.y = 0.55;
      modules.forEach((g, id) => {
        const focus = control.current.focus === id;
        const idx = SURYA_MODULES.findIndex((m) => m.id === id);
        const appear = Math.min(1, Math.max(0, ease * 1.6 - idx * 0.15));
        g.scale.setScalar(0.001 + appear * (focus ? 1.06 : 1));
        g.position.z = 4 + (reduce ? 0 : Math.sin(t * 0.8 + idx) * 0.35);
      });
      if (dust && !reduce) dust.rotation.z = Math.sin(t * 0.1) * 0.05;
      renderer.render(scene, camera);
    };
    const start = () => { if (!raf) { clock.getDelta(); raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) start(); else stop();
    }, { threshold: 0.05 });
    io.observe(host);
    const onVis = () => { if (document.hidden) stop(); else if (visible) start(); };
    document.addEventListener("visibilitychange", onVis);

    renderer.render(scene, camera);
    onReady();

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      host.removeEventListener("pointermove", onMove);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [control, mobile, onReady]);

  return <div ref={hostRef} className="sdv-canvas" />;
}
