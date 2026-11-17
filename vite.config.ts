/// <reference types="vitest/config" />
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // One dependency cache per environment. Dev servers that run side by side
  // (local dev, the e2e server and the demo's e2e server) otherwise rewrite
  // each other's pre-bundled dependencies, which reloads pages mid-test.
  cacheDir: process.env.CLOUDFLARE_ENV
    ? `node_modules/.vite-${process.env.CLOUDFLARE_ENV}`
    : undefined,
  // The cloudflare plugin boots workerd, which unit tests don't need.
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [cloudflare()]),
    // `pnpm dev:https`: a self-signed certificate, for trying the app on a
    // phone. The camera, location and share sheet need a secure origin.
    ...(process.env.DEV_HTTPS ? [basicSsl()] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  build: {
    // The 3D views (three.js) and the map are lazy-loaded and large by nature.
    chunkSizeWarningLimit: 2000,
  },
  // MapLibre's tile worker is an ES module with its own imports.
  worker: { format: "es" },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "worker/**/*.{test,spec}.ts",
      "shared/**/*.{test,spec}.ts",
      "scripts/**/*.{test,spec}.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
