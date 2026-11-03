import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Long arcs sweeping down to the right, drawn as rings around a center 336px right of and 700px above the window's
 * top right corner. Drawn at 1:1 pixels and sized to the element, so a bigger area shows more rings rather than
 * stretching them. The rings are always placed relative to the window, so any two copies line up exactly; that's how
 * the sync board brightens the page backdrop's lines around a hovered cover.
 */
export function LinePattern({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0, vw: 0 });

  useEffect(() => {
    const el = ref.current!;
    let frame = 0;
    // at most one read per frame, and no re-render unless something moved: scroll and pointerover fire constantly,
    // and redrawing every ring each time made scrolling a long list of covers stutter
    const read = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const next = { x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth };
      setBox((b) => (b.x === next.x && b.y === next.y && b.w === next.w && b.h === next.h && b.vw === next.vw ? b : next));
    };
    const measure = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    // ResizeObserver misses an ancestor sliding in on a transform, so check again whenever the pointer moves onto something
    window.addEventListener("pointerover", measure, { passive: true });
    window.addEventListener("scroll", measure, {
      capture: true,
      passive: true,
    });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointerover", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, []);

  const cx = box.vw + 336 - box.x;
  const cy = -700 - box.y;
  // enough rings to reach the corner farthest from the center
  const far = Math.max(Math.hypot(cx, box.h - cy), Math.hypot(cx - box.w, box.h - cy));
  const rings = Math.max(0, Math.ceil((far - 900) / 48) + 1);

  return (
    <div ref={ref} className={cn("absolute inset-0 overflow-hidden", className)} aria-hidden>
      <svg className="absolute inset-0" width={box.w} height={box.h}>
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          {Array.from({ length: rings }, (_, i) => (
            <circle key={i} cx={cx} cy={cy} r={900 + i * 48} />
          ))}
        </g>
      </svg>
    </div>
  );
}
