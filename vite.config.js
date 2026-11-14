// Import Vite's configuration helper.
import { defineConfig } from "vite";

// Import React support for Vite.
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Enable React/JSX.
  plugins: [react()],

  // Where the website is served from:
  // - Cloudflare Pages (CF_PAGES is set by its build): the site root, "/".
  // - GitHub Pages and local development: /Aquatimbang-main/, the repository name.
  // VITE_BASE overrides both.
  base: process.env.VITE_BASE || (process.env.CF_PAGES ? "/" : "/Aquatimbang-main/"),
});