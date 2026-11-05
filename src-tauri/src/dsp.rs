//! "Is this track already on a streaming service?" Searches Spotify (when
//! credentials are set), Deezer and Apple Music, and decides whether any result
//! is the same recording.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::{Duration, Instant};
use tauri::State;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DspMatch {
    service: String,
    artist: String,
    title: String,
    url: String,
}

#[derive(Serialize, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DspCheck {
    Matched { found: DspMatch },
    /// Every service answered and nothing matched.
    NotFound,
    /// Nothing matched, but at least one service couldn't be asked, so "unreleased" isn't known.
    Failed { errors: Vec<String> },
}

// ---------------------------------------------------------------------------
// matching

const STOP_WORDS: &[&str] = &["the", "a", "an", "and", "of", "to", "in", "on"];
const REMIX_WORDS: &[&str] = &["remix", "edit", "flip", "bootleg", "vip", "rework", "refix"];
/// "Radio Edit", "Original Mix" etc. label a cut of the original rather than a remix.
const NOT_REMIX_BEFORE: &[&str] = &["original", "radio", "extended", "album", "single", "clean", "explicit", "short"];
/// A " - suffix" containing one of these is a version label (Spotify's "Song - X Remix"), not part of the title.
const VERSION_WORDS: &[&str] = &[
    "remix", "edit", "mix", "flip", "bootleg", "vip", "rework", "refix", "version", "remaster", "remastered", "live", "acoustic",
    "instrumental", "demo", "mono", "stereo", "radio", "extended", "deluxe", "edition", "feat", "ft", "featuring", "with", "from",
    "sped", "slowed", "prod",
];
/// Bracketed or dashed segments that credit people rather than describe the version.
const CREDIT_WORDS: &[&str] = &["feat", "ft", "featuring", "with", "prod"];
const ARTIST_SEPARATORS: &[&str] = &["x", "and", "feat", "ft", "featuring", "vs", "with"];

fn tokens(s: &str) -> Vec<String> {
    s.to_lowercase()
        .replace(['\'', '’'], "")
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(str::to_string)
        .collect()
}

fn content_words(ts: &[String]) -> HashSet<&str> {
    ts.iter().map(String::as_str).filter(|t| !STOP_WORDS.contains(t)).collect()
}

fn jaccard(a: &HashSet<&str>, b: &HashSet<&str>) -> f64 {
    let union = a.union(b).count();
    if union == 0 { 0.0 } else { a.intersection(b).count() as f64 / union as f64 }
}

fn levenshtein_ratio(a: &str, b: &str) -> f64 {
    let (a, b): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let longest = a.len().max(b.len());
    if longest == 0 {
        return 1.0;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() {
            cur[j + 1] = (prev[j] + usize::from(ca != cb)).min(prev[j + 1] + 1).min(cur[j] + 1);
        }
        prev = cur;
    }
    1.0 - prev[b.len()] as f64 / longest as f64
}

/// A title split into the name itself and the version labels around it.
struct Title {
    core: Vec<String>,
    /// Bracketed groups and " - suffixes", minus credits like "feat. X".
    labels: Vec<Vec<String>>,
}

impl Title {
    fn parse(raw: &str) -> Title {
        let (mut core, mut groups, mut cur, mut depth) = (String::new(), Vec::new(), String::new(), 0);
        for c in raw.chars() {
            match c {
                '(' | '[' | '{' => {
                    if depth > 0 {
                        cur.push(' ');
                    }
                    depth += 1;
                }
                ')' | ']' | '}' if depth > 0 => {
                    depth -= 1;
                    if depth == 0 {
                        groups.push(std::mem::take(&mut cur));
                    }
                }
                _ if depth > 0 => cur.push(c),
                _ => core.push(c),
            }
        }
        // an unclosed bracket is more likely a typo than a label
        core.push_str(&cur);

        let mut parts = core.split(" - ");
        let mut name = parts.next().unwrap_or_default().to_string();
        for tail in parts {
            if tokens(tail).iter().any(|t| VERSION_WORDS.contains(&t.as_str())) {
                groups.push(tail.to_string());
            } else {
                name.push_str(" - ");
                name.push_str(tail);
            }
        }
        let labels = groups
            .iter()
            .map(|g| tokens(g))
            .filter(|ts| ts.first().is_some_and(|t| !CREDIT_WORDS.contains(&t.as_str())))
            .collect();
        Title { core: tokens(&name), labels }
    }

