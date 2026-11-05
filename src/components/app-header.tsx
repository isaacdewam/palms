import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { motion, useMotionValueEvent, useScroll } from "motion/react";
import { cn } from "@/lib/utils";
import { motionTransitions } from "@/lib/motion-tokens";

// the traffic lights sit at x=20 and end around x=82 (trafficLightPosition in tauri.conf.json)
const LIGHTS_GUTTER = 104;
const CONTENT_MAX = 1152; // max-w-6xl, matches <main>
const PILL_MAX = 896;
/** Height of the header while flush; the backdrop starts just below it. */
export const HEADER_HEIGHT = 64;

// the page's width without the scrollbar: innerWidth counts it, so with a mouse plugged in (always-on scrollbars) the
// header came out a scrollbar wider than the page and the whole window could be scrolled sideways
const pageWidth = () => document.documentElement.clientWidth;

/** The page's width, and whether the window is being resized right now (true until it's been still for 200ms). */
function useWindowWidth() {
  const [w, setW] = useState(pageWidth);
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = () => {
      setW(pageWidth());
      setResizing(true);
      clearTimeout(t);
      t = setTimeout(() => setResizing(false), 200);
    };
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      clearTimeout(t);
    };
  }, []);
  return [w, resizing] as const;
}

/**
 * Sits clear and flush with the page at the top, then lifts into a see-through floating pill once the page scrolls.
 * The native title bar is hidden, so the header doubles as the window drag area. It floats over `scroller` (the
 * content area, which does the scrolling instead of the window) so it stays put while that scrolls and rubber-bands.
 */
export function AppHeader({
  scroller,
  left,
  center,
  right,
}: {
  scroller: RefObject<HTMLElement | null>;
  left: ReactNode;
  center: (scrolled: boolean) => ReactNode;
  right: ReactNode;
}) {
  const { scrollY } = useScroll({ container: scroller });
  const [scrolled, setScrolled] = useState(() => scrollY.get() > 12);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 12));
  const [vw, resizing] = useWindowWidth();

  // flush: the logo shares the content's left edge, only shifting right when the window is too narrow to clear the lights.
  // pill: narrow enough to stay clear of the lights on both sides, so it needs no extra left padding.
  const target = scrolled
    ? {
        width: Math.min(PILL_MAX, vw - LIGHTS_GUTTER * 2),
        marginTop: 14,
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 20,
        paddingRight: 6,
        borderRadius: 6,
        backgroundColor: "rgba(23, 23, 23, 0.5)",
        borderColor: "rgba(38, 38, 38, 1)",
        boxShadow: "0 12px 40px -12px rgba(0, 0, 0, 0.8)",
      }
    : {
        width: Math.min(CONTENT_MAX, vw),
        marginTop: 0,
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: Math.max(24, LIGHTS_GUTTER - Math.max(0, (vw - CONTENT_MAX) / 2)),
        paddingRight: 24,
        borderRadius: 0,
        backgroundColor: "rgba(23, 23, 23, 0)",
        borderColor: "rgba(38, 38, 38, 0)",
        boxShadow: "0 12px 40px -12px rgba(0, 0, 0, 0)",
      };

  return (
    // flex so the pill's top margin can't collapse through the header and get pinned to 0
    <header data-tauri-drag-region className="absolute inset-x-0 top-0 z-30 flex">
      <motion.div
        data-tauri-drag-region
        initial={false}
        animate={target}
        // the spring is for lifting into the pill on scroll; while the window is resized the header tracks its width exactly,
        // so the logo and tabs stay locked in place instead of lagging behind and springing after it
        transition={resizing ? { duration: 0 } : motionTransitions.springMorph}
        className={cn("mx-auto grid grid-cols-[1fr_auto_1fr] items-center gap-4 border", scrolled && "backdrop-blur-xl")}
      >
        {left}
        {center(scrolled)}
        {right}
      </motion.div>
    </header>
  );
}
