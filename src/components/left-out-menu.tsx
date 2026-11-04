import { Popover } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { AnimatedNumber } from "@/components/ui/animated-number";

export interface LeftOutTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
  /** Why it was left out, e.g. the matching file or the earlier decision. */
  note: string;
}

export interface LeftOutGroup {
  label: string;
  tracks: LeftOutTrack[];
}

/**
 * Tracks left out of the run (already in local files, or handled in an earlier run). Sits in the run's
 * stats row as one more count, which opens the list so it doesn't crowd the tracks below.
 */
export function LeftOutMenu({ groups }: { groups: LeftOutGroup[] }) {
  const shown = groups.filter((g) => g.tracks.length);
  const total = shown.reduce((n, g) => n + g.tracks.length, 0);
  return (
    <Popover.Root>
      <Popover.Trigger
        disabled={!total}
        className="group -my-1 rounded-lg px-1 py-1 text-left outline-none transition-colors enabled:hover:bg-neutral-900/60 focus-visible:ring-2 focus-visible:ring-neutral-600 data-[state=open]:bg-neutral-900/60"
      >
        <div className="flex items-center gap-1 text-xs text-neutral-500 transition-colors group-enabled:group-hover:text-neutral-300">
          Left out
          {total > 0 && <ChevronDown className="size-3 transition-transform group-data-[state=open]:rotate-180" />}
        </div>
        <AnimatedNumber value={total} className="text-2xl font-semibold tabular-nums" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-96 w-96 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950 p-1 text-sm text-neutral-100 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {shown.map((g) => (
            <section key={g.label}>
              <div className="px-2.5 pt-2 pb-1 text-xs text-neutral-500">
                {g.label} · {g.tracks.length}
              </div>
              <ul>
                {g.tracks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2">
                    <div className="size-9 shrink-0 overflow-hidden rounded-md bg-neutral-900">
                      <CoverImage cover={t.cover} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.title}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {t.artist} · {t.note}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
