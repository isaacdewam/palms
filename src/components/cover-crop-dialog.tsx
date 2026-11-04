import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { Dialog } from "radix-ui";
import { AnimatePresence, motion } from "motion/react";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";
import { api } from "@/lib/api";
import { motionTransitions } from "@/lib/motion-tokens";

const VIEW = 320;
const PREVIEW = 56;
const OUTPUT = 1000;
const MAX_ZOOM = 4;

interface Loaded {
  src: string;
  img: HTMLImageElement;
}

/** Square crop for a track cover: drag to pan, scroll or slide to zoom, optionally swap in a local file first. */
export function CoverCropDialog({
  open,
  source,
  id,
  onClose,
  onApply,
}: {
  open: boolean;
  /** The uncropped image to frame, url or local path. */
  source: string;
  id: string;
  onClose: () => void;
  /** Gets the saved crop's path and the source it was cut from. */
  onApply: (cover: string, source: string) => void;
}) {
  const [current, setCurrent] = useState(source);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (open) setCurrent(source);
  }, [open, source]);

  // always load through Rust, so a remote image doesn't taint the canvas
  useEffect(() => {
    if (!open || !current) return;
    let live = true;
    setLoaded(null);
    setError(null);
    api
      .loadImage(current)
      .then(
        (src) =>
          new Promise<Loaded>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ src, img });
            img.onerror = () => reject(new Error("That file isn't an image Palms can read."));
            img.src = src;
          }),
      )
      .then((l) => {
        if (!live) return;
        const s = VIEW / Math.min(l.img.naturalWidth, l.img.naturalHeight);
        setLoaded(l);
        setZoom(1);
        setPos({ x: (VIEW - l.img.naturalWidth * s) / 2, y: (VIEW - l.img.naturalHeight * s) / 2 });
      })
      .catch((e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [open, current]);

  const w = loaded?.img.naturalWidth ?? 1;
  const h = loaded?.img.naturalHeight ?? 1;
  const scaleFor = (z: number) => (VIEW / Math.min(w, h)) * z;
  const scale = scaleFor(zoom);
  // the image always covers the frame, so there's never an empty edge in the crop
  const clamp = (x: number, y: number, s: number) => ({
    x: Math.min(0, Math.max(VIEW - w * s, x)),
    y: Math.min(0, Math.max(VIEW - h * s, y)),
  });

  const zoomTo = (z: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    const s2 = scaleFor(next);
    // keep the point under the frame's center fixed
    const cx = (VIEW / 2 - pos.x) / scale;
    const cy = (VIEW / 2 - pos.y) / scale;
    setZoom(next);
    setPos(clamp(VIEW / 2 - cx * s2, VIEW / 2 - cy * s2, s2));
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ...pos };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (d) setPos(clamp(d.x + e.clientX - d.px, d.y + e.clientY - d.py, scale));
  };
  const onWheel = (e: WheelEvent) => zoomTo(zoom * Math.exp(-e.deltaY * 0.002));

  const replace = async () => {
    const f = await openFile({ multiple: false, filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    if (typeof f === "string") setCurrent(f);
  };

  const apply = async () => {
    if (!loaded) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = OUTPUT;
      canvas.getContext("2d")!.drawImage(loaded.img, -pos.x / scale, -pos.y / scale, VIEW / scale, VIEW / scale, 0, 0, OUTPUT, OUTPUT);
      const path = await api.saveCover(id, canvas.toDataURL("image/jpeg", 0.92));
      onApply(path, current);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const layer = (size: number) =>
    loaded && (
      <img
        src={loaded.src}
        alt=""
        draggable={false}
        className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
        style={{
          width: w * scale * (size / VIEW),
          height: h * scale * (size / VIEW),
          transform: `translate(${pos.x * (size / VIEW)}px, ${pos.y * (size / VIEW)}px)`,
        }}
      />
    );

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
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed top-1/2 left-1/2 z-50 w-[384px] -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-neutral-100 shadow-2xl outline-none"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={motionTransitions.springSmooth}
              >
                <div className="flex items-center justify-between">
                  <Dialog.Title className="font-medium">Crop cover</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" className="rounded-md" aria-label="Close">
                      <X className="size-4" />
                    </Button>
                  </Dialog.Close>
                </div>

                <div
                  className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-xl bg-neutral-900 active:cursor-grabbing"
                  style={{ width: VIEW, height: VIEW }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => (drag.current = null)}
                  onWheel={onWheel}
                >
                  {layer(VIEW)}
                  {loaded ? (
                    // thirds guide, so centering a face or logo is easy
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="border-[0.5px] border-white/15" />
                      ))}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-500">
                      {error ?? (current ? <Loader size={18} variant="arc" /> : "No cover yet. Choose an image.")}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative shrink-0 overflow-hidden rounded-lg bg-neutral-900" style={{ width: PREVIEW, height: PREVIEW }}>
                    {layer(PREVIEW)}
                  </div>
                  <label className="flex-1 space-y-1.5">
                    <span className="text-xs text-neutral-500">Zoom</span>
                    <input
                      type="range"
                      min={1}
                      max={MAX_ZOOM}
                      step={0.01}
                      value={zoom}
                      disabled={!loaded}
                      onChange={(e) => zoomTo(Number(e.target.value))}
                      className="w-full accent-neutral-100"
                    />
                  </label>
                </div>

                {error && loaded && <div className="text-xs text-red-400">{error}</div>}

                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" onClick={replace}>
                    <ImagePlus className="size-4" /> Replace image
                  </Button>
                  <Button onClick={apply} disabled={!loaded || saving}>
                    {saving ? "Saving" : "Apply"}
                  </Button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
