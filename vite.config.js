// Import Vite's configuration helper.
import { defineConfig } from "vite";

// Import React support for Vite.
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Enable React/JSX.
  plugins: [react()],

  // This repository is named "Aquatimbang-main", so
  // GitHub Pages serves the website from /Aquatimbang-main/.
  base: "/Aquatimbang-main/",
});