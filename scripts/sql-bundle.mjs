// Fasst alle Migrationen zu EINER Datei zusammen, die man im Supabase-Dashboard (SQL Editor)
// in einem Rutsch einfügen kann. Die Einzeldateien in supabase/migrations/ bleiben maßgeblich.
//   npm run sql:bundle
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = join(dirname(fileURLToPath(import.meta.url)), '..');
const ordner = join(wurzel, 'supabase', 'migrations');
const dateien = readdirSync(ordner).filter((f) => f.endsWith('.sql')).sort();

const teile = dateien.map((f) => `-- ════════ ${f} ════════\n${readFileSync(join(ordner, f), 'utf8').trim()}\n`);
const kopf = `-- KiJuB-Kompass · alle Migrationen in einer Datei (GENERIERT – nicht von Hand ändern)
-- Erzeugt mit: npm run sql:bundle
-- Nur für ein LEERES Projekt gedacht: einmal komplett im SQL Editor ausführen.
-- Enthalten: ${dateien.join(', ')}

`;
writeFileSync(join(wurzel, 'supabase', 'alle-migrationen.sql'), kopf + teile.join('\n'));
console.log(`${dateien.length} Migrationen → supabase/alle-migrationen.sql`);
