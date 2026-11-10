import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'vendor-portal-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && (req.url.startsWith('/vendor/secure-access/') || req.url === '/vendor/secure-access')) {
            req.url = '/vendor-portal.html';
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        schedules: resolve(__dirname, 'schedules.html'),
        navigation: resolve(__dirname, 'navigation.html'),
        vendor: resolve(__dirname, 'vendor-portal.html')
      }
    }
  }
});
