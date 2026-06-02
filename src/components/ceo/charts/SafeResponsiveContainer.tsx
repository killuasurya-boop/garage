"use client";

import { cloneElement, type ReactElement } from "react";
import { useEffect, useRef, useState } from "react";

type ChartSize = {
  width: number;
  height: number;
};

export function SafeResponsiveContainer({ children }: { children: ReactElement<Record<string, unknown>> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);

      if (width <= 0 || height <= 0) {
        setSize(null);
        return;
      }

      setSize((current) => {
        if (current?.width === width && current.height === height) return current;
        return { width, height };
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full min-w-0">
      {size ? cloneElement(children, { width: size.width, height: size.height }) : null}
    </div>
  );
}
