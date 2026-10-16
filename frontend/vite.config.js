import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` keeps asset URLs relative so the built app works when FastAPI
// serves it from /app (see app/main.py) or from any static host.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    // In dev, forward API calls to the FastAPI backend (uvicorn app.main:app).
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