    fn key(&self) -> String {
        self.core.concat()
    }

    /// `None` = not a remix. `Some(None)` = a remix by someone we can't tell. `Some(Some(names))` = remixed by `names`.
    fn remix(&self) -> Option<Option<Vec<String>>> {
        let find = |ts: &[String]| {
            ts.iter().enumerate().position(|(i, t)| {
                let is_kind = REMIX_WORDS.contains(&t.as_str()) || (t == "mix" && i > 0);
                is_kind && !(i > 0 && NOT_REMIX_BEFORE.contains(&ts[i - 1].as_str()))
            })
        };
        for label in &self.labels {
            if let Some(i) = find(label) {
                return Some(Some(label[..i].iter().filter(|t| !STOP_WORDS.contains(&t.as_str())).cloned().collect()));
            }
        }
        // "Song Skrillex Remix" with no separator: it's a remix, but the remixer can't be told from the title
        find(&self.core).map(|_| None)
    }
}

fn titles_match(w: &Title, g: &Title) -> bool {
    let (wk, gk) = (w.key(), g.key());
    if wk.is_empty() || gk.is_empty() {
        return false;
    }
    if wk == gk {
        return true;
    }
    let (ws, gs) = (content_words(&w.core), content_words(&g.core));
    // one-word titles must match exactly, otherwise "jump" finds "Jumpman" and "secret" finds "Secrets"
    if ws.len() <= 1 || gs.len() <= 1 {
        return false;
    }
    jaccard(&ws, &gs) >= 0.8 || levenshtein_ratio(&w.core.join(" "), &g.core.join(" ")) >= 0.9
}

/// Remixes only match remixes by the same people, so an unreleased remix of a released song stays unreleased.
fn versions_match(w: &Title, g: &Title) -> bool {
    match (w.remix(), g.remix()) {
        (None, None) => true,
        (Some(Some(a)), Some(Some(b))) => {
            let (a, b): (Vec<&str>, Vec<&str>) = (a.iter().map(String::as_str).collect(), b.iter().map(String::as_str).collect());
            a == b || jaccard(&a.into_iter().collect(), &b.into_iter().collect()) >= 0.8
        }
        _ => false,
    }
}

/// Individual credited names, normalised: "Osamason + okaymar" -> ["osamason", "okaymar"].
fn artist_names(s: &str) -> Vec<String> {
    let spaced = s.to_lowercase().replace([',', '&', '+', '/', ';'], " | ");
    let mut names = vec![String::new()];
    for word in spaced.split_whitespace() {
        let bare = word.trim_end_matches('.');
        if word == "|" || ARTIST_SEPARATORS.contains(&bare) {
            names.push(String::new());
        } else {
            names.last_mut().unwrap().extend(word.chars().filter(|c| c.is_alphanumeric()));
        }
    }
    names.retain(|n| !n.is_empty());
    names
}

fn artists_match(want: &str, got: &str) -> bool {
    let got = artist_names(got);
    artist_names(want).iter().any(|w| {
        got.iter().any(|g| w == g || (w.len().min(g.len()) >= 5 && levenshtein_ratio(w, g) >= 0.9))
    })
}

pub fn is_unknown_artist(a: &str) -> bool {
    let a = a.trim();
    a.is_empty() || a.eq_ignore_ascii_case("unknown artist")
}

