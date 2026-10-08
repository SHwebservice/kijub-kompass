# KiJuKo-Import (Phase 1)

> **Stand 2026-10-08 – KiJuKo 3:** KiJuKo 2.1 ist durch KiJuKo 3 ersetzt. KiJuKo 3 speichert unter
> *Einstellungen → KiJuB-Kompass → Exportieren* eine eigene Datei (`"format": "kijuko-kompass"`, `version: 1`), die nur die
> hier benötigten Felder enthält (Orte, Personen ohne Geburtsdatum/Adresse/Anrede, Freizeiten mit `leitung`/`team`,
> Essenszahlen je Tag, Materialbedarf; keine Kurse, Teilnehmenden, Haushalt, Zugangscodes). `baueImportPlanAusExport`
> in `src/import/kijuko.ts` macht daraus denselben Plan wie bisher – Datenbankfunktion, Vorschau und Feldregeln sind unverändert.
> Alte Sicherungen aus KiJuKo 2.1 werden weiter erkannt. Unterschiede zur alten Sicherung:
> - KiJuKo 3 übernimmt die IDs der alten Sicherung → nach einem alten Import wird alles wiedererkannt (`tests/db/import-kijuko3.test.ts`).
> - Leitung kann jede Person sein (nicht nur Hauptamtliche). Beschäftigungsarten, die es im Kompass nicht gibt (z. B. Küchenkraft), werden „TeamerIn“ mit Hinweis.
> - Essenszahlen kommen nur noch je Tag (von KiJuKo aus Teilnehmenden und Personal berechnet; Wochenenden nur bei Übernachtungsfreizeiten); die Gesamtzeile entfällt.
> - Küchenteams sind in KiJuKo 3 Teil ihrer Freizeit; frühere eigene „Küchen-Freizeiten“ erscheinen beim ersten Import als „nicht mehr in KiJuKo“.
> - Zugangscodes/-links gibt es nicht mehr; Zugänge richtet die Koordination im Kompass ein (Abschnitt 5).

Stand: 2026-09-30 · Grundlage: Backup `KiJuKo-Backup-2026-09-30.json` (469 KB) und `js/backup-import.js` des Altcodes.
**Entscheidung:** KiJuKo2.1 bleibt die Offline-Verwaltungssoftware; der Kompass importiert dauerhaft aus ihr, und der Import wird gegenüber dem Altcode erweitert.

## Stand der Umsetzung (Phase 3)

**Umgesetzt und getestet:** Parser (`src/import/kijuko.ts`), Datenbankfunktion `fn_kijuko_import` (Migration `0010`),
Oberfläche *Mehr → KiJuKo-Import* (nur Koordination). Maßgeblich für das Verhalten sind Code und Tests
(`src/import/kijuko.test.ts`, `tests/db/import.test.ts`); dieses Dokument beschreibt Ziel und Regeln.

**Ablauf:** Datei wählen → der Browser prüft sie und baut einen schlanken Plan (nur benötigte Felder) → die Datenbank
rechnet den kompletten Import als **Probelauf** durch und macht ihn wieder rückgängig (Vorschau = exakt das, was der echte Lauf tut)
→ Entscheidungen treffen → **Import durchführen** (eine Transaktion, alles oder nichts, Protokoll in `import_laeufe`).

**Feldregeln** (neu = KiJuKo, ist = Kompass, stand = Wert beim letzten Import):
leere KiJuKo-Werte überschreiben nie · ist = neu: nichts · neu = stand (KiJuKo unverändert): Kompass-Wert bleibt, auch bei Abweichung ·
ist leer: neu übernehmen · ist = stand (Kompass nicht angefasst): neu übernehmen · sonst **Konflikt** (Koordination entscheidet; ohne Entscheidung
bleibt der Kompass-Wert und der Konflikt offen).

**Abgleich mit Vorhandenem:** über die KiJuKo-ID; fehlt sie, über Mail-Adresse (Personen), Name (Orte) bzw. Name + Startdatum (Freizeiten) –
so entstehen keine Doppelten. Kompass-eigene Angaben (Koordinations-Flag, Farbe, Rollen im Team, Wochenpläne, Hinweise …) werden nie berührt.

