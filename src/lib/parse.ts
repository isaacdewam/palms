import type { RawTrack } from "./api";

export interface ParsedTrack {
  artist: string;
  title: string;
  /** The artist is the uploader's name, which may be a reposter rather than the artist. */
  artistGuessed?: boolean;
}

const KEEP_QUALIFIER = /\b(remix|mix|edit|vip|flip|bootleg|rework|feat\.?|ft\.?|featuring|version|dub|acoustic|live|cover|refix)\b/i;

const JUNK_PATTERNS: RegExp[] = [
  /^\s*(premiere|exclusive|new|world premiere)\s*[:|-]\s*/i,
  /\b(free\s*(dl|download)|out\s*now|download\s*link\s*in\s*description|buy\s*=\s*free)\b/gi,
  /\b(official\s*(music\s*)?(video|audio|visualizer|lyric\s*video)|lyric\s*video|lyrics?|visualizer|audio)\b/gi,
  /\b(hd|hq|4k|1080p|720p)\b/gi,
  /#\w+/g,
  /\*+/g,
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,
];

function stripBrackets(s: string): string {
  // drop (…) / […] / {…} groups unless they carry meaning like (feat. X) or (Y Remix)
  return s.replace(/[([{]([^)\]}]*)[)\]}]/g, (_m, inner: string) => {
    const clean = inner.trim();
    if (!clean) return "";
    return KEEP_QUALIFIER.test(clean) ? `(${clean})` : "";
  }).replace(/\(\s*\)/g, "");
}

function tidy(s: string): string {
  return s
    .replace(/\s+\|.*$/, "") // "Song | Channel Name"
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—~|:]+|[\s\-–—~|:]+$/g, "")
    .trim();
}

export function cleanTitle(raw: string): string {
  let s = raw;
  for (const p of JUNK_PATTERNS) s = s.replace(p, " ");
  s = stripBrackets(s);
  return tidy(s);
}

/** Moves "ft. X" out of the artist and normalises it into the title as "(feat. X)". */
function normaliseFeat(artist: string, title: string): ParsedTrack {
  const featRe = /\s+(?:ft\.?|feat\.?|featuring)\s+(.+)$/i;
  const a = artist.match(featRe);
  if (a) {
    artist = artist.replace(featRe, "").trim();
    if (!/feat\./i.test(title)) title = `${title} (feat. ${a[1].trim()})`;
  }
  // bare "Song ft. X" -> "Song (feat. X)"
  title = title.replace(/\s+(?:ft\.?|feat\.?|featuring)\s+([^()]+)$/i, " (feat. $1)");
  title = title.replace(/\((?:ft\.?|featuring)\s+/i, "(feat. ");
  return { artist: artist.trim(), title: title.trim() };
}

function cleanUploader(u?: string | null): string {
  return (u ?? "")
    .replace(/\s+-\s+Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\s*\b(official|music|records?)\b\s*$/i, "")
    .trim();
}

export function parseTrack(t: RawTrack): ParsedTrack {
  const cleaned = cleanTitle(t.title);
  const sep = cleaned.match(/^(.+?)\s+[-–—~]\s+(.+)$/);
  if (sep) return normaliseFeat(tidy(sep[1]), tidy(sep[2]));

  // YouTube Music / auto-generated uploads carry proper track metadata
  if (t.platform === "youtube" && t.artist && t.track) {
    return normaliseFeat(t.artist.split(",")[0].trim(), cleanTitle(t.track));
  }
  return { ...normaliseFeat(cleanUploader(t.uploader) || "Unknown Artist", cleaned || t.title), artistGuessed: true };
}

/** First credited artist, which is what DSP searches match best on. */
export function primaryArtist(artist: string): string {
  return artist.split(/\s*(?:,|&|\+|\bx\b|\band\b|\bvs\.?\b|\bfeat\.?\b|\bft\.?\b)\s*/i)[0].trim() || artist;
}

/** Title without (feat. …) for searching. */
export function searchTitle(title: string): string {
  return title.replace(/\s*\((?:feat\.|ft\.)[^)]*\)/i, "").trim();
}

// letters and digits in any script, so "Øyvind" and "beyoncé" count as whole words
const WORD = /[\p{L}\p{N}'’]/u;
const EDGES = /^[\s\-–—~|:,&+]+|[\s\-–—~|:,&+]+$/g;

/** Removes `start..end` from `s` and tidies what's left, e.g. cutting "Skrillex" out of "Skrillex - Bangarang" leaves "Bangarang". */
export function cutRange(s: string, start: number, end: number): string {
  return (s.slice(0, start) + " " + s.slice(end))
    .replace(/[([{]\s*[)\]}]/g, "")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(EDGES, "")
    .trim();
}

/** Highlighted text without the separators and spaces caught at its edges. */
export function trimSeparators(s: string): string {
  return s.replace(EDGES, "").trim();
}

/** Widens `start..end` to whole words, so highlighting part of a name still recases the name. */
export function expandToWords(s: string, start: number, end: number): [number, number] {
  while (start > 0 && WORD.test(s[start - 1])) start--;
  while (end < s.length && WORD.test(s[end])) end++;
  // drop the spaces a double-click or drag picks up at the edges
  while (start < end && /\s/.test(s[start])) start++;
  while (end > start && /\s/.test(s[end - 1])) end--;
  return [start, end];
}

/** "dj SNAKE" -> "Dj Snake": each word's first letter up, the rest down. */
export function capitalizeWords(s: string): string {
  return s.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_m, pre: string, c: string) => pre + c.toUpperCase());
}

/** Every whole-word match of `name` in `s`, ignoring case, rewritten to `name`'s casing. */
export function recaseName(s: string, name: string): string {
  if (!name.trim()) return s;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return s.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "giu"), name);
}

/** Like recaseName, but only inside a title's brackets, where credits like (feat. X) and (X Remix) live. */
export function recaseCredits(title: string, name: string): string {
  return title.replace(/[([{][^)\]}]*[)\]}]/g, (group) => recaseName(group, name));
}
