#!/usr/bin/env bash
# Compiles src-tauri/native/livephoto/main.swift into the Tauri sidecar binary
# that authors iOS Live Photo pairs (roadmap #23, src/lib/livePhotoExport.ts).
#
# Unlike scripts/setup-ffmpeg-sidecar.sh this is NOT a fetch script — the Swift
# source is ours, committed to git, and the only portable way to produce a
# working binary is to compile it on the machine that will run it (AVFoundation
# isn't something you can statically link and ship like FFmpeg's codec libs).
# `swiftc` ships with Xcode Command Line Tools, so this needs no extra install
# on any Mac that can already build the Tauri app itself.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$APP_DIR/src-tauri/binaries"
SRC="$APP_DIR/src-tauri/native/livephoto/main.swift"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "error: swiftc not found on PATH — install Xcode Command Line Tools (xcode-select --install)." >&2
  exit 1
fi

HOST_TRIPLE="$(rustc -vV 2>/dev/null | awk '/^host:/{print $2}')"
if [ -z "$HOST_TRIPLE" ]; then
  echo "error: rustc not found on PATH (needed to resolve the target triple)." >&2
  echo "       try: PATH=\"\$HOME/.cargo/bin:\$PATH\" bash scripts/setup-livephoto-tool.sh" >&2
  exit 1
fi

case "$HOST_TRIPLE" in
  aarch64-apple-darwin | x86_64-apple-darwin) ;;
  *)
    echo "error: Live Photo export needs AVFoundation, which only exists on macOS." >&2
    echo "       host triple '$HOST_TRIPLE' is not a macOS target — nothing to stage." >&2
    exit 1
    ;;
esac

DEST_BIN="$BIN_DIR/livephoto-$HOST_TRIPLE"
if [ -x "$DEST_BIN" ] && [ "${FORCE_REBUILD:-0}" != "1" ]; then
  echo "livephoto sidecar already staged at $DEST_BIN (set FORCE_REBUILD=1 to recompile)."
  exit 0
fi

mkdir -p "$BIN_DIR"
echo "compiling livephoto tool for $HOST_TRIPLE ..."

# The `import` subcommand calls PhotoKit, and macOS TCC refuses to prompt for a
# process that carries no usage description — it kills it outright. A bare
# command-line binary has no Info.plist to hold that description, so the standard
# fix is to embed one as a __TEXT,__info_plist section at link time. The app
# bundle's own src-tauri/Info.plist carries the same key, because TCC may
# attribute the request to either the sidecar or the responsible parent app
# depending on how the process was launched; covering both is the only way to be
# sure a prompt appears instead of a silent crash.
EMBEDDED_PLIST="$(mktemp -t livephoto-plist)"
cat > "$EMBEDDED_PLIST" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>studio.mazij.livephoto</string>
  <key>CFBundleName</key>
  <string>Mazij Live Photo Tool</string>
  <key>NSPhotoLibraryAddUsageDescription</key>
  <string>To add the Live Photos you export from Mazij into your Photos library. Mazij only adds; it never reads your photos.</string>
</dict>
</plist>
PLIST

swiftc -O "$SRC" -o "$DEST_BIN" \
  -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$EMBEDDED_PLIST"
rm -f "$EMBEDDED_PLIST"
chmod +x "$DEST_BIN"

echo "staged $(du -h "$DEST_BIN" | cut -f1) livephoto sidecar -> $DEST_BIN"
