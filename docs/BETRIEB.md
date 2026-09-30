# Betrieb: Veröffentlichen, Lebenszeichen, Datensicherung

Alles hier bleibt kostenlos (Supabase Free, Cloudflare Pages, GitHub Actions). Schritte, die du selbst machen musst, sind mit **[du]** markiert;
alles andere ist im Repository vorbereitet und getestet.

| Baustein | Was er tut | Wo die Einstellung liegt |
|---|---|---|
| Cloudflare Pages | liefert die App aus (HTTPS, weltweit schnell) | Cloudflare-Konto **[du]**, `public/_headers`, `public/_redirects`, `.node-version` |
| Supabase | Datenbank, Anmeldung, Zugriffsregeln | Supabase-Projekt **[du]**, `supabase/migrations/` |
| Erinnerung Tagesprotokoll | „Protokoll fehlt“ abends per Mitteilung an Treffleitung und Dienst des Tages | Migration `0016`, Workflow `erinnerung.yml`, Secret `CRON_SECRET` **[du]** |
| Mitteilungen | Web-Push an die Geräte (Hinweise, Dienstplan, Bewerbungen …) | Edge Function `push-senden`, Migration `0015`, `public/sw.js`, VAPID-Schlüssel **[du]** |
| Lebenszeichen | verhindert, dass Supabase das Projekt nach 7 Tagen ohne Zugriff pausiert | `.github/workflows/keepalive.yml`, Migration `0014` |
| Datensicherung | sichert die Datenbank wöchentlich, verschlüsselt | `.github/workflows/backup.yml` |
| Prüfungen | Tests und Build bei jedem Push | `.github/workflows/ci.yml` |

## 1. App veröffentlichen (Cloudflare Pages) **[du]**

1. Bei Cloudflare ein kostenloses Konto anlegen → **Workers & Pages → Create → Pages → Connect to Git** → das Repository `kijub-kompass` wählen.
2. Einstellungen:
   - Framework: **None** (oder „Vite“)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables (Production **und** Preview): `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` (aus Supabase → Project Settings → API).
   - Die Node-Version steht in `.node-version` (22).
3. Speichern. Nach dem ersten Build gibt es eine Adresse wie `kijub-kompass.pages.dev`. Jeder Push auf `main` veröffentlicht automatisch.
4. **In Supabase die Adresse eintragen:** Authentication → URL Configuration → *Site URL* = die neue Adresse, unter *Redirect URLs* dieselbe Adresse mit `/**` ergänzen.
   (Der Passwort-Login braucht keine Links per Mail, aber Supabase verlangt eine gültige Adresse.)
5. Prüfen, ob alles stimmt – von deinem Rechner aus, verändert nichts:

```bash
npm run check:site -- https://kijub-kompass.pages.dev
```

Die Prüfung kontrolliert: Erreichbarkeit, Sicherheitsköpfe (Content-Security-Policy, HSTS …), dass Lesezeichen auf tiefe Adressen funktionieren,
dass die Programmdateien lange zwischengespeichert werden und dass keine Source-Map öffentlich ist.

**Eigene Domain** (z. B. `kompass.kijub.de`): in Cloudflare Pages → Custom domains. Danach *Site URL* in Supabase anpassen.
Die Sicherheitsköpfe in `public/_headers` erlauben Verbindungen nur zu `*.supabase.co` – ein eigenes Supabase-Domain-Add-on wäre dort einzutragen.

### Die Version erkennen
Unter **Mehr** steht ganz unten „Version abc1234“ (die kurze Commit-ID). Bei einer Fehlermeldung bitte diese Nummer mitschicken.
Auch die Fehlerseite („Da ist etwas schiefgelaufen“) zeigt sie.

## 2. GitHub-Geheimnisse einrichten **[du]**

Repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Inhalt | Wofür |
|---|---|---|
| `SUPABASE_URL` | die Projekt-URL, z. B. `https://abcd1234.supabase.co` | Lebenszeichen |
| `SUPABASE_ANON_KEY` | der öffentliche *anon*-Schlüssel | Lebenszeichen |
| `SUPABASE_DB_URL` | die Datenbank-Adresse des **Session Pooler** (siehe unten) | Datensicherung |
| `BACKUP_PASSPHRASE` | ein langes, zufälliges Passwort (mindestens 20 Zeichen) | Verschlüsselung der Sicherung |

