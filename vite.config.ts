import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

// renderer 源码根 = src/renderer/src/
// 构建产物 = dist/renderer/，由 main/server.ts 在端口 3456 直接服务给 Electron
const RENDERER_SRC = resolve(__dirname, 'src/renderer/src');
const RENDERER_DIST = resolve(__dirname, 'dist/renderer');

export default defineConfig({
  plugins: [vue()],
  root: RENDERER_SRC,
  base: './',
  build: {
    outDir: RENDERER_DIST,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(RENDERER_SRC, 'index.html'),
        settings: resolve(RENDERER_SRC, 'settings.html'),
        'floating-ball': resolve(RENDERER_SRC, 'floating-ball.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
