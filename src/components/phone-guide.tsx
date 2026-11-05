import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motionTransitions } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";
import { DeviceScene, type SceneState } from "@/components/device-scene";

const DESKTOP_SHOT = "/tutorial/desktop-palms.png";
const PHONE_BEFORE = "/tutorial/phone-palms-greyed.png";
const PHONE_DOWNLOADED = "/tutorial/phone-palms-synced.png";

/** Spots and loupes are fractions of the screenshots: the desktop one is 2000×1109, the phone ones 921×2000. */
const STEPS: { title: string; body: string; scene: SceneState }[] = [
  {
    title: "Make a playlist on your computer",
    body: "In the Spotify desktop app, open Local Files and add your synced tracks to a playlist.",
    scene: {
      show: "monitor",
      focus: "monitor",
      phoneShot: PHONE_BEFORE,
      // Local Files in the sidebar, and the synced tracks in the playlist
      monitorSpots: [
        { x: 0.008, y: 0.166, w: 0.096, h: 0.047 },
        { x: 0.2, y: 0.464, w: 0.768, h: 0.128 },
      ],
      phoneSpots: [],
      linked: false,
    },
  },
  {
    title: "Download it on your phone",
    body: "Open the same playlist on your phone and tap the download arrow. Your phone and computer have to be on the same Wi-Fi network. Tracks stay greyed out until they download.",
    scene: {
      show: "both",
      focus: "phone",
      phoneShot: PHONE_BEFORE,
      monitorSpots: [],
      // the download arrow under the playlist's name
      phoneSpots: [{ x: 0.034, y: 0.502, w: 0.06, h: 0.028, round: true }],
      linked: true,
      loupe: { cx: 0.1, cy: 0.516, span: 0.24 },
    },
  },
  {
    title: "Start listening",
    body: "Once the tracks show a green arrow they're on your phone, and you can add them to any playlist you like.",
    scene: {
      show: "phone",
      focus: "phone",
      phoneShot: PHONE_DOWNLOADED,
      monitorSpots: [],
      phoneSpots: [],
      linked: false,
      // resting on Masterclass, the track that's playing
      cursor: { x: 0.64, y: 0.77 },
    },
  },
];

const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
};

/** Animates its height to fit its content, so swapping slides of different lengths eases instead of jumping. */
function AutoHeight({ children }: { children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const el = inner.current!;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div initial={false} animate={{ height }} transition={motionTransitions.springGentle} className="overflow-hidden">
      <div ref={inner}>{children}</div>
    </motion.div>
  );
}

/**
 * Walkthrough for getting synced tracks from Spotify on the computer onto a phone.
 * After a sync (`synced` set) it asks first, and both the prompt and the last step offer a way to never show it again;
 * from Settings it goes straight to step one.
 */
