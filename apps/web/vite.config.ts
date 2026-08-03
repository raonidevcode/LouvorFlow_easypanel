import legacy from "@vitejs/plugin-legacy";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["iOS >= 9", "Safari >= 9"],
      modernPolyfills: true
    })
  ],
  build: {
    target: "es2015",
    cssTarget: "safari9",
    sourcemap: true
  },
  server: {
    port: 5173,
    allowedHosts: [
      '://hawkstecnologia.com.br'
    ],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
        ws: true,
        rewrite: function (path) {
          return path.replace(/^\/api/, "");
        }
      }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
        ws: true,
        rewrite: function (path) {
          return path.replace(/^\/api/, "");
        }
      }
    }
  }
});

