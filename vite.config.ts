/// <reference types="vitest/config" />
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // The cloudflare plugin boots workerd, which unit tests don't need.
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [cloudflare()]),
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
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
