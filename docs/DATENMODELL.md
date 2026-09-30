# Datenmodell (Phase 1) – PostgreSQL / Supabase

Entwurf des Schemas. Wird in Phase 2 in nummerierte SQL-Migrationen (`supabase/migrations/`) überführt.
Namen sind deutsch und ohne Umlaute. Alle Tabellen haben `id uuid primary key default gen_random_uuid()`,
`created_at timestamptz default now()` und – wo sinnvoll – `updated_at`, `erstellt_von uuid references personen(id)`.
Row Level Security ist überall aktiv; die Policies folgen [RECHTE.md](RECHTE.md).

> **Stand Phase 2:** Maßgeblich sind die SQL-Migrationen in `supabase/migrations/`; der Code unten ist der Entwurf aus Phase 1.
> Abweichungen, die bewusst gemacht wurden:
> - `personen.id` ist eine **eigene UUID**; das Konto hängt über `personen.auth_user_id` daran (nicht mehr `id = auth.users.id`).
>   Grund: Personen existieren schon vor dem Login (KiJuKo-Import); die Einladung verknüpft später per Mail-Adresse.
> - `personen.mail` ist ohne Beachtung der Schreibweise eindeutig (Index auf `lower(mail)`).
> - Zusätzlich: `freizeiten.status` (geplant/abgesagt), KiJuKo-Felder, `freizeit_verpflegung`, `freizeit_material`, `import_*` (siehe IMPORT.md).
> - Notizen der Freizeit/des Treffs liegen in **einer** Tabelle `notizen`; Treffs kennen nur Absprachen (CHECK).
> - Formular-Entwürfe für `anwesenheit` sind per CHECK ausgeschlossen (Kindernamen).

## 1. Überblick der Entitäten

```
auth.users ─1:1─ personen ──< freizeit_team >── freizeiten ──< freizeit_slots
                   │   │                          │  │  └─< plan_eintraege >─ angebote
                   │   │                          │  └───── orte ──< lebensmittel_eingang
                   │   │                          │                └< lebensmittel_verbrauch
                   │   │                          └──< notizen (Hinweis/Absprache) ──< notiz_bestaetigungen
                   │   │                                                          └──< notiz_kommentare
                   │   └──< treff_team >── treffs ──< treff_oeffnungszeiten
                   │                         │   ├──< treff_plan_eintraege >─ angebote
                   │                         │   ├──< dienste ──< dienst_zuteilungen >─ personen
                   │                         │   │       └──< dienst_wuensche
                   │                         │   └──< dienstplan_kommentare
                   ├──< abwesenheiten        └──< notizen (Absprachen)
                   ├──< bewerbungen >── freizeiten
                   ├──< zeitnachweise ──< zeitnachweis_zeilen
                   ├──< push_abos · formular_entwuerfe · quiz_ergebnisse · favoriten
feiertage · einstellungen · inhalte (Mappen) · quiz_fragen · angebote ──< bewertungen, kommentare · angebot_vorschlaege · tags
```

## 2. Schema

