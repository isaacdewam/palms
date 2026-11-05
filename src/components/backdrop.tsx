import { useState } from "react";
import { motion } from "motion/react";
import { HEADER_HEIGHT } from "@/components/app-header";
import { LinePattern } from "@/components/line-pattern";

/**
 * A shallow half-ellipse hanging from the top centre, just big enough to sit behind the logo, tabs and
 * settings button. The sync lines clear out inside it.
 */
const NAV_HALO = `ellipse min(960px, 70vw) ${HEADER_HEIGHT * 1.4}px at 50% 0`;

/** Where the grainy glow comes up from: wide and low along the bottom edge, gone well before the content's middle. */
const FLOOR_GLOW = "radial-gradient(ellipse 90% 70% at 50% 95%, black 0%, rgb(0 0 0 / 0.55) 40%, transparent 85%)";

/**
 * Fine indigo speckle, tiled. Fractal noise pushed hard through the alpha channel so most of it drops out and
 * what's left reads as separate grains rather than a haze.
 */
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='1' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.64 0 0 0 0 0.69 0 0 0 0 1 2.4 0 0 0 -0.95'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
)}")`;

/**
 * Page background: plain near-black with a grainy glow rising off the bottom, halfway between the app icon's navy
 * (#0a0922) and the earlier grey-blue wash. While `plain` (a sync is
 * running and on screen, not behind history) long curved lines fade in with no colour, framing the sync's covers. `glow={false}` drops the navy glow
 * (the history grid reads better on flat black). `bare` (once a run has started) fades the glow and grain to a flat #0b0b0b; the
 * sync lines stay on top of it.
 */
export function Backdrop({ plain = false, glow = true, bare = false }: { plain?: boolean; glow?: boolean; bare?: boolean }) {
  // the lines and the full-window blur over them only exist while they can be seen: from a sync starting until its
  // fade-out finishes. Left mounted, the blur was recomposited under every scroll of the covers grid
  const [linesShown, setLinesShown] = useState(plain);
  if (plain && !linesShown) setLinesShown(true);
  return (
    // its own GPU layer: otherwise WebKit repaints the whole window's worth of gradients, grain and masks under anything
    // translucent that changes, like the skeletons' sweep, and scrolling the scrape placeholders fell to ~24fps
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-950 will-change-transform">
      {/* a grainy navy-grey glow rising off the bottom of the window: a faint smooth wash, with speckle over it that
          thins out as the glow fades */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ opacity: glow ? 1 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      >
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "radial-gradient(ellipse 90% 60% at 50% 105%, rgb(25 29 49), rgb(25 29 49 / 0.4) 45%, transparent 85%)" }}
        />
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: GRAIN, maskImage: FLOOR_GLOW }} />
      </motion.div>
      {/* the same speckle, very faint, over the whole window so the black above the glow isn't flat */}
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: GRAIN }} />
      {/* the bare background: flat #0b0b0b over the glow and grain */}
      <motion.div
        className="absolute inset-0 bg-[#0b0b0b]"
        initial={false}
        animate={{ opacity: bare ? 1 : 0 }}
        transition={{ duration: 0.6, ease: "easeInOut" }}
      />
      {/* the sync lines sit above the bare background so a run never hides them */}
      <div
        className="absolute inset-0"
        // the sync lines clear in the middle of the halo, easing out to full strength at its rim so there's no visible edge
        style={{
          maskImage: `radial-gradient(${NAV_HALO}, transparent 30%, rgb(0 0 0 / 0.1) 48%, rgb(0 0 0 / 0.3) 64%, rgb(0 0 0 / 0.6) 82%, rgb(0 0 0 / 0.85) 100%, black 120%)`,
        }}
      >
        {/* the sync backdrop: curved lines, fading out around the covers (which sit just above
            the middle of the window) instead of from the top, so the texture frames them */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: plain ? 1 : 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          onAnimationComplete={() => !plain && setLinesShown(false)}
          style={{ maskImage: "radial-gradient(ellipse 60% 62% at 50% 46%, black 20%, transparent 100%)" }}
        >
          {linesShown && <LinePattern className="text-white/[0.06]" />}
        </motion.div>
      </div>
      {/* blurs the lines past the halo's rim so its outline can't be made out, sharp again further out */}
      {linesShown && (
        <div
          className="absolute inset-0 backdrop-blur-[28px]"
          style={{
            maskImage: `radial-gradient(${NAV_HALO}, black 70%, rgb(0 0 0 / 0.6) 120%, transparent 180%)`,
          }}
        />
      )}
    </div>
  );
}