/// Whether a search result is the track we're looking for. The artist always has to agree: a
/// same-titled song by someone else is a different song, so an unknown artist never matches.
pub fn is_match(want_artist: &str, want_title: &str, got_artist: &str, got_title: &str) -> bool {
    let (w, g) = (Title::parse(want_title), Title::parse(got_title));
    !is_unknown_artist(want_artist) && artists_match(want_artist, got_artist) && versions_match(&w, &g) && titles_match(&w, &g)
}

// ---------------------------------------------------------------------------
// searching

const RESULT_LIMIT: u32 = 25;

struct Candidate {
    service: &'static str,
    artist: String,
    title: String,
    url: String,
}

#[derive(Clone, Copy)]
enum Service {
    Spotify,
    Deezer,
    Itunes,
}

impl Service {
    fn name(self) -> &'static str {
        match self {
            Service::Spotify => "Spotify",
            Service::Deezer => "Deezer",
            Service::Itunes => "Apple Music",
        }
    }
}

enum Query<'a> {
    /// Field-scoped search where the service supports it.
    Fields { artist: &'a str, title: &'a str },
    Text(String),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyCreds {
    client_id: String,
    client_secret: String,
}

struct CachedToken {
    creds: (String, String),
    token: String,
    expires: Instant,
}

/// Deezer allows 50 requests per 5 seconds per IP; spacing them a little wider keeps parallel checks under it.
const DEEZER_SPACING: Duration = Duration::from_millis(120);
/// Waits after Deezer's "Quota limit exceeded" (error code 4), long enough for its 5 second window to roll over.
const DEEZER_QUOTA_BACKOFF: &[u64] = &[3, 6];

/// Shared HTTP client, the Spotify app token (which lasts an hour and shouldn't be fetched per track),
/// and the next free slot for a Deezer request.
pub struct Dsp {
    pub(crate) client: reqwest::Client,
    spotify_token: tokio::sync::Mutex<Option<CachedToken>>,
    deezer_next: tokio::sync::Mutex<Instant>,
}

impl Dsp {
    pub fn new() -> Dsp {
        Dsp {
            client: reqwest::Client::builder().timeout(Duration::from_secs(12)).build().expect("http client"),
            spotify_token: tokio::sync::Mutex::new(None),
            deezer_next: tokio::sync::Mutex::new(Instant::now()),
        }
    }

    /// Claims the next Deezer slot and sleeps until it, so every concurrent check shares one request rate.
    async fn deezer_slot(&self) {
        let at = {
            let mut next = self.deezer_next.lock().await;
            let at = (*next).max(Instant::now());
            *next = at + DEEZER_SPACING;
            at
        };
        tokio::time::sleep_until(at.into()).await;
    }

    /// Deezer search, waiting out its quota error a couple of times before giving up.
    async fn deezer_search(&self, q: &str) -> Result<serde_json::Value, String> {
        let url = format!("https://api.deezer.com/search?q={q}&limit={RESULT_LIMIT}");
        let mut backoff = DEEZER_QUOTA_BACKOFF.iter();
        loop {
            self.deezer_slot().await;
            let v = send_json(self.client.get(&url)).await?;
            // Deezer reports quota and query errors with a 200 and an error object
            let Some(e) = v.get("error") else { return Ok(v) };
            if e.get("code").and_then(|c| c.as_u64()) == Some(4) {
                match backoff.next() {
                    Some(&secs) => {
                        self.push_deezer_back(Duration::from_secs(secs)).await;
                        continue;
                    }
                    None => return Err("rate limited".into()),
                }
            }
            return Err(e.get("message").and_then(|m| m.as_str()).unwrap_or("error response").to_string());
        }
    }

    /// Holds every queued Deezer request back, not just the one that hit the quota.
    async fn push_deezer_back(&self, by: Duration) {
        let mut next = self.deezer_next.lock().await;
        *next = (*next).max(Instant::now() + by);
    }

