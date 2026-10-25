import type { CSSProperties, ElementType, ReactNode } from "react";

/** Fade + slide masuk (CSS, menghormati prefers-reduced-motion). */
export function MotionReveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={`gm-reveal ${className ?? ""}`}
      style={{ "--gm-delay": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
