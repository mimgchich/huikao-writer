import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { attachApi, pickEnv } from './server/api.mjs'

export default defineConfig(({ mode }) => {
  const env = pickEnv(loadEnv(mode, process.cwd(), ''))
  const usingKey = Boolean(env.GEMINI_API_KEY || env.OPENAI_API_KEY)
  console.log(
    usingKey
      ? '[作文練習室] 已讀到 API 金鑰'
      : '[作文練習室] 未設定 API 金鑰，先使用示範模式',
  )

  return {
    plugins: [
      react(),
      {
        name: 'essay-api',
        configureServer(server) {
          attachApi(server.middlewares, env)
        },
        configurePreviewServer(server) {
          attachApi(server.middlewares, env)
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
  }
})
