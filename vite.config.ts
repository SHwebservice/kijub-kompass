import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Auslieferung unter der Wurzel einer Domain (z. B. Cloudflare Pages mit SPA-Fallback, siehe public/_redirects).
// Die Versionsnummer (kurze Commit-ID) kommt von Cloudflare Pages bzw. GitHub Actions und erscheint unter „Mehr“ – so lässt sich
// bei Fehlermeldungen sagen, welcher Stand der App läuft.
const version = (process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'lokal').slice(0, 7);

export default defineConfig({
  base: '/',
  plugins: [react()],
  define: { __BUILD_VERSION__: JSON.stringify(version) },
  build: { sourcemap: false },
});
