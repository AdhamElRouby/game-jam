import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const SERVER = process.env.SH_SERVER ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER, ws: true, changeOrigin: true },
      '/healthz': { target: SERVER },
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2500,
  },
});
