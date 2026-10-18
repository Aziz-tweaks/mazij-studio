#!/usr/bin/env bash
# Stages the onnxruntime-web WASM runtime into public/ort/ so it's served as a
# static asset at a stable URL (/ort/...) regardless of how Vite bundles the
# onnxruntime-web JS import — see src/lib/backgroundRemoval.ts, which sets
# `ort.env.wasm.wasmPaths = '/ort/'`.
#
# Why staged, not committed: these .wasm binaries (~32MB combined) already ship
# inside node_modules/onnxruntime-web/dist (fetched by `npm install`); committing
# a second copy to the repo would just double the bloat for no benefit. Same
# reasoning as src-tauri/binaries/ffmpeg (see scripts/setup-ffmpeg-sidecar.sh) —
# onnxruntime-web is MIT-licensed, so no redistribution/attribution obligation,
# this is purely a "don't bloat git" call.
#
# Roadmap #15 (auto-captions) pulls in `@huggingface/transformers`, which depends
# on its OWN onnxruntime-web version (nested under its own node_modules — a
# different, newer dev build than the top-level one above) because the two
# versions' .wasm binaries and .mjs glue are not interchangeable. That second
# runtime is staged separately to public/ort-whisper/ — see
# src/lib/autoCaptions.ts, which sets `env.backends.onnx.wasm.wasmPaths =
# '/ort-whisper/'`. Reusing '/ort/' for both would silently pair one version's
# JS glue with the other's .wasm binary.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

stage() {
  local src_dir="$1" dest_dir="$2" extra_variants="$3"
  if [ ! -d "$src_dir" ]; then
    echo "error: onnxruntime-web not found at $src_dir — run 'npm install' first." >&2
    exit 1
  fi
  mkdir -p "$dest_dir"
  for f in ort-wasm-simd-threaded.wasm ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.jsep.wasm ort-wasm-simd-threaded.jsep.mjs; do
    cp "$src_dir/$f" "$dest_dir/$f"
    echo "staged $f -> $dest_dir"
  done
  if [ "$extra_variants" = "yes" ]; then
    # This newer onnxruntime-web build picks its backend variant (asyncify vs jsep
    # vs jspi) at runtime by feature-detecting the browser, so all three must be
    # present — the top-level /ort/ copy above never hit this because the older
    # 1.19.2 build only ships the plain/jsep pair.
    for f in ort-wasm-simd-threaded.asyncify.wasm ort-wasm-simd-threaded.asyncify.mjs ort-wasm-simd-threaded.jspi.wasm ort-wasm-simd-threaded.jspi.mjs; do
      cp "$src_dir/$f" "$dest_dir/$f"
      echo "staged $f -> $dest_dir"
    done
  fi
}

stage "$APP_DIR/node_modules/onnxruntime-web/dist" "$APP_DIR/public/ort" no
stage "$APP_DIR/node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist" "$APP_DIR/public/ort-whisper" yes

echo "done"
