import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Wifi } from "lucide-react";
import { motionTransitions } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

/** A box on a screenshot, as fractions (0–1) of its width and height. */
export interface Spot {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pills and round buttons get a round outline; rows and lists a rounded rectangle. */
  round?: boolean;
}

/** A magnified circle of the phone screen, for buttons too small to make out at phone size. */
export interface Loupe {
  /** Centre of the magnified area, as fractions of the screenshot. */
  cx: number;
  cy: number;
  /** How much of the screenshot's width fits across the circle. */
  span: number;
}

export interface SceneState {
  /**
   * Which devices are in the picture. Alone, a device takes the middle a size up; with both, they sit either side of
   * the Wi-Fi link. The others slide out to the side they'd sit on.
   */
  show: "monitor" | "both" | "phone";
  /** Which device the step is about; the other one dims. */
  focus: "monitor" | "phone";
  phoneShot: string;
  monitorSpots: Spot[];
  phoneSpots: Spot[];
  /** The Wi-Fi link from computer to phone, lit while the playlist is downloading across it. */
  linked: boolean;
  loupe?: Loupe;
  /** A green dot resting on a point of the phone's screenshot (fractions of it), like a finger hovering there. */
  cursor?: { x: number; y: number };
}

// the scene is drawn at a fixed size: the dialog is a fixed width, and the window's minimum leaves room for it
const W = 720;
const H = 344;
const MONITOR_BEZEL = 5;
const PHONE_BEZEL = 4;
// the monitor's neck (22px) and foot (6px)
const STAND = 28;
const LOUPE_SIZE = 100;

// natural height over width per screenshot, read once each loads
const ratios = new Map<string, number>();

/** A screenshot's height over its width, or `fallback` until it has loaded. */
function useRatio(src: string, fallback: number) {
  const [ratio, setRatio] = useState(() => ratios.get(src) ?? fallback);
  useEffect(() => {
    const known = ratios.get(src);
    if (known) return setRatio(known);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth) return;
      ratios.set(src, img.naturalHeight / img.naturalWidth);
      setRatio(img.naturalHeight / img.naturalWidth);
    };
    img.src = src;
  }, [src]);
  return ratio;
}

/**
 * Sizes each screen to its screenshot's own shape, so nothing is cropped or stretched: the monitor's screen fits a
 * 420×262 box and the phone's a 186×298 one, as large as the shape allows. Everything else hangs off those.
 */
function layout(monitorRatio: number, phoneRatio: number) {
  const mw = Math.min(420, 262 / monitorRatio);
  const mh = mw * monitorRatio;
  const ph = Math.min(298, 186 * phoneRatio);
  const pw = ph / phoneRatio;
  const monitor = { left: 8, top: (H - (mh + MONITOR_BEZEL * 2 + STAND)) / 2, w: mw, h: mh };
  const phone = { left: W - 16 - pw - PHONE_BEZEL * 2, top: (H - (ph + PHONE_BEZEL * 2)) / 2, w: pw, h: ph };
  const monitorRight = monitor.left + mw + MONITOR_BEZEL * 2;
  // the link runs from the middle of the monitor's right edge to the middle of the phone's left edge
  const from = { x: monitorRight + 4, y: monitor.top + MONITOR_BEZEL + mh / 2 };
  const to = { x: phone.left - 6, y: phone.top + PHONE_BEZEL + ph / 2 };
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return {
    monitor,
    phone,
    from,
    to,
    mid,
    path: `M ${from.x} ${from.y} C ${mid.x} ${from.y}, ${mid.x} ${to.y}, ${to.x} ${to.y}`,
    // the loupe sits in the gap between the devices, under the link
    loupe: { x: (monitorRight + phone.left) / 2 + 4, y: Math.min(H - LOUPE_SIZE / 2 - 6, to.y + 86) },
    /** Where a point on the phone's screenshot sits in the scene. */
    onPhone: (fx: number, fy: number) => ({ x: phone.left + PHONE_BEZEL + fx * pw, y: phone.top + PHONE_BEZEL + fy * ph }),
  };
}

