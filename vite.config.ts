import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A relative base keeps the build working both on a GitHub Pages project site
// (https://user.github.io/repo/) and at a domain root, without any configuration.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    assetsInlineLimit: 2048,
  },
});