    async fn spotify_token(&self, creds: &SpotifyCreds) -> Result<String, String> {
        // held across the fetch so a batch of parallel checks shares one token request
        let mut cached = self.spotify_token.lock().await;
        let key = (creds.client_id.clone(), creds.client_secret.clone());
        if let Some(t) = cached.as_ref().filter(|t| t.creds == key && t.expires > Instant::now()) {
            return Ok(t.token.clone());
        }
        let req = self
            .client
            .post("https://accounts.spotify.com/api/token")
            .basic_auth(&creds.client_id, Some(&creds.client_secret))
            .form(&[("grant_type", "client_credentials")]);
        let v = send_json(req).await.map_err(|e| match e.as_str() {
            "HTTP 400" | "HTTP 401" => "client ID or secret rejected".to_string(),
            _ => e,
        })?;
        let token = v.get("access_token").and_then(|x| x.as_str()).ok_or("no access token in response")?.to_string();
        let ttl = v.get("expires_in").and_then(|x| x.as_u64()).unwrap_or(3600);
        *cached = Some(CachedToken {
            creds: key,
            token: token.clone(),
            expires: Instant::now() + Duration::from_secs(ttl.saturating_sub(60)),
        });
        Ok(token)
    }

    async fn query(&self, svc: Service, q: &Query<'_>, spotify: Option<&SpotifyCreds>) -> Result<Vec<Candidate>, String> {
        let text = match q {
            Query::Text(t) => t.clone(),
            Query::Fields { artist, title } => match svc {
                Service::Spotify => format!("track:{title} artist:{artist}"),
                Service::Deezer => format!("artist:\"{artist}\" track:\"{title}\""),
                Service::Itunes => format!("{artist} {title}"),
            },
        };
        let q = urlencoding::encode(&text);
        match svc {
            Service::Deezer => {
                let v = self.deezer_search(&q).await?;
                Ok(items(&v, "/data")?
                    .iter()
                    .map(|i| Candidate {
                        service: svc.name(),
                        artist: str_at(i, "/artist/name"),
                        title: str_at(i, "/title"),
                        url: str_at(i, "/link"),
                    })
                    .collect())
            }
            Service::Itunes => {
                let url = format!("https://itunes.apple.com/search?media=music&entity=song&limit={RESULT_LIMIT}&term={q}");
                let v = send_json(self.client.get(url)).await?;
                Ok(items(&v, "/results")?
                    .iter()
                    .map(|i| Candidate {
                        service: svc.name(),
                        artist: str_at(i, "/artistName"),
                        title: str_at(i, "/trackName"),
                        url: str_at(i, "/trackViewUrl"),
                    })
                    .collect())
            }
            Service::Spotify => {
                let creds = spotify.ok_or("no credentials")?;
                let token = self.spotify_token(creds).await?;
                let search = |limit: u32| {
                    self.client
                        .get(format!("https://api.spotify.com/v1/search?type=track&limit={limit}&q={q}"))
                        .bearer_auth(&token)
                };
                let v = match send_json(search(RESULT_LIMIT)).await {
                    // apps in development mode may be capped at a smaller page size
                    Err(e) if e == "HTTP 400" => send_json(search(10)).await?,
                    Err(e) if e == "HTTP 401" => {
                        *self.spotify_token.lock().await = None;
                        return Err("token expired, will refresh on the next track".into());
                    }
                    r => r?,
                };
                Ok(items(&v, "/tracks/items")?
                    .iter()
                    .map(|i| Candidate {
                        service: svc.name(),
                        artist: i
                            .get("artists")
                            .and_then(|a| a.as_array())
                            .map(|a| a.iter().filter_map(|x| x.get("name")?.as_str()).collect::<Vec<_>>().join(", "))
                            .unwrap_or_default(),
                        title: str_at(i, "/name"),
                        url: str_at(i, "/external_urls/spotify"),
                    })
                    .collect())
            }
        }
    }

