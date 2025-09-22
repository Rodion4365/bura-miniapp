import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base =
  process.env.PUBLIC_BASE_PATH && process.env.PUBLIC_BASE_PATH !== 'PUBLIC_BASE_PATH'
    ? process.env.PUBLIC_BASE_PATH
    : '/'

export default defineConfig({
  plugins: [react()],
  base,
})
