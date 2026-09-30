import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const wurzel = join(__dirname, '../..');
const lies = (p: string) => readFileSync(join(wurzel, p), 'utf8');

describe('GitHub Actions', () => {
  const ci = lies('.github/workflows/ci.yml');
  const ping = lies('.github/workflows/keepalive.yml');
  const backup = lies('.github/workflows/backup.yml');

  it('die Prüfung läuft bei jedem Push und Pull-Request mit Lint, Typen, Tests und Build', () => {
    expect(ci).toMatch(/push:[\s\S]*main/);
    expect(ci).toMatch(/pull_request:/);
    for (const schritt of ['npm run lint', 'npm run typecheck', 'npm test', 'npm run build']) expect(ci).toContain(schritt);
  });

  it('Node-Version: CI, Cloudflare (.node-version) und Projekt stimmen überein', () => {
    const ciVersion = /node-version:\s*(\d+)/.exec(ci)?.[1];
    expect(lies('.node-version').trim()).toBe(ciVersion);
  });

  it('Lebenszeichen: zweimal pro Woche, ruft nur fn_ping auf und prüft die Antwort', () => {
    expect(ping).toMatch(/cron:\s*'[^']*\*\s+\*\s+[0-6],[0-6]'/);
    expect(ping).toContain('workflow_dispatch');
    expect(ping).toContain('/rest/v1/rpc/fn_ping');
    expect(ping).toContain('secrets.SUPABASE_URL');
    expect(ping).toContain('secrets.SUPABASE_ANON_KEY');
    expect(ping).not.toMatch(/service_role/i);
    expect(ping).toMatch(/test "\$antwort" = '"ok"'/);
  });

  it('Lebenszeichen-Abstand ist deutlich kürzer als die 7 Tage bis zur Pausierung', () => {
    const tage = /cron:\s*'\d+ \d+ \* \* ([0-6](?:,[0-6])*)'/.exec(ping)?.[1]?.split(',').map(Number) ?? [];
    expect(tage.length).toBeGreaterThanOrEqual(2);
    const sortiert = [...tage].sort((a, b) => a - b);
    const luecken = sortiert.map((t, i) => ((sortiert[(i + 1) % sortiert.length]! - t + 7) % 7) || 7);
    expect(Math.max(...luecken)).toBeLessThanOrEqual(4);
  });

  it('Sicherung: wöchentlich, verschlüsselt, bricht ohne Passwort ab, nur lesende Rechte', () => {
    expect(backup).toMatch(/cron:/);
    expect(backup).toContain('workflow_dispatch');
    expect(backup).toContain('permissions:');
    expect(backup).toMatch(/contents:\s*read/);
    expect(backup).toContain('secrets.SUPABASE_DB_URL');
    expect(backup).toContain('secrets.BACKUP_PASSPHRASE');
    expect(backup).toMatch(/--symmetric/);
    expect(backup).toMatch(/AES256/);
    expect(backup).toMatch(/\$\{#BACKUP_PASSPHRASE\} -lt 20/);
    expect(backup).toContain('--schema=public --data-only');
    expect(backup).toContain('--schema=public --schema-only');
    expect(backup).toContain('--table=auth.users');
    expect(backup).toContain('COPY public.personen');
  });

  it('Sicherung: es wird nur die verschlüsselte Datei hochgeladen, nie Klartext', () => {
    const hochladen = backup.slice(backup.indexOf('actions/upload-artifact'));
    expect(hochladen).toContain('.tar.gz.gpg');
    expect(hochladen).not.toMatch(/\.sql|sicherung\/|\.tar\.gz\s*$/m);
    expect(backup).toMatch(/rm -rf sicherung sicherung\.tar\.gz/);
    expect(hochladen).toMatch(/retention-days:\s*\d+/);
    expect(hochladen).toContain('if-no-files-found: error');
  });

  it('Sicherung: Client-Version passt zu Supabase (PostgreSQL 17) und pg_dump nutzt sie ausdrücklich', () => {
    expect(backup).toContain('postgresql-client-17');
    expect(backup).toContain('/usr/lib/postgresql/17/bin/pg_dump');
  });

  it('keine Zugangsdaten in den Workflow-Dateien', () => {
    for (const w of [ci, ping, backup]) {
      expect(w).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);            // JWT (anon- oder service_role-Schlüssel)
      expect(w).not.toMatch(/postgres(ql)?:\/\/[^$\s]+:[^$\s]+@/);   // Verbindungsadresse mit Passwort
    }
  });
});

describe('Projektdateien', () => {
  it('.env.example enthält nur Platzhalter', () => {
    const t = lies('.env.example');
    expect(t).toContain('VITE_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co');
    expect(t).toContain('VITE_SUPABASE_ANON_KEY=DEIN-ANON-SCHLUESSEL');
    expect(t).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  });
  it('.env kommt nie ins Repository', () => {
    const ignorieren = lies('.gitignore').split(/\r?\n/);
    expect(ignorieren).toContain('.env');
    expect(ignorieren).toContain('.env.local');
  });
  it('SPA-Fallback: alle Adressen liefern die App', () => {
    expect(lies('public/_redirects')).toMatch(/^\/\*\s+\/index\.html\s+200/m);
  });
  it('Content-Security-Policy: kein unsafe-eval, keine fremden Skripte, Supabase erlaubt', () => {
    const csp = /Content-Security-Policy:\s*(.+)/.exec(lies('public/_headers'))?.[1] ?? '';
    const teil = (name: string) => new RegExp(`${name} ([^;]*)`).exec(csp)?.[1] ?? '';
    expect(teil('script-src')).toBe("'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(teil('default-src')).toBe("'self'");
    expect(teil('connect-src')).toContain('https://*.supabase.co');
    expect(teil('connect-src')).toContain('wss://*.supabase.co');
    expect(teil('object-src')).toBe("'none'");
    expect(teil('frame-ancestors')).toBe("'none'");
  });
  it('die App lädt nichts von fremden Servern (Verweise in Links zählen nicht; passt zur Content-Security-Policy)', () => {
    const quellen: string[] = [];
    const gehe = (ordner: string) => {
      for (const e of readdirSync(join(wurzel, ordner), { withFileTypes: true })) {
        const pfad = `${ordner}/${e.name}`;
        if (e.isDirectory()) gehe(pfad);
        else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) quellen.push(pfad);
      }
    };
    gehe('src');
    const fremd = quellen.flatMap((q) => {
      const treffer = lies(q).match(/(?:src=|url\(|from\s+|import\()\s*["'(]?https?:\/\/[^"')\s]+/g) ?? [];
      return treffer.filter((t) => !/supabase\.co|localhost|example\.(org|com)/.test(t)).map((t) => `${q}: ${t}`);
    });
    expect(fremd).toEqual([]);
    expect(lies('index.html')).not.toMatch(/https?:\/\//);
  });
  it('die Migrationen sind lückenlos nummeriert und die Sammeldatei enthält alle', () => {
    const dateien = readdirSync(join(wurzel, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    dateien.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(4, '0'))).toBe(true));
    const bundle = lies('supabase/alle-migrationen.sql');
    for (const f of dateien) expect(bundle).toContain(`-- ════════ ${f} ════════`);
  });
  it('alle Geheimnisse, die die Workflows brauchen, sind in der Betriebsanleitung beschrieben', () => {
    const doku = lies('docs/BETRIEB.md');
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_DB_URL', 'BACKUP_PASSPHRASE']) expect(doku).toContain(name);
  });
});