**`SUPABASE_DB_URL` finden:** Supabase → oben **Connect** → *Session pooler* (Port 5432) → die Adresse kopieren und `[YOUR-PASSWORD]` durch das
Datenbank-Passwort ersetzen (Project Settings → Database → Reset database password, falls du es nicht kennst).
Die *Direct connection* funktioniert hier **nicht**: sie ist nur per IPv6 erreichbar, GitHub Actions nutzt IPv4. Der *Transaction pooler* (Port 6543) ist für `pg_dump` ungeeignet.

**`BACKUP_PASSPHRASE`:** z. B. im Passwort-Manager erzeugen lassen. **Sie muss außerhalb von GitHub aufbewahrt werden** (Passwort-Manager, Tresor der Koordination):
Ohne sie sind alle Sicherungen unbrauchbar, und GitHub kann sie nicht wiederherstellen.

> Der service_role-Schlüssel gehört **nirgends** hierher.

## 2b. Mitteilungen (Web-Push) einrichten **[du]**

Mitteilungen erscheinen auf dem Gerät, auch wenn die App geschlossen ist: neuer Hinweis, neue Absprache, Dienstplan geändert, neuer Kommentar, neuer Dienstwunsch und dessen Antwort,
neue Bewerbung, neuer Katalog-Vorschlag – und manuelle Mitteilungen der Koordination an Gruppen (*Mehr → Mitteilung senden*). Jede Person schaltet sie selbst auf ihrem Gerät ein (*Mehr → Mitteilungen*).

**Wie es funktioniert:** Die App meldet der Edge Function `push-senden`, dass etwas passiert ist. Die **Datenbank** entscheidet dann (Migration `0015`), ob die auslösende Person das darf,
wer Empfänger ist und welcher Text verschickt wird – nur eigene, frische Vorgänge werden akzeptiert, Wiederholungen und Massenversand werden gebremst (gleiche Mitteilung nicht zweimal in 2 Minuten, höchstens 60 pro Stunde und Person).
Die Edge Function verschlüsselt (Web-Push-Standard, RFC 8291) und schickt an die Geräte der Empfänger; nicht mehr gültige Geräte räumt sie selbst auf. Die auslösende Person bekommt ihre eigene Mitteilung nie.

Einrichten (einmalig):

1. **Schlüssel erzeugen:** `npm run vapid` – zeigt drei Werte für Supabase und einen für Cloudflare. Die Schlüssel werden nicht gespeichert; bitte sofort eintragen.
2. **Supabase → Edge Functions → Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (z. B. `mailto:freizeiten@frankenthal.de`).
3. **Edge Function bereitstellen** (wie bei den anderen, siehe `docs/SETUP.md`): Name `push-senden`, Inhalt von `supabase/functions/push-senden/index.ts`, **„Verify JWT“ bleibt an**.
4. **Migration** `supabase/migrations/0015_mitteilungen.sql` im SQL Editor ausführen.
5. **Cloudflare Pages → Environment variables:** `VITE_VAPID_PUBLIC_KEY` (der **öffentliche** Schlüssel) in Production und Preview, danach neu bereitstellen. Der private Schlüssel gehört **nur** in die Supabase-Secrets.
6. **Testen:** in der App *Mehr → Mitteilungen einschalten → Testmitteilung senden*. Es erscheint „Testmitteilung“ auf dem Gerät.

