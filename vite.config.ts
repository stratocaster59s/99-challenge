import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署在 https://<user>.github.io/99-challenge/ 子路徑下
  base: '/99-challenge/',
})