export function PhoneGuide({
  open,
  synced,
  onClose,
  onNever,
}: {
  open: boolean;
  /** How many tracks the sync just put in local files; null when opened by hand. */
  synced: number | null;
  onClose: () => void;
  /** Stops it opening after syncs. */
  onNever: () => void;
}) {
  // -1 is the "want to see how?" prompt
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  // held so the prompt keeps its count while it animates out
  const [count, setCount] = useState(0);
  // opened by a sync rather than from Settings, held for the same reason
  const [fromSync, setFromSync] = useState(false);
  // separate refs: the prompt and the steps are both mounted while one animates out, and the leaving one would clear a shared ref
  const promptPrimary = useRef<HTMLButtonElement>(null);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setStep(synced === null ? 0 : -1);
      setDir(1);
      setCount(synced ?? 0);
      setFromSync(synced !== null);
    }
  }, [open, synced]);

  // keep focus on the main button as the prompt swaps for the steps
  useEffect(() => {
    if (open) (step < 0 ? promptPrimary : primary).current?.focus();
  }, [open, step]);

  const go = (to: number) => {
    if (to < 0 || to >= STEPS.length) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
  };

  useEffect(() => {
    if (!open || step < 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={motionTransitions.easeFast}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={undefined}
              // start on the main action, so Enter doesn't land on "Don't show again"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (step < 0 ? promptPrimary : primary).current?.focus();
              }}
            >
              <motion.div
                className="fixed top-1/2 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-100 shadow-2xl outline-none"
                // the prompt is a short question; the steps widen it to fit the computer-and-phone picture
                initial={{ opacity: 0, scale: 0.96, width: step < 0 ? 420 : 760 }}
                animate={{ opacity: 1, scale: 1, width: step < 0 ? 420 : 760 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={motionTransitions.springSmooth}
              >
                {/* padding lives inside the animated box so focus rings at the edges aren't clipped */}
                <AutoHeight>
                  <div className="relative p-5">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {step < 0 ? (
                        <motion.div
                          key="prompt"
                          className="space-y-5"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={motionTransitions.easeFast}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-neutral-900">
                              <Smartphone className="size-4 text-neutral-300" />
                            </div>
                            <div className="space-y-1">
                              <Dialog.Title className="font-medium">Put them on your phone?</Dialog.Title>
                              <p className="text-sm leading-relaxed text-neutral-400">
                                {count} {count === 1 ? "track is" : "tracks are"} in your local files. It takes three steps to get them onto your
                                phone.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <Button
                              variant="ghost"
                              className="text-neutral-500"
                              onClick={() => {
                                onNever();
                                onClose();
                              }}
                            >
                              Don't show again
                            </Button>
                            <div className="flex gap-2">
                              <Button variant="ghost" onClick={onClose}>
                                Not now
                              </Button>
                              <Button ref={promptPrimary} onClick={() => go(0)}>
                                Show me how
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="steps"
                          className="space-y-4"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={motionTransitions.easeFast}
                        >
                          <div className="flex items-center justify-between">
                            <Dialog.Title className="text-xs font-medium tracking-wide text-neutral-500 uppercase tabular-nums">
                              Step {step + 1} of {STEPS.length}
                            </Dialog.Title>
                            <Dialog.Close asChild>
                              <Button variant="ghost" size="icon" className="rounded-md" aria-label="Close">
                                <X className="size-4" />
                              </Button>
                            </Dialog.Close>
                          </div>

                          {/* one setup for every step: the devices stay put and the step changes which is in focus */}
                          <div className="-mx-5 overflow-hidden border-y border-neutral-900 bg-neutral-900/40 py-3">
                            <DeviceScene state={s.scene} desktopShot={DESKTOP_SHOT} stepKey={step} />
                          </div>

                          {/* popLayout: the old text leaves while the new one comes in, so the dialog's height eases between them */}
                          <div className="relative">
                            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                              <motion.div
                                key={step}
                                custom={dir}
                                variants={slide}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={motionTransitions.easeSoft}
                                className="space-y-1"
                              >
                                <h3 className="font-medium">{s.title}</h3>
                                <p className="text-sm leading-relaxed text-neutral-400">{s.body}</p>
                              </motion.div>
                            </AnimatePresence>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex gap-1.5">
                              {STEPS.map((t, i) => (
                                <button
                                  key={t.title}
                                  onClick={() => go(i)}
                                  aria-label={`Step ${i + 1}`}
                                  aria-current={i === step ? "step" : undefined}
                                  className={cn(
                                    "h-1.5 rounded-full transition-all duration-300",
                                    i === step ? "w-5 bg-neutral-100" : "w-1.5 bg-neutral-700 hover:bg-neutral-500",
                                  )}
                                />
                              ))}
                            </div>
                            <div className="flex gap-2">
                              {last && fromSync && (
                                <Button
                                  variant="ghost"
                                  className="text-neutral-500"
                                  onClick={() => {
                                    onNever();
                                    onClose();
                                  }}
                                >
                                  Don't show again
                                </Button>
                              )}
                              {step > 0 && (
                                <Button variant="ghost" onClick={() => go(step - 1)}>
                                  <ArrowLeft /> Back
                                </Button>
                              )}
                              <Button ref={primary} onClick={last ? onClose : () => go(step + 1)}>
                                {last ? "Done" : "Next"} {!last && <ArrowRight />}
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </AutoHeight>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
