import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(here, 'client'),
  plugins: [react()],
  resolve: {
    // giao diện module ĐKCT (../client) dùng chung react / lucide-react / pdfjs-dist của standalone
    alias: { '@dkct': path.join(here, '..', 'client') },
    dedupe: ['react', 'react-dom', 'lucide-react', 'pdfjs-dist', 'docx-preview']
  },
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true },
  server: {
    port: 5174,
    fs: { allow: [path.join(here, '..')] },
    proxy: { '/api': 'http://localhost:3000' }
  }
});
