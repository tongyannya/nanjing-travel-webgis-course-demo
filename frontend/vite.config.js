import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url))

export function createViteConfig(env) {
  const frontendHost = env.FRONTEND_HOST || '127.0.0.1'
  const backendOrigin = `http://${env.BACKEND_HOST || '127.0.0.1'}:${env.BACKEND_PORT || 8000}`
  const apiBaseUrl = (env.VITE_API_BASE_URL || '').replace(/\/$/, '')
  const proxy = { '/api': backendOrigin, '/_AMapService': backendOrigin }
  return {
    plugins: [vue()],
    envDir: PROJECT_ROOT,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl) },
    server: {
      host: frontendHost,
      port: Number(env.FRONTEND_PORT || 5173),
      strictPort: true,
      proxy,
    },
    preview: {
      host: frontendHost,
      port: Number(env.FRONTEND_PREVIEW_PORT || 4173),
      strictPort: true,
      proxy,
    },
  }
}

export default defineConfig(({ mode }) =>
  createViteConfig(loadEnv(mode, PROJECT_ROOT, '')),
)
