import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { LinePattern } from "@/components/line-pattern";
import { motionTransitions } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

const MAX = 4;
const CARD = 136; // a 128px cover plus its frame
const GAP = 176; // center to center
const TILTS = [-6, 4, -3, 5, -4, 3];
// the covers and the status under them are placed as one group, centred a little above the middle of the stage (optical
// centre); LIFT is how far the covers' centre sits above the stage's
const LIFT = 72;
const TEXT_GAP = 36; // from the bottom of the covers to the status line

// the small line under the status, one at a time; the last one stays a little longer, then the line fades away
const NOTES = [
  "hope u r enjoying palms :D",
  "made by isaac d. with care",
  "brother, for u best local files app",
  "alr peace out bro",
];
const NOTE_EVERY = 5000;
const LAST_NOTE_FOR = 10000;
const GLOW = 180; // radius of the brighter pattern around a hovered cover

/** Where the k-th of n visible covers sits, as an offset from the board's center. One sits dead center; more spread out evenly with a slight zigzag. */
function place(k: number, n: number) {
  const x = (k - (n - 1) / 2) * GAP;
  const y = n === 1 ? 0 : (k % 2 === 0 ? -1 : 1) * 14;
  return { x, y };
}

export interface SyncingCover {
  id: string;
  cover: string;
  done: boolean;
  /** Its position in the whole sync, so it keeps the same tilt as the window slides. */
  slot: number;
}

export const SYNC_SLOTS = MAX;

/** The sync loader: the covers being synced pop out in a loose cluster and drift, with a line saying what's happening. */
export function SyncingCovers({
  covers,
  synced,
  failed,
  total,
  current,
}: {
  covers: SyncingCover[];
  synced: number;
  failed: number;
  total: number;
  /** Tracks downloading right now. */
  current: { title: string; artist: string }[];
}) {
  const still = useReducedMotion();
  const now =
    current.length === 0
      ? "Finishing up"
      : current.length === 1
        ? `Downloading ${current[0].title} by ${current[0].artist}`
        : `Downloading ${current.map((c) => c.title).join(" and ")}`;

  const [note, setNote] = useState(0);
  useEffect(() => {
    if (note === NOTES.length) return; // past the last one: nothing shown
    const id = setTimeout(() => setNote(note + 1), note === NOTES.length - 1 ? LAST_NOTE_FOR : NOTE_EVERY);
    return () => clearTimeout(id);
  }, [note]);

  const shown = covers.slice(0, MAX);
  const [hovered, setHovered] = useState<string | null>(null);
  const lit = shown.findIndex((c) => c.id === hovered);
  const spot = lit === -1 ? null : place(lit, shown.length);

  return (
    <div>
      {/* the stage fills the window under the header; the covers float over the page backdrop's lines (see Backdrop) */}
      <div className="relative h-[calc(100vh-7rem)] min-h-[30rem]">
        {/* the backdrop's lines again, brighter, only showing through a soft circle around the hovered cover */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{
            opacity: spot ? 1 : 0,
            "--spot-x": `${spot?.x ?? 0}px`,
            "--spot-y": `${spot?.y ?? 0}px`,
          }}
          transition={motionTransitions.easeSoft}
          style={{
            maskImage: `radial-gradient(circle ${GLOW}px at calc(50% + var(--spot-x)) calc(50% - ${LIFT}px + var(--spot-y)), #000 30%, transparent)`,
            WebkitMaskImage: `radial-gradient(circle ${GLOW}px at calc(50% + var(--spot-x)) calc(50% - ${LIFT}px + var(--spot-y)), #000 30%, transparent)`,
          }}
        >
          <LinePattern className="text-white/30" />
        </motion.div>

        <AnimatePresence>
          {shown.map((c, k) => {
            const { x, y } = place(k, shown.length);
            const rotate = shown.length === 1 ? 0 : TILTS[c.slot % TILTS.length];
            const glowing = c.id === hovered;
            return (
              <motion.div
                key={c.id}
                className="absolute"
                style={{
                  left: `calc(50% - ${CARD / 2}px)`,
                  top: `calc(50% - ${CARD / 2 + LIFT}px)`,
                }}
                initial={{
                  opacity: 0,
                  scale: 0.4,
                  x: x + GAP / 2,
                  y: y + 12,
                  rotate: rotate - 18,
                }}
                animate={{ opacity: 1, scale: 1, x, y, rotate }}
                exit={{ opacity: 0, scale: 0.6, x: x - GAP / 2 }}
                transition={motionTransitions.springResponsive}
                onHoverStart={() => setHovered(c.id)}
                onHoverEnd={() => setHovered((h) => (h === c.id ? null : h))}
                whileHover={{
                  scale: 1.06,
                  rotate: [rotate, rotate - 7, rotate + 6, rotate - 3, rotate],
                  transition: { duration: 0.45, ease: "easeInOut" },
                }}
              >
                <motion.div
                  animate={still ? undefined : { y: [0, -5, 0], rotate: [0, 1.5, 0] }}
                  transition={{
                    duration: 3.2 + (c.slot % 3) * 0.6,
                    delay: (c.slot % 4) * 0.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className={cn(
                    "relative rounded-2xl bg-white p-1 transition-shadow duration-300",
                    glowing
                      ? "shadow-[0_6px_16px_rgb(0_0_0/0.35),0_0_28px_6px_rgb(255_255_255/0.22)]"
                      : "shadow-[0_6px_16px_rgb(0_0_0/0.35),0_0_0_0_rgb(255_255_255/0)]",
                  )}
                >
                  <div className="size-32 overflow-hidden rounded-xl bg-neutral-200">
                    <CoverImage cover={c.cover} />
                  </div>
                  <AnimatePresence>
                    {c.done && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={motionTransitions.springSnappy}
                        className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow"
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        <div
          className="pointer-events-none absolute inset-x-0 space-y-1 px-6 text-center"
          style={{ top: `calc(50% - ${LIFT}px + ${CARD / 2 + TEXT_GAP}px)` }}
        >
          <div className="font-medium tabular-nums">
            {synced} of {total} synced
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={now}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={motionTransitions.easeFast}
              className="mx-auto max-w-md truncate text-sm text-neutral-400"
            >
              {now}
            </motion.div>
          </AnimatePresence>
          <div className="text-xs text-neutral-600">
            <AnimatePresence mode="wait" initial={false}>
              {note < NOTES.length && (
                <motion.span
                  key={note}
                  className="inline-block"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -3 }}
                  transition={motionTransitions.easeFast}
                >
                  {NOTES[note]}
                </motion.span>
              )}
            </AnimatePresence>
            {failed > 0 && <span className="text-red-400">{note < NOTES.length && " · "}{failed} failed</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