Hinweise:
- **iPhone/iPad:** Mitteilungen gibt es erst, wenn die Seite zum Home-Bildschirm hinzugefügt wurde (Teilen → „Zum Home-Bildschirm“) und von dort geöffnet wird (iOS 16.4 oder neuer). Die App zeigt diese Anleitung selbst an.
- Wer sich abmeldet, meldet das Gerät für Mitteilungen automatisch ab – so kommen sie nie bei der nächsten Person am selben Gerät an.
- **Neue Schlüssel** (`npm run vapid` ein zweites Mal) machen alle bisherigen Geräteanmeldungen ungültig: Alle müssen die Mitteilungen einmal aus- und wieder einschalten.
- Mitteilungen sind **nicht zuverlässig genug für Notfälle** (Geräte im Energiesparmodus, ausgeschaltete Benachrichtigungen, Browser ohne Unterstützung). Wichtiges zusätzlich anders weitergeben.

## 2c. Erinnerung „Tagesprotokoll fehlt“ einrichten **[du]**

Wer ein Treff-Team ist, bekommt abends eine Mitteilung, wenn für den Öffnungstag noch kein Tagesprotokoll geschrieben wurde. Ein GitHub-Lauf (`.github/workflows/erinnerung.yml`) fragt dafür
alle 30 Minuten (16–24 Uhr) die Edge Function `push-senden`. **Die Datenbank** (Migration `0016`, `fn_protokoll_erinnerungen`) entscheidet: Treffleitung und die heute Eingeteilten, frühestens 15 Minuten
nach Ende der Öffnungszeit, höchstens drei Stunden danach, nicht an Feiertagen, einmal pro Treff und Tag. Das Geheimnis erlaubt dem Zeitplan **nur** diese eine Erinnerung – sonst nichts.

1. **Migration** `supabase/migrations/0016_tagesprotokoll.sql` im SQL Editor ausführen.
2. **Geheimnis erzeugen:** `openssl rand -hex 32` (oder ein anderer Passwortgenerator, mindestens 32 Zeichen).
3. **Supabase → Edge Functions → Secrets:** `CRON_SECRET` = das Geheimnis.
4. **Edge Function `push-senden` neu bereitstellen** (Inhalt von `supabase/functions/push-senden/index.ts` – sie kennt jetzt den Zeitplan-Aufruf).
5. **GitHub → Settings → Secrets and variables → Actions:** `CRON_SECRET` = dasselbe Geheimnis (`SUPABASE_URL` und `SUPABASE_ANON_KEY` gibt es schon).
6. **Testen:** Actions → *Erinnerung Tagesprotokoll* → *Run workflow*. Ausgabe „Antwort (200)“ mit Zahlen; außerhalb der Fenster lautet sie `erinnerungen: 0`. Ohne VAPID-Schlüssel oder ohne Secrets warnt der Lauf nur, er schlägt nicht fehl.

Hinweis: GitHub startet Zeitpläne nicht sekundengenau, Verspätungen von einigen Minuten sind normal. Die Erinnerung ist deshalb ein Hinweis, keine Uhr.

## 3. Lebenszeichen

Kostenlose Supabase-Projekte werden nach **7 Tagen ohne Zugriffe pausiert**. `keepalive.yml` ruft montags und donnerstags (06:17 UTC) die Funktion `fn_ping` auf,
die nur „ok“ zurückgibt (Migration `0014`, die einzige ohne Anmeldung aufrufbare Funktion). Der größte Abstand zwischen zwei Aufrufen beträgt 4 Tage.

- **Prüfen:** Repository → **Actions → Lebenszeichen → Run workflow**. Grünes Häkchen = Datenbank antwortet.
- **Schlägt ein Lauf fehl**, schickt GitHub eine Mail. Häufigste Ursachen: Secret fehlt oder falsch, Projekt pausiert.
- **Projekt ist pausiert?** Supabase-Dashboard → das Projekt → **Restore project**. Die Daten bleiben erhalten (mindestens 90 Tage); danach das Lebenszeichen einmal von Hand starten.
- **Achtung, GitHub-Regel:** In Repositories ohne Aktivität deaktiviert GitHub geplante Workflows nach **60 Tagen**. Jeder Commit (oder „Enable workflow“ im Actions-Reiter) schaltet sie wieder ein.
  Auch die Datensicherung fällt darunter – die Mail von GitHub nicht übersehen.

## 4. Datensicherung

Kostenlose Supabase-Projekte haben **keine automatischen Sicherungen**. Darum sichert `backup.yml` jeden Sonntag (03:43 UTC) und auf Knopfdruck:

