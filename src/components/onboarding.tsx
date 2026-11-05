import { useEffect, useState, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { Folder, FolderOpen, FolderPlus, Loader2, Star } from "lucide-react";
import { PalmsLogo } from "@/components/palms-logo";
import { HEADER_HEIGHT } from "@/components/app-header";
import { Segmented } from "@/components/segmented";
import { api } from "@/lib/api";
import { motionTransitions } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";

const primary =
  "h-11 rounded-[10px] bg-neutral-100 px-6 text-[15px] font-semibold text-neutral-950 transition-all hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
const enter = {
  initial: { opacity: 0, y: 10, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -10, filter: "blur(4px)" },
  transition: motionTransitions.springGentle,
};

/** "Step n of 2" with a bar per step; the folder screen is step 1, the dashboard tip step 2. */
export function StepBar({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-neutral-400">
      {[1, 2].map((n) => (
        <span key={n} className={cn("h-1 w-10 rounded-full", n <= step ? "bg-neutral-100" : "bg-neutral-800")} />
      ))}
      <span className="ml-2">Step {step} of 2</span>
    </div>
  );
}

function splitPath(p: string) {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i < 0 ? { parent: p, name: "" } : { parent: p.slice(0, i) || "/", name: p.slice(i + 1) };
}

const pane = (shown: boolean) =>
  cn("[grid-area:1/1] transition-opacity duration-200", !shown && "pointer-events-none opacity-0");

const MODES = [
  { value: "new", label: "Create a new folder", icon: FolderPlus },
  { value: "existing", label: "Use an existing folder", icon: FolderOpen },
] as const;

/** First run, over everything: a welcome screen, then creating a new local files folder or picking one that's already there. */
export function Onboarding({ folder, onDone }: { folder: string; onDone: (folder: string) => void }) {
  const [step, setStep] = useState<"welcome" | "folder">("welcome");
  const [mode, setMode] = useState<"new" | "existing">("new");
  // the folder picked in "existing" mode; nothing until the user picks one
  const [existing, setExisting] = useState<string | null>(null);
  const [parent, setParent] = useState(() => splitPath(folder).parent);
  const [name, setName] = useState("Local Files");
  const [home, setHome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    homeDir().then(setHome).catch(() => {});
  }, []);

  const sep = parent.includes("\\") ? "\\" : "/";
  const full = `${parent.replace(/[\\/]$/, "")}${sep}${name.trim()}`;
  const tilde = (p: string) => (home && p.startsWith(home) ? `~${p.slice(home.replace(/[\\/]$/, "").length)}` : p);
  const badName = !name.trim() || /[\\/]/.test(name) || name.trim() === "." || name.trim() === "..";

  const chooseLocation = async () => {
    const f = await open({ directory: true, defaultPath: parent });
    if (typeof f === "string") setParent(f);
  };
  const chooseExisting = async () => {
    const f = await open({ directory: true, defaultPath: existing ?? parent });
    if (typeof f === "string") setExisting(f);
  };
  const canContinue = !busy && (mode === "existing" ? Boolean(existing) : !badName);
  const next = async () => {
    if (!canContinue) return;
    if (mode === "existing") return onDone(existing!);
    setBusy(true);
    setError(null);
    try {
      onDone(await api.makeDir(parent, name));
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-black text-neutral-100"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      // flat black for the welcome; the folder step gets a soft white glow
      style={step === "folder" ? { backgroundImage: "radial-gradient(ellipse 70% 60% at 40% 45%, rgb(255 255 255 / 0.045), transparent 70%)" } : undefined}
    >
      {/* the native title bar is hidden, so this strip moves the window */}
      <div data-tauri-drag-region className="shrink-0" style={{ height: HEADER_HEIGHT }} />
      <div className="flex min-h-0 flex-1 flex-col px-14 pb-14">
        <AnimatePresence mode="wait" initial={false}>
          {step === "welcome" ? (
            <motion.section key="welcome" {...enter} className="my-auto max-w-3xl">
              <PalmsLogo className="h-[clamp(110px,18vh,156px)] w-auto text-[#f2efe9]" />
              <h1 className="mt-10 max-w-[720px] text-[clamp(40px,5.2vw,58px)] leading-[1.04] font-semibold tracking-[-0.03em] text-[#f2efe9] lowercase">
                your music, even when it isn’t on streaming
              </h1>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-neutral-400">
                palms finds tracks without an official release and saves them as tagged mp3s to your local files.
              </p>
              <button autoFocus className={cn(primary, "mt-9")} onClick={() => setStep("folder")}>
                Get started
              </button>
            </motion.section>
          ) : (
            <motion.section key="folder" {...enter} className="my-auto w-full max-w-[720px]">
              <StepBar step={1} />
              <h1 className="mt-6 text-[clamp(36px,5vw,56px)] leading-[1.05] font-semibold tracking-[-0.03em] lowercase">
                choose your local files folder
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-neutral-400">
                palms saves tagged mp3s here. add this folder to your local files and new tracks show up in your library.
              </p>

              <Segmented value={mode} onChange={setMode} options={MODES} className="mt-8" />

              {/* both panes share one grid cell, so the block keeps the taller one's height and doesn't shift (it's centred
                  vertically, and a shift made the switcher's pill jump instead of sliding) */}
              <div className="mt-4 grid">
                <div className={pane(mode === "new")} inert={mode !== "new"}>
                  <div className="divide-y divide-neutral-800 rounded-[14px] border border-neutral-800 bg-neutral-900">
                    <div className="flex items-center gap-3 py-2.5 pr-2.5 pl-4">
                      <Folder className="size-[18px] shrink-0 text-neutral-500" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-neutral-500">Location</div>
                        <div className="truncate text-[15px]">{tilde(parent)}</div>
                      </div>
                      <button
                        onClick={chooseLocation}
                        className="h-10 shrink-0 rounded-[10px] border border-neutral-700 px-4 text-sm font-medium transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                      >
                        Choose location
                      </button>
                    </div>
                    <label className="flex items-center gap-3 py-3 pr-4 pl-4">
                      <span className="w-[18px] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-neutral-500">Folder name</div>
                        <input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && next()}
                          spellCheck={false}
                          className="w-full bg-transparent text-[15px] outline-none placeholder:text-neutral-600"
                          placeholder="Local Files"
                        />
                      </div>
                    </label>
                  </div>

                  <p className={cn("mt-3 text-[13px]", error || (badName && name) ? "text-red-400" : "text-neutral-500")}>
                    {error ??
                      (badName
                        ? name && "use a folder name without slashes."
                        : `palms creates ${tilde(full)}. add this folder to your local files.`)}
                  </p>
                </div>
                <div className={pane(mode === "existing")} inert={mode !== "existing"}>
                  <div className="flex items-center gap-3 rounded-[14px] border border-neutral-800 bg-neutral-900 py-2.5 pr-2.5 pl-4">
                    <Folder className="size-[18px] shrink-0 text-neutral-500" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-neutral-500">Folder</div>
                      <div className={cn("truncate text-[15px]", !existing && "text-neutral-500")}>
                        {existing ? tilde(existing) : "No folder chosen yet"}
                      </div>
                    </div>
                    <button
                      onClick={chooseExisting}
                      className="h-10 shrink-0 rounded-[10px] border border-neutral-700 px-4 text-sm font-medium transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                    >
                      {existing ? "Change folder" : "Choose folder"}
                    </button>
                  </div>
                  <p className="mt-3 text-[13px] text-neutral-500">
                    {existing
                      ? "palms saves into this folder and skips tracks already in it."
                      : "pick the folder you already use for local files."}
                  </p>
                </div>
              </div>

              <div className="mt-10 flex items-center justify-end gap-3">
                <button
                  onClick={() => setStep("welcome")}
                  className="h-11 rounded-[10px] px-5 text-[15px] font-medium text-neutral-400 transition-colors hover:text-neutral-100"
                >
                  Back
                </button>
                <button className={cn(primary, "flex items-center gap-2")} disabled={!canContinue} onClick={next}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  {mode === "new" ? "Create folder" : "Continue"}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * Step 2: dims the dashboard around `target` (the source bar) and points at it. The bar stays usable through the
 * hole; clicking anywhere else or pressing Escape closes the tip.
 */
export function StartCoach({ target, onClose }: { target: RefObject<HTMLElement | null>; onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  // shortcut: re-measures every frame so the hole follows the bar's enter animation and window resizes; it only runs while the tip shows
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const r = target.current?.getBoundingClientRect();
      if (r)
        setRect((p) => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p : r));
      id = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(id);
  }, [target]);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!target.current?.contains(t) && !(t as Element).closest?.("[data-coach]")) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [target, onClose]);
  if (!rect) return null;

  const pad = 8;
  const mid = rect.left + rect.width / 2;
  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* the hole: everything around it is shadow, which clicks pass straight through */}
      <div
        className="absolute rounded-[26px] border border-neutral-100/80 shadow-[0_0_0_100vmax_rgb(0_0_0/0.78)]"
        style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
      />
      <div
        className="absolute flex w-[min(560px,90vw)] -translate-x-1/2 -translate-y-full flex-col items-center text-center"
        style={{ top: rect.top - pad - 56, left: mid }}
      >
        <StepBar step={2} />
        <h2 className="mt-5 text-[44px] leading-[1.05] font-semibold tracking-[-0.03em] text-neutral-100 lowercase">
          start by pasting a link
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">
          paste a soundcloud or youtube link. palms scans every track for an official release first, then saves the rest as tagged mp3s.
        </p>
      </div>
      <div
        className="absolute flex w-[min(560px,90vw)] -translate-x-1/2 flex-col items-center gap-5 text-center"
        style={{ top: rect.bottom + pad + 22, left: mid }}
      >
        <p className="flex items-center gap-2 text-sm text-neutral-300">
          <Star className="size-4" />
          star a link to save it here for next time.
        </p>
        <button data-coach className={cn(primary, "pointer-events-auto h-10 px-5 text-sm")} onClick={onClose}>
          Got it
        </button>
      </div>
    </motion.div>
  );
}
