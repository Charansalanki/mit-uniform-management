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
    host: 'localhost',
    port: 5173,
    strictPort: true,
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/sqlite/**', '**/*.db', '**/*.sqlite'],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true
      },
      '/uploads': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true
      }
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
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
        }
      }
    }
  }
});
