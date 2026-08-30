import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined
          if (id.includes("@tanstack")) return "vendor-query"
          if (
            id.includes("recharts") ||
            id.includes("d3-") ||
            id.includes("d3-shape") ||
            id.includes("victory-vendor")
          )
            return "vendor-charts"
          if (id.includes("react-dom") || id.includes("react-router")) return "vendor-react"
          if (
            id.includes("react") ||
            id.includes("radix-ui") ||
            id.includes("cmdk") ||
            id.includes("sonner") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("lucide-react")
          )
            return "vendor-ui"
          return undefined
        },
      },
    },
  },
})