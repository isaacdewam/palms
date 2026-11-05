use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

mod dsp;

/// macOS GUI apps don't inherit the shell PATH, so look in the usual places.
fn find_bin(name: &str) -> String {
    let candidates = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
    for dir in candidates {
        let p = Path::new(dir).join(name);
        if p.exists() {
            return p.to_string_lossy().into_owned();
        }
    }
    name.to_string()
}

fn tool_path_env() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    format!("/opt/homebrew/bin:/usr/local/bin:{base}")
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RawTrack {
    id: String,
    title: String,
    uploader: Option<String>,
    artist: Option<String>,
    track: Option<String>,
    thumbnail: Option<String>,
    url: String,
    duration: Option<f64>,
    platform: String,
}

fn json_str(v: &serde_json::Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string()).filter(|s| !s.is_empty())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScrapeProgress {
    count: usize,
    title: String,
}

/// Streams full metadata for each entry, newest first. Stops early when it
/// reaches `stop_at_id` (the saved checkpoint) or `limit` entries.
#[tauri::command]
async fn scrape(
    app: AppHandle,
    url: String,
    stop_at_id: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<RawTrack>, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!("Not a link: {url}"));
    }
    let limit = limit.unwrap_or(200);
    let mut child = Command::new(find_bin("yt-dlp"))
        .env("PATH", tool_path_env())
        .args([
            "-j",
            "--skip-download",
            "--ignore-errors",
            "--no-warnings",
            "--playlist-end",
            &limit.to_string(),
            "--",
            &url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Could not start yt-dlp (is it installed?): {e}"))?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let mut lines = BufReader::new(stdout).lines();
    let mut out = Vec::new();
    let mut stopped = false;

    while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
        let id = json_str(&v, "id").unwrap_or_default();
        if stop_at_id.as_deref() == Some(id.as_str()) {
            let _ = child.kill().await;
            stopped = true;
            break;
        }
        let extractor = json_str(&v, "extractor_key").unwrap_or_default().to_lowercase();
        let platform = if extractor.contains("soundcloud") { "soundcloud" } else { "youtube" };
        let t = RawTrack {
            id,
            title: json_str(&v, "title").unwrap_or_default(),
            uploader: json_str(&v, "uploader").or_else(|| json_str(&v, "channel")),
            artist: json_str(&v, "artist").or_else(|| json_str(&v, "creator")),
            track: json_str(&v, "track"),
            thumbnail: json_str(&v, "thumbnail"),
            url: json_str(&v, "webpage_url").or_else(|| json_str(&v, "original_url")).unwrap_or_default(),
            duration: v.get("duration").and_then(|d| d.as_f64()),
            platform: platform.into(),
        };
        let _ = app.emit("scrape-progress", ScrapeProgress { count: out.len() + 1, title: t.title.clone() });
        out.push(t);
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if out.is_empty() && !status.success() && !stopped {
        let mut err = String::new();
        if let Some(mut se) = child.stderr.take() {
            use tokio::io::AsyncReadExt;
            let _ = se.read_to_string(&mut err).await;
        }
        return Err(format!("yt-dlp failed: {}", err.trim()));
    }
    Ok(out)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncRequest {
    id: String,
    url: String,
    title: String,
    artist: String,
    album: Option<String>,
    cover: Option<String>,
    folder: String,
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
        .collect::<String>()
        .trim()
        .to_string()
}

async fn load_cover(client: &reqwest::Client, cover: &str) -> Option<(Vec<u8>, String)> {
    if cover.starts_with("http") {
        let r = client.get(cover).send().await.ok()?.error_for_status().ok()?;
        let mime = r.headers().get("content-type").and_then(|h| h.to_str().ok()).unwrap_or("image/jpeg").to_string();
        let bytes = r.bytes().await.ok()?.to_vec();
        Some((bytes, mime))
    } else {
        let bytes = tokio::fs::read(cover).await.ok()?;
        let mime = if cover.to_lowercase().ends_with(".png") { "image/png" } else { "image/jpeg" };
        Some((bytes, mime.into()))
    }
}

/// A cover (http url or local path) as a data url, so the webview can show and crop it without file access or CORS.
#[tauri::command]
async fn load_image(dsp: tauri::State<'_, dsp::Dsp>, src: String) -> Result<String, String> {
    use base64::Engine;
    let (bytes, mime) = load_cover(&dsp.client, &src).await.ok_or_else(|| format!("Could not load image: {src}"))?;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

/// Writes a cropped cover (jpeg data url) to the app's covers folder and returns its path.
#[tauri::command]
async fn save_cover(app: AppHandle, id: String, data_url: String) -> Result<String, String> {
    use base64::Engine;
    let b64 = data_url.split_once(";base64,").map(|(_, b)| b).ok_or("Not a base64 data url")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("covers");
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    // a fresh name per crop, so a re-crop never shows a cached older image
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = dir.join(format!("{}-{stamp}.jpg", sanitize(&id)));
    tokio::fs::write(&path, bytes).await.map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Downloads audio as mp3, writes ID3 tags + artwork, drops it in `folder`.
#[tauri::command]
async fn sync_track(app: AppHandle, dsp: tauri::State<'_, dsp::Dsp>, req: SyncRequest) -> Result<String, String> {
    let tmp = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("downloads");
    tokio::fs::create_dir_all(&tmp).await.map_err(|e| e.to_string())?;
    let safe_id = sanitize(&req.id);
    let template = tmp.join(format!("{safe_id}.%(ext)s"));
    let out = Command::new(find_bin("yt-dlp"))
        .env("PATH", tool_path_env())
        .args(["-x", "--audio-format", "mp3", "--audio-quality", "0", "--no-playlist", "--no-warnings", "-o"])
        .arg(&template)
        .arg("--")
        .arg(&req.url)
        .output()
        .await
        .map_err(|e| format!("Could not start yt-dlp: {e}"))?;
    if !out.status.success() {
        return Err(format!("Download failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let mp3 = tmp.join(format!("{safe_id}.mp3"));

    let mut tag = id3::Tag::new();
    {
        use id3::TagLike;
        tag.set_title(&req.title);
        tag.set_artist(&req.artist);
        tag.set_album(req.album.clone().filter(|a| !a.is_empty()).unwrap_or_else(|| req.title.clone()));
        tag.set_album_artist(&req.artist);
        if let Some(c) = req.cover.as_deref().filter(|c| !c.is_empty()) {
            if let Some((data, mime_type)) = load_cover(&dsp.client, c).await {
                tag.add_frame(id3::frame::Picture {
                    mime_type,
                    picture_type: id3::frame::PictureType::CoverFront,
                    description: String::new(),
                    data,
                });
            }
        }
    }
    tag.write_to_path(&mp3, id3::Version::Id3v23).map_err(|e| e.to_string())?;

    let folder = PathBuf::from(&req.folder);
    tokio::fs::create_dir_all(&folder).await.map_err(|e| e.to_string())?;
    let dest = folder.join(format!("{} - {}.mp3", sanitize(&req.artist), sanitize(&req.title)));
    // shortcut: two parallel syncs of the same name can still race past this check, fine at 2 download slots
    if tokio::fs::try_exists(&dest).await.unwrap_or(false) {
        let _ = tokio::fs::remove_file(&mp3).await;
        return Err(format!("{} already exists in the folder", dest.file_name().unwrap_or_default().to_string_lossy()));
    }
    if tokio::fs::rename(&mp3, &dest).await.is_err() {
        // cross-device move
        tokio::fs::copy(&mp3, &dest).await.map_err(|e| e.to_string())?;
        let _ = tokio::fs::remove_file(&mp3).await;
    }
    Ok(dest.to_string_lossy().into_owned())
}

/// Lowercase words only, so "Artist - Track (VIP)" and "artist – track [vip]" compare equal.
fn norm(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn track_key(artist: &str, title: &str) -> String {
    format!("{}|{}", norm(artist), norm(title))
}

const AUDIO_EXT: [&str; 6] = ["mp3", "m4a", "flac", "wav", "aiff", "ogg"];

/// Collects an "artist|title" key per audio file from its `Artist - Title` name and, for mp3s, its ID3 tags.
fn collect_local(dir: &Path, depth: u8, keys: &mut std::collections::HashMap<String, String>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let path = e.path();
        if path.is_dir() {
            if depth > 0 {
                collect_local(&path, depth - 1, keys);
            }
            continue;
        }
        let ext = path.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase();
        if !AUDIO_EXT.contains(&ext.as_str()) {
            continue;
        }
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let stem = path.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        if let Some((a, t)) = stem.split_once(" - ") {
            keys.entry(track_key(a, t)).or_insert_with(|| name.clone());
        }
        if ext == "mp3" {
            if let Ok(tag) = id3::Tag::read_from_path(&path) {
                use id3::TagLike;
                if let (Some(a), Some(t)) = (tag.artist(), tag.title()) {
                    keys.entry(track_key(a, t)).or_insert_with(|| name.clone());
                }
            }
        }
    }
}

#[derive(Deserialize)]
struct LocalQuery {
    artist: String,
    title: String,
}

/// For each track, the name of a file in `folder` that already holds it, if any.
#[tauri::command]
async fn find_local(folder: String, tracks: Vec<LocalQuery>) -> Result<Vec<Option<String>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut keys = std::collections::HashMap::new();
        collect_local(Path::new(&folder), 3, &mut keys);
        tracks.iter().map(|t| keys.get(&track_key(&t.artist, &t.title)).cloned()).collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Every audio file in `dir`, looking `depth` folders down, the same reach as `find_local`.
fn audio_files(dir: &Path, depth: u8, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let path = e.path();
        if path.is_dir() {
            if depth > 0 {
                audio_files(&path, depth - 1, out);
            }
        } else if AUDIO_EXT.contains(&path.extension().and_then(|x| x.to_str()).unwrap_or("").to_lowercase().as_str()) {
            out.push(path);
        }
    }
}

/// The folder as a path, refusing the home folder and anything above it so a bad setting can't sweep the whole disk.
fn library_dir(folder: &str) -> Result<PathBuf, String> {
    let dir = PathBuf::from(folder);
    let home = dirs::home_dir().unwrap_or_default();
    if folder.trim().is_empty() || !dir.is_absolute() || home.starts_with(&dir) {
        return Err(format!("Won't clear {folder}: pick a dedicated music folder first"));
    }
    Ok(dir)
}

/// How many audio files clearing `folder` would move to the Trash.
#[tauri::command]
async fn count_audio(folder: String) -> Result<usize, String> {
    let dir = library_dir(&folder)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        audio_files(&dir, 3, &mut files);
        files.len()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Moves every audio file in `folder` to the Trash, leaving other files alone. Returns how many went.
#[tauri::command]
async fn clear_folder(folder: String) -> Result<usize, String> {
    let dir = library_dir(&folder)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut files = Vec::new();
        audio_files(&dir, 3, &mut files);
        if !files.is_empty() {
            let mut trash = trash::TrashContext::default();
            // the default asks Finder through AppleScript, which can stall on an automation prompt; this goes straight to the file system
            #[cfg(target_os = "macos")]
            {
                use trash::macos::{DeleteMethod, TrashContextExtMacos};
                trash.set_delete_method(DeleteMethod::NsFileManager);
            }
            trash.delete_all(&files).map_err(|e| e.to_string())?;
        }
        Ok(files.len())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn default_music_dir() -> String {
    dirs::audio_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join("Music"))
        .join("Spotify Local")
        .to_string_lossy()
        .into_owned()
}

#[tauri::command]
async fn check_tools() -> Result<String, String> {
    let out = Command::new(find_bin("yt-dlp")).arg("--version").output().await
        .map_err(|_| "yt-dlp not found. Install with: brew install yt-dlp ffmpeg".to_string())?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Tauri's default macOS menu (see `Menu::default`) plus Palms > Settings… on Cmd+, the way Mac apps put it. The
/// Edit menu has to stay: it's what makes Cmd+C/V/X/A/Z work in text fields.
#[cfg(target_os = "macos")]
fn app_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
    let info = app.package_info();
    let about = AboutMetadata { name: Some(info.name.clone()), version: Some(info.version.to_string()), ..Default::default() };
    let settings = MenuItemBuilder::with_id("settings", "Settings…").accelerator("CmdOrCtrl+,").build(app)?;
    let palms = SubmenuBuilder::new(app, &info.name)
        .about(Some(about))
        .separator()
        .item(&settings)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file = SubmenuBuilder::new(app, "File").close_window().build()?;
    let edit = SubmenuBuilder::new(app, "Edit").undo().redo().separator().cut().copy().paste().select_all().build()?;
    let view = SubmenuBuilder::new(app, "View").fullscreen().build()?;
    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().separator().close_window().build()?;
    MenuBuilder::new(app).items(&[&palms, &file, &edit, &view, &window]).build()
}

/// WebKit holds page rendering near 60fps by default, even on 120Hz+ displays where Chromium renders every refresh, so
/// scrolling and animations in the app looked half as smooth as in a browser. Safari keeps this behind a feature flag
/// (Develop > Feature Flags > "Prefer Page Rendering Updates near 60fps"); a WKWebView can only reach it through
/// WebKit's private feature list, so this looks it up by name and does nothing if a macOS version lacks it.
#[cfg(target_os = "macos")]
fn uncap_frame_rate(window: &tauri::WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, AnyObject, Bool};
    use objc2::sel;
    use std::ffi::{CStr, c_char};

    let _ = window.with_webview(|webview| unsafe {
        let Some(prefs_class) = AnyClass::get(c"WKPreferences") else { return };
        let listed: Bool = msg_send![prefs_class, respondsToSelector: sel!(_features)];
        if !listed.as_bool() {
            return;
        }
        let wk = webview.inner() as *mut AnyObject;
        let config: *mut AnyObject = msg_send![wk, configuration];
        let prefs: *mut AnyObject = msg_send![config, preferences];
        let settable: Bool = msg_send![prefs, respondsToSelector: sel!(_setEnabled:forFeature:)];
        if prefs.is_null() || !settable.as_bool() {
            return;
        }
        let features: *mut AnyObject = msg_send![prefs_class, _features];
        let count: usize = msg_send![features, count];
        for i in 0..count {
            let feature: *mut AnyObject = msg_send![features, objectAtIndex: i];
            let key: *mut AnyObject = msg_send![feature, key];
            let name: *const c_char = msg_send![key, UTF8String];
            if !name.is_null() && CStr::from_ptr(name) == c"PreferPageRenderingUpdatesNear60FPSEnabled" {
                let _: () = msg_send![prefs, _setEnabled: Bool::NO, forFeature: feature];
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_menu(app_menu(app.handle())?)?;
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                uncap_frame_rate(&window);
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "settings" {
                let _ = app.emit("open-settings", ());
            }
        })
        .manage(dsp::Dsp::new())
        .invoke_handler(tauri::generate_handler![scrape, dsp::check_dsp, sync_track, find_local, load_image, save_cover, default_music_dir, check_tools, count_audio, clear_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_keys_ignore_case_and_punctuation() {
        assert_eq!(track_key("Fred again..", "Delilah (pull me out of this)"), track_key("fred again", "delilah [Pull Me Out Of This]"));
        assert_ne!(track_key("Artist", "Song (VIP)"), track_key("Artist", "Song"));
    }

    #[test]
    fn finds_files_by_name_and_skips_other_files() {
        let dir = std::env::temp_dir().join(format!("palms-local-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("Artist - Song.mp3"), b"").unwrap();
        std::fs::write(dir.join("sub").join("Other - Track (Remix).m4a"), b"").unwrap();
        std::fs::write(dir.join("Artist - Notes.txt"), b"").unwrap();
        let mut keys = std::collections::HashMap::new();
        collect_local(&dir, 3, &mut keys);
        assert_eq!(keys.get(&track_key("artist", "song")).map(String::as_str), Some("Artist - Song.mp3"));
        assert!(keys.contains_key(&track_key("Other", "Track (Remix)")));
        assert!(!keys.contains_key(&track_key("Artist", "Notes")));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn clearing_only_touches_audio_and_never_home() {
        let dir = std::env::temp_dir().join(format!("palms-clear-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("A - B.mp3"), b"").unwrap();
        std::fs::write(dir.join("sub").join("C - D.FLAC"), b"").unwrap();
        std::fs::write(dir.join("notes.txt"), b"").unwrap();
        let mut files = Vec::new();
        audio_files(&dir, 3, &mut files);
        assert_eq!(files.len(), 2);
        std::fs::remove_dir_all(&dir).unwrap();

        let home = dirs::home_dir().unwrap();
        assert!(library_dir(&home.to_string_lossy()).is_err());
        assert!(library_dir("/").is_err());
        assert!(library_dir("").is_err());
        assert!(library_dir("relative/music").is_err());
        assert!(library_dir(&home.join("Music").join("Spotify Local").to_string_lossy()).is_ok());
    }
}
