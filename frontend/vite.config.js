import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ─── Production / CDN Configuration ──────────────────────────────────────────
// For CDN deployment: set VITE_CDN_BASE in your environment
//   e.g. VITE_CDN_BASE=https://cdn.pakkatourism.com npm run build
//
// Assets will be output to dist/ and can be uploaded to any CDN (Cloudflare,
// AWS S3 + CloudFront, Vercel, Netlify, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // ── Base URL ──────────────────────────────────────────────────────────────
  // '/' for same-origin / traditional server deploy
  // Set to your CDN URL for CDN-hosted static assets
  base: process.env.VITE_CDN_BASE || '/',

  // ── Dev server ────────────────────────────────────────────────────────────
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },

  // ── Build (production) ────────────────────────────────────────────────────
  build: {
    outDir:    'dist',
    sourcemap: mode !== 'production', // sourcemaps in staging only
    minify:    'esbuild',             // fastest, ~20% smaller than terser
    target:    'es2020',

    // Chunk splitting — keeps vendor bundles separate for CDN caching
    rollupOptions: {
      output: {
        // Content-hashed filenames for long-lived CDN cache
        entryFileNames:  'assets/[name].[hash].js',
        chunkFileNames:  'assets/[name].[hash].js',
        assetFileNames:  'assets/[name].[hash][extname]',

        // Manual chunk groups — each cached independently on CDN
        manualChunks: {
          // Core React runtime
          'vendor-react':   ['react', 'react-dom', 'react-router-dom'],
          // State management
          'vendor-state':   ['zustand'],
          // HTTP client
          'vendor-axios':   ['axios'],
          // Socket.io client
          'vendor-socket':  ['socket.io-client'],
          // PDF / Doc export (large — split out so main bundle stays small)
          'vendor-pdf':     ['jspdf'],
          'vendor-docx':    ['docx'],
          // Excel export
          'vendor-excel':   ['file-saver'],
          // Charts
          'vendor-charts':  ['recharts'],
        },
      },
    },

    // Warn if any chunk exceeds 500 kB (helps catch bloat)
    chunkSizeWarningLimit: 500,
  },

  // ── Preview server (for testing production build locally) ─────────────────
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
}));
