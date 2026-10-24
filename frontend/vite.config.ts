import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium/') },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/node-api': { target: 'http://127.0.0.1:3001', rewrite: path => path.replace(/^\/node-api/, '') },
      '/python-api': { target: 'http://127.0.0.1:3002', rewrite: path => path.replace(/^\/python-api/, '') },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: { output: { manualChunks: { cesium: ['cesium'] } } },
    chunkSizeWarningLimit: 5000,
  },
});
