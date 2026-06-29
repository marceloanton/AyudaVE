import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        app: "index.html",
        admin: "admin.html",
      },
      output: {
        manualChunks: {
          vendor: ["react", "react-dom/client"],
        },
      },
    },
  },
});
