import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub project Pages lives at /<repo>/; CI sets BASE_PATH (see .github/workflows).
const base = process.env.BASE_PATH?.trim() || '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base,
})
