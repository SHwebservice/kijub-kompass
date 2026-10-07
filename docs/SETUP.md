# Einrichtung (Supabase, Hosting, erster Zugang)

Alles unten ist kostenlos. Die Schritte mit **[du]** kann nur Sebastian ausführen (Konto, Zugangsdaten);
die Migrationen, Tests und die App selbst sind im Repository fertig.

**Anmeldung:** Mail-Adresse + Passwort. Es werden **keine Mails versendet** – Supabase verschickt im kostenlosen
Tarif ohnehin nur an Teammitglieder (2 Mails pro Stunde). Zugänge richtet die Koordination in der App ein und gibt das
Startpasswort persönlich weiter; die Person legt beim ersten Anmelden ein eigenes fest.

## 1. Supabase-Projekt anlegen **[du]**

1. Auf <https://supabase.com> ein Konto anlegen und ein Projekt erstellen.
   - **Region: Frankfurt (eu-central-1)** – wegen DSGVO.
   - Starkes Datenbank-Passwort vergeben und im Passwortmanager ablegen.
2. **Authentication → Sign In / Providers:**
   - **„Allow new users to sign up" ausschalten.** Konten entstehen ausschließlich über die Koordination.
   - Provider **Email** eingeschaltet lassen (wird für Mail+Passwort gebraucht). **„Confirm email" an lassen** (zweite Sperre
     gegen fremde Registrierungen; die App legt Konten bereits bestätigt an).
   - **Minimum password length: 10** (entspricht `MIN_PASSWORT` in `src/lib/auth-fehler.ts`).
3. **Authentication → URL Configuration:** *Site URL* = Adresse der App (Abschnitt 4); lokal zusätzlich `http://localhost:5173`.
4. **Project Settings → API:** *Project URL* und *anon public key* notieren (für `.env`, siehe Abschnitt 5).

## 2. Datenbank einrichten

Variante A – mit der Supabase-CLI (empfohlen, wiederholbar):

```bash
npm i -D supabase
npx supabase login
npx supabase link --project-ref <PROJEKT-REF>
npx supabase db push          # spielt supabase/migrations/*.sql der Reihe nach ein
```

Variante B – ohne CLI: Im Dashboard unter **SQL Editor** den Inhalt von `supabase/alle-migrationen.sql` einfügen und
**einmal** ausführen (nur für ein leeres Projekt; die Datei entsteht mit `npm run sql:bundle`).

**Projekt läuft schon und es kommen neue Migrationen dazu?** Dann nur die neue Datei aus `supabase/migrations/` (z. B. `0009_person_entfernen.sql`)
im SQL Editor ausführen – nicht die Sammeldatei, die ist nur für leere Projekte.
Aktueller Stand der Migrationen: `0001` bis `0028` (`0010` = KiJuKo-Import, `0011` = Live-Aktualisierung der Freizeiten, `0012` = Dienstplan der Treffs, `0013` = Katalog-Kommentare mit Namen, `0014` = Lebenszeichen, `0015` = Mitteilungen, `0016` = Tagesprotokoll und Notizen der Treffs, `0017` = Mitteilungen zu Bewerbung, Nachweis und Lebensmitteln, `0018` = Koordination getrennt in Freizeiten- und Treffkoordination, `0019` = Fehlermeldungen der App, `0020` = Startseite in einem Aufruf und „Neu seit letztem Besuch“, `0021` = Bewerbung mit Rollenwahl und Aufräumen beim Entfernen aus einem Treff, `0022` = Stundennachweise durch Treffleitung und Treffkoordination erstellen lassen, `0023` = Überschneidungen von Freizeiten akzeptieren, `0024` = Monat einteilen: Personen gezielt hinzufügen und entfernen, `0025` = mehrere Dienstwünsche auf einmal bestätigen; Einteilen erfüllt einen offenen Wunsch, `0026` = Schließzeiten der Treffs, Erinnerung „Tagesprotokoll fehlt“ ans ganze Team, Farbe je Freizeit, `0027` = Feiertage schließen den Treff, `0028` = Vorlagen für das Tagesprotokoll je Wochentag).

### Erste Koordination anlegen **[du]**

Die App hat bewusst keinen „erster Benutzer"-Weg. Einmalig im SQL Editor (eigene Daten einsetzen):

```sql
insert into personen (vorname, nachname, mail, kategorie, ist_koordination)
values ('Vorname', 'Nachname', 'deine@mail.example', 'Hauptamtliche*r', true);
```

Danach unter **Authentication → Users → Add user → Create new user** dieselbe Mail-Adresse mit einem **Passwort** anlegen und
**„Auto Confirm User"** ankreuzen. Der Datenbank-Trigger verknüpft das Konto über die Mail-Adresse mit der Person.
Ab dann richtet die Koordination alle weiteren Zugänge in der App ein (**Mehr → Personen & Zugänge**).

> Schon angemeldet, aber ohne Passwort (z. B. über einen früheren Einladungslink)? Die Sitzung bleibt bestehen –
> unter **Mehr → Passwort ändern** ein Passwort festlegen, **bevor** du dich abmeldest.

## 3. Edge Functions bereitstellen **[du]**

Zwei Funktionen brauchen den Service-Schlüssel, den die App nie sieht:

