import { invoke } from "@tauri-apps/api/core";

export type Platform = "soundcloud" | "youtube";

export interface RawTrack {
  id: string;
  title: string;
  uploader?: string | null;
  artist?: string | null;
  track?: string | null;
  thumbnail?: string | null;
  url: string;
  duration?: number | null;
  platform: Platform;
}

export interface DspMatch {
  service: string;
  artist: string;
  title: string;
  url: string;
}

export type DspCheck =
  | { kind: "matched"; found: DspMatch }
  | { kind: "notFound" }
  /** Nothing matched, but at least one service couldn't be asked. */
  | { kind: "failed"; errors: string[] };

export interface SpotifyCreds {
  clientId: string;
  clientSecret: string;
}

export const api = {
  scrape: (url: string, stopAtId: string | null, limit: number) =>
    invoke<RawTrack[]>("scrape", { url, stopAtId, limit }),
  checkDsp: (artist: string, title: string, spotify?: SpotifyCreds) =>
    invoke<DspCheck>("check_dsp", { artist, title, spotify: spotify ?? null }),
  syncTrack: (req: {
    id: string;
    url: string;
    title: string;
    artist: string;
    album?: string;
    cover?: string;
    folder: string;
  }) => invoke<string>("sync_track", { req }),
  /** For each track, the file already in `folder` that holds it, or null. */
  findLocal: (folder: string, tracks: { artist: string; title: string }[]) =>
    invoke<(string | null)[]>("find_local", { folder, tracks }),
  /** Any cover (url or local path) as a data url the webview can display and draw to a canvas. */
  loadImage: (src: string) => invoke<string>("load_image", { src }),
  /** Saves a cropped jpeg data url and returns the file path to use as the cover. */
  saveCover: (id: string, dataUrl: string) => invoke<string>("save_cover", { id, dataUrl }),
  /** How many audio files clearing `folder` would move to the Trash. */
  countAudio: (folder: string) => invoke<number>("count_audio", { folder }),
  /** Moves every audio file in `folder` to the Trash and returns how many went. */
  clearFolder: (folder: string) => invoke<number>("clear_folder", { folder }),
  defaultMusicDir: () => invoke<string>("default_music_dir"),
  /** Creates `name` inside `parent` and returns the new folder's path. */
  makeDir: (parent: string, name: string) => invoke<string>("make_dir", { parent, name }),
  checkTools: () => invoke<string>("check_tools"),
};

export function detectPlatform(url: string): Platform | null {
  if (/soundcloud\.com/i.test(url)) return "soundcloud";
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  return null;
}
