# Palms

Tauri 2 + React + TypeScript desktop app. It scrapes SoundCloud likes or a YouTube playlist, cleans each title into artist and track name, checks whether the track is already on streaming services, and downloads the unreleased ones as tagged MP3s into your Spotify local-files folder.

## Requirements
- `brew install yt-dlp ffmpeg`
- Rust (rustup) and pnpm

## Run
```
pnpm install
pnpm tauri dev        # development
pnpm tauri build      # release .app
```

## Setup in Spotify
Open Settings → Your Library → turn on **Show Local Files** → **Add a source** and pick the folder shown in Palms settings (default `~/Music/Spotify Local`).

## Getting tracks onto your phone
1. In Spotify on your computer, open Local Files and add the synced tracks to a playlist.
2. Open that playlist on your phone and tap the download arrow. The phone and computer have to be on the same Wi-Fi network. Tracks stay greyed out until they download.
3. Once the tracks show a green arrow they're on your phone, and you can add them to any playlist.

Palms walks you through these steps, with screenshots, after a sync adds tracks. You can turn that off from the popup or in Settings → On your phone, and open the guide from there any time.

## How it works
- **Scrape**: `yt-dlp -j` reads metadata (src-tauri/src/lib.rs `scrape`).
- **Parse**: `src/lib/parse.ts` splits `Artist - Title`, removes junk like [FREE DL], (Official Video), PREMIERE: and label tags, keeps (feat. X) and (X Remix), and falls back to the uploader or YouTube Music metadata.
- **Release check**: searches Deezer and iTunes (no API keys needed), and Spotify too if you enter client credentials in settings. A remix only counts as released if the remix itself is listed.
- **Sync**: downloads the audio as MP3, writes ID3 title, artist, album and cover tags, and saves it as `Artist - Title.mp3`.
- **Modes**: Auto syncs every unreleased track. Manual shows a review list where you can edit the title, artist and cover (URL or local file) and tick tracks on or off, then Approve & sync.
- **Checkpoints**: each platform has a default source URL. Each source URL keeps its own checkpoint: the IDs already handled plus, for SoundCloud likes, the newest ID, so the next scrape stops there. Failed downloads aren't added to the checkpoint, so they're retried next run. Data is stored with tauri-plugin-store in `palms.json`.
