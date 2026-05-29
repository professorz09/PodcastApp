import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true,
        hmr: false,
        watch: {
          ignored: ['**/.local/**'],
        },
      },
      plugins: [react()],
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // Pre-bundle heavy deps so Vite doesn't re-analyse them on every cold start
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          '@google/genai',
          'lucide-react',
          'idb-keyval',
          'motion/react',
          'mp4-muxer',
          'clsx',
          'tailwind-merge',
        ],
        // Keep pdfjs out of pre-bundling — it is dynamically imported on demand
        exclude: ['pdfjs-dist'],
      },
      build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react':  ['react', 'react-dom'],
              'vendor-genai':  ['@google/genai'],
              'vendor-motion': ['motion/react'],
              'vendor-muxer':  ['mp4-muxer'],
              'vendor-icons':  ['lucide-react'],
            },
          },
        },
      },
    };
});
