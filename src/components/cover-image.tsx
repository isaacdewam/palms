import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// local covers go through Rust once each, then come from here
const cache = new Map<string, Promise<string>>();

/** Turns a cover (http url, data url or local path) into something an <img> can show. Null while loading or if it can't be read. */
export function useCoverSrc(cover: string): string | null {
  const direct = !cover || /^(https?|data):/.test(cover);
  const [src, setSrc] = useState<string | null>(direct ? cover || null : null);
  useEffect(() => {
    if (direct) {
      setSrc(cover || null);
      return;
    }
    let live = true;
    setSrc(null);
    if (!cache.has(cover)) cache.set(cover, api.loadImage(cover).catch(() => (cache.delete(cover), "")));
    cache.get(cover)!.then((s) => live && setSrc(s || null));
    return () => {
      live = false;
    };
  }, [cover, direct]);
  return src;
}

/**
 * The same artwork at thumbnail size, for the small boxes covers are drawn in. Track covers are the full uploads
 * (SoundCloud originals run to 3000px and several MB), which made every list that shows them heavy to scroll.
 * Synced files still embed the original, since this only changes what's displayed.
 */
function thumbnail(cover: string): string {
  if (/sndcdn\.com\//.test(cover)) return cover.replace(/-(original|large|t\d+x\d+|crop)(\.\w+)(\?.*)?$/, "-t300x300$2");
  if (/ytimg\.com\//.test(cover)) return cover.replace(/\/(maxresdefault|sddefault|hqdefault|hq720)(\.\w+)/, "/mqdefault$2");
  return cover;
}

/** A cover image that fills its box, local file or url alike. */
export function CoverImage({ cover, className }: { cover: string; className?: string }) {
  const src = useCoverSrc(thumbnail(cover));
  return src ? <img src={src} alt="" className={cn("size-full object-cover", className)} draggable={false} loading="lazy" decoding="async" /> : null;
}

/**
 * App-icon shine over a cover, after the macOS-style icons on framer.com/mcp: a bright rim along the top edge, a faint
 * light hairline all round, a sheen fading down from the top and a touch of shade at the bottom. Goes last inside a
 * `relative` box and takes that box's rounding.
 */
export function CoverShine({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit]",
        "bg-[linear-gradient(180deg,rgb(255_255_255/0.14),transparent_38%,transparent_72%,rgb(0_0_0/0.14))]",
        "shadow-[inset_0_1.5px_0_rgb(255_255_255/0.3),inset_0_0_0_1px_rgb(255_255_255/0.1),inset_0_-1px_0_rgb(0_0_0/0.3)]",
        className,
      )}
    />
  );
}
