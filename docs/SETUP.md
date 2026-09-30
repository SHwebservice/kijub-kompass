# Einrichtung (Supabase, Hosting, erster Zugang)

Alles unten ist kostenlos. Die Schritte mit **[du]** kann nur Sebastian ausführen (Konto, Zugangsdaten);
die Migrationen, Tests und die App selbst sind im Repository fertig.

## 1. Supabase-Projekt anlegen **[du]**

1. Auf <https://supabase.com> ein Konto anlegen und ein Projekt erstellen.
   - **Region: Frankfurt (eu-central-1)** – wegen DSGVO.
   - Starkes Datenbank-Passwort vergeben und im Passwortmanager ablegen.
2. **Authentication → Providers → Email:** „Confirm email" an lassen, **„Allow new users to sign up" ausschalten**
   (Konten entstehen ausschließlich per Einladung der Koordination).
3. **Authentication → Email Templates:** In den Vorlagen „Magic Link" und „Invite user" den Code ausgeben, damit die App ihn abfragen kann:
   - Magic Link: Text z. B. `Dein Anmeldecode: {{ .Token }}`
   - Invite user: Link `{{ .ConfirmationURL }}` belassen (öffnet die App) und zusätzlich den Hinweis, dass spätere Anmeldungen per Code funktionieren.
4. **Authentication → URL Configuration:** *Site URL* = Adresse der App (siehe Abschnitt 4); lokal zusätzlich `http://localhost:5173` als *Redirect URL*.
5. **Project Settings → API:** *Project URL* und *anon public key* notieren.

## 2. Datenbank einrichten

Variante A – mit der Supabase-CLI (empfohlen, wiederholbar):

```bash
npm i -D supabase
npx supabase login
npx supabase link --project-ref <PROJEKT-REF>
npx supabase db push          # spielt supabase/migrations/*.sql der Reihe nach ein
```

Variante B – ohne CLI: Im Dashboard unter **SQL Editor** die Dateien `supabase/migrations/0001_…sql` bis `0007_…sql`
**in dieser Reihenfolge** einfügen und ausführen.

### Erste Koordination anlegen **[du]**

Die App hat bewusst keinen „erster Benutzer"-Weg. Einmalig im SQL Editor (eigene Daten einsetzen):

```sql
insert into personen (vorname, nachname, mail, kategorie, ist_koordination)
values ('Vorname', 'Nachname', 'deine@mail.example', 'Hauptamtliche*r', true);
```

Danach unter **Authentication → Users → Add user → Send invitation** dieselbe Mail-Adresse einladen
(oder „Create new user" mit „Auto confirm"). Der Datenbank-Trigger verknüpft das Konto über die Mail-Adresse
mit der Person. Ab dann lädt die Koordination alle weiteren Personen in der App ein (**Mehr → Personen & Einladungen**).

## 3. Einladungs-Funktion bereitstellen

```bash
npx supabase functions deploy person-einladen
npx supabase secrets set APP_URL=https://kompass.example.org   # Adresse der App (Abschnitt 4)
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase automatisch. Der Service-Schlüssel
bleibt ausschließlich in der Funktion und gelangt nie in die App.

> Die Funktion wurde noch **nicht gegen ein echtes Supabase-Projekt getestet** (lokal ohne Docker/Deno nicht möglich).
> Erster Test nach dem Deploy: in der App eine Testperson anlegen und einladen.

## 4. App veröffentlichen

**Empfehlung: Cloudflare Pages** (kostenlos, SPA-Fallback über `public/_redirects`, schnelle Auslieferung).

1. Repository auf GitHub ablegen **[du]** (privat möglich).
2. Cloudflare Pages → „Create project" → mit GitHub verbinden.
3. Build-Befehl `npm run build`, Ausgabeordner `dist`.
4. Umgebungsvariablen (Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Der anon-Schlüssel ist dafür gedacht, öffentlich zu sein; geschützt sind die Daten durch die Zugriffsregeln (RLS).
**Niemals** den `service_role`-Schlüssel in `VITE_…`-Variablen oder ins Repository legen.

## 5. Lokal entwickeln

```bash
npm install
cp .env.example .env     # Werte aus Abschnitt 1.5 eintragen
npm run dev              # http://localhost:5173
npm test                 # Datenbank-Regeln (PGlite) + Oberfläche
npm run lint && npm run typecheck && npm run build
```

Die Datenbank-Tests brauchen weder Docker noch Supabase: `tests/db/harness.ts` startet Postgres im Speicher (PGlite),
stellt `auth.users`/`auth.uid()` nach und spielt alle Migrationen ein.

## Bekannte Grenzen des Testaufbaus

- PGlite ist echtes Postgres, aber **nicht** Supabase: Auth-Schema, JWT-Verarbeitung (`auth.uid()` liest dort
  `request.jwt.claims`) und Rollen werden nachgebildet. Nach dem ersten echten `db push` sollten die Rechte einmal
  stichprobenartig über die App geprüft werden (Anmeldung als TeamerIn, Leitung, Koordination).
- Edge Functions, E-Mail-Versand und Push sind lokal nicht getestet.
