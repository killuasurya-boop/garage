"use client";

// Border laser merah yang berjalan mengelilingi perimeter kartu (SVG rect + pathLength, presisi di sudut rounded).
// Tiga lapis: jejak dasar redup, sinar utama (inti terang + glow), kilatan kecil yang sesekali lewat.
// Ukuran viewBox = ukuran kartu (ResizeObserver) sehingga radius sudut tidak terdistorsi. Animasi = CSS
// (stroke-dashoffset, GPU-friendly), berhenti saat kartu tidak terlihat dan saat prefers-reduced-motion.
import { useEffect, useRef, useState } from "react";

export function LaserBorder({ radius = 28, inset = 1 }: { radius?: number; inset?: number }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const svg = ref.current;
    const host = svg?.parentElement;
    if (!svg || !host) return;
    const measure = () => setSize({ w: host.clientWidth, h: host.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(host);
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(host);
    return () => {
      resize.disconnect();
      io.disconnect();
    };
  }, []);

  const w = Math.max(0, size.w - inset * 2);
  const h = Math.max(0, size.h - inset * 2);
  const r = Math.min(radius, w / 2, h / 2);

  return (
    <svg
      ref={ref}
      className="cine-laser"
      data-paused={visible ? undefined : "true"}
      viewBox={`0 0 ${size.w || 1} ${size.h || 1}`}
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      {w > 0 ? (
        <>
          <rect className="cine-laser-track" x={inset} y={inset} width={w} height={h} rx={r} ry={r} pathLength={100} />
          <rect className="cine-laser-glow" x={inset} y={inset} width={w} height={h} rx={r} ry={r} pathLength={100} />
          <rect className="cine-laser-core" x={inset} y={inset} width={w} height={h} rx={r} ry={r} pathLength={100} />
          <rect className="cine-laser-spark" x={inset} y={inset} width={w} height={h} rx={r} ry={r} pathLength={100} />
        </>
      ) : null}
    </svg>
  );
}
