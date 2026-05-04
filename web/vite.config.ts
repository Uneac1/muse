import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const normalizePath = (id: string) => id.split(path.sep).join('/');

function vendorChunkName(id: string) {
  if (!id.includes('node_modules')) return undefined;

  const normalizedId = normalizePath(id);
  if (normalizedId.includes('/node_modules/react/') || normalizedId.includes('/node_modules/react-dom/')) return 'vendor-react';
  if (normalizedId.includes('/node_modules/react-router') || normalizedId.includes('/node_modules/@remix-run/')) return 'vendor-router';
  if (normalizedId.includes('/node_modules/@material/web/')) return 'vendor-material';
  if (normalizedId.includes('/node_modules/framer-motion/')) return 'vendor-motion';
  if (normalizedId.includes('/node_modules/lucide-react/')) return 'vendor-icons';
  if (normalizedId.includes('/node_modules/@radix-ui/')) return 'vendor-radix';
  if (normalizedId.includes('/node_modules/sonner/')) return 'vendor-toast';
  if (normalizedId.includes('/node_modules/zustand/')) return 'vendor-state';
  if (
    normalizedId.includes('/node_modules/clsx/')
    || normalizedId.includes('/node_modules/class-variance-authority/')
    || normalizedId.includes('/node_modules/tailwind-merge/')
  ) {
    return 'vendor-utils';
  }

  return 'vendor';
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          return vendorChunkName(id);
        },
      },
    },
  },
});