**Was wegfällt:** nie stillschweigend gelöscht. Personen und Freizeiten werden markiert (`kijuko_entfallen_am`), entfallene Zuteilungen
nur auf Häkchen entfernt. Im Kompass bewusst entfernte Zuteilungen kommen nicht zurück.

**Bekannte Grenzen:** Der Import setzt die Koordination nie außer Kraft – selbst auf ausdrückliche Entscheidung lässt sich die letzte aktive Koordination
nicht deaktivieren. Ändert sich die Mail-Adresse einer Person mit Login-Konto, läuft das Konto unter der alten Adresse weiter (Hinweis in der Vorschau).
Am echten Backup (Stand 2026-09-30) geprüft: 10 Orte, 77 Personen, 44 Freizeiten, 224 Zuteilungen (66 Leitungen), 105 Verpflegungszeilen, 33 Materialposten;
zwei Datensätze übersprungen (Hauptamtliche ohne Mail, Beispielzeile); ein zweiter Lauf ändert nichts.

---

## 1. Was das Backup enthält (gemessen)

| Schlüssel | Anzahl | Inhalt |
|---|---|---|
| `projects` | 44 | Alle `type = "Camp"`; 30 Ferien-Camps, 14 „Einzelevents" (Oster-/Herbst-Angebote an Treff-Standorten, **keine** Treffs). `startDate`/`endDate` sind vorhanden (der Altcode parste stattdessen `period`). Status: Geplant 26 · Abgesagt 2 · ohne Status 16. 8 Serien (`seriesId`). |
| `staff` | 58 | Ehrenamtliche/Teilzeit (TeamerIn 41, TZK 6, Praktikum bezahlt 6, Senior 3, FSJ 1, Praktikum unbezahlt 1). Enthält neben Kontaktdaten auch Anrede, Adresse, Geburtsdatum, `availableWeeks`, `weekStatuses`, `schulung`, `skills`, `accessCode/-Link`. Keine doppelten Mails. |
| `hauptamtliche` | 20 | Die Leitungen (alle 66 Leiter-Verweise der Projekte zeigen hierher, **keiner** auf `staff`). 1 Eintrag ohne Mail, 1 Eintrag ohne Vorname (ob derselbe, nicht geprüft), 11 mit 0 Wochenstunden. |
| `allocations` | 158 | Zuteilung Person ↔ Projekt, teils mit `status` („Bestätigt" 10, „Noch nicht an PA gesendet" 9). Alle verweisen auf vorhandene `staff` und `projects`. 54 von 58 Personen haben Zuteilungen. |
| `locations` | 10 | Name, Adresse, `lieferstelleNr` (7 von 10), sonst leere Felder. |
| `cateringEntries` | 18 | Verpflegungsmengen je Projekt (Mischkost/Vegetarisch/Allergiker, je Tag). |
| `materialNeeds` | 34 | Materialbedarf je Projekt. |
| `checklists` · `todos` · `taskTemplates` | 480 · 146 · 80 | Projekt-Checklisten, Aufgaben, Aufgabenvorlagen (Zeitpunkt relativ zu Start/Ende). |
| `foodRates` · `equipmentRates` · `budgetRates` · `manualBookings` | 8 · 14 · – · 1 | Kalkulation (Lebensmittel/Geschirr je Kind, Budgetposten 201/203). |
| `mailTemplates` · `customPlaceholders` · `letterheadImage` · `bescheinigung*` | 3 · 2 · – · – | Mailvorlagen, Briefkopf, Leistungsbescheinigungen (Sets „Standard", „Küche"). |
| `faqEntries` · `faqCategories` | 7 · 7 | FAQ der KiJuKo-Nutzenden (Koordination). |
| `partners` · `schulungTermine` · `schulungNotizbuch` · `projectSeries` · `logisticsDeliveries` · `archive` | 1 · – · 2 · 0 · 0 · 0 | Sonstiges (teils leer). |

Daraus folgt: **KiJuKo ist ein eigenes, breites Verwaltungssystem** (Personal, Budget, Verpflegung, Checklisten,
Bescheinigungen). Der Kompass soll davon nur das übernehmen, was er für die Organisation der Freizeiten braucht.
Alles andere bleibt in KiJuKo.

## 2. Was der Altcode importierte

