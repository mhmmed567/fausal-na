import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          if (
            id.includes("/@heroui/") ||
            id.includes("/tailwind-variants/") ||
            id.includes("/iceberg-js/") ||
            id.includes("/@radix-ui/")
          ) {
            return "heroui-vendor";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/") ||
            id.includes("/use-sync-external-store/")
          ) {
            return "react-vendor";
          }
          if (id.includes("/react-router") || id.includes("/@remix-run/")) {
            return "router-vendor";
          }
          if (
            id.includes("/react-aria") ||
            id.includes("/react-stately/") ||
            id.includes("/@internationalized/")
          ) {
            return "aria-vendor";
          }
          if (id.includes("/@supabase/")) {
            return "supabase-vendor";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/mcp": "http://localhost:4010",
    },
  },
});
