import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
const host = process.env.TAURI_DEV_HOST;

// Roadmap #15 (auto-captions): `@huggingface/transformers`'s onnxruntime-web build
// loads its WASM backend by dynamically `import()`-ing a `.mjs` glue module at
// runtime (the older onnxruntime-web build `backgroundRemoval.ts` uses never does
// this). Vite's dev server refuses to serve a `/public` asset through its ESM
// transform pipeline ("this file is in /public ... should not be imported from
// source code" — a 500), which only matters for THIS newer build's `.mjs` files
// under public/ort-whisper/ (see scripts/setup-onnxruntime-wasm.sh). This plugin's
// middleware intercepts exactly those requests and serves them as plain static
// JavaScript before Vite's own transform middleware gets a chance to reject them —
// a dev-server-only concern; `vite build`/the packaged app just serves /public as
// static files with no such guard.
function serveOrtWhisperMjs(): Plugin {
  return {
    name: "serve-ort-whisper-mjs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url.startsWith("/ort-whisper/") && url.endsWith(".mjs")) {
          const filePath = path.join(process.cwd(), "public", url);
          if (fs.existsSync(filePath)) {
            res.setHeader("Content-Type", "text/javascript");
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), serveOrtWhisperMjs()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