```sql
-- ===== Aufzählungen =====
create type kategorie          as enum ('TeamerIn','Senior-TeamerIn','FSJ','TZK',
                                        'Praktikum bezahlt','Praktikum unbezahlt','Hauptamtliche*r');
create type ernaehrung_t       as enum ('Mischkost','Vegetarisch','Vegan');
create type freizeit_rolle     as enum ('teamer','leitung');
create type treff_rolle        as enum ('betreuerin','treffleitung');
create type ferienzeitraum_t   as enum ('ostern','sommer','herbst');
create type angebot_kategorie  as enum ('kennenlernen','bewegung','wasser','planb','kreativ','highlight');
create type wetter_t           as enum ('indoor','outdoor','beides');
create type notiz_art          as enum ('hinweis','absprache');   -- hinweis: für alle im Team, absprache: Leitung+Koordination
create type notiz_geltung      as enum ('gesamt','tag');
create type status_antrag      as enum ('offen','angenommen','abgelehnt');
create type wunsch_status      as enum ('offen','bestaetigt','abgelehnt');
create type abwesenheit_typ    as enum ('urlaub','krank');
create type nachweis_status    as enum ('entwurf','eingereicht','freigegeben');
create type formular_typ       as enum ('anwesenheit','tagesbericht','unfallbericht','bescheinigung','stundenmeldung');

-- ===== Personen =====
-- 1:1 zu auth.users (Supabase Auth). Kein Konto ohne Person, keine Person ohne Einladung.
create table personen (
  id              uuid primary key references auth.users(id) on delete cascade,
  vorname         text not null,
  nachname        text not null,
  mail            text not null unique,
  telefon         text,
  ernaehrung      ernaehrung_t not null default 'Mischkost',
  notizen         text,                       -- "Allergien / besondere Fähigkeiten"
  kategorie       kategorie not null default 'TeamerIn',
  tzk_regeltage   text,                       -- nur Kategorie TZK
  tzk_max_stunden numeric(5,1),
  ist_koordination boolean not null default false,
  aktiv           boolean not null default true,
  farbe           text,                       -- Chip-Farbe im Dienstplan (sonst aus id abgeleitet)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Einladung: Koordination legt Person an (Edge Function: auth.admin.inviteUserByEmail),
-- Profilzeile entsteht mit derselben id.

-- ===== Orte =====
create table orte (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  adresse text,
  created_at timestamptz not null default now()
);

-- ===== Freizeiten =====
create table tags (name text primary key);      -- Gelbes T-Shirt, Großfreizeit, …

create table freizeiten (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  ferienzeitraum  ferienzeitraum_t,
  ferienwoche     smallint check (ferienwoche between 1 and 6),
  ort_id          uuid references orte(id) on delete restrict,   -- Ort kann nur gelöscht werden, wenn unbenutzt
  adresse_abw     text,                                          -- nur wenn kein Ort gewählt (sonst aus orte)
  start_datum     date not null,
  ende_datum      date not null check (ende_datum >= start_datum),
  arbeitsbeginn   time,
  arbeitsende     time,
  alter_von       smallint,
  alter_bis       smallint,
  max_teilnehmende smallint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Ferienwoche ≤ 2 bei ostern/herbst, ≤ 6 bei sommer: per CHECK oder Einstellung prüfen.

create table freizeit_tags (
  freizeit_id uuid references freizeiten(id) on delete cascade,
  tag text references tags(name) on update cascade on delete cascade,
  primary key (freizeit_id, tag)
);

create table freizeit_team (
  freizeit_id uuid references freizeiten(id) on delete cascade,
  person_id   uuid references personen(id)   on delete cascade,
  rolle       freizeit_rolle not null,
  primary key (freizeit_id, person_id)
);

-- Tageslisten ("Mo 20.7.") werden aus start_datum..ende_datum berechnet, nicht gespeichert.
create table freizeit_slots (
  id uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  name text not null,                    -- Vormittag, Nachmittag, Abend
  position smallint not null,
  unique (freizeit_id, name)
);

create table plan_eintraege (
  id uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  datum       date not null,
  slot_id     uuid not null references freizeit_slots(id) on delete cascade,
  angebot_id  uuid references angebote(id) on delete set null,
  freitext    text,
  notiz       text,
  erstellt_von uuid references personen(id),
  created_at  timestamptz not null default now(),
  check (angebot_id is not null or freitext is not null)
);
-- Policy: freitext nur für Leitung/Koordination.

-- Hinweise und Absprachen (Freizeit ODER Treff)
create table notizen (
  id          uuid primary key default gen_random_uuid(),
  freizeit_id uuid references freizeiten(id) on delete cascade,
  treff_id    uuid references treffs(id)     on delete cascade,
  art         notiz_art not null,
  geltung     notiz_geltung not null default 'gesamt',
  datum       date,                       -- bei geltung='tag' (Freizeit) bzw. optionales Datum (Treff-Absprache)
  text        text not null,
  erstellt_von uuid not null references personen(id),
  created_at  timestamptz not null default now(),
  check ((freizeit_id is not null) <> (treff_id is not null)),
  check (geltung = 'gesamt' or datum is not null)
);
create table notiz_bestaetigungen (
  notiz_id uuid references notizen(id) on delete cascade,
  person_id uuid references personen(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (notiz_id, person_id)
);
create table notiz_kommentare (
  id uuid primary key default gen_random_uuid(),
  notiz_id uuid not null references notizen(id) on delete cascade,
  person_id uuid not null references personen(id),
  text text not null,
  created_at timestamptz not null default now()
);

-- Lebensmittel: Bestand je Ort
create table lebensmittel_eingang (
  id uuid primary key default gen_random_uuid(),
  ort_id uuid not null references orte(id) on delete cascade,
  freizeit_id uuid references freizeiten(id) on delete set null,
  name text not null, menge numeric not null check (menge >= 0), einheit text,
  datum date not null default current_date,
  erstellt_von uuid references personen(id)
);
create table lebensmittel_verbrauch (
  id uuid primary key default gen_random_uuid(),
  ort_id uuid not null references orte(id) on delete cascade,
  freizeit_id uuid references freizeiten(id) on delete set null,
  name text not null, menge numeric not null check (menge > 0),
  datum date not null,                   -- altes Feld "tag"
  erstellt_von uuid references personen(id)
);
-- View lebensmittel_bestand(ort_id, name, einheit, erhalten, verbraucht, rest, status 'ok'|'knapp'|'leer')
-- knapp: rest > 0 und rest <= 25 % von erhalten. Hochrechnung in der App/als View.

-- ===== Bewerbungen =====
create table bewerbungen (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references personen(id) on delete cascade,
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  notiz text,
  status status_antrag not null default 'offen',
  created_at timestamptz not null default now(),
  entschieden_von uuid references personen(id),
  unique (person_id, freizeit_id)
);
-- Annahme: Trigger legt freizeit_team(rolle='teamer') an.

-- ===== Treffs =====
create table treffs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ort_id uuid unique references orte(id) on delete restrict,   -- ein Ort gehört höchstens einem Treff
  adresse_abw text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table treff_team (
  treff_id uuid references treffs(id) on delete cascade,
  person_id uuid references personen(id) on delete cascade,
  rolle treff_rolle not null,
  primary key (treff_id, person_id)
);
-- Regel: nur Kategorien TZK, FSJ, Praktikum unbezahlt, Hauptamtliche*r (Trigger/Check-Funktion).

create table treff_oeffnungszeiten (
  treff_id uuid references treffs(id) on delete cascade,
  wochentag smallint check (wochentag between 1 and 7),       -- 1 = Montag … 7 = Sonntag (ISO)
  von time not null, bis time not null check (bis > von),
  primary key (treff_id, wochentag)
);
create table treff_plan_eintraege (                            -- wiederkehrendes Wochenprogramm
  treff_id uuid references treffs(id) on delete cascade,
  wochentag smallint check (wochentag between 1 and 7),
  angebot_id uuid references angebote(id) on delete set null,
  freitext text, notiz text,
  primary key (treff_id, wochentag),
  check (angebot_id is not null or freitext is not null)
);

-- Dienste: ein Datensatz je Treff-Tag mit Dienst (regulär oder sonder).
-- Regulär: entsteht beim Zuteilen/Monatsmuster (Zeiten aus Öffnungszeit kopiert, damit spätere Änderungen alte Nachweise nicht verfälschen).
create table dienste (
  id uuid primary key default gen_random_uuid(),
  treff_id uuid not null references treffs(id) on delete cascade,
  datum date not null,
  von time, bis time,
  ist_sonder boolean not null default false,
  bezeichnung text,                               -- Pflicht bei ist_sonder
  check (not ist_sonder or bezeichnung is not null)
);
create unique index on dienste (treff_id, datum) where not ist_sonder;   -- ein regulärer Dienst je Tag
create table dienst_zuteilungen (
  dienst_id uuid references dienste(id) on delete cascade,
  person_id uuid references personen(id) on delete cascade,
  primary key (dienst_id, person_id)
);
create table dienst_wuensche (
  dienst_id uuid references dienste(id) on delete cascade,
  person_id uuid references personen(id) on delete cascade,
  status wunsch_status not null default 'offen',
  entschieden_von uuid references personen(id),
  created_at timestamptz not null default now(),
  primary key (dienst_id, person_id)
);
create table dienstplan_kommentare (
  id uuid primary key default gen_random_uuid(),
  treff_id uuid not null references treffs(id) on delete cascade,
  woche_start date not null,                     -- Montag der ISO-Woche
  person_id uuid not null references personen(id),
  text text not null,
  created_at timestamptz not null default now()
);

-- Abwesenheiten gehören zur Person (gelten für alle Treffs/Freizeiten)
create table abwesenheiten (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references personen(id) on delete cascade,
  datum date not null,
  typ abwesenheit_typ not null,
  notiz text,
  erstellt_von uuid references personen(id),
  unique (person_id, datum)
);
create table feiertage (
  id uuid primary key default gen_random_uuid(),
  treff_id uuid references treffs(id) on delete cascade,   -- NULL = gilt für alle Treffs
  datum date not null, bezeichnung text not null
);

-- Nachweis der Teilzeitkräfte
create table zeitnachweise (
  id uuid primary key default gen_random_uuid(),
  treff_id uuid not null references treffs(id) on delete cascade,
  person_id uuid not null references personen(id) on delete cascade,
  monat date not null check (extract(day from monat) = 1),
  status nachweis_status not null default 'entwurf',
  unterschrift_text text,
  freigegeben_von uuid references personen(id),
  created_at timestamptz not null default now(),
  unique (treff_id, person_id, monat)
);
create table zeitnachweis_zeilen (
  id uuid primary key default gen_random_uuid(),
  nachweis_id uuid not null references zeitnachweise(id) on delete cascade,
  datum date not null,
  zeiten text,                                     -- "14:00 - 17:30" oder "Urlaub – …"
  stunden numeric(5,2),
  quelle text check (quelle in ('dienst','abwesenheit','manuell'))
);

-- ===== Inhalte & Lernen =====
create table inhalte (                             -- CMS-artige Dokumente (selten geändert, jsonb genügt)
  schluessel text primary key,                     -- 'teamermappe' | 'treffmappe' | 'formular_beispiele'
  daten jsonb not null,
  updated_by uuid references personen(id),
  updated_at timestamptz not null default now()
);
create table quiz_fragen (
  id uuid primary key default gen_random_uuid(),
  thema text not null,                             -- aufsicht|datenschutz|tagesablauf|regeln|schwimmen|gesundheit
  frage text not null,
  antworten jsonb not null,                        -- ["…","…"]
  korrekt smallint[] not null,
  erklaerung text
);
create table quiz_ergebnisse (
  person_id uuid references personen(id) on delete cascade,
  thema text not null,
  bester_wert smallint not null, gesamt smallint not null,
  primary key (person_id, thema)
);
create table formular_entwuerfe (
  person_id uuid references personen(id) on delete cascade,
  typ formular_typ not null,
  daten jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (person_id, typ)
  -- Anwesenheitslisten (Kindernamen) werden NICHT hier gespeichert.
);

-- ===== Katalog =====
create table angebote (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kategorie angebot_kategorie not null,
  dauer text, gruppe text, personal text, raum text,
  alter_gruppen text[] not null default '{}',      -- '6-8','9-12',…
  wetter wetter_t,
  material text, vorbereitung text, umsetzung text, nachbereitung text,
  autor text,
  suchtext tsvector generated always as (
    to_tsvector('german', coalesce(name,'')||' '||coalesce(umsetzung,'')||' '||coalesce(material,'')||' '||
                          coalesce(vorbereitung,'')||' '||coalesce(nachbereitung,'')||' '||coalesce(raum,'')||' '||coalesce(autor,''))
  ) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table angebot_bewertungen (
  angebot_id uuid references angebote(id) on delete cascade,
  person_id  uuid references personen(id) on delete cascade,
  sterne smallint not null check (sterne between 1 and 5),
  primary key (angebot_id, person_id)
);
create table angebot_kommentare (
  id uuid primary key default gen_random_uuid(),
  angebot_id uuid not null references angebote(id) on delete cascade,
  person_id uuid not null references personen(id),
  text text not null, created_at timestamptz not null default now()
);
create table angebot_favoriten (
  person_id uuid references personen(id) on delete cascade,
  angebot_id uuid references angebote(id) on delete cascade,
  primary key (person_id, angebot_id)
);
create table angebot_vorschlaege (                 -- gleiche Felder wie angebote + Status
  id uuid primary key default gen_random_uuid(),
  eingereicht_von uuid not null references personen(id),
  status status_antrag not null default 'offen',
  daten jsonb not null,                            -- Felder wie angebote (von Koordination vor Übernahme editierbar)
  created_at timestamptz not null default now()
);

-- ===== Mitteilungen & Betrieb =====
create table push_abos (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references personen(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null, auth text not null,
  user_agent text, created_at timestamptz not null default now()
);
create table gelesen_stand (                       -- ersetzt lokales "neu seit letztem Besuch"
  person_id uuid references personen(id) on delete cascade,
  bereich text not null,                           -- 'treff:<id>:notizen' | 'treff:<id>:dienstplan' | 'notizen:<freizeit-id>'
  bis timestamptz not null,
  primary key (person_id, bereich)
);
create table einstellungen (schluessel text primary key, wert jsonb not null);
   -- z. B. bewerbung_vorlauf_tage = 7, ferienwochen = {"ostern":2,"sommer":6,"herbst":2}
```

