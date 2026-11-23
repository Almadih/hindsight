"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Renders children only once the box nears the viewport; the box keeps its size (give it one) so nothing shifts. */
export function InView({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <div ref={ref} className={className}>
      {seen ? children : null}
    </div>
  );
}
