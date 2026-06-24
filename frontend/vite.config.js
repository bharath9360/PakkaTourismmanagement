import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ─── Production / CDN Configuration ──────────────────────────────────────────
// • All JS/CSS chunks get content-hashed filenames → safe for long CDN cache
// • Heavy libraries split into their own chunks → browser caches them separately
// • esbuild minifier (fastest + smallest output)
// • gzip compression: Vercel & Cloudflare serve pre-compressed assets automatically
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      // Babel fast-refresh + automatic JSX runtime
      fastRefresh: true,
    }),
  ],

  // ── Base URL ──────────────────────────────────────────────────────────────
  // '/' for same-origin server deploy (Vercel)
  // Set VITE_CDN_BASE to a CDN URL if you upload dist/ to a CDN separately
  base: process.env.VITE_CDN_BASE || '/',

  // ── Dev server ────────────────────────────────────────────────────────────
  server: {
    port: 5173,
    proxy: {
      '/api':      { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads':  { target: 'http://localhost:5000', changeOrigin: true },
    },
  },

  // ── Build (production) ────────────────────────────────────────────────────
  build: {
    outDir:          'dist',
    sourcemap:       false,        // No sourcemaps in production — saves ~30% size
    minify:          'esbuild',    // Fastest minifier
    target:          'es2020',
    cssMinify:       true,
    reportCompressedSize: false,   // Speeds up build

    rollupOptions: {
      output: {
        // Content-hashed names → 1-year CDN cache safe
        entryFileNames:  'assets/[name].[hash].js',
        chunkFileNames:  'assets/[name].[hash].js',
        assetFileNames:  'assets/[name].[hash][extname]',

        // ── Manual chunk splitting ─────────────────────────────────────────
        // Each group is cached independently.
        // Heavy rarely-changed libs go in their own chunk.
        manualChunks(id) {
          // Core React (tiny, cached forever)
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
          // Zustand state
          if (id.includes('node_modules/zustand/')) return 'vendor-state';
          // Axios HTTP client
          if (id.includes('node_modules/axios/')) return 'vendor-axios';
          // Socket.io (large — split out)
          if (id.includes('node_modules/socket.io-client/') ||
              id.includes('node_modules/engine.io-client/')) {
            return 'vendor-socket';
          }
          // Charts (recharts + d3 deps are heavy)
          if (id.includes('node_modules/recharts/') ||
              id.includes('node_modules/d3') ||
              id.includes('node_modules/victory')) {
            return 'vendor-charts';
          }
          // PDF export — only loaded when user clicks Export
          if (id.includes('node_modules/jspdf/')) return 'vendor-pdf';
          // DOCX export
          if (id.includes('node_modules/docx/')) return 'vendor-docx';
          // File saver
          if (id.includes('node_modules/file-saver/')) return 'vendor-filesaver';
          // Leaflet maps
          if (id.includes('node_modules/leaflet/') ||
              id.includes('node_modules/react-leaflet/')) {
            return 'vendor-maps';
          }
          // DnD kit
          if (id.includes('node_modules/@dnd-kit/')) return 'vendor-dnd';
          // Face API (very heavy ML library)
          if (id.includes('node_modules/face-api')) return 'vendor-faceapi';
          // html2canvas
          if (id.includes('node_modules/html2canvas/')) return 'vendor-canvas';
        },
      },

      // Tree-shake — remove unused exports from bundled libs
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },

    // Warn if any single chunk exceeds 600 kB (helps catch bloat)
    chunkSizeWarningLimit: 600,
  },

  // ── Preview server (for testing production build locally) ─────────────────
  preview: {
    port: 4173,
    proxy: {
      '/api':     { target: 'http://localhost:5000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },

  // ── Optimise dev cold starts ───────────────────────────────────────────────
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-router-dom',
      'axios', 'zustand',
      'recharts', 'socket.io-client',
    ],
    // face-api.js has unusual imports — exclude from pre-bundling
    exclude: ['face-api.js'],
  },
}));
