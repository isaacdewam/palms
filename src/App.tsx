import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { message, open } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Lenis from "lenis";
import { ArrowLeft, CaseLower, CaseSensitive, CaseUpper, Download, ImagePlus, Settings2, UserRoundPen, UserRoundPlus, X } from "lucide-react";
import { AppHeader, HEADER_HEIGHT } from "@/components/app-header";
import { Backdrop } from "@/components/backdrop";
import { PalmsLogo } from "@/components/palms-logo";
import { SettingsSheet } from "@/components/settings-sheet";
import { PhoneGuide } from "@/components/phone-guide";
import { SourceBar } from "@/components/source-bar";
import { StatusCorner, StatusMenu } from "@/components/status-menu";
import { CoverImage } from "@/components/cover-image";
import { SYNC_SLOTS, SyncingCovers } from "@/components/syncing-covers";
import { CoverCropDialog } from "@/components/cover-crop-dialog";
import { SelectionActions } from "@/components/selection-actions";
import type { LeftOutTrack } from "@/components/left-out-menu";
import { EmptyState } from "@/components/empty-state";
import { HistoryView } from "@/components/history-view";
import { RunSteps, type Phase } from "@/components/run-steps";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { SmoothTabs } from "@/components/ui/smooth-tabs";
import { SearchField, matchesQuery } from "@/components/ui/search-field";
import { UndoToast } from "@/components/ui/undo-toast";
import { api, detectPlatform, type DspMatch, type RawTrack } from "@/lib/api";
import { motionTransitions } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";
import {
  capitalizeWords,
  cutRange,
  expandToWords,
  parseTrack,
  primaryArtist,
  recaseCredits,
  recaseName,
  searchTitle,
  trimSeparators,
} from "@/lib/parse";
import {
  addHistoryRun,
  advanceCheckpoint,
  getArtistCasing,
  getHistory,
  getPlatform,
  getSettings,
  getSources,
  handledTracks,
  labelFor,
  resetCheckpoint,
  resetHistory,
  forgetSynced,
  saveArtistCasing,
  saveSettings,
  saveSources,
  type ArtistCasing,
  type Checkpoint,
  type HistoryRun,
  type HistoryTrack,
  type Settings,
  type Sources,
} from "@/lib/store";

type Status = "checking" | "released" | "maybe" | "unreleased" | "checkFailed" | "syncing" | "synced" | "skipped" | "error";

interface Item {
  raw: RawTrack;
  title: string;
  artist: string;
  cover: string;
  /** The uncropped image the current cover was cut from, so re-cropping starts from the full picture. */
  coverSource?: string;
  status: Status;
  match?: DspMatch | null;
  include: boolean;
  error?: string;
  /** Why the release check couldn't finish, per service. */
  checkError?: string;
  artistGuessed?: boolean;
}

const STATUS: Record<Status, { label: string; tone: BadgeTone }> = {
  checking: { label: "Checking DSPs", tone: "neutral" },
  released: { label: "On DSPs", tone: "warning" },
  maybe: { label: "Maybe on DSPs", tone: "neutral" },
  checkFailed: { label: "Check failed", tone: "warning" },
  unreleased: { label: "Unreleased", tone: "success" },
  syncing: { label: "Syncing", tone: "neutral" },
  synced: { label: "In local files", tone: "success" },
  skipped: { label: "Skipped", tone: "neutral" },
  error: { label: "Failed", tone: "danger" },
};

// sync outcomes keep the text pill; release statuses show as the mark on the cover's corner
const SYNC_STATUS = new Set<Status>(["syncing", "synced", "error"]);

// list order, most worth a look first: unreleased, maybe released, couldn't check (e.g. Deezer rate limited), released, still checking
const RANK: Record<Status, number> = {
  unreleased: 0,
  syncing: 0,
  synced: 0,
  error: 0,
  maybe: 1,
  checkFailed: 2,
  released: 3,
  skipped: 3,
  checking: 4,
};

type View = "dashboard" | "history";

const HANDLED_NOTE = {
  synced: "Synced",
  released: "On DSPs",
  skipped: "Skipped",
  failed: "Failed",
  checkFailed: "Check failed",
} as const;

const VIEWS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "history", label: "History" },
] as const;

