import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Loader2, RotateCcw, Star, X } from "lucide-react";
import { detectPlatform, type Platform } from "@/lib/api";
import { motionTransitions } from "@/lib/motion-tokens";
import type { Checkpoint, Sources } from "@/lib/store";
import { cn } from "@/lib/utils";

const PLATFORM_NAME: Record<Platform, string> = { soundcloud: "SoundCloud", youtube: "YouTube" };
/** Each service's logo colour, used for the little marker beside a link. */
const PLATFORM_COLOR: Record<Platform, string> = { soundcloud: "#FF5500", youtube: "#FF0033" };

function PlatformDot({ platform }: { platform: Platform }) {
  return <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[platform] }} />;
}

export function SourceBar({
  url,
  onUrlChange,
  onRun,
  busy,
  next,
  sources,
  onSave,
  onRemove,
  onMakeDefault,
  checkpoint,
  onResetCheckpoint,
  limit,
}: {
  url: string;
  onUrlChange: (u: string) => void;
  onRun: () => void;
  busy: boolean;
  /** Scraping is the next step (nothing is waiting on review), so the button gets the moving shine. */
  next: boolean;
  sources: Sources;
  onSave: () => void;
  onRemove: (url: string) => void;
  onMakeDefault: (url: string) => void;
  checkpoint: Checkpoint | null;
  onResetCheckpoint: () => void;
  limit: number;
}) {
  const trimmed = url.trim();
  const platform = detectPlatform(trimmed);
  const isSaved = sources.saved.some((s) => s.url === trimmed);
  const canRun = !busy && Boolean(platform);

  return (
    // one box: the link row on top, saved links along the bottom
    <section className="rounded-[18px] border border-neutral-800 bg-neutral-900 px-2 pt-1 pb-2 transition-colors focus-within:border-neutral-700">
      <div className="flex h-12 items-center gap-1">
        {/* filled once the link is saved; pressing it again unsaves it */}
        <button
          onClick={() => (isSaved ? onRemove(trimmed) : onSave())}
          disabled={!platform}
          aria-label={isSaved ? "Remove saved link" : "Save this link"}
          aria-pressed={isSaved}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
            isSaved ? "text-neutral-100" : "text-neutral-400 hover:text-neutral-100",
          )}
        >
          <Star className={cn("size-[18px]", isSaved && "fill-current")} />
        </button>

        <input
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-[15px] text-neutral-100 outline-none placeholder:text-neutral-500"
          placeholder="Paste a SoundCloud likes link, playlist or YouTube playlist"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && canRun && onRun()}
        />

        <AnimatePresence>
          {trimmed && (
            <motion.span
              key={platform ?? "unknown"}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={motionTransitions.easeFast}
              className={cn("mr-2 flex shrink-0 items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs", platform ? "font-medium" : "text-red-400")}
              // tinted with the service's logo colour, solid so it doesn't pick up what's behind it
              style={
                platform
                  ? {
                      backgroundColor: `color-mix(in srgb, ${PLATFORM_COLOR[platform]} 24%, #171717)`,
                      // near-white with a hint of the brand, so it reads clearly against the tinted fill
                      color: `color-mix(in srgb, ${PLATFORM_COLOR[platform]} 12%, white)`,
                    }
                  : undefined
              }
            >
              {platform && <PlatformDot platform={platform} />}
              {platform ? PLATFORM_NAME[platform] : "Unsupported link"}
            </motion.span>
          )}
        </AnimatePresence>

        <button
          onClick={onRun}
          disabled={!canRun}
          aria-label="Scrape"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-95",
            canRun ? "bg-neutral-100 text-neutral-950 hover:bg-white" : "cursor-not-allowed bg-neutral-800 text-neutral-500",
            // a soft glow when scraping is the next thing to do
            canRun && next && "shadow-[0_0_20px_-4px_rgba(255,255,255,0.45)]",
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-[18px]" />}
        </button>
      </div>

      <div className="flex items-start justify-between gap-4 border-t border-neutral-800/70 px-2 pt-2.5 pb-1">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {sources.saved.map((s) => {
              const active = s.url === trimmed;
              const isDefault = s.url === sources.defaultUrl;
              return (
                <motion.div
                  key={s.url}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={motionTransitions.springSnappy}
                  className={cn(
                    "group flex h-8 items-center gap-1 rounded-[10px] border pr-1 pl-1 text-xs transition-colors",
                    active ? "border-neutral-600 bg-neutral-800 text-neutral-100" : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-100",
                  )}
                >
                  <button
                    className={cn("rounded-[6px] p-1", isDefault ? "text-neutral-100" : "text-neutral-600 hover:text-neutral-300")}
                    onClick={() => onMakeDefault(s.url)}
                    aria-label={isDefault ? "Default source" : "Make default"}
                  >
                    <Star className={cn("size-3.5", isDefault && "fill-current")} />
                  </button>
                  <button
                    className="flex max-w-56 items-center gap-1.5"
                    onClick={() => onUrlChange(s.url)}
                    disabled={busy}
                  >
                    <PlatformDot platform={s.platform} />
                    <span className="truncate">{s.label}</span>
                  </button>
                  <button
                    className="rounded-[6px] p-1 text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-neutral-200"
                    onClick={() => onRemove(s.url)}
                    aria-label="Remove saved link"
                  >
                    <X className="size-3" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {!sources.saved.length && <span className="py-2 text-xs text-neutral-600">Links you star show up here.</span>}
        </div>

        <div className="shrink-0 py-2 text-xs text-neutral-500">
          {checkpoint ? (
            <span className="flex items-center gap-3">
              <span>
                {checkpoint.seenIds.length} handled · last run {checkpoint.lastRun ? new Date(checkpoint.lastRun).toLocaleString() : "never"}
              </span>
              <button className="flex items-center gap-1 hover:text-neutral-200" onClick={onResetCheckpoint}>
                <RotateCcw className="size-3.5" /> Reset
              </button>
            </span>
          ) : (
            platform && <span>First scan looks at up to {limit} tracks</span>
          )}
        </div>
      </div>
    </section>
  );
}
