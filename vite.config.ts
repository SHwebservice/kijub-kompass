import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Auslieferung unter der Wurzel einer Domain (z. B. Cloudflare Pages mit SPA-Fallback, siehe public/_redirects).
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: { sourcemap: true },
});
