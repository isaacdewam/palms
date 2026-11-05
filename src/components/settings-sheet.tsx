import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, FolderOpen, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motionTransitions } from "@/lib/motion-tokens";
import { api } from "@/lib/api";
import type { Settings } from "@/lib/store";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="px-1 pb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">{title}</h3>
      <div className="divide-y divide-neutral-900 rounded-xl border border-neutral-900 bg-neutral-900/30">{children}</div>
    </section>
  );
}

/** Label and description on the left, control on the right; `below` spans the full width. */
function Row({ label, description, control, below }: { label: string; description?: ReactNode; control?: ReactNode; below?: ReactNode }) {
  return (
    <div className="space-y-3 px-4 py-3.5">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 space-y-0.5">
          <div className="text-sm font-medium text-neutral-100">{label}</div>
          {description && <div className="text-xs leading-relaxed text-neutral-500">{description}</div>}
        </div>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {below}
    </div>
  );
}

/** A destructive button that asks first, inline: one click shows what will happen, a second does it. */
function ConfirmAction({
  label,
  prompt,
  run,
  disabled,
}: {
  label: string;
  /** What the confirm step says; may look things up first. */
  prompt: () => Promise<string>;
  /** Does the thing and says how it went. */
  run: () => Promise<string>;
  disabled?: boolean;
}) {
  const [state, setState] = useState<{ step: "idle" } | { step: "confirm" | "done"; text: string } | { step: "working" }>({ step: "idle" });

  // The result line is a one-off receipt; left up, it reads like the current state.
  useEffect(() => {
    if (state.step !== "done") return;
    const t = setTimeout(() => setState({ step: "idle" }), 4000);
    return () => clearTimeout(t);
  }, [state]);

  const ask = async () => {
    try {
      setState({ step: "confirm", text: await prompt() });
    } catch (e) {
      setState({ step: "done", text: String(e) });
    }
  };
  const go = async () => {
    setState({ step: "working" });
    try {
      setState({ step: "done", text: await run() });
    } catch (e) {
      setState({ step: "done", text: String(e) });
    }
  };

  if (state.step === "confirm" || state.step === "working") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-red-500/10 px-3 py-2">
        <span className="text-xs text-red-200">{state.step === "confirm" ? state.text : "Working…"}</span>
        <div className="flex shrink-0 gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setState({ step: "idle" })} disabled={state.step === "working"}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={go} disabled={state.step === "working"}>
            Confirm
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-neutral-500">{state.step === "done" ? state.text : ""}</span>
      <Button variant="destructive" onClick={ask} disabled={disabled}>
        <Trash2 /> {label}
      </Button>
    </div>
  );
}

const files = (n: number) => `${n} audio file${n === 1 ? "" : "s"}`;

export function SettingsSheet({
  open,
  onClose,
  settings,
  onChange,
  onPickFolder,
  busy,
  onResetAll,
  onOpenPhoneGuide,
}: {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  onPickFolder: () => void;
  /** A run is going, so nothing gets cleared out from under it. */
  busy: boolean;
  /** Clears the folder and forgets all history; resolves to how many files went. */
  onResetAll: () => Promise<number>;
  onOpenPhoneGuide: () => void;
}) {
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const spotifySet = Boolean(settings.spotify.clientId && settings.spotify.clientSecret);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={motionTransitions.easeFast}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Settings"
            className="fixed inset-y-2 right-2 z-50 flex w-[420px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
            initial={{ x: "calc(100% + 1rem)" }}
            animate={{ x: 0 }}
            exit={{ x: "calc(100% + 1rem)" }}
            transition={motionTransitions.springSmooth}
          >
            <div className="flex items-center justify-between border-b border-neutral-900 px-5 py-4">
              <h2 className="font-semibold tracking-tight">Settings</h2>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings">
                <X />
              </Button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <Section title="Library">
                <Row
                  label="Local files folder"
                  description="Spotify reads synced tracks from here. Add it once in Spotify → Settings → Your Library → Local Files."
                  below={
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 truncate rounded-lg bg-neutral-900 px-3 py-2 font-mono text-xs text-neutral-300">
                        {settings.folder}
                      </div>
                      <Button variant="outline" onClick={onPickFolder}>
                        <FolderOpen /> Change
                      </Button>
                    </div>
                  }
                />
              </Section>

              <Section title="On your phone">
                <Row
                  label="Phone guide"
                  description="Three steps for getting synced tracks from Spotify on your computer onto your phone. Always here, even if you've hidden it after syncs."
                  control={
                    <Button variant="outline" onClick={onOpenPhoneGuide}>
                      Open <ArrowRight />
                    </Button>
                  }
                />
              </Section>

              <Section title="Sync">
                <Row
                  label="Tracks per scan"
                  description="How far back the first scan of a new source looks."
                  control={
                    <input
                      type="number"
                      min={1}
                      className="field w-20 text-right text-sm tabular-nums"
                      value={settings.limit}
                      onChange={(e) => onChange({ limit: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  }
                />
              </Section>

              <Section title="Release check">
                <Row
                  label="Spotify API"
                  description="Optional. Also searches Spotify's catalogue, which catches more released tracks."
                  control={
                    <button
                      className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100"
                      onClick={() => setSpotifyOpen((o) => !o)}
                      aria-expanded={spotifyOpen}
                    >
                      {spotifySet ? "Connected" : "Not set"}
                      <motion.span animate={{ rotate: spotifyOpen ? 180 : 0 }} transition={motionTransitions.springSnappy}>
                        <ChevronDown className="size-3.5" />
                      </motion.span>
                    </button>
                  }
                  below={
                    <AnimatePresence initial={false}>
                      {spotifyOpen && (
                        <motion.div
                          className="overflow-hidden"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={motionTransitions.springGentle}
                        >
                          <div className="space-y-2 pt-1">
                            <input
                              className="field w-full text-sm"
                              placeholder="Client ID"
                              value={settings.spotify.clientId}
                              onChange={(e) => onChange({ spotify: { ...settings.spotify, clientId: e.target.value } })}
                            />
                            <input
                              type="password"
                              className="field w-full text-sm"
                              placeholder="Client secret"
                              value={settings.spotify.clientSecret}
                              onChange={(e) => onChange({ spotify: { ...settings.spotify, clientSecret: e.target.value } })}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  }
                />
              </Section>

              <Section title="Reset">
                <Row
                  label="Reset everything"
                  description="Clears the folder and forgets all history and scan checkpoints, so every track is offered again. Saved links and settings stay."
                  below={
                    <ConfirmAction
                      label="Reset all"
                      disabled={busy}
                      prompt={async () => `Move ${files(await api.countAudio(settings.folder))} to the Trash and erase all history?`}
                      run={async () => `Moved ${files(await onResetAll())} to the Trash and cleared history.`}
                    />
                  }
                />
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