- `daten.sql` – alle Daten der eigenen Tabellen
- `struktur.sql` – Aufbau, Regeln und Funktionen (zum Nachschlagen)
- `auth.sql` – die Anmeldekonten (E-Mail und Passwort-Prüfsumme; keine Klartext-Passwörter)

Alles wird zu **einer verschlüsselten Datei** (`kijub-kompass-JJJJ-MM-TT.tar.gz.gpg`, AES-256) gepackt und als Artefakt 60 Tage aufbewahrt.
Der Lauf bricht ab, wenn `BACKUP_PASSPHRASE` fehlt – unverschlüsselt wird nie etwas abgelegt (in öffentlichen Repositories könnte jede angemeldete Person Artefakte laden).

**Sicherung jetzt anstoßen / herunterladen:** Actions → *Datensicherung* → **Run workflow**; nach dem Lauf steht unten auf der Seite das Artefakt `datensicherung`.

**Zusätzlich empfohlen:** die Datei einmal im Quartal an einen Ort außerhalb von GitHub legen (Laufwerk der Stadt), denn Artefakte werden nach 60 Tagen gelöscht.

### Wiederherstellen (Totalausfall oder versehentlich gelöschte Daten)

Nur mit Datenbank-Zugriff über `psql` (Teil des PostgreSQL-Clients, Version 17). **Empfehlung: einmal als Probe** in einem zweiten kostenlosen Supabase-Projekt durchspielen –
dann ist der Ernstfall kein Erstkontakt. Diese Wiederherstellung wurde noch nicht gegen ein echtes Supabase-Projekt erprobt.

1. **Entschlüsseln und auspacken:**
   ```bash
   gpg --decrypt kijub-kompass-2027-01-03.tar.gz.gpg | tar xz        # fragt nach BACKUP_PASSPHRASE, erzeugt den Ordner sicherung/
   ```
2. **Neues (oder leeres) Projekt vorbereiten:** Im SQL Editor den Inhalt von `supabase/alle-migrationen.sql` ausführen. Das legt Aufbau, Regeln und Rechte exakt wie im Original an.
3. **Daten einspielen** (`$DB_URL` = Session-Pooler-Adresse des neuen Projekts):
   ```bash
   (echo "set session_replication_role = replica;"; echo "delete from tags; delete from einstellungen;"; cat sicherung/daten.sql) \
     | psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1
   ```
   (Falls Supabase das Setzen von `session_replication_role` ablehnt: im SQL Editor die Trigger der Tabellen vorübergehend mit `alter table … disable trigger user` abschalten und danach wieder einschalten.)
   „replica“ schaltet die Prüf-Trigger während des Einspielens ab (sonst würden sie z. B. Nachweise oder Zuteilungen beim Laden ablehnen); `tags` und `einstellungen` enthalten Startwerte aus den Migrationen und werden vorher geleert.
4. **Anmeldekonten einspielen** (damit sich alle mit ihrem bisherigen Passwort anmelden können):
   ```bash
   (echo "set session_replication_role = replica;"; cat sicherung/auth.sql) | psql "$DB_URL" --single-transaction -v ON_ERROR_STOP=1
   ```
   Schlägt das fehl (z. B. weil Supabase die Konten-Tabellen geändert hat), ist das kein Drama: Die Personen sind in `daten.sql` enthalten; die Koordination richtet unter *Mehr → Personen & Zugänge* neue Zugänge ein.
5. **Edge Functions** (`konto-passwort`, `konto-entfernen`) im neuen Projekt bereitstellen (siehe `docs/SETUP.md`), **Auth-Einstellungen** wiederholen (Registrierung aus, Mindestlänge 10) und in Cloudflare `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` auf das neue Projekt stellen.
6. `npm run check:live` prüft das neue Projekt von außen.

## 5. Vor dem Start für alle: Checkliste **[du]**

