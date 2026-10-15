import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  cacheDir: mode === 'desktop' ? 'node_modules/.vite-desktop' : 'node_modules/.vite',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    ...(mode === 'desktop'
      ? []
      : [
          VitePWA({
            registerType: 'prompt',
            injectRegister: 'script',
            manifest: {
              name: 'Tier Studio',
              short_name: 'Tier Studio',
              description: 'A little order for everything you love. An offline tier list editor.',
              theme_color: '#f5f4ef',
              background_color: '#f5f4ef',
              display: 'standalone',
              icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,woff2}'],
              navigateFallback: '/index.html',
            },
          }),
        ]),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: mode === 'desktop' ? 1422 : 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/dist/**'] },
  },
  clearScreen: false,
  build: {
    outDir: mode === 'desktop' ? 'dist/desktop' : 'dist/web',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'storage', test: /node_modules[\\/](dexie|zod)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
}));