| Funktion | Datei | Zweck |
|---|---|---|
| `konto-passwort` | `supabase/functions/konto-passwort/index.ts` | Zugang einrichten, Passwort zurücksetzen |
| `konto-entfernen` | `supabase/functions/konto-entfernen/index.ts` | Zugang entziehen, Person endgültig löschen |
| `push-senden` | `supabase/functions/push-senden/index.ts` | Mitteilungen (Web-Push) verschicken – braucht zusätzlich die Secrets aus `docs/BETRIEB.md` Abschnitt 2b |

Ohne CLI, für **jede** der Funktionen: Dashboard → **Edge Functions → Deploy a new function → „Via Editor"**, Name genau wie in der
Tabelle, Beispielcode löschen, Inhalt der Datei einfügen und bereitstellen. Die Dateien sind in sich geschlossen.
Mit CLI: `npx supabase functions deploy <name>` (für `konto-passwort`, `konto-entfernen`, `push-senden`).
Nach einer Änderung an den Dateien muss die Funktion neu bereitgestellt werden.

Secrets sind nicht nötig: `SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase automatisch.
Die Option **„Verify JWT"** bleibt an.

> Erster Test nach dem Bereitstellen: in der App eine Testperson anlegen, „Zugang einrichten" wählen, mit dem
> angezeigten Startpasswort in einem zweiten Browser anmelden und ein eigenes Passwort festlegen.

## 4. App veröffentlichen

Ausführlich in **[docs/BETRIEB.md](BETRIEB.md)**: Cloudflare Pages (Build `npm run build`, Ausgabe `dist`, Variablen `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`),
Supabase-Adresse eintragen, Prüfung mit `npm run check:site -- <Adresse>`, dazu Lebenszeichen gegen das Pausieren und die verschlüsselte wöchentliche Datensicherung.

Der anon-Schlüssel ist dafür gedacht, öffentlich zu sein; geschützt sind die Daten durch die Zugriffsregeln (RLS).
**Niemals** den `service_role`-Schlüssel in `VITE_…`-Variablen oder ins Repository legen.

## 5. Lokal entwickeln

```bash
npm install
cp .env.example .env     # Werte aus Abschnitt 1.4 eintragen
npm run dev              # http://localhost:5173
npm test                 # Datenbank-Regeln (PGlite) + Funktionen + Oberfläche
npm run lint && npm run typecheck && npm run build
npm run check:live       # prüft das echte Supabase-Projekt von außen (nur lesend)
```

Die Datenbank-Tests brauchen weder Docker noch Supabase: `tests/db/harness.ts` startet Postgres im Speicher (PGlite),
stellt `auth.users`/`auth.uid()` nach und spielt alle Migrationen ein.

## Sicherheitshinweise zum Passwort-Login

- Startpasswörter entstehen serverseitig (57 Zeichen Alphabet, 12 Zeichen, ≈ 70 Bit) und werden **nie gespeichert oder
  protokolliert**; nur die Koordination sieht sie einmal.
- Die Person muss das Startpasswort beim ersten Anmelden ändern. Die Pflicht ist ein Flag im Konto
  (`muss_passwort_aendern`); es zu umgehen ist nur der Person selbst möglich und schadet nur ihr.
- Nach „Passwort zurücksetzen" bleiben bereits angemeldete Geräte der Person bis zum Ablauf ihrer Sitzung gültig.
  Soll eine Person sofort gesperrt werden, setzt die Koordination sie auf **deaktiviert**: Dann greifen alle Datenregeln
  sofort nicht mehr.
- Supabase begrenzt fehlgeschlagene Anmeldungen automatisch (Ratenbegrenzung). Der Schutz vor bekannten, geleakten
  Passwörtern ist im kostenlosen Tarif nicht verfügbar – darum die Mindestlänge 10.

## Bekannte Grenzen des Testaufbaus

- PGlite ist echtes Postgres, aber **nicht** Supabase: Auth-Schema, JWT-Verarbeitung und Rollen werden nachgebildet.
  Nach dem Einspielen sollten die Rechte einmal stichprobenartig über die App geprüft werden (Anmeldung als TeamerIn,
  Leitung, Koordination).
- Edge Functions sind lokal nur in Teilen getestet (Passwort-Generator, Aufbau); der Ablauf gegen ein echtes Projekt
  wird beim ersten Einsatz geprüft.

## Live-Aktualisierung (Realtime)

Die Migrationen `0011` (Freizeiten: Wochenplan, Zeitabschnitte, Hinweise, Bestätigungen, Kommentare, Team, Lebensmittel) und `0012`
(Treffs: Dienste, Zuteilungen, Wünsche, Kommentare, Feiertage, Team, Wochenprogramm) melden die Tabellen bei Supabase Realtime an. Die Seiten laden dann von selbst nach, wenn jemand anderes etwas ändert. Es werden nur Zeilen geliefert, die die Person
laut Zugriffsregeln sehen darf. Hinweis zu Supabase: Bei **Löschungen** erfährt jede angemeldete Person der Tabelle nur, dass etwas gelöscht wurde
(mit der technischen ID, ohne Inhalt) – die Seite lädt dann neu und zeigt wie immer nur erlaubte Daten. Geprüft wird das in der Praxis: Zwei Geräte
öffnen denselben Wochenplan; ein Eintrag auf Gerät A erscheint kurz darauf auf Gerät B. Personenbezogene Tabellen (Personen, Bewerbungen, Nachweise,
Abwesenheiten) sind bewusst **nicht** angemeldet.
