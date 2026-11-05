#!/bin/sh
# Downloads the yt-dlp and ffmpeg that get bundled inside Palms.app (bundle.resources / externalBin in tauri.conf.json).
# Tauri wants one file per target triple; run this before `pnpm tauri dev` or `pnpm tauri build`.
set -eu
cd "$(dirname "$0")/../src-tauri"
mkdir -p binaries
FFMPEG=https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1

# The folder build of yt-dlp (universal), shipped as a resource. The single-file yt-dlp_macos unpacks
# Python into a fresh temp dir on every run and macOS rescans it each time: ~25s per call.
rm -rf binaries/yt-dlp binaries/yt-dlp-*
curl -fL -o binaries/yt-dlp.zip https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos.zip
mkdir binaries/yt-dlp && unzip -q binaries/yt-dlp.zip -d binaries/yt-dlp && rm binaries/yt-dlp.zip
curl -fL -o binaries/ffmpeg-aarch64-apple-darwin "$FFMPEG/ffmpeg-darwin-arm64"
curl -fL -o binaries/ffmpeg-x86_64-apple-darwin "$FFMPEG/ffmpeg-darwin-x64"
curl -fL -o binaries/ffmpeg.LICENSE "$FFMPEG/darwin-arm64.LICENSE"
chmod +x binaries/yt-dlp/yt-dlp_macos binaries/ffmpeg-*-darwin
