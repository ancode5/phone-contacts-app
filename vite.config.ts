import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const GITHUB_PAGES_BASE = '/phone-contacts-app/';

export default defineConfig(({ command }) => ({
  // Во время локальной разработки приложение открывается от корня localhost.
  // Production-сборка публикуется в подпапке репозитория GitHub Pages.
  base: command === 'build' ? GITHUB_PAGES_BASE : '/',
  plugins: [react()],
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
}));
