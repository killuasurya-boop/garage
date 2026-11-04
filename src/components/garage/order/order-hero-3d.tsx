"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// Aksen 3D ringan menu digital (Owner, Nov 2026): gelas kopi krom Garage berputar
// pelan di pita sambutan. three.js dimuat terpisah (dynamic import) supaya daftar
// menu tetap tampil cepat. Mati otomatis → logo statis bila: prefers-reduced-motion,
// Save-Data, RAM ≤ 2 GB, atau WebGL tidak tersedia. Render berhenti saat di luar
// layar / tab disembunyikan; pixel ratio dibatasi 1.5.

type Mode = "pending" | "3d" | "static";

function canUse3d() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function OrderHero3D({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("pending");

  useEffect(() => {
    if (!canUse3d()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deteksi kemampuan perangkat setelah mount
      setMode("static");
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void import("three")
      .then((THREE) => {
        if (disposed) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.style.display = "block";
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
        camera.position.set(0, 1.2, 6.2);
        camera.lookAt(0, 0.35, 0);

        // Cahaya: krom/silver dengan rim merah + amber (palet Garage).
        scene.add(new THREE.AmbientLight(0xffffff, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 2.2);
        key.position.set(3, 4, 5);
        scene.add(key);
        const rimRed = new THREE.PointLight(0xd11a2a, 18, 12);
        rimRed.position.set(-3, 1.5, -1.5);
        scene.add(rimRed);
        const rimAmber = new THREE.PointLight(0xf5a742, 10, 12);
        rimAmber.position.set(3, -0.5, -2);
        scene.add(rimAmber);

        const cup = new THREE.Group();
        const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd2d8, metalness: 0.92, roughness: 0.22 });
        const red = new THREE.MeshStandardMaterial({ color: 0xd11a2a, metalness: 0.35, roughness: 0.4, emissive: 0x3a0508 });
        const coffee = new THREE.MeshStandardMaterial({ color: 0x3b2116, roughness: 0.55 });

        // Badan gelas: profil lathe (dinding tipis, dasar tebal).
        const profile = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.62, 0),
          new THREE.Vector2(0.7, 0.08),
          new THREE.Vector2(0.86, 1.15),
          new THREE.Vector2(0.9, 1.22),
          new THREE.Vector2(0.84, 1.22),
          new THREE.Vector2(0.8, 1.12),
          new THREE.Vector2(0.62, 0.14),
          new THREE.Vector2(0, 0.14),
        ];
        const bodyGeometry = new THREE.LatheGeometry(profile, 48);
        cup.add(new THREE.Mesh(bodyGeometry, chrome));
        const bandGeometry = new THREE.CylinderGeometry(0.815, 0.775, 0.16, 48, 1, true);
        const band = new THREE.Mesh(bandGeometry, red);
        band.position.y = 0.72;
        cup.add(band);
        const surfaceGeometry = new THREE.CircleGeometry(0.8, 48);
        const surface = new THREE.Mesh(surfaceGeometry, coffee);
        surface.rotation.x = -Math.PI / 2;
        surface.position.y = 1.08;
        cup.add(surface);
        const handleGeometry = new THREE.TorusGeometry(0.3, 0.07, 16, 32, Math.PI * 1.2);
        const handle = new THREE.Mesh(handleGeometry, chrome);
        handle.position.set(0.93, 0.62, 0);
        handle.rotation.z = -Math.PI * 0.6;
        cup.add(handle);
        const saucerGeometry = new THREE.CylinderGeometry(1.25, 1.1, 0.08, 48);
        const saucer = new THREE.Mesh(saucerGeometry, chrome);
        saucer.position.y = -0.05;
        cup.add(saucer);
        cup.position.y = -0.35;
        scene.add(cup);

        // Uap: titik-titik naik pelan (ringan, tanpa tekstur).
        const steamCount = 28;
        const steamPositions = new Float32Array(steamCount * 3);
        const steamSeeds = Array.from({ length: steamCount }, () => Math.random());
        const steamGeometry = new THREE.BufferGeometry();
        steamGeometry.setAttribute("position", new THREE.BufferAttribute(steamPositions, 3));
        const steamMaterial = new THREE.PointsMaterial({ color: 0xe8e8ee, size: 0.09, transparent: true, opacity: 0.45, depthWrite: false });
        const steam = new THREE.Points(steamGeometry, steamMaterial);
        scene.add(steam);

        const resize = () => {
          const width = Math.max(1, host.clientWidth);
          const height = Math.max(1, host.clientHeight);
          renderer.setSize(width, height, false);
          renderer.domElement.style.width = `${width}px`;
          renderer.domElement.style.height = `${height}px`;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        resize();
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);

        let visible = true;
        let frame = 0;
        const clock = new THREE.Clock();
        const render = () => {
          frame = 0;
          if (!visible || document.hidden) return;
          const t = clock.getElapsedTime();
          cup.rotation.y = t * 0.45;
          cup.position.y = -0.35 + Math.sin(t * 1.2) * 0.04;
          for (let i = 0; i < steamCount; i += 1) {
            const life = (t * 0.35 + steamSeeds[i]) % 1;
            steamPositions[i * 3] = Math.sin(life * 6 + i) * 0.22 * life;
            steamPositions[i * 3 + 1] = 0.8 + life * 1.3;
            steamPositions[i * 3 + 2] = Math.cos(life * 5 + i) * 0.15 * life;
          }
          steamGeometry.attributes.position.needsUpdate = true;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(render);
        };
        const kick = () => {
          if (!frame && visible && !document.hidden) frame = requestAnimationFrame(render);
        };
        const intersection = new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          kick();
        });
        intersection.observe(host);
        document.addEventListener("visibilitychange", kick);
        setMode("3d");
        kick();

        cleanup = () => {
          if (frame) cancelAnimationFrame(frame);
          intersection.disconnect();
          resizeObserver.disconnect();
          document.removeEventListener("visibilitychange", kick);
          for (const geometry of [bodyGeometry, bandGeometry, surfaceGeometry, handleGeometry, saucerGeometry, steamGeometry]) geometry.dispose();
          for (const material of [chrome, red, coffee, steamMaterial]) material.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      })
      .catch(() => {
        if (!disposed) setMode("static");
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return (
    <div ref={hostRef} className={`relative ${className}`} aria-hidden="true">
      {mode !== "3d" ? (
        <Image
          src="/garage-brand/garage-coffee-icon.png"
          alt=""
          fill
          sizes="96px"
          className={`object-contain p-2 transition-opacity ${mode === "pending" ? "opacity-40" : "opacity-90"}`}
        />
      ) : null}
    </div>
  );
}
