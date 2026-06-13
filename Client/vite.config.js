import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isAnalyze = mode === "analyze";
  const isProd = mode === "production" || isAnalyze;

  return {
    plugins: [
      tailwindcss(),
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      isAnalyze &&
        visualizer({
          filename: "dist/stats.html",
          open: true,
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),

    build: {
      target: "es2020",
      sourcemap: !isProd,
      minify: isProd ? "terser" : false,
      terserOptions: isProd
        ? {
            compress: { drop_console: true, passes: 2 },
            format: { comments: false },
          }
        : undefined,
      assetsInlineLimit: 4096,
      rollupOptions: {
        output: {
          chunkFileNames: "assets/[name]-[hash].js",
          entryFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              if (id.includes("/src/components/ui/")) {
                return "ui";
              }
              return undefined;
            }
            if (
              id.includes("recharts") ||
              id.includes("d3-") ||
              id.includes("/victory") ||
              id.includes("react-is")
            ) {
              return "charts";
            }
            if (
              id.includes("react-dom") ||
              id.includes("react-router") ||
              id.includes("/react/") ||
              id.includes("scheduler")
            ) {
              return "vendor";
            }
            if (id.includes("@tanstack/react-query")) {
              return "query";
            }
            return undefined;
          },
        },
      },
    },

    server: {
      proxy: {
        "/api": {
          target: "http://localhost:5000",
          changeOrigin: true,
        },
      },
    },
  };
});
