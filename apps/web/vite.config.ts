import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Read .env from the monorepo root so there's a single env file. Only VITE_*
  // vars are exposed to the client bundle; everything else stays server-side.
  envDir: "../../",
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    // Manual vendor splitting to keep the initial chat bundle small.
    // Lazy-loaded route chunks (settings, auth) and the markdown vendor
    // (react-markdown + react-syntax-highlighter, used by every chat message)
    // are split out so the browser can cache them independently and so a
    // user who never visits Settings or never signs in doesn't pay for
    // recharts (~150KB) or @react-oauth/google (~80KB).
    // See openspec/ROADMAP.md / RISKS.md T3 for context.
    //
    // The markdown chunk is ~777KB raw / ~270KB gzip — that's the full
    // react-syntax-highlighter + its language definitions. Every chat
    // message needs it, so it ships with the first render of any
    // conversation. The previous design packed it into a 1.49MB single
    // chunk; now it's at least cacheable across routes. To shrink further
    // we'd need to swap react-syntax-highlighter for shiki/highlight.js
    // with lazy language registration (backlog item, see RISKS.md T3).
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          markdown: [
            "react-markdown",
            "remark-gfm",
            "react-syntax-highlighter",
          ],
        },
      },
    },
  },
});