    /// Everything one service returns for this track: an artist+title search, retried as plain text
    /// if it comes back empty.
    async fn candidates(&self, svc: Service, artist: &str, title: &str, spotify: Option<&SpotifyCreds>) -> Result<Vec<Candidate>, String> {
        let out = self.query(svc, &Query::Fields { artist, title }, spotify).await?;
        // iTunes is already a plain-text search, so retrying would repeat the same request
        if out.is_empty() && !matches!(svc, Service::Itunes) {
            return self.query(svc, &Query::Text(format!("{artist} {title}")), spotify).await;
        }
        Ok(out)
    }
}

fn str_at(v: &serde_json::Value, ptr: &str) -> String {
    v.pointer(ptr).and_then(|x| x.as_str()).unwrap_or_default().to_string()
}

fn items<'a>(v: &'a serde_json::Value, ptr: &str) -> Result<&'a Vec<serde_json::Value>, String> {
    v.pointer(ptr).and_then(|x| x.as_array()).ok_or_else(|| "unexpected response shape".to_string())
}

/// Sends a request and parses JSON, waiting out one 429 (Retry-After, capped at 10s) before giving up.
async fn send_json(req: reqwest::RequestBuilder) -> Result<serde_json::Value, String> {
    let describe = |e: reqwest::Error| if e.is_timeout() { "timed out".to_string() } else { e.to_string() };
    let retry = req.try_clone();
    let mut res = req.send().await.map_err(describe)?;
    if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        if let Some(retry) = retry {
            let wait = res
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(2)
                .min(10);
            tokio::time::sleep(Duration::from_secs(wait)).await;
            res = retry.send().await.map_err(describe)?;
        }
    }
    if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("rate limited".into());
    }
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status().as_u16()));
    }
    res.json().await.map_err(|e| format!("unreadable response: {e}"))
}

/// First match across the services, in the order given.
fn pick(results: &[Vec<Candidate>], artist: &str, title: &str) -> Option<DspMatch> {
    results.iter().flatten().find(|c| is_match(artist, title, &c.artist, &c.title)).map(|c| DspMatch {
        service: c.service.into(),
        artist: c.artist.clone(),
        title: c.title.clone(),
        url: c.url.clone(),
    })
}

