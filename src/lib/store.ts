import { load, type Store } from "@tauri-apps/plugin-store";
import type { DspMatch, Platform, SpotifyCreds } from "./api";

/** Where we left off for one source URL. */
export interface Checkpoint {
  /** Newest item id at the last sync. SoundCloud likes are newest-first, so scraping stops here. */
  topId: string | null;
  /** Every id already handled (synced or skipped), so reordered playlists don't re-add. */
  seenIds: string[];
  lastRun: string | null;
}

export interface PlatformState {
  defaultUrl: string;
  checkpoints: Record<string, Checkpoint>;
}

/** A link the user keeps around to scrape again (likes, playlists, channels). */
export interface SavedSource {
  url: string;
  label: string;
  platform: Platform;
}

export interface Sources {
  saved: SavedSource[];
  /** Loaded into the input on launch. */
  defaultUrl: string | null;
}

export interface Settings {
  folder: string;
  limit: number;
  spotify: SpotifyCreds;
  /** Offer the phone guide after a sync adds tracks. */
  phoneGuide: boolean;
  /** First-run setup is done. */
  onboarded: boolean;
}

let storePromise: Promise<Store> | null = null;
const store = () => (storePromise ??= load("palms.json", { autoSave: true, defaults: {} }));

export async function getPlatform(p: Platform): Promise<PlatformState> {
  const s = await store();
  return (await s.get<PlatformState>(`platform.${p}`)) ?? { defaultUrl: "", checkpoints: {} };
}

export async function setPlatform(p: Platform, state: PlatformState) {
  const s = await store();
  await s.set(`platform.${p}`, state);
}

export async function getSettings(fallbackFolder: string): Promise<Settings> {
  const s = await store();
  // drop the old auto/manual setting so it isn't saved back
  const stored = await s.get<Partial<Settings> & { mode?: unknown }>("settings");
  const { mode: _mode, ...saved } = stored ?? {};
  return {
    folder: fallbackFolder,
    limit: 100,
    spotify: { clientId: "", clientSecret: "" },
    phoneGuide: true,
    // anyone with saved settings set the app up before onboarding existed
    onboarded: stored != null,
    ...saved,
  };
}

export async function saveSettings(settings: Settings) {
  const s = await store();
  await s.set("settings", settings);
}

/** Artist names the user recased by hand, keyed by lowercase, so later fetches get the same casing. */
export type ArtistCasing = Record<string, string>;

export async function getArtistCasing(): Promise<ArtistCasing> {
  const s = await store();
  return (await s.get<ArtistCasing>("artistCasing")) ?? {};
}

export async function saveArtistCasing(casing: ArtistCasing) {
  const s = await store();
  await s.set("artistCasing", casing);
}

/** Saved links. Seeded once from the old per-platform default urls. */
export async function getSources(): Promise<Sources> {
  const s = await store();
  const existing = await s.get<Sources>("sources");
  if (existing) return existing;
  const saved: SavedSource[] = [];
  for (const p of ["soundcloud", "youtube"] as const) {
    const url = (await getPlatform(p)).defaultUrl;
    if (url) saved.push({ url, label: labelFor(url), platform: p });
  }
  return { saved, defaultUrl: saved[0]?.url ?? null };
}

export async function saveSources(sources: Sources) {
  const s = await store();
  await s.set("sources", sources);
}

/** A short readable name for a source url, e.g. "artist-name · likes". */
export function labelFor(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.get("list")) return "YouTube playlist";
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length ? parts.slice(0, 2).join(" · ") : u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function emptyCheckpoint(): Checkpoint {
  return { topId: null, seenIds: [], lastRun: null };
}

/** Records ids as handled and moves the checkpoint to the newest scraped item. */
export async function advanceCheckpoint(p: Platform, url: string, newestId: string | null, ids: string[]) {
  const state = await getPlatform(p);
  const cp = state.checkpoints[url] ?? emptyCheckpoint();
  const seen = new Set(cp.seenIds);
  ids.forEach((id) => seen.add(id));
  state.checkpoints[url] = {
    topId: newestId ?? cp.topId,
    seenIds: [...seen].slice(-5000),
    lastRun: new Date().toISOString(),
  };
  await setPlatform(p, state);
}

export async function resetCheckpoint(p: Platform, url: string) {
  const state = await getPlatform(p);
  delete state.checkpoints[url];
  await setPlatform(p, state);
}

/** What a run decided for a track. Only the first three count as handled for later scans. */
export type HistoryStatus = "synced" | "released" | "skipped" | "failed" | "checkFailed";

export interface HistoryTrack {
  id: string;
  title: string;
  artist: string;
  cover: string;
  url: string;
  status: HistoryStatus;
  match?: DspMatch | null;
  error?: string;
  /** Where the synced mp3 was written. */
  path?: string;
}

export interface HistoryRun {
  id: string;
  at: string;
  sourceUrl: string;
  platform: Platform;
  /** Always "manual" now; older runs may say "auto". */
  mode: "auto" | "manual";
  counts: Record<HistoryStatus, number> & { found: number; local: number };
  tracks: HistoryTrack[];
}

const HISTORY_MAX = 200;

/** Runs newest first. */
export async function getHistory(): Promise<HistoryRun[]> {
  const s = await store();
  return (await s.get<HistoryRun[]>("history")) ?? [];
}

export async function addHistoryRun(run: HistoryRun) {
  const s = await store();
  await s.set("history", [run, ...(await getHistory())].slice(0, HISTORY_MAX));
}

export const HANDLED: HistoryStatus[] = ["synced", "released", "skipped"];

/** The latest handled entry per track id across every run, so a track decided once isn't offered again from any source. */
export type HandledTrack = HistoryTrack & { at: string; sourceUrl: string };

export function handledTracks(runs: HistoryRun[]): Map<string, HandledTrack> {
  const out = new Map<string, HandledTrack>();
  for (const run of runs) {
    for (const t of run.tracks) {
      if (!out.has(t.id) && HANDLED.includes(t.status)) out.set(t.id, { ...t, at: run.at, sourceUrl: run.sourceUrl });
    }
  }
  return out;
}

/** Forgets every run and every source's checkpoint, so all tracks get offered again. Saved links and settings stay. */
export async function resetHistory() {
  const s = await store();
  await s.set("history", []);
  for (const p of ["soundcloud", "youtube"] as const) {
    const state = await getPlatform(p);
    await setPlatform(p, { ...state, checkpoints: {} });
  }
}

/** Drops every track whose latest decision was "synced" from history and from each checkpoint, for when their files are gone. Returns how many. */
export async function forgetSynced(): Promise<number> {
  const s = await store();
  const runs = await getHistory();
  const gone = new Set([...handledTracks(runs).values()].filter((t) => t.status === "synced").map((t) => t.id));
  if (!gone.size) return 0;
  const kept = runs
    .map((run) => {
      const tracks = run.tracks.filter((t) => !gone.has(t.id));
      return { ...run, tracks, counts: { ...run.counts, synced: tracks.filter((t) => t.status === "synced").length } };
    })
    .filter((run) => run.tracks.length);
  await s.set("history", kept);
  for (const p of ["soundcloud", "youtube"] as const) {
    const state = await getPlatform(p);
    for (const [url, cp] of Object.entries(state.checkpoints)) {
      const seenIds = cp.seenIds.filter((id) => !gone.has(id));
      // the stop point would hide forgotten tracks older than it, so scan from the top again
      if (seenIds.length !== cp.seenIds.length) state.checkpoints[url] = { ...cp, seenIds, topId: null };
    }
    await setPlatform(p, state);
  }
  return gone.size;
}
