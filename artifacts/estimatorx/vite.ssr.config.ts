import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@clerk/react": path.resolve(import.meta.dirname, "src/mocks/clerk-react"),
      "@clerk/react/internal": path.resolve(import.meta.dirname, "src/mocks/clerk-react-internal"),
      "@clerk/themes": path.resolve(import.meta.dirname, "src/mocks/clerk-themes"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    ssr: true,
    outDir: "dist/server",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/entry-server.tsx",
      output: {
        format: "esm",
      },
    },
    sourcemap: false,
  },
  ssr: {
    noExternal: true,
    target: "node",
  },
  define: {
    "import.meta.env.BASE_URL": JSON.stringify("/"),
    "import.meta.env.MODE": JSON.stringify("production"),
    "import.meta.env.DEV": JSON.stringify(false),
    "import.meta.env.PROD": JSON.stringify(true),
    "import.meta.env.SSR": JSON.stringify(true),
    "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify("pk_live_mock"),
    "import.meta.env.VITE_CLERK_PROXY_URL": JSON.stringify(""),
  },
});