#[tauri::command]
pub async fn check_dsp(
    dsp: State<'_, Dsp>,
    artist: String,
    title: String,
    spotify: Option<SpotifyCreds>,
) -> Result<DspCheck, String> {
    // nothing can match without an artist to compare against
    if is_unknown_artist(&artist) {
        return Ok(DspCheck::NotFound);
    }
    let spotify = spotify.filter(|s| !s.client_id.is_empty() && !s.client_secret.is_empty());
    let mut found: Vec<Vec<Candidate>> = Vec::new();
    let mut errors = Vec::new();

    if let Some(creds) = &spotify {
        match dsp.candidates(Service::Spotify, &artist, &title, Some(creds)).await {
            Ok(c) => {
                if let Some(m) = pick(std::slice::from_ref(&c), &artist, &title) {
                    return Ok(DspCheck::Matched { found: m });
                }
                found.push(c);
            }
            Err(e) => errors.push(format!("Spotify: {e}")),
        }
    }

    let (deezer, itunes) = tokio::join!(
        dsp.candidates(Service::Deezer, &artist, &title, None),
        dsp.candidates(Service::Itunes, &artist, &title, None),
    );
    for (svc, r) in [(Service::Deezer, deezer), (Service::Itunes, itunes)] {
        match r {
            Ok(c) => found.push(c),
            Err(e) => errors.push(format!("{}: {e}", svc.name())),
        }
    }

    Ok(match pick(&found, &artist, &title) {
        Some(m) => DspCheck::Matched { found: m },
        None if errors.is_empty() => DspCheck::NotFound,
        None => DspCheck::Failed { errors },
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn m(wa: &str, wt: &str, ga: &str, gt: &str) -> bool {
        is_match(wa, wt, ga, gt)
    }

    #[test]
    fn exact() {
        assert_eq!(m("Fred again..", "Delilah (pull me out of this)", "Fred again..", "Delilah (pull me out of this)"), true);
        assert_eq!(m("Duwap Kaine", "under the sun", "Duwap Kaine", "Under The Sun"), true);
        assert_eq!(m("Someone", "Song", "Other", "Song"), false);
    }

    #[test]
    fn feat_credits_are_ignored() {
        assert_eq!(m("NDO Dee", "Shots", "NDO Dee", "Shots (feat. Baby Bartier)"), true);
        assert_eq!(m("NDO Dee", "Shots (feat. Baby Bartier)", "NDO Dee", "Shots"), true);
        assert_eq!(m("NDO Dee", "Shots", "NDO Dee", "Shots - feat. Baby Bartier"), true);
    }

    #[test]
    fn one_word_titles_need_an_exact_match() {
        assert_eq!(m("osamason", "jump", "osamason", "Jumpman"), false);
        assert_eq!(m("osamason", "secret", "osamason", "Secrets"), false);
        assert_eq!(m("osamason", "secret", "osamason", "Secret"), true);
    }

    #[test]
    fn longer_titles_tolerate_small_differences() {
        assert_eq!(m("A", "Somebody that I used to know", "A", "Somebody That I Use To Know"), true);
        assert_eq!(m("A", "Lost in the night", "A", "Found in the morning"), false);
    }

    #[test]
    fn edition_and_version_labels_are_not_remixes() {
        assert_eq!(m("Artist", "Song", "Artist", "Song (Deluxe Edition)"), true);
        assert_eq!(m("Artist", "Song", "Artist", "Song - Radio Edit"), true);
        assert_eq!(m("Artist", "Song", "Artist", "Song - Remastered 2011"), true);
        assert_eq!(m("Artist", "Credit Score", "Artist", "Credit Score"), true);
        assert_eq!(m("Artist", "Vipers", "Artist", "Vipers"), true);
    }

    #[test]
    fn remixes_must_match_the_remixer() {
        assert_eq!(m("Fred again..", "Delilah (Skrillex Remix)", "Fred again..", "Delilah"), false);
        assert_eq!(m("Fred again..", "Delilah", "Fred again..", "Delilah - Skrillex Remix"), false);
        assert_eq!(m("Fred again..", "Delilah (Skrillex Remix)", "Fred again..", "Delilah (Four Tet Remix)"), false);
        assert_eq!(m("Fred again..", "Delilah (Skrillex Remix)", "Fred again..", "Delilah - Skrillex Remix"), true);
        assert_eq!(m("Artist", "Song (VIP)", "Artist", "Song (VIP)"), true);
    }

    #[test]
    fn multi_artist_credits() {
        assert_eq!(m("okaymar", "unnecessary", "osamason, okaymar", "unnecessary"), true);
        assert_eq!(m("osamason + okaymar", "unnecessary", "osamason", "unnecessary"), true);
        assert_eq!(m("Tyler, The Creator", "Song", "Tyler, The Creator & Kali Uchis", "Song"), true);
        assert_eq!(m("lil o", "location", "lil oasis", "location"), false);
    }

    #[test]
    fn the_artist_has_to_match() {
        assert_eq!(m("slimepointe", "secret", "osamason", "secret"), false);
        assert_eq!(m("Unknown Artist", "pretty", "che", "pretty"), false);
        assert_eq!(m("", "pretty", "che", "pretty"), false);
    }

    #[test]
    fn artist_names_split_on_credits() {
        assert_eq!(artist_names("Osamason + okaymar"), vec!["osamason", "okaymar"]);
        assert_eq!(artist_names("A feat. B & C x D"), vec!["a", "b", "c", "d"]);
        assert_eq!(artist_names("Fred again.."), vec!["fredagain"]);
    }
}