- Projekte → Freizeiten (Name, Ort, Adresse, Zeitraum aus `period`, Ferienzeitraum/-woche, Alter aus `ageRange`, max. Teilnehmende, **Leitung nur als Text** aus den Hauptamtlichen)
- Staff → Mitarbeitende (Vorname, Nachname, Mail, Telefon, Ernährung, Status, Notiz, Rolle `leitung` nur, wenn der Staff-Eintrag Leiter war – kam real nie vor)
- Allocations → Freizeit-Zuordnung, Orte nur soweit von einer Freizeit genutzt
- Überspringen: Projekte ohne Name/Zeitraum, Staff ohne Mail/Namen

**Lücken:** Hauptamtliche wurden **nicht** als Personen angelegt (Leitungen hatten dadurch kein Konto, keine Rechte, keine Push-Nachrichten); Wochenstatus, Verfügbarkeit, Zuteilungsstatus, Schulung und Verpflegung gingen verloren; der Import war nicht wiederholbar (jede Ausführung legte neue Datensätze an – deshalb gab es die „Duplikate bereinigen"-Funktion).

## 3. Zielbild des neuen Imports

1. **Wiederholbar (idempotent).** Jeder importierte Datensatz merkt sich die KiJuKo-ID (`kijuko_id`). Ein zweiter Import mit einem neueren Backup **gleicht ab**: Neues wird angelegt, Geändertes aktualisiert, Unverändertes bleibt. Damit entfallen Duplikate.
2. **Vorschau vor dem Schreiben.** Ergebnis als Liste „neu / geändert / unverändert / übersprungen (mit Grund) / in KiJuKo nicht mehr vorhanden", inkl. Feld-Unterschieden. Erst nach Bestätigung wird geschrieben; alles in **einer** Transaktion.
3. **Klare Eigentümerschaft je Feld.** KiJuKo ist führend für Stammdaten, Zuteilung und Status. Der Kompass ist führend für alles, was dort nicht existiert (Wochenplan, Hinweise, Absprachen, Lebensmittel, Dienste, Bewerbungen, Favoriten). Kompass-eigene Daten werden vom Import **nie** überschrieben oder gelöscht.
4. **Nichts wird stillschweigend gelöscht.** Ein in KiJuKo entfallener Datensatz wird im Kompass nur markiert („nicht mehr in KiJuKo") und der Koordination zur Entscheidung vorgelegt (Abgesagt/Entfernen).
5. **Nur durch Koordination**, als Server-Funktion (Edge Function / RPC), nicht als Browser-Logik. Der Browser lädt die Datei hoch; Parsen, Abgleich und Schreiben laufen serverseitig. Importprotokoll je Lauf (wer, wann, Datei-Prüfsumme, Zahlen).
6. **Datensparsamkeit.** Felder, die der Kompass nicht braucht (Geburtsdatum, Straße/PLZ/Ort), werden **nicht** gespeichert. Die Datei selbst wird nach dem Lauf nicht aufbewahrt.
7. **Versionstolerant.** Fehlende Schlüssel oder neue Felder brechen den Import nicht ab; unbekannte Felder werden ignoriert und im Protokoll erwähnt.

## 4. Abbildung (Vorschlag)

### Stufe 1 – fest (ersetzt die Funktion des Altcodes vollständig)

| KiJuKo | Kompass | Regel |
|---|---|---|
| `locations` | `orte` | Name + Adresse; Schlüssel `kijuko_id`. `lieferstelleNr` wird mitgenommen (nützlich für Verpflegung/Lieferung) als `orte.lieferstelle_nr`. Es werden **alle** Orte importiert, nicht nur genutzte (Orte sind Stammdaten, z. B. für die Treffs). |
| `projects` | `freizeiten` | Name, `startDate`/`endDate` (nicht mehr aus `period` parsen), `holidayPeriod` → `ferienzeitraum`, `holidayWeek` („Sommer - Woche 3") → `ferienwoche`, `ageRange` → `alter_von/bis`, `maxParticipants`, `workStartTime/EndTime` → `arbeitsbeginn/-ende`, Ort, Code (`code`, z. B. F26S3ESa1) und `seriesId` als Referenz. **Abgesagt** → Freizeit `status = abgesagt` (nicht löschen). |
| `hauptamtliche` | `personen` (Kategorie Hauptamtliche\*r) | Name, Mail, Telefon. Schlüssel `kijuko_id`. Eintrag ohne Mail wird **übersprungen** und im Protokoll genannt. **Neu ggü. Altcode.** |
| `projects.leader1Id/leader2Id` | `freizeit_team` (Rolle `leitung`) | Leitungen werden echte Teammitglieder statt nur Text. Leitungsname/-mail der Freizeit werden daraus abgeleitet. **Neu.** |
| `staff` | `personen` | Vorname, Nachname, Mail (Schlüssel für den Abgleich), Telefon, Ernährung, Kategorie aus `employmentType`, Notizen aus `note` + `allergies`. TZK-Felder bleiben Kompass-Daten. |
| `allocations` | `freizeit_team` (Rolle `teamer`) | Zuordnung Person ↔ Freizeit. Eine im Kompass manuell geänderte Rolle bleibt erhalten. |

### Stufe 2 – beschlossene Erweiterung (Entscheidung 2026-09-30)

| KiJuKo | Kompass | Nutzen |
|---|---|---|
| `cateringEntries` | `freizeit_verpflegung` (Mischkost/Vegetarisch/Allergiker, Gesamt und je Tag) | Leitung und Küche sehen die Essenszahlen je Freizeit. |
| `materialNeeds` | `freizeit_material` (Name, Einheit, Menge, Notiz) | Materialbedarf je Freizeit, sichtbar für Leitung und Koordination. Beispielzeilen („bitte löschen") werden im Protokoll gemeldet, nicht stumm übernommen. |

Beide Bausteine gehören KiJuKo: Im Kompass sind sie **nur lesbar** (kein Bearbeiten), damit keine zwei führenden Stände entstehen.

### Bewusst zurückgestellt (nicht gewählt, später nachrüstbar)

Zuteilungs-/Wochenstatus (`allocations.status`, `staff.weekStatuses`), Verfügbarkeit (`availableWeeks`), Schulung
(`schulung`: T-Shirt, Erste Hilfe), Projekt-Notizverlauf (`notesLog`), Bedarfszahlen (`minParticipants`, `staffNeeded`, `fee`),
KiJuKo-FAQ. Der Import-Plan ist so gebaut, dass sich diese Felder später ergänzen lassen, ohne alte Läufe zu entwerten.

### Nicht importieren (bleibt in KiJuKo)

Budget, Buchungen, Kalkulationssätze (`budgetRates`, `foodRates`, `equipmentRates`, `manualBookings`), Checklisten, ToDos und Aufgabenvorlagen,
Mailvorlagen/Platzhalter, Briefkopf, Bescheinigungen, `partners`, Schulungstermine/Notizbuch, Logistik, Archiv.
**Nicht gespeichert (Datensparsamkeit):** Geburtsdatum, Straße/PLZ/Ort, Anrede, `accessCode/accessLink` (Codes entfallen im Kompass).

### Sonderfälle in den Daten

| Befund | Behandlung |
|---|---|
| `ageRange` = `0` (7×) oder `-` (1×) | als „keine Angabe" importieren (nicht als Alter 0). |
| 14 Projekte mit `eventType = Einzelevent` / `courseRecurrence = wöchentlich` | sind einwöchige Ferienangebote → Freizeiten (nicht Treffs). Treffs kommen nicht aus KiJuKo und werden im Kompass angelegt. |
| Projekte an Treff-Standorten (Zuckerfabrik, Kindertreff …) | normale Freizeiten; der Ort kann zugleich einem Treff gehören (Kompass: Ort gehört höchstens einem **Treff**, beliebig vielen Freizeiten). |
| `staff.active` nur bei 2 Einträgen gesetzt | fehlt = aktiv; nur ausdrücklich `false` = deaktiviert. |
| 1 Hauptamtliche\*r ohne Mail, 1 ohne Vorname | ohne Mail: überspringen, melden. Ohne Vorname: Nachname/`name` verwenden, Hinweis im Protokoll. |
| Ferienwoche „Sommer - Woche 6" | Ostern/Herbst max. 2, Sommer max. 6 Wochen (Einstellung prüft beim Import, Verstöße landen im Protokoll). |
| Mail-Abgleich | Groß-/Kleinschreibung und Leerzeichen normalisieren; bei Namensgleichheit mit anderer Mail → Rückfrage in der Vorschau statt automatischer Zusammenführung. |

## 5. Erste Anmeldung der importierten Personen

Importierte Personen haben zunächst **kein Konto**. Nach dem Import richtet die Koordination pro Person den **Zugang** ein
(Mehr → Personen & Zugänge) und gibt das angezeigte Startpasswort persönlich weiter; die Person legt beim ersten Anmelden ein
eigenes fest. Der Status „Zugang eingerichtet / noch kein Zugang" steht in der Personenliste. Damit ersetzen Zugänge die bisherigen
Codes, und KiJuKos `{Code}`/`{Zugangslink}`-Platzhalter werden hinfällig (Mail-Vorlagen dort auf die App-Adresse umstellen).

## 6. Datenmodell-Ergänzungen (für DATENMODELL.md)

```sql
alter table personen   add column kijuko_id text unique, add column kijuko_quelle text
                         check (kijuko_quelle in ('staff','hauptamtliche')),
                         add column kijuko_entfallen_am timestamptz;
alter table freizeiten add column kijuko_id text unique, add column kijuko_code text,
                         add column kijuko_serie_id text,
                         add column status text not null default 'geplant' check (status in ('geplant','abgesagt')),
                         add column kijuko_entfallen_am timestamptz;
alter table orte       add column kijuko_id text unique, add column lieferstelle_nr text;
-- Stufe 2 (beschlossen): freizeit_verpflegung, freizeit_material (nur lesbar, vom Import befüllt)

create table import_laeufe (
  id uuid primary key default gen_random_uuid(),
  quelle text not null default 'kijuko',
  gestartet_von uuid not null references personen(id),
  datei_name text, datei_sha256 text,
  backup_datum date,
  ergebnis jsonb not null,            -- Zähler + Liste der Änderungen/Übersprungenen (ohne Personendaten im Klartext über Namen/Mail hinaus)
  angewendet boolean not null default false,
  created_at timestamptz not null default now()
);
-- Zuletzt importierter Wert je Feld: Grundlage der Konflikterkennung (I2)
create table import_staende (
  tabelle text not null, datensatz_id uuid not null, feld text not null,
  wert jsonb, lauf_id uuid references import_laeufe(id),
  primary key (tabelle, datensatz_id, feld)
);

create table freizeit_verpflegung (
  id uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  datum date,                                   -- NULL = Gesamtwerte der Freizeit
  mischkost int not null default 0, vegetarisch int not null default 0, allergiker int not null default 0
);
create unique index on freizeit_verpflegung (freizeit_id, coalesce(datum, date '0001-01-01'));
create table freizeit_material (
  id uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  kijuko_id text unique, name text not null, einheit text, menge numeric, notiz text
);
```

Importlogik als RPC `fn_kijuko_import(plan jsonb)` (Transaktion). Die Datei wird im Browser **geparst und als Plan hochgeladen**
(Personendaten verlassen das Gerät nur in dem Umfang, der auch gespeichert wird); die Validierung und der Abgleich mit
dem Bestand laufen in der Datenbank. Tests: Beispiel-Backup (anonymisiert) als Fixture; Läufe: Erstimport, identischer Zweitimport
(0 Änderungen), geänderte Mail, Person in KiJuKo entfernt, Abgesagtes Projekt, Hauptamtliche ohne Mail.

## 7. Entscheidungen und offene Punkte

| # | Frage | Stand |
|---|---|---|
| I1 | Umfang der Erweiterung | **Entschieden:** Hauptamtliche als Personen mit Leitungs-Zuordnung, Abgleich statt Neuanlage, Vorschau, Verpflegung, Materialbedarf. Übrige Bausteine zurückgestellt. |
| I2 | Konflikte Kompass ↔ KiJuKo | **Entschieden:** KiJuKo überschreibt nur Felder, die im Kompass seit dem letzten Import unverändert sind; bei Abweichung zeigt die Vorschau den Konflikt, die Koordination entscheidet je Fall. Dafür speichert der Import je Feld den zuletzt importierten Wert (`import_staende`). |
| I3 | Rückweg Kompass → KiJuKo | Offen, Empfehlung: zunächst nur KiJuKo → Kompass. |
| I4 | Importrhythmus | Offen, Empfehlung: manuell durch die Koordination per Datei-Upload (KiJuKo läuft offline). |
