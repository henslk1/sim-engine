import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { tanstackRouter } from "@tanstack/router-plugin/vite"

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), tailwindcss(), react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
