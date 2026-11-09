#!/usr/bin/env bash
# Stages the FFmpeg Tauri sidecar binary into src-tauri/binaries/.
#
# Why this is a fetch script and not a committed binary: a genuinely redistributable
# FFmpeg for macOS must be statically linked against its codec libraries (libx264,
# libvpx, etc.) or it only runs on machines that happen to have the exact same
# Homebrew install at the exact same path. Homebrew's own ffmpeg (what you get from
# `brew install ffmpeg`) is dynamically linked against /opt/homebrew/Cellar/... and is
# NOT portable — it would silently fail (or silently use a different, wrong binary)
# on any machine without that Homebrew cellar. We fetch a real static build instead
# and verify it with `otool -L` before using it.
#
# Source: Martin Riedl's FFmpeg Build Server (https://ffmpeg.martin-riedl.de), which
# publishes signed+notarized static macOS builds with published SHA256 checksums.
# FFmpeg itself is LGPL/GPL depending on enabled components (this build enables GPL
# components like libx264) — redistributing this binary in a shipped app build means
# complying with GPL §3 (offer corresponding source / build script), same obligation
# a common design tool/a common video editor-style apps that bundle FFmpeg carry. Not resolved by this script —
# flagged here for whoever cuts a public release.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$APP_DIR/src-tauri/binaries"

HOST_TRIPLE="$(rustc -vV 2>/dev/null | awk '/^host:/{print $2}')"
if [ -z "$HOST_TRIPLE" ]; then
  echo "error: rustc not found on PATH (needed to resolve the target triple)." >&2
  echo "       try: PATH=\"\$HOME/.cargo/bin:\$PATH\" bash scripts/setup-ffmpeg-sidecar.sh" >&2
  exit 1
fi

case "$HOST_TRIPLE" in
  aarch64-apple-darwin)
    DOWNLOAD_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip"
    ;;
  x86_64-apple-darwin)
    DOWNLOAD_URL="https://ffmpeg.martin-riedl.de/redirect/latest/macos/amd64/release/ffmpeg.zip"
    ;;
  *)
    echo "error: no known static FFmpeg source wired up for host triple '$HOST_TRIPLE'." >&2
    echo "       this project currently only stages macOS (arm64/x86_64) sidecars." >&2
    exit 1
    ;;
esac

DEST_BIN="$BIN_DIR/ffmpeg-$HOST_TRIPLE"
if [ -x "$DEST_BIN" ] && [ "${FORCE_REFETCH:-0}" != "1" ]; then
  echo "ffmpeg sidecar already staged at $DEST_BIN (set FORCE_REFETCH=1 to re-fetch)."
  exit 0
fi

mkdir -p "$BIN_DIR"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "downloading static ffmpeg for $HOST_TRIPLE ..."
curl -fL --max-time 180 -o "$WORK_DIR/ffmpeg.zip" "$DOWNLOAD_URL"

SHA_URL="$DOWNLOAD_URL.sha256"
if curl -fsL --max-time 30 -o "$WORK_DIR/ffmpeg.zip.sha256" "$SHA_URL" 2>/dev/null; then
  EXPECTED="$(awk '{print $1}' "$WORK_DIR/ffmpeg.zip.sha256")"
  ACTUAL="$(shasum -a 256 "$WORK_DIR/ffmpeg.zip" | awk '{print $1}')"
  if [ "$EXPECTED" != "$ACTUAL" ]; then
    echo "error: checksum mismatch for downloaded ffmpeg.zip" >&2
    echo "       expected: $EXPECTED" >&2
    echo "       actual:   $ACTUAL" >&2
    exit 1
  fi
  echo "checksum verified ($ACTUAL)."
else
  echo "warning: could not fetch a published checksum for this redirect URL; skipping verification." >&2
fi

unzip -q -o "$WORK_DIR/ffmpeg.zip" -d "$WORK_DIR/extracted"
EXTRACTED_BIN="$(find "$WORK_DIR/extracted" -type f -perm +111 | head -1)"
if [ -z "$EXTRACTED_BIN" ]; then
  echo "error: no executable found inside the downloaded archive." >&2
  exit 1
fi

# Refuse to stage a binary that links against anything outside the OS itself —
# that's exactly the non-portable Homebrew situation this script exists to avoid.
if otool -L "$EXTRACTED_BIN" | tail -n +2 | grep -vE '^\s*/(usr/lib|System/Library)/' ; then
  echo "error: the downloaded ffmpeg links against non-system libraries (see above)." >&2
  echo "       refusing to stage a non-portable sidecar binary." >&2
  exit 1
fi

cp "$EXTRACTED_BIN" "$DEST_BIN"
chmod +x "$DEST_BIN"
xattr -dr com.apple.quarantine "$DEST_BIN" 2>/dev/null || true

echo "staged $(du -h "$DEST_BIN" | cut -f1) ffmpeg sidecar -> $DEST_BIN"
"$DEST_BIN" -version | head -1
