import { useEffect, useMemo, useState } from "react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { motion } from "motion/react";
import { FolderOpen, History } from "lucide-react";
import { Segmented } from "@/components/segmented";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { motionTransitions } from "@/lib/motion-tokens";
import { handledTracks, labelFor, type HistoryRun, type HistoryStatus } from "@/lib/store";
import { CoverImage, CoverShine } from "@/components/cover-image";
import { cn } from "@/lib/utils";
import { SearchField, matchesQuery } from "@/components/ui/search-field";

type Filter = "all" | "synced" | "released" | "skipped";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "synced", label: "Synced" },
  { value: "released", label: "On DSPs" },
  { value: "skipped", label: "Skipped" },
] as const;

const STATUS: Partial<Record<HistoryStatus, { label: string; tone: BadgeTone }>> = {
  synced: { label: "In local files", tone: "success" },
  released: { label: "On DSPs", tone: "warning" },
  skipped: { label: "Skipped", tone: "neutral" },
};

/** Every track a run has decided on, latest decision first, so the user can see what won't be offered again. */
export function HistoryView({ runs }: { runs: HistoryRun[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // the row whose reveal button is showing. Tracked here and the button left out of the DOM otherwise: a CSS
  // hover/opacity toggle sometimes didn't repaint in the webview, so the icon stayed up until the next scroll
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const clear = () => setActive(null);
    window.addEventListener("blur", clear);
    document.documentElement.addEventListener("mouseleave", clear);
    return () => {
      window.removeEventListener("blur", clear);
      document.documentElement.removeEventListener("mouseleave", clear);
    };
  }, []);
  const all = useMemo(() => [...handledTracks(runs).values()], [runs]);
  // the filter counts follow the search, so they say how many matches each tab holds
  const tracks = useMemo(
    () => all.filter((t) => matchesQuery(query, t.title, t.artist, t.match?.service, labelFor(t.sourceUrl))),
    [all, query],
  );
  const shown = useMemo(() => (filter === "all" ? tracks : tracks.filter((t) => t.status === filter)), [tracks, filter]);
  const count = (f: Filter) => (f === "all" ? tracks.length : tracks.filter((t) => t.status === f).length);

  if (!all.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-900 px-6 py-16 text-center">
        <History className="size-6 text-neutral-600" />
        <div className="font-medium">No history yet</div>
        <div className="text-sm text-neutral-500">Tracks you sync, skip or mark as on DSPs will show up here after a run.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ ...f, label: `${f.label} ${count(f.value)}` }))}
          size="sm"
        />
        <SearchField value={query} onChange={setQuery} placeholder="Search history" size="sm" className="w-56" />
      </div>

      {!shown.length && <div className="py-8 text-center text-sm text-neutral-500">{query ? `No tracks match “${query}”` : "Nothing here yet"}</div>}

      {/* the list outlined with a hairline and ruled off between rows rather than sat on a filled panel, after the grid
          on framer.com/mcp, and rounded like the source bar */}
      {shown.length > 0 && (
        <ul className="divide-y divide-white/[0.1] overflow-hidden rounded-[18px] border border-white/[0.1]">
          {shown.map((t, i) => (
            <motion.li
              key={t.id}
              layout="position"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...motionTransitions.springSmooth, delay: Math.min(i * 0.02, 0.3) }}
              // offscreen rows skip rendering; a long history otherwise paints every cover at once
              className={cn(
                "flex items-center gap-4 px-4 py-3 transition-colors duration-150 [contain-intrinsic-size:auto_121px] [content-visibility:auto]",
                // driven by `active` like the reveal button, since CSS hover didn't always repaint in the webview
                active === t.id && "bg-white/[0.03]",
              )}
              onPointerMove={() => setActive(t.id)}
              onPointerLeave={() => setActive((a) => (a === t.id ? null : a))}
              // keyboard users get the button too once focus is anywhere in the row
              onFocus={() => setActive(t.id)}
              onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setActive((a) => (a === t.id ? null : a))}
            >
              <button
                // a faint light halo round the cover, with the shine over it, like an app icon on black
                className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-neutral-900 shadow-[0_0_16px_-4px_rgb(255_255_255/0.07)]"
                onClick={() => t.url && openUrl(t.url)}
                tabIndex={-1}
                aria-hidden
              >
                <CoverImage cover={t.cover} />
                <CoverShine />
              </button>

              <div className="min-w-0 flex-1 space-y-1">
                <button className="block max-w-full truncate text-left font-semibold hover:underline" onClick={() => t.url && openUrl(t.url)}>
                  {t.title}
                </button>
                <div className="truncate text-neutral-400">{t.artist}</div>
                <div className="truncate text-sm text-neutral-500">
                  {new Date(t.at).toLocaleDateString()} · {labelFor(t.sourceUrl)}
                </div>
                {t.match && (
                  <button
                    className="block max-w-full truncate text-left text-xs text-neutral-500 hover:text-neutral-200"
                    onClick={() => openUrl(t.match!.url)}
                  >
                    {t.match.service}: {t.match.artist} – {t.match.title}
                  </button>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {t.path && (
                  <div className="size-8">
                    {active === t.id && (
                      <button
                        className="flex size-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-900 hover:text-white"
                        onClick={() => revealItemInDir(t.path!)}
                        aria-label="Show in Finder"
                      >
                        <FolderOpen className="size-4" />
                      </button>
                    )}
                  </div>
                )}
                {STATUS[t.status] && (
                  <Badge tone={STATUS[t.status]!.tone} dot>
                    {STATUS[t.status]!.label}
                  </Badge>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