## 3. Abgeleitete Sichten (Views / Funktionen)

| Name | Zweck | Ersetzt im Altcode |
|---|---|---|
| `v_team_freizeit`, `v_team_treff` | Teamliste mit Kontaktdaten, **per RLS** nach Rolle gefiltert | `teamListe`-Kopien (`syncTeamListe`, `syncTreffTeamListe`) |
| `v_lebensmittel_bestand` | erhalten/verbraucht/rest/status je Ort+Artikel | `renderLebensmittelSection`, Dashboard-Karten |
| `v_dienst_statistik(treff, monat)` | Dienste und Stunden je Person | `computeDienstplanMonatStatistik` |
| `v_angebot_bewertung` | Durchschnitt + Anzahl | `loadAllRatings` |
| `fn_dienste_monatsmuster(treff, monat, muster jsonb)` | Muster setzen (Transaktion) | `saveMonatMuster` |
| `fn_nachweis_befuellen(nachweis)` | Zeilen aus Diensten/Abwesenheiten/Feiertagen | `teilzeitAutofillRows` |
| `fn_bewerbung_annehmen(id)` | Bewerbung → Team-Zuordnung (atomar) | `assignBewerbung` |
| `fn_vorschlag_uebernehmen(id)` | Vorschlag → `angebote` (atomar) | `acceptEinreichung` |

