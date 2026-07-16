import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      manifest: true,
    },
    server: {
      hmr: true,
      watch: {
        // SQLite creates WAL/SHM sidecar files during normal requests. They
        // must not trigger a full-page reload in development.
        ignored: ['**/*.db', '**/*.db-*'],
      },
    },
  };
});
