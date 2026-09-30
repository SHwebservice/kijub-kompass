# KiJuB-Kompass

Organisations-App des Kinder- und Jugendbüros für Ferienfreizeiten und Treffs.
React + TypeScript + Vite (PWA), Backend: Supabase (Postgres mit Row Level Security, Auth, Edge Functions).

| Dokument | Inhalt |
|---|---|
| [docs/PRODUKT.md](docs/PRODUKT.md) | Zielbild, Rollen, Leitplanken |
| [docs/FEATURES.md](docs/FEATURES.md) | Funktionsliste mit Entscheidungen |
| [docs/DATENMODELL.md](docs/DATENMODELL.md) | Datenmodell (maßgeblich sind `supabase/migrations/`) |
| [docs/RECHTE.md](docs/RECHTE.md) | Rechte-Matrix (umgesetzt in `0005`/`0006`, geprüft in `tests/db/`) |
| [docs/IMPORT.md](docs/IMPORT.md) | Import aus KiJuKo |
| [docs/SETUP.md](docs/SETUP.md) | Supabase, Hosting, erster Zugang |

## Entwickeln

```bash
npm install
npm test            # Datenbank-Regeln, Funktionen, Oberfläche
npm run dev
```

## Aufbau

```
supabase/migrations/   SQL: Schema, Hilfsfunktionen, Rechte (RLS), Sichten, RPC
supabase/functions/    Edge Functions (konto-passwort: Zugang einrichten, Passwort zurücksetzen)
src/lib/               Auth, Rollenlogik, Supabase-Client
src/components/        Design-System (ui.tsx), App-Hülle
src/pages/             Seiten
src/styles/            Design-Tokens (hell/dunkel), Basis-Stile
tests/db/              Rechte-Tests gegen Postgres im Speicher (PGlite)
```

## Regeln für Änderungen

- **Rechte gehören in die Datenbank.** Die Oberfläche blendet nur aus; erlaubt wird in `supabase/migrations/0006_rls.sql`.
- Jede neue Policy bekommt einen Positiv- **und** einen Negativtest in `tests/db/`.
- Bestehende Migrationen nach dem ersten Deploy nie ändern – neue Datei anlegen.
- Neue Funktion → zuerst Domäne (`docs/PRODUKT.md`) und Rolle (`docs/RECHTE.md`) klären.