## 4. Zuordnung Altdaten → Neu (zur Orientierung, kein Datenimport geplant)

| Firestore | Neu |
|---|---|
| `angebote`, `…/bewertungen`, `…/kommentare` | `angebote`, `angebot_bewertungen`, `angebot_kommentare` |
| `angebot_einreichungen` | `angebot_vorschlaege` |
| `mitarbeitende` (+ `freizeiten`/`treffs`-Maps, `beworben`, `pushTokens`, `authUid`) | `personen` + `freizeit_team` + `treff_team` + `bewerbungen` + `push_abos` |
| `mitarbeitendeAuth`, `zugaenge` | entfallen |
| `adminPushTokens` | `push_abos` (Person mit `ist_koordination`) |
| `ferienfreizeiten` (`tage`, `slots`, `planung`, `notizen`, `lebensmittel`, `verbrauch`, `teamListe`, `tags`) | `freizeiten`, `freizeit_slots`, `plan_eintraege`, `notizen`(+Bestätigungen/Kommentare), `lebensmittel_*` (am Ort), `freizeit_tags`, View |
| `orte` | `orte` |
| `treffs` (`planung`, `notizen`, `abwesenheiten`, `feiertage`, `teamListe`, `oeffnungszeiten`) | `treffs`, `treff_oeffnungszeiten`, `treff_plan_eintraege`, `notizen`, `abwesenheiten` (je Person), `feiertage`, View |
| `treffs/{id}/dienstplaene/{weekId}` (`zuweisungen`, `wunschdienste`, `wunschAntworten`, `kommentare`, `sonderdienste`) | `dienste`, `dienst_zuteilungen`, `dienst_wuensche`, `dienstplan_kommentare` |
| `settings/teamermappe`, `settings/treffmappe`, `settings/mappeBeispiele` | `inhalte` |
| `quiz_fragen` | `quiz_fragen` |
| `localStorage`: Nachweis Teilzeit, Formular-Entwürfe, Favoriten, Pläne, Quiz-Best | `zeitnachweise`, `formular_entwuerfe`, `angebot_favoriten`, (Planer: offen O6), `quiz_ergebnisse` |

