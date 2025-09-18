import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true, // Force port 3000, fail if unavailable
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  define: {
    global: 'globalThis'
  },
  optimizeDeps: {
    include: [
      '@tensorflow/tfjs',
      '@tensorflow-models/blazeface',
      '@tensorflow-models/coco-ssd'
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'tf-vendor': ['@tensorflow/tfjs'],
          'tf-models': ['@tensorflow-models/blazeface', '@tensorflow-models/coco-ssd']
        }
      }
    }
  }
})