- [ ] Supabase: *Confirm email* wieder einschalten, Mindestlänge Passwort 10, Registrierung (*Allow new users to sign up*) **aus** – `npm run check:live` zeigt den Stand.
- [ ] Migrationen `0001` bis `0016` eingespielt, Edge Functions (`konto-passwort`, `konto-entfernen`, `push-senden`) bereitgestellt, VAPID-Schlüssel eingetragen.
- [ ] Cloudflare Pages läuft, `npm run check:site -- <Adresse>` zeigt „Alles in Ordnung“.
- [ ] Fünf GitHub-Geheimnisse gesetzt (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`, `CRON_SECRET`), *Lebenszeichen* und *Datensicherung* je einmal von Hand gestartet (grün), `BACKUP_PASSPHRASE` im Passwort-Manager.
- [ ] Probewiederherstellung in einem zweiten Projekt.
- [ ] **Datenschutz:** Die Seiten *Impressum* und *Datenschutzhinweise* (`/impressum`, `/datenschutz`, Texte in `src/pages/recht/`) von der/dem Datenschutzbeauftragten der Stadt prüfen lassen.
      Dazu gehören: Auftragsverarbeitungsverträge mit Supabase und Cloudflare, die Wahl der Supabase-Region (beim Anlegen des Projekts festgelegt – bei Bedarf prüfen), und der Eintrag im Verzeichnis der Verarbeitungstätigkeiten.
- [ ] Koordination unterweisen: Personen anlegen, Zugänge einrichten und entziehen, Person löschen.

## 6. Wenn etwas nicht klappt

| Beobachtung | Wahrscheinliche Ursache | Was tun |
|---|---|---|
| Seite zeigt „Die App ist noch nicht mit Supabase verbunden“ | Umgebungsvariablen fehlen im Cloudflare-Build | Variablen setzen, Deployment neu starten (Variablen gelten erst ab dem nächsten Build) |
| Anmeldung meldet einen Serverfehler, nichts lädt | Supabase-Projekt pausiert | Dashboard → *Restore project* |
| Lesezeichen/„Neu laden“ ergibt „Not found“ | `public/_redirects` fehlt im Build | `npm run check:site` zeigt es; Datei muss in `dist/` liegen |
| Seite bleibt nach Änderung auf altem Stand | Gerät hat die alte Version zwischengespeichert | „Seite neu laden“ (auf dem Handy: App schließen und neu öffnen) |
| Keine Verbindung zu Supabase trotz laufendem Projekt | Content-Security-Policy blockiert die Adresse (z. B. eigene Supabase-Domain) | `connect-src` in `public/_headers` ergänzen |
| „Mitteilungen sind noch nicht eingerichtet“ in der App | `VITE_VAPID_PUBLIC_KEY` fehlt im Cloudflare-Build | Variable setzen, neu bereitstellen |
| Testmitteilung: „VAPID-Schlüssel fehlen“ | Secrets in Supabase fehlen | Abschnitt 2b, Schritt 2 |
| Testmitteilung: „kein Gerät erreichbar“ | Gerät vom Push-Dienst abgemeldet (z. B. Browserdaten gelöscht) | Mitteilungen aus- und wieder einschalten |
| Mitteilungen kommen nicht an, obwohl „eingeschaltet“ | Gerät im Energiesparmodus, Benachrichtigungen für den Browser ausgeschaltet, iPhone ohne Home-Bildschirm-App | Geräteeinstellungen prüfen; Testmitteilung senden |
| Lebenszeichen-Lauf rot | Secret falsch/fehlt oder Projekt pausiert | siehe Abschnitt 3 |
| Sicherung rot mit „Passwort kürzer als 20 Zeichen“ | `BACKUP_PASSPHRASE` fehlt | Secret setzen |
| Sicherung rot bei `pg_dump` („Network is unreachable“, „Tenant or user not found“) | falsche Adresse: Direct Connection (IPv6) oder falscher Benutzername | Session-Pooler-Adresse aus *Connect* verwenden |
| Die letzte Koordination kann sich nicht mehr anmelden | Konto gesperrt oder Passwort vergessen | Supabase → Authentication → Users → Passwort setzen; die Datenbank verhindert, dass die letzte aktive Koordination entfernt oder herabgestuft wird |