## 5. Bewusste Modellentscheidungen

1. **Tabellen statt Arrays in Dokumenten.** Der Altcode musste bei jeder Notiz/Lebensmittel-Buchung das ganze Array in einer Transaktion neu schreiben; parallele Änderungen blockierten sich (und das `lastZugangCode`-Feld gehörte zur Rechteprüfung).
2. **Daten statt Zeichenketten für Tage.** „Mo 20.7." wird aus `datum` gebildet. Damit fallen die Sonderbehandlungen für Punkte in Feldpfaden weg.
3. **Dienste sind Datensätze je Datum**, nicht je ISO-Woche. Wochenansicht, Monatsansicht, Statistik und Nachweis lesen dieselbe Quelle; Verschieben zwischen Wochen (Sonderdienst) ist ein einfaches Datums-Update.
4. **Zeiten werden im Dienst kopiert** (`von`/`bis`), damit spätere Änderungen der Öffnungszeiten vergangene Nachweise nicht rückwirkend verändern.
5. **Abwesenheit je Person**, nicht je Treff: Urlaub gilt überall.
6. **Kein Löschen von Personen im Normalbetrieb.** `aktiv = false` bewahrt Historie (Dienste, Nachweise). Endgültiges Löschen ist eine Admin-Funktion (DSGVO-Löschung) und entfernt personenbezogene Felder bzw. die Zeile per Kaskade.
7. **`inhalte` als jsonb.** Teamer-/Treffmappe und Formularbeispiele sind selten geändertes, dokumentartiges Redaktionsmaterial – kein Anlass für relationale Modellierung.
8. **Suche:** `tsvector` mit deutscher Konfiguration ersetzt das Filtern im Browser; die „ähnlichen Programmpunkte" können zunächst weiter clientseitig berechnet werden.

## 6. Offene Modellfragen

- Ferienwochen-Begrenzung (Ostern 2 / Sommer 6 / Herbst 2) als CHECK-Funktion oder nur Einstellung?
- Mehrere Öffnungszeiten pro Wochentag in Treffs (z. B. Vormittag + Abend)? Altcode kennt nur eine; Schema erlaubt es über Wechsel des Primärschlüssels.
- Braucht ein regulärer Dienst mehrere Schichten je Tag? Altcode: nein (ein Eintrag pro Öffnungstag).
- Stundenberechnung aus Freitext („14:00 - 17:30") bleibt Komfort im Nachweis; Quelle der Wahrheit sind `von`/`bis` der Dienste.

> **Import aus KiJuKo:** zusätzliche Spalten (`kijuko_id`, `status`, `zuteilungsstatus` …) und die Tabelle `import_laeufe` stehen in [IMPORT.md](IMPORT.md), Abschnitt 6.