/** Outlines what to tap, with a glow pulsing out from it. */
function SpotRing({ spot }: { spot: Spot }) {
  const radius = spot.round ? "rounded-full" : "rounded-[3px]";
  return (
    <motion.span
      initial={{ opacity: 0, scale: 1.15 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={motionTransitions.springSnappy}
      className={cn("pointer-events-none absolute outline-2 outline-offset-1 outline-emerald-400", radius)}
      style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, width: `${spot.w * 100}%`, height: `${spot.h * 100}%` }}
    >
      {/* sized to the outline's outer edge, so the glow never covers the target */}
      <motion.span
        className={cn("absolute -inset-[3px]", radius)}
        animate={{ boxShadow: ["0 0 0 0 rgb(52 211 153 / 0.6)", "0 0 0 7px rgb(52 211 153 / 0)"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
      />
    </motion.span>
  );
}

function Spots({ spots, id }: { spots: Spot[]; id: string }) {
  return <AnimatePresence>{spots.map((s, i) => <SpotRing key={`${id}-${i}`} spot={s} />)}</AnimatePresence>;
}

/**
 * The phone guide's picture: the Spotify desktop app on a monitor, a Wi-Fi link to a phone running Spotify, and
 * whichever device the step is about in focus, with what to tap outlined. It stays put between steps and only its
 * state changes, so the user sees one setup and where each step happens in it.
 */
export function DeviceScene({ state, desktopShot, stepKey }: { state: SceneState; desktopShot: string; stepKey: number }) {
  const monitorRatio = useRatio(desktopShot, 1109 / 2000);
  const phoneRatio = useRatio(state.phoneShot, 2000 / 921);
  const { monitor, phone, to, mid, path, loupe: LOUPE, onPhone } = layout(monitorRatio, phoneRatio);
  const dim = { opacity: 0.4, filter: "saturate(0.6)" };
  const lit = { opacity: 1, filter: "saturate(1)" };
  const loupe = state.loupe;
  const loupeAt = loupe && onPhone(loupe.cx, loupe.cy);
  // the shot drawn wide enough that `span` of it fills the circle
  const loupeW = loupe ? LOUPE_SIZE / loupe.span : 0;
  const both = state.show === "both";
  // alone, a device sits in the middle a size up; when the other comes in it slides over and settles to make room
  const monitorShift = (W - (monitor.w + MONITOR_BEZEL * 2)) / 2 - monitor.left;
  const monitorScale = Math.min(1.18, (H - 12) / (monitor.h + MONITOR_BEZEL * 2 + STAND));
  const phoneShift = (W - (phone.w + PHONE_BEZEL * 2)) / 2 - phone.left;
  const phoneScale = Math.min(1.12, (H - 12) / (phone.h + PHONE_BEZEL * 2));
  // the link draws itself from the monitor to the phone by widening this clip
  const clipId = useId();

  return (
    <div aria-hidden className="relative mx-auto select-none" style={{ width: W, height: H }}>
      {/* the link and the loupe's leader sit under both devices' screens */}
      <svg className="absolute inset-0 overflow-visible" width={W} height={H}>
        <defs>
          <clipPath id={clipId}>
            <motion.rect
              x={monitor.left + monitor.w + MONITOR_BEZEL * 2}
              y={0}
              height={H}
              initial={false}
              animate={{ width: !both ? 0 : to.x - (monitor.left + monitor.w + MONITOR_BEZEL * 2) + 8 }}
              transition={{ duration: !both ? 0.2 : 0.5, delay: !both ? 0 : 0.35, ease: "easeOut" }}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <motion.path
            d={path}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray="4 5"
            initial={false}
            animate={{ stroke: state.linked ? "rgb(52 211 153)" : "rgb(255 255 255 / 0.18)", strokeDashoffset: state.linked ? [0, -18] : 0 }}
            transition={{ stroke: { duration: 0.4 }, strokeDashoffset: { duration: 0.8, repeat: Infinity, ease: "linear" } }}
          />
          {/* arrowhead at the phone end, so the link reads as computer -> phone */}
          <motion.path
            d={`M ${to.x - 6} ${to.y - 4.5} L ${to.x} ${to.y} L ${to.x - 6} ${to.y + 4.5}`}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ stroke: state.linked ? "rgb(52 211 153)" : "rgb(255 255 255 / 0.18)" }}
            transition={{ duration: 0.4 }}
          />
        </g>
        <AnimatePresence>
          {loupeAt && (
            <motion.line
              key="leader"
              x1={loupeAt.x}
              y1={loupeAt.y}
              x2={LOUPE.x}
              y2={LOUPE.y}
              stroke="rgb(52 211 153 / 0.7)"
              strokeWidth={1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x1: loupeAt.x, y1: loupeAt.y }}
              exit={{ opacity: 0 }}
              transition={motionTransitions.springGentle}
            />
          )}
        </AnimatePresence>
      </svg>

      {/* the Wi-Fi chip on the link: both devices have to be on the same network for the download to come across */}
      <motion.div
        className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
        style={{ left: mid.x, top: mid.y }}
        initial={false}
        animate={!both ? { opacity: 0, scale: 0.6 } : state.linked ? { ...lit, scale: 1 } : { opacity: 0.55, filter: "saturate(1)", scale: 1 }}
        // pops in once the link has drawn up to it
        transition={{ ...motionTransitions.springSnappy, delay: !both ? 0 : 0.55 }}
      >
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full border transition-colors duration-300",
            state.linked ? "border-emerald-400/50 bg-emerald-950 text-emerald-300" : "border-neutral-800 bg-neutral-900 text-neutral-400",
          )}
        >
          <Wifi className="size-3.5" />
        </span>
      </motion.div>
      <motion.span
        className="absolute -translate-x-1/2 text-[10px] font-medium whitespace-nowrap"
        style={{ left: mid.x, top: mid.y + 18 }}
        initial={false}
        animate={{ opacity: state.linked ? 1 : 0, color: "rgb(110 231 183)" }}
        transition={{ duration: 0.3 }}
      >
        Same Wi-Fi
      </motion.span>

      {/* the monitor: bezel, screen, then a neck and foot */}
      <motion.div
        className="absolute"
        style={{ left: monitor.left, top: monitor.top }}
        initial={false}
        animate={
          state.show === "phone"
            ? { opacity: 0, filter: "saturate(1)", x: -56, scale: 0.94 }
            : { ...(state.focus === "monitor" ? lit : dim), x: state.show === "monitor" ? monitorShift : 0, scale: state.show === "monitor" ? monitorScale : 1 }
        }
        transition={{ ...motionTransitions.springSmooth, opacity: { duration: 0.4 }, filter: { duration: 0.4 } }}
      >
        <div className="relative rounded-[10px] border border-neutral-700 bg-neutral-950 shadow-[0_10px_30px_rgb(0_0_0/0.5)]" style={{ padding: MONITOR_BEZEL }}>
          <div className="relative overflow-hidden rounded-[5px]" style={{ width: monitor.w, height: monitor.h }}>
            <img src={desktopShot} alt="" className="block size-full" draggable={false} />
          </div>
          {/* the spots sit outside the clipped screen so their glow isn't cut off at its edge */}
          <div className="pointer-events-none absolute" style={{ left: MONITOR_BEZEL, top: MONITOR_BEZEL, width: monitor.w, height: monitor.h }}>
            <Spots spots={state.monitorSpots} id={`m${stepKey}`} />
          </div>
        </div>
        <div className="mx-auto h-[22px] w-[46px] bg-linear-to-b from-neutral-700 to-neutral-800 [clip-path:polygon(18%_0,82%_0,100%_100%,0_100%)]" />
        <div className="mx-auto h-[6px] w-[124px] rounded-full bg-neutral-700" />
      </motion.div>

      {/* the phone: a thin bezel round the screenshot, which already has the status bar and island */}
      <motion.div
        className="absolute"
        style={{ left: phone.left, top: phone.top }}
        initial={false}
        // slides in from the right as the monitor makes room, and back out if the user steps back
        animate={
          state.show === "monitor"
            ? { opacity: 0, filter: "saturate(1)", x: 56, scale: 0.94 }
            : { ...(state.focus === "phone" ? lit : dim), x: state.show === "phone" ? phoneShift : 0, scale: state.show === "phone" ? phoneScale : 1 }
        }
        transition={{ ...motionTransitions.springSmooth, delay: state.show === "monitor" ? 0 : 0.12 }}
      >
        <div className="relative rounded-[26px] border border-neutral-700 bg-black shadow-[0_10px_30px_rgb(0_0_0/0.5)]" style={{ padding: PHONE_BEZEL }}>
          <div className="relative overflow-hidden rounded-[22px] bg-neutral-900" style={{ width: phone.w, height: phone.h }}>
            {/* the two phone shots cross-fade, so the tracks turning green reads as the same screen changing */}
            <AnimatePresence initial={false}>
              <motion.img
                key={state.phoneShot}
                src={state.phoneShot}
                alt=""
                draggable={false}
                className="absolute inset-0 block size-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              />
            </AnimatePresence>
          </div>
          <div className="pointer-events-none absolute" style={{ left: PHONE_BEZEL, top: PHONE_BEZEL, width: phone.w, height: phone.h }}>
            <Spots spots={state.phoneSpots} id={`p${stepKey}`} />
            <AnimatePresence>
              {state.cursor && (
                // glides up onto its spot once the phone has settled, then pulses there
                <motion.span
                  key="cursor"
                  className="absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_1.5px_rgb(0_0_0/0.5),0_2px_6px_rgb(0_0_0/0.5)]"
                  style={{ left: `${state.cursor.x * 100}%`, top: `${state.cursor.y * 100}%` }}
                  initial={{ opacity: 0, x: 26, y: 34 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ ...motionTransitions.springGentle, delay: 0.45 }}
                >
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    animate={{ boxShadow: ["0 0 0 0 rgb(52 211 153 / 0.6)", "0 0 0 8px rgb(52 211 153 / 0)"] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut", delay: 1 }}
                  />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* the loupe: the phone's buttons are a few pixels across at this size, so the one to tap is shown up close */}
      <AnimatePresence>
        {loupe && (
          <motion.div
            key="loupe"
            className="absolute overflow-hidden rounded-full border-2 border-emerald-400 bg-neutral-900 shadow-[0_8px_24px_rgb(0_0_0/0.6)]"
            style={{ left: LOUPE.x - LOUPE_SIZE / 2, top: LOUPE.y - LOUPE_SIZE / 2, width: LOUPE_SIZE, height: LOUPE_SIZE }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={motionTransitions.springSnappy}
          >
            <AnimatePresence initial={false}>
              <motion.img
                key={state.phoneShot}
                src={state.phoneShot}
                alt=""
                draggable={false}
                className="absolute max-w-none"
                style={{ width: loupeW }}
                initial={{ opacity: 0, left: LOUPE_SIZE / 2 - loupe.cx * loupeW, top: LOUPE_SIZE / 2 - loupe.cy * loupeW * phoneRatio }}
                animate={{ opacity: 1, left: LOUPE_SIZE / 2 - loupe.cx * loupeW, top: LOUPE_SIZE / 2 - loupe.cy * loupeW * phoneRatio }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
