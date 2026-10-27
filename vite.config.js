// Import Vite's configuration helper.
import { defineConfig } from "vite";

// Import React support for Vite.
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Enable React/JSX.
  plugins: [react()],

  // Your GitHub repository is named "Aquatimbang".
  // GitHub Pages will serve the website from /Aquatimbang/.
  base: "/Aquatimbang/",
});