/** Runs `fn` over `items` with at most `n` in flight. */
async function pool<T>(items: T[], n: number, fn: (t: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

async function checkpointFor(url: string): Promise<Checkpoint | null> {
  const p = detectPlatform(url);
  return p ? ((await getPlatform(p)).checkpoints[url] ?? null) : null;
}

/** One track on the shelf. Memoized so a status update or a keystroke in one card doesn't re-render (and re-measure) the whole grid. */
const TrackCard = memo(function TrackCard({
  it,
  i,
  row,
  editable,
  onPatch,
  onCrop,
  onRecase,
}: {
  it: Item;
  i: number;
  row: number;
  editable: boolean;
  onPatch: (i: number, p: Partial<Item>) => void;
  onCrop: (i: number) => void;
  /** Gives every track's artist this name's casing; returns how many other tracks changed. */
  onRecase: (name: string) => number;
}) {
  // the highlighted part of the title or artist field, which gets a bar of actions over it
  const [sel, setSel] = useState<{ field: "title" | "artist"; start: number; end: number } | null>(null);
  // how many other tracks the last recase reached, shown in the bar until the highlight changes
  const [recased, setRecased] = useState(0);
  const artistRef = useRef<HTMLInputElement>(null);
  // the highlight to put back once a recased artist re-renders, since a new value drops it
  const keepSelection = useRef<[number, number] | null>(null);
  useLayoutEffect(() => {
    const r = keepSelection.current;
    keepSelection.current = null;
    if (r && document.activeElement === artistRef.current) artistRef.current!.setSelectionRange(...r);
  }, [it.artist]);

  const trackSelection = (field: "title" | "artist") => (e: React.SyntheticEvent<HTMLInputElement>) => {
    const { selectionStart: start, selectionEnd: end, value } = e.currentTarget;
    const next = start !== null && end !== null && value.slice(start, end).trim() ? { field, start, end } : null;
    setSel((prev) => (prev?.field === next?.field && prev?.start === next?.start && prev?.end === next?.end ? prev : next));
    if (!next || next.field !== sel?.field || next.start !== sel.start || next.end !== sel.end) setRecased(0);
  };

  /** Cuts the highlighted title text into the artist, replacing it or adding it as another credit. */
  const moveToArtist = (mode: "set" | "add") => {
    if (sel?.field !== "title") return;
    const text = trimSeparators(it.title.slice(sel.start, sel.end));
    if (!text) return;
    // cutting the whole title would leave nothing to name the file by, so then it's a copy
    const title = cutRange(it.title, sel.start, sel.end) || it.title;
    const artist = mode === "add" && it.artist.trim() && !it.artistGuessed ? `${it.artist} & ${text}` : text;
    onPatch(i, { title, artist, artistGuessed: false });
    setSel(null);
  };

  /** Recases the highlighted name, widened to whole words, here and on every other track with the same name. */
  const recase = (fn: (s: string) => string) => {
    if (sel?.field !== "artist") return;
    const [start, end] = expandToWords(it.artist, sel.start, sel.end);
    const name = fn(it.artist.slice(start, end));
    if (!name.trim()) return;
    // the upper case of some letters is longer (ß -> SS), so the highlight grows with it
    const range: [number, number] = [start, start + name.length];
    if (name !== it.artist.slice(start, end)) keepSelection.current = range;
    setRecased(onRecase(name));
    setSel({ field: "artist", start: range[0], end: range[1] });
  };

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: !it.include && it.status !== "checking" ? 0.5 : 1,
        y: 0,
      }}
      transition={{
        ...motionTransitions.springSmooth,
        delay: Math.min(row * 0.025, 0.4),
        // the stagger is for the first reveal; re-sorting after a status change moves right away
        layout: motionTransitions.springSmooth,
      }}
      // no content-visibility: WebKit (the Tauri webview) lays out and paints each skipped card the moment it scrolls in,
      // which made scrolling the grid stutter. Painting them up front costs less than that
      className="min-w-0"
    >
      {/* the cover has a dark see-through inner edge, with the release status on its corner */}
      <div className="relative rounded-xl shadow-[0_6px_16px_rgb(0_0_0/0.35)]">
        <button
          className="group relative block aspect-square w-full overflow-hidden rounded-xl bg-neutral-900"
          onClick={() => editable && onCrop(i)}
          disabled={!editable}
          aria-label={editable ? "Crop or replace the cover" : undefined}
        >
          <CoverImage cover={it.cover} />
          {editable && (
            <span className="absolute inset-0 hidden items-center justify-center bg-black/60 group-hover:flex">
              <ImagePlus className="size-5" />
            </span>
          )}
        </button>
        <span className="pointer-events-none absolute inset-0 rounded-xl ring-[1.5px] ring-inset ring-black/30" />
        {editable ? (
          // the DSP check is a guess, so in review the user has the final say on each track
          <StatusMenu
            className="absolute bottom-2.5 left-2.5"
            status={it.status}
            label={STATUS[it.status].label}
            onChange={(status) =>
              onPatch(i, {
                status,
                include: status !== "released" && status !== "skipped",
                checkError: undefined,
              })
            }
          />
        ) : (
          !SYNC_STATUS.has(it.status) && (
            <StatusCorner className="absolute bottom-2.5 left-2.5" status={it.status} label={STATUS[it.status].label} />
          )
        )}
      </div>

      <div className="mt-3 space-y-0.5">
        {editable ? (
          <>
            <div className="relative">
              <SelectionActions
                open={sel?.field === "title"}
                actions={[
                  { label: "Set artist", icon: <UserRoundPen className="size-3.5" />, onClick: () => moveToArtist("set") },
                  { label: "Add to artist", icon: <UserRoundPlus className="size-3.5" />, onClick: () => moveToArtist("add") },
                ]}
              />
              <input
                className="field-inline w-full text-sm font-medium"
                value={it.title}
                onChange={(e) => onPatch(i, { title: e.target.value })}
                onSelect={trackSelection("title")}
                onBlur={() => setSel(null)}
              />
            </div>
            <div className="relative">
              <SelectionActions
                open={sel?.field === "artist"}
                note={recased ? `${recased} more ${recased === 1 ? "track" : "tracks"}` : null}
                actions={[
                  { label: "Capitalize", icon: <CaseSensitive className="size-3.5" />, onClick: () => recase(capitalizeWords) },
                  { label: "All caps", icon: <CaseUpper className="size-3.5" />, onClick: () => recase((s) => s.toUpperCase()) },
                  { label: "Lowercase", icon: <CaseLower className="size-3.5" />, onClick: () => recase((s) => s.toLowerCase()) },
                ]}
              />
              <input
                ref={artistRef}
                className="field-inline w-full text-sm text-neutral-400"
                value={it.artist}
                onChange={(e) => onPatch(i, { artist: e.target.value })}
                onSelect={trackSelection("artist")}
                onBlur={() => setSel(null)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="truncate text-sm font-medium">{it.title}</div>
            <div className="truncate text-sm text-neutral-400">{it.artist}</div>
          </>
        )}
        <div className="truncate text-xs text-neutral-600">
          {it.raw.uploader} · {it.raw.title}
        </div>
      </div>

      <div className="mt-2 flex flex-col items-start gap-1.5">
        {!editable && SYNC_STATUS.has(it.status) && (
          <Badge tone={STATUS[it.status].tone} dot pulse={it.status === "syncing"}>
            {STATUS[it.status].label}
          </Badge>
        )}
        {it.match && (
          <button
            className="max-w-full truncate text-left text-xs text-neutral-500 hover:text-neutral-200"
            onClick={() => openUrl(it.match!.url)}
          >
            {it.match.service}: {it.match.artist} – {it.match.title}
          </button>
        )}
        {it.checkError && (
          <span className="flex max-w-full items-center gap-1 truncate text-xs text-amber-400">
            <X className="size-3 shrink-0" /> {it.checkError}
          </span>
        )}
        {it.error && (
          <span className="flex max-w-full items-center gap-1 truncate text-xs text-red-400">
            <X className="size-3 shrink-0" /> {it.error}
          </span>
        )}
      </div>
    </motion.li>
  );
});

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [url, setUrl] = useState("");
  const [sources, setSources] = useState<Sources>({
    saved: [],
    defaultUrl: null,
  });
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // the phone guide: `synced` is how many tracks the last sync added, null when opened from settings
  const [guide, setGuide] = useState<{ synced: number | null } | null>(null);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  const [cropping, setCropping] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  // tracks kept out of `items` so they don't take up the list: already in the local-files folder, or decided in an earlier run
  const [local, setLocal] = useState<LeftOutTrack[]>([]);
  const [handled, setHandled] = useState<LeftOutTrack[]>([]);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [scrapeCount, setScrapeCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toolWarning, setToolWarning] = useState<string | null>(null);
  // the content area under the header; the window itself never scrolls
  const scroller = useRef<HTMLDivElement>(null);
  // the sync screen is a fixed stage: back to the top and no scrolling until the run ends (history still scrolls)
  const stageLocked = phase === "syncing" && view !== "history";
  // smooth wheel and trackpad scrolling for the content area (Lenis honours reduced motion and falls back to native)
  const lenis = useRef<Lenis | null>(null);
  useEffect(() => {
    const wrapper = scroller.current!;
    const l = new Lenis({ wrapper, content: wrapper.firstElementChild as HTMLElement, autoRaf: true });
    lenis.current = l;
    return () => {
      l.destroy();
      lenis.current = null;
    };
  }, []);
  useEffect(() => {
    const l = lenis.current;
    if (stageLocked) {
      l?.scrollTo(0, { immediate: true, force: true });
      l?.stop();
    } else l?.start();
  }, [stageLocked]);
  // the url a run was started with, so checkpoints and steps stay right if it changes mid-run
  const runUrl = useRef("");
  // newest scraped id, which can be a track left out for being in local files
  const runTopId = useRef<string | null>(null);
  // read by syncAll when the run is recorded
  const runMeta = useRef({ local: 0 });
  // bumped to start or abandon a run, so a cancelled run's late results are dropped
  const runGen = useRef(0);

  const patch = useCallback((i: number, p: Partial<Item>) => {
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...p } : it)));
  }, []);

  // read by recase, which has to count what it changed before the state update lands
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // names recased by hand, applied to every fetch after
  const casing = useRef<ArtistCasing>({});
  const withCasing = (artist: string, title: string) => {
    for (const name of Object.values(casing.current)) {
      artist = recaseName(artist, name);
      title = recaseCredits(title, name);
    }
    return { artist, title };
  };

  /** Gives `name`'s casing to every track that credits it, and remembers it for later fetches. Returns how many other tracks changed. */
  const recase = useCallback((name: string) => {
    let changed = 0;
    const next = itemsRef.current.map((it) => {
      const artist = recaseName(it.artist, name);
      const title = recaseCredits(it.title, name);
      if (artist === it.artist && title === it.title) return it;
      changed++;
      return { ...it, artist, title };
    });
    itemsRef.current = next;
    setItems(next);
    // moved to the end, since they're applied in order and the latest pick should win where names overlap ("DJ" in "Dj Snake")
    const { [name.toLowerCase()]: _old, ...rest } = casing.current;
    casing.current = { ...rest, [name.toLowerCase()]: name };
    void saveArtistCasing(casing.current);
    // the track the name was highlighted on is one of them
    return Math.max(0, changed - 1);
  }, []);

  // a newer release on GitHub, offered in a toast; dev builds skip the check since they have no release to compare to
  const [update, setUpdate] = useState<Update | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) check().then(setUpdate).catch(() => {});
  }, []);
  const installUpdate = (u: Update) =>
    u
      .downloadAndInstall()
      .then(relaunch)
      .catch((e) => message(String(e), { title: "Update failed", kind: "error" }));

  useEffect(() => {
    api.defaultMusicDir().then(getSettings).then(setSettings);
    api.checkTools().catch((e) => setToolWarning(String(e)));
    getHistory().then(setHistory);
    getArtistCasing().then((c) => (casing.current = c));
    getSources().then(async (s) => {
      setSources(s);
      if (s.defaultUrl) {
        setUrl(s.defaultUrl);
        setCheckpoint(await checkpointFor(s.defaultUrl));
      }
    });
    const un = listen<{ count: number }>("scrape-progress", (e) => setScrapeCount(e.payload.count));
    // Palms > Settings… (Cmd+,) in the app menu
    const unSettings = listen("open-settings", () => setShowSettings(true));
    return () => {
      void un.then((f) => f());
      void unSettings.then((f) => f());
    };
  }, []);

  const updateSettings = (p: Partial<Settings>) => {
    setSettings((s) => {
      if (!s) return s;
      const next = { ...s, ...p };
      saveSettings(next);
      return next;
    });
  };

  const updateSources = (next: Sources) => {
    setSources(next);
    saveSources(next);
  };

  const onUrlChange = async (u: string) => {
    setUrl(u);
    setCheckpoint(await checkpointFor(u.trim()));
  };

  const saveSource = () => {
    const u = url.trim();
    const p = detectPlatform(u);
    if (!p) return;
    updateSources({
      saved: [...sources.saved, { url: u, label: labelFor(u), platform: p }],
      defaultUrl: sources.defaultUrl ?? u,
    });
  };

  const removeSource = (u: string) =>
    updateSources({
      saved: sources.saved.filter((s) => s.url !== u),
      defaultUrl: sources.defaultUrl === u ? null : sources.defaultUrl,
    });

  const toggleDefault = (u: string) =>
    updateSources({
      ...sources,
      defaultUrl: sources.defaultUrl === u ? null : u,
    });

  const syncAll = async (list: Item[]) => {
    if (!settings) return;
    setPhase("syncing");
    // tracks whose release check failed and weren't synced anyway get checked again next run
    const failed = new Set(list.filter((it) => it.status === "checkFailed" && !it.include).map((it) => it.raw.id));
    const record = (it: Item, status: HistoryTrack["status"], extra: Partial<HistoryTrack> = {}): HistoryTrack => ({
      id: it.raw.id,
      title: it.title,
      artist: it.artist,
      cover: it.cover,
      url: it.raw.url,
      status,
      match: it.match ?? null,
      ...extra,
    });
    // what was decided for each track, taken before the badges flip to skipped/synced
    const results: HistoryTrack[] = list.map((it) =>
      it.include
        ? record(it, "failed")
        : record(it, it.status === "released" ? "released" : it.status === "checkFailed" ? "checkFailed" : "skipped", { error: it.checkError }),
    );
    await pool(list, 2, async (it, i) => {
      if (!it.include) {
        if (it.status !== "checkFailed") patch(i, { status: "skipped" });
        return;
      }
      patch(i, { status: "syncing" });
      try {
        const path = await api.syncTrack({
          id: it.raw.id,
          url: it.raw.url,
          title: it.title,
          artist: it.artist,
          cover: it.cover,
          folder: settings.folder,
        });
        results[i] = record(it, "synced", { path });
        patch(i, { status: "synced" });
      } catch (e) {
        failed.add(it.raw.id);
        results[i] = record(it, "failed", { error: String(e) });
        patch(i, { status: "error", error: String(e) });
      }
    });
    // failed downloads and failed checks stay unseen (and the stop point stays put) so the next run retries them
    const p = list[0].raw.platform;
    await advanceCheckpoint(
      p,
      runUrl.current,
      failed.size ? null : runTopId.current,
      list.map((it) => it.raw.id).filter((id) => !failed.has(id)),
    );
    setCheckpoint(await checkpointFor(runUrl.current));
    const tally = (s: HistoryTrack["status"]) => results.filter((t) => t.status === s).length;
    await addHistoryRun({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      sourceUrl: runUrl.current,
      platform: p,
      mode: "manual",
      counts: {
        found: list.length,
        local: runMeta.current.local,
        synced: tally("synced"),
        released: tally("released"),
        skipped: tally("skipped"),
        failed: tally("failed"),
        checkFailed: tally("checkFailed"),
      },
      tracks: results,
    });
    setHistory(await getHistory());
    const synced = tally("synced");
    // settings can change mid-run, so read the latest rather than this closure's
    if (synced && settingsRef.current?.phoneGuide) setGuide({ synced });
    if (results.some((t) => t.status === "failed")) {
      // keep the run up so the errors can be read and retried
      setPhase("done");
      return;
    }
    // everything landed in history, so show it there and leave the dashboard ready for the next run
    setItems([]);
    setLocal([]);
    setHandled([]);
    setPhase("idle");
    setView("history");
  };

  const run = async () => {
    const p = detectPlatform(url.trim());
    if (!settings || !p) return;
    const gen = ++runGen.current;
    const live = () => gen === runGen.current;
    setError(null);
    setItems([]);
    setQuery("");
    setLocal([]);
    setHandled([]);
    setScrapeCount(0);
    runMeta.current = { local: 0 };
    setPhase("scraping");
    runUrl.current = url.trim();
    try {
      const st = await getPlatform(p);
      if (!live()) return;
      const cp = st.checkpoints[runUrl.current];
      // only SoundCloud likes are reliably newest-first, so only they can stop early
      const stopAt = p === "soundcloud" && /\/likes\/?$/.test(runUrl.current) ? (cp?.topId ?? null) : null;
      const raw = await api.scrape(runUrl.current, stopAt, settings.limit);
      if (!live()) return;
      const seen = new Set(cp?.seenIds ?? []);
      // decisions from any earlier run count, so a track skipped from one source isn't offered again from another
      const decided = handledTracks(await getHistory());
      if (!live()) return;
      const isHandled = (t: RawTrack) => seen.has(t.id) || decided.has(t.id);
      setHandled(
        raw.filter(isHandled).map((r) => {
          const h = decided.get(r.id);
          const note = h ? `${HANDLED_NOTE[h.status]} ${new Date(h.at).toLocaleDateString()}` : "Handled in an earlier run";
          return h
            ? {
                id: r.id,
                title: h.title,
                artist: h.artist,
                cover: h.cover,
                note,
              }
            : { id: r.id, ...parseTrack(r), cover: r.thumbnail ?? "", note };
        }),
      );
      const fresh = raw.filter((t) => !isHandled(t));
      if (!fresh.length) {
        setPhase("done");
        return;
      }
      runTopId.current = raw[0].id;
      const parsed: Item[] = fresh.map((r) => {
        const parsed = parseTrack(r);
        return {
          raw: r,
          ...parsed,
          ...withCasing(parsed.artist, parsed.title),
          cover: r.thumbnail ?? "",
          status: "checking",
          include: false,
        };
      });
      // a failed folder scan shouldn't block the run, it just means nothing gets left out
      const files = await api
        .findLocal(
          settings.folder,
          parsed.map((it) => ({ artist: it.artist, title: it.title })),
        )
        .catch(() => []);
      if (!live()) return;
      const list = parsed.filter((_, i) => !files[i]);
      runMeta.current.local = parsed.length - list.length;
      setLocal(
        parsed.flatMap((it, i) =>
          files[i]
            ? [
                {
                  id: it.raw.id,
                  title: it.title,
                  artist: it.artist,
                  cover: it.cover,
                  note: files[i]!,
                },
              ]
            : [],
        ),
      );
      if (!list.length) {
        setPhase("done");
        return;
      }
      setItems(list);
      setPhase("checking");

      const spotify = settings.spotify.clientId ? settings.spotify : undefined;
      await pool(list, 4, async (it, i) => {
        if (!live()) return;
        try {
          const res = await api.checkDsp(primaryArtist(it.artist), searchTitle(it.title), spotify);
          if (res.kind === "matched") {
            list[i] = {
              ...it,
              match: res.found,
              status: "released",
              include: false,
            };
          } else if (res.kind === "notFound") {
            list[i] = {
              ...it,
              match: null,
              status: "unreleased",
              include: true,
            };
          } else {
            list[i] = {
              ...it,
              match: null,
              status: "checkFailed",
              include: false,
              checkError: res.errors.join("; "),
            };
          }
        } catch (e) {
          // unknown isn't the same as unreleased, so leave it for the user rather than syncing it
          list[i] = {
            ...it,
            match: null,
            status: "checkFailed",
            include: false,
            checkError: String(e),
          };
        }
        if (live()) patch(i, list[i]);
      });
      if (!live()) return;

      setPhase("review");
    } catch (e) {
      if (!live()) return;
      setError(String(e));
      setPhase("idle");
    }
  };

  // leaves the run before anything is synced; nothing is recorded, so the same tracks come up next time
  const startOver = () => {
    runGen.current++;
    setItems([]);
    setLocal([]);
    setHandled([]);
    setQuery("");
    setScrapeCount(0);
    setPhase("idle");
  };

  const approve = () => syncAll(items);

  const pickFolder = async () => {
    const f = await open({ directory: true, defaultPath: settings?.folder });
    if (typeof f === "string") updateSettings({ folder: f });
  };

  // history is updated even if trashing fails partway: a track whose file survived shows up as already in local files on the next scan anyway
  const clearFolder = async () => {
    try {
      return await api.clearFolder(settings?.folder ?? "");
    } finally {
      await forgetSynced();
      setHistory(await getHistory());
      setCheckpoint(await checkpointFor(url.trim()));
    }
  };

  const resetAll = async () => {
    const n = await clearFolder();
    await resetHistory();
    setHistory([]);
    setCheckpoint(null);
    return n;
  };

  // search only hides rows; unmatched tracks are still synced if ticked
  const shownItems = items.map((it, i) => ({ it, i })).filter(({ it }) => matchesQuery(query, it.title, it.artist, it.raw.uploader, it.raw.title));

  const busy = phase === "scraping" || phase === "checking" || phase === "syncing";
  const included = items.filter((i) => i.include);
  const checkFailed = items.filter((i) => i.status === "checkFailed").length;
  const editable = phase === "review";
  // a run that found nothing new: just its steps, the caught-up note and a way back, no source bar
  const caughtUp = phase === "done" && items.length === 0;
  // a window of covers that slides forward as tracks finish, so finished ones pop off and the next ones pop in
  const syncBoard = () => {
    const finished = (it: Item) => it.status === "synced" || it.status === "error";
    const first = included.findIndex((it) => !finished(it));
    const start = Math.max(0, Math.min(first === -1 ? included.length : first, included.length - SYNC_SLOTS));
    return {
      covers: included.slice(start, start + SYNC_SLOTS).map((it, j) => ({
        id: it.raw.id,
        cover: it.cover,
        done: finished(it),
        slot: start + j,
      })),
      synced: included.filter((it) => it.status === "synced").length,
      failed: included.filter((it) => it.status === "error").length,
      current: included.filter((it) => it.status === "syncing"),
      total: included.length,
    };
  };

  return (
    <MotionConfig reducedMotion="user">
      {/* isolate keeps the backdrop's negative z-index above this background rather than behind it */}
      <div className="isolate relative h-screen bg-neutral-950 text-neutral-100 antialiased">
        {/* past the link screen, and on history, the page gets a bare black background */}
        <Backdrop plain={stageLocked} glow={view !== "history"} bare={view === "history" || phase !== "idle"} />
        <AppHeader
          scroller={scroller}
          left={<PalmsLogo className="h-[25px] w-auto shrink-0 justify-self-start text-white" />}
          center={(scrolled) => (
            <SmoothTabs value={view} onChange={setView} tabs={VIEWS} className={cn("transition-colors duration-500", scrolled && "bg-neutral-800/70")} />
          )}
          right={
            <Button variant="ghost" size="icon-lg" className="justify-self-end rounded-md" onClick={() => setShowSettings(true)} aria-label="Settings">
              <Settings2 className="size-[18px]" />
            </Button>
          }
        />

        {/* the only part that scrolls (and rubber-bands); it starts under the header, which floats over it */}
        <div
          ref={scroller}
          data-app-scroller
          className={cn("h-full", stageLocked ? "overflow-hidden" : "overflow-y-auto")}
          style={{ paddingTop: HEADER_HEIGHT }}
        >
          <main className="mx-auto max-w-6xl px-6 py-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={motionTransitions.easeFast}
                className="space-y-6"
              >
                {view === "history" ? (
                  <HistoryView runs={history} />
                ) : (
                  <>
                    {toolWarning && (
                      <Alert tone="danger">
                        <AlertTitle>yt-dlp missing</AlertTitle>
                        <AlertDescription>{toolWarning}</AlertDescription>
                      </Alert>
                    )}

                    {/* starting a run swaps the source bar for the run's progress; it comes back once the run is done */}
                    <div className="relative flex flex-col gap-6">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {(phase === "idle" || (phase === "done" && !caughtUp)) && (
                          <motion.div
                            key="source"
                            layout
                            initial={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(4px)" }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(4px)" }}
                            transition={motionTransitions.springGentle}
                            // with nothing else on the dashboard, the bar sits in the middle of the window (86px of header and padding above it, ~110px tall)
                            className={cn(phase === "idle" && "mt-[max(0px,calc(50vh-141px))]")}
                          >
                          <SourceBar
                            url={url}
                            onUrlChange={onUrlChange}
                            onRun={run}
                            busy={busy}
                            next={phase === "idle" || phase === "done"}
                            sources={sources}
                            onSave={saveSource}
                            onRemove={removeSource}
                            onMakeDefault={toggleDefault}
                            checkpoint={checkpoint}
                            onResetCheckpoint={async () => {
                              const p = detectPlatform(url.trim());
                              if (p) await resetCheckpoint(p, url.trim());
                              setCheckpoint(null);
                            }}
                            limit={settings?.limit ?? 100}
                          />
                          </motion.div>
                        )}

                        {phase !== "idle" && (
                          <motion.section
                            key="run"
                            layout
                            initial={{ opacity: 0, y: 12, scale: 0.98, filter: "blur(4px)" }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
                            transition={motionTransitions.springGentle}
                            // the run's steps sit straight on the page backdrop, like the sync's covers, with no box of their own
                            // nothing else is on a caught-up dashboard, so the note sits in the middle of the window like the source bar (~190px tall)
                            className={cn(
                              phase !== "syncing" && "flex flex-col items-center gap-6 py-2",
                              caughtUp && "mt-[max(0px,calc(50vh-181px))]",
                            )}
                          >
                            {phase === "syncing" ? (
                              <SyncingCovers {...syncBoard()} />
                            ) : (
                              <>
                                {/* a caught-up run has nothing past its fetch to show, so just the note stands in the middle */}
                                {!caughtUp && (
                                  <RunSteps
                                    phase={phase}
                                    scraped={scrapeCount}
                                    local={local.length}
                                    checked={items.filter((i) => i.status !== "checking").length}
                                    total={items.length}
                                    failed={checkFailed}
                                    synced={included.filter((i) => i.status === "synced" || i.status === "error").length}
                                    toSync={phase === "done" ? included.length : 0}
                                  />
                                )}
                                {caughtUp && (
                                  <EmptyState title="You're caught up">
                                    {local.length + handled.length
                                      ? "Everything found is already in your local files or was handled in an earlier run."
                                      : "Nothing new since the last checkpoint."}
                                  </EmptyState>
                                )}
                                {!caughtUp && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="rounded-md border border-neutral-800 px-3.5 text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
                                    onClick={startOver}
                                  >
                                    {busy ? "Cancel scan" : "Start over"}
                                  </Button>
                                )}
                              </>
                            )}
                          </motion.section>
                        )}
                      </AnimatePresence>
                      {/* a caught-up run's way back sits in the top left corner, out of the centred steps */}
                      {caughtUp && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-0 left-0 z-10 rounded-md border border-neutral-800 px-3.5 text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
                          onClick={startOver}
                        >
                          <ArrowLeft className="size-3.5" />
                          Back
                        </Button>
                      )}
                    </div>

                    {error && (
                      <Alert tone="danger" dismissible onDismiss={() => setError(null)}>
                        <AlertTitle>Scrape failed</AlertTitle>
                        <AlertDescription className="break-all">{error}</AlertDescription>
                      </Alert>
                    )}

                    {/* placeholder covers in the same grid as the real shelf, one per track found so far: two rows to
                        start, capped at six so a big scrape doesn't build a wall of them */}
                    {phase === "scraping" && (
                      <ul aria-hidden className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                        {Array.from({ length: Math.min(Math.max(scrapeCount, 10), 30) }).map((_, i) => (
                          <li key={i} className="min-w-0">
                            <Skeleton className="aspect-square w-full rounded-xl" />
                            <div className="mt-3 space-y-1.5">
                              <Skeleton className="h-3.5 w-3/4" />
                              <Skeleton className="h-3.5 w-1/2" />
                              <Skeleton className="h-3 w-2/3" />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {phase !== "syncing" && items.length > 0 && (
                      <div className="flex items-center gap-3">
                        <SearchField value={query} onChange={setQuery} placeholder="Search tracks" className="flex-1" />
                        {query && (
                          <span className="shrink-0 text-xs text-neutral-500 tabular-nums">
                            {shownItems.length} of {items.length}
                          </span>
                        )}
                      </div>
                    )}

                    {phase !== "syncing" && query && items.length > 0 && !shownItems.length && (
                      <div className="py-8 text-center text-sm text-neutral-500">No tracks match “{query}”</div>
                    )}

                    {/* fetched tracks show as a shelf of covers, each with its details underneath */}
                    <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {phase !== "syncing" &&
                        // sorted only for display, so `i` still points into `items` for patching; a status change re-sorts and the card glides to its new spot
                        shownItems
                          .sort((a, b) => RANK[a.it.status] - RANK[b.it.status] || a.i - b.i)
                          .map(({ it, i }, row) => (
                            <TrackCard
                              key={it.raw.id}
                              it={it}
                              i={i}
                              row={row}
                              editable={editable}
                              onPatch={patch}
                              onCrop={setCropping}
                              onRecase={recase}
                            />
                          ))}
                    </ul>

                    {/* review is a step in the run, so its confirm bar sits pinned under the list until the user decides */}
                    <AnimatePresence>
                      {editable && items.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 24 }}
                          transition={motionTransitions.springSmooth}
                          className="sticky bottom-4 z-20 mx-2 flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 py-2 pr-2 pl-5 shadow-2xl"
                        >
                          <div className="space-y-0.5">
                            <div className="text-sm font-medium">
                              {included.length} of {items.length} selected
                            </div>
                            <div className="text-xs text-neutral-500">Click the mark on a cover to correct the DSP check. Edit titles, artists and covers inline, or highlight text to move it to the artist or fix its capitals.</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                const all = included.length !== items.length;
                                setItems((prev) => prev.map((it) => ({ ...it, include: all })));
                              }}
                            >
                              {included.length === items.length ? "Select none" : "Select all"}
                            </Button>
                            <Button
                              variant="sync"
                              size="lg"
                              type="button"
                              onClick={approve}
                              disabled={!included.length}
                              className="px-5"
                            >
                              Sync {included.length} {included.length === 1 ? "track" : "tracks"}
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        <CoverCropDialog
          open={cropping !== null && editable}
          source={cropping !== null ? (items[cropping]?.coverSource ?? items[cropping]?.cover ?? "") : ""}
          id={cropping !== null ? (items[cropping]?.raw.id ?? "cover") : "cover"}
          onClose={() => setCropping(null)}
          onApply={(cover, coverSource) => cropping !== null && patch(cropping, { cover, coverSource })}
        />

        {settings && (
          <SettingsSheet
            open={showSettings}
            onClose={() => setShowSettings(false)}
            settings={settings}
            onChange={updateSettings}
            onPickFolder={pickFolder}
            busy={busy}
            onResetAll={resetAll}
            onOpenPhoneGuide={() => {
              setShowSettings(false);
              setGuide({ synced: null });
            }}
          />
        )}

        <PhoneGuide
          open={guide !== null}
          synced={guide?.synced ?? null}
          onClose={() => setGuide(null)}
          onNever={() => updateSettings({ phoneGuide: false })}
        />

        {update && (
          <UndoToast
            title="Update available"
            description={`Palms ${update.version} is ready to install. The app restarts once it's in.`}
            undoLabel="Update"
            restoredMessage="Downloading update…"
            icon={<Download className="size-4 text-neutral-300" />}
            duration={0}
            showProgress={false}
            position="bottom-right"
            onUndo={() => installUpdate(update)}
            onDismiss={() => setUpdate(null)}
          />
        )}
      </div>
    </MotionConfig>
  );
}
