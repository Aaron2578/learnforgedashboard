import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      stream: path.resolve(__dirname, "src/lib/nodeShims/stream.js"),
      util: path.resolve(__dirname, "src/lib/nodeShims/util.js"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
});
