-- KiJuB-Kompass · alle Migrationen in einer Datei (GENERIERT – nicht von Hand ändern)
-- Erzeugt mit: npm run sql:bundle
-- Nur für ein LEERES Projekt gedacht: einmal komplett im SQL Editor ausführen.
-- Enthalten: 0001_stammdaten.sql, 0002_freizeit_details.sql, 0003_treffs_dienste.sql, 0004_inhalte_betrieb.sql, 0005_hilfsfunktionen.sql, 0006_rls.sql, 0007_sichten_funktionen.sql, 0008_standardrechte.sql, 0009_person_entfernen.sql, 0010_kijuko_import.sql, 0011_realtime.sql, 0012_dienstplan.sql, 0013_katalog.sql, 0014_betrieb.sql, 0015_mitteilungen.sql, 0016_tagesprotokoll.sql, 0017_mitteilungen_mehr.sql, 0018_koordination_getrennt.sql, 0019_fehlermeldungen.sql, 0020_heute.sql, 0021_bewerbung_rolle_treff_aufraeumen.sql, 0022_nachweise_erstellen.sql, 0023_ueberschneidung_akzeptiert.sql, 0024_dienstplan_anwenden.sql, 0025_wuensche_bestaetigen.sql, 0026_schliesszeiten_farbe.sql, 0027_feiertag_schliesst.sql, 0028_protokoll_vorlagen.sql, 0029_checkliste.sql, 0030_bewerbungen_mehr.sql, 0031_checkliste_termine.sql

-- ════════ 0001_stammdaten.sql ════════
-- KiJuB-Kompass · 0001 Stammdaten
-- Personen, Orte, Freizeiten, Treffs, Katalog (siehe docs/DATENMODELL.md, docs/IMPORT.md)

-- ===== Aufzählungen =====
create type kategorie         as enum ('TeamerIn','Senior-TeamerIn','FSJ','TZK',
                                       'Praktikum bezahlt','Praktikum unbezahlt','Hauptamtliche*r');
create type ernaehrung_t      as enum ('Mischkost','Vegetarisch','Vegan');
create type freizeit_rolle    as enum ('teamer','leitung');
create type treff_rolle       as enum ('betreuerin','treffleitung');
create type ferienzeitraum_t  as enum ('ostern','sommer','herbst');
create type freizeit_status   as enum ('geplant','abgesagt');
create type angebot_kategorie as enum ('kennenlernen','bewegung','wasser','planb','kreativ','highlight');
create type wetter_t          as enum ('indoor','outdoor','beides');
create type notiz_art         as enum ('hinweis','absprache');
create type notiz_geltung     as enum ('gesamt','tag');
create type status_antrag     as enum ('offen','angenommen','abgelehnt');
create type wunsch_status     as enum ('offen','bestaetigt','abgelehnt');
create type abwesenheit_typ   as enum ('urlaub','krank');
create type nachweis_status   as enum ('entwurf','eingereicht','freigegeben');
create type formular_typ      as enum ('anwesenheit','tagesbericht','unfallbericht','bescheinigung','stundenmeldung');

-- ===== Allgemein =====
create function fn_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===== Personen =====
-- Eine Person existiert unabhängig von einem Login (z. B. durch den KiJuKo-Import).
-- Erst die Einladung legt ein auth.users-Konto an; der Trigger unten verknüpft es über die Mail-Adresse.
create table personen (
  id               uuid primary key default gen_random_uuid(),
  auth_user_id     uuid unique references auth.users(id) on delete set null,
  vorname          text not null check (length(trim(vorname)) > 0),
  nachname         text not null check (length(trim(nachname)) > 0),
  mail             text not null check (mail like '%_@_%'),
  telefon          text,
  ernaehrung       ernaehrung_t not null default 'Mischkost',
  notizen          text,
  kategorie        kategorie not null default 'TeamerIn',
  tzk_regeltage    text,
  tzk_max_stunden  numeric(5,1),
  ist_koordination boolean not null default false,
  aktiv            boolean not null default true,
  farbe            text,
  eingeladen_am    timestamptz,
  kijuko_id        text unique,
  kijuko_quelle    text check (kijuko_quelle in ('staff','hauptamtliche')),
  kijuko_entfallen_am timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index personen_mail_uq on personen (lower(mail));
create trigger personen_touch before update on personen for each row execute function fn_touch_updated_at();

-- Verknüpfung Konto <-> Person über die Mail-Adresse (läuft mit Rechten des Besitzers).
create function fn_auth_user_verknuepfen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update personen set auth_user_id = new.id
   where lower(mail) = lower(new.email) and auth_user_id is null;
  return new;
end $$;
create trigger auth_user_verknuepfen after insert on auth.users
  for each row execute function fn_auth_user_verknuepfen();

-- ===== Orte =====
create table orte (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  adresse         text,
  lieferstelle_nr text,
  kijuko_id       text unique,
  created_at      timestamptz not null default now()
);

-- ===== Einstellungen =====
create table einstellungen (schluessel text primary key, wert jsonb not null);
insert into einstellungen values
  ('bewerbung_vorlauf_tage', '7'::jsonb),
  ('ferienwochen', '{"ostern":2,"sommer":6,"herbst":2}'::jsonb);

-- ===== Tags =====
create table tags (name text primary key);
insert into tags values ('Gelbes T-Shirt'),('Großfreizeit'),('Themenfreizeit'),
  ('Schwimmen/Wasser'),('Übernachtung/Mehrtägig'),('Küche');

-- ===== Katalog =====
create table angebote (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  kategorie     angebot_kategorie not null,
  dauer         text, gruppe text, personal text, raum text,
  alter_gruppen text[] not null default '{}',
  wetter        wetter_t,
  material      text, vorbereitung text, umsetzung text, nachbereitung text,
  autor         text,
  suchtext      tsvector generated always as (
    to_tsvector('german',
      coalesce(name,'')||' '||coalesce(umsetzung,'')||' '||coalesce(material,'')||' '||
      coalesce(vorbereitung,'')||' '||coalesce(nachbereitung,'')||' '||coalesce(raum,'')||' '||coalesce(autor,''))
  ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index angebote_suche on angebote using gin (suchtext);
create trigger angebote_touch before update on angebote for each row execute function fn_touch_updated_at();

-- ===== Freizeiten =====
create table freizeiten (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  status           freizeit_status not null default 'geplant',
  ferienzeitraum   ferienzeitraum_t,
  ferienwoche      smallint check (ferienwoche >= 1),
  ort_id           uuid references orte(id) on delete restrict,
  adresse_abw      text,
  start_datum      date not null,
  ende_datum       date not null,
  arbeitsbeginn    time,
  arbeitsende      time,
  alter_von        smallint,
  alter_bis        smallint,
  max_teilnehmende smallint,
  kijuko_id        text unique,
  kijuko_code      text,
  kijuko_serie_id  text,
  kijuko_entfallen_am timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ende_datum >= start_datum),
  check (ferienwoche is null or ferienzeitraum is null
         or ferienwoche <= case ferienzeitraum when 'sommer' then 6 else 2 end)
);
create index freizeiten_start on freizeiten (start_datum);
create trigger freizeiten_touch before update on freizeiten for each row execute function fn_touch_updated_at();

create table freizeit_tags (
  freizeit_id uuid references freizeiten(id) on delete cascade,
  tag         text references tags(name) on update cascade on delete cascade,
  primary key (freizeit_id, tag)
);

create table freizeit_team (
  freizeit_id uuid references freizeiten(id) on delete cascade,
  person_id   uuid references personen(id)   on delete cascade,
  rolle       freizeit_rolle not null,
  primary key (freizeit_id, person_id)
);
create index freizeit_team_person on freizeit_team (person_id);

-- ===== Treffs =====
create table treffs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  ort_id      uuid unique references orte(id) on delete restrict,   -- ein Ort gehört höchstens einem Treff
  adresse_abw text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger treffs_touch before update on treffs for each row execute function fn_touch_updated_at();

create table treff_team (
  treff_id  uuid references treffs(id)   on delete cascade,
  person_id uuid references personen(id) on delete cascade,
  rolle     treff_rolle not null,
  primary key (treff_id, person_id)
);
create index treff_team_person on treff_team (person_id);

-- Nur bestimmte Kategorien dürfen einem Treff zugeordnet werden (Regel aus dem Altbestand).
create function fn_treff_team_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare k kategorie;
begin
  select kategorie into k from personen where id = new.person_id;
  if k not in ('TZK','FSJ','Praktikum unbezahlt','Hauptamtliche*r') then
    raise exception 'Kategorie % darf keinem Treff zugeordnet werden', k using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger treff_team_pruefen before insert or update on treff_team
  for each row execute function fn_treff_team_pruefen();

-- ════════ 0002_freizeit_details.sql ════════
-- KiJuB-Kompass · 0002 Freizeit-Details
-- Slots, Wochenplan, Hinweise/Absprachen, Lebensmittel, Bewerbungen, KiJuKo-Zusatzdaten

-- ===== Slots & Wochenplan =====
create table freizeit_slots (
  id          uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  position    smallint not null,
  unique (freizeit_id, name)
);

-- Neue Freizeiten bekommen die Standard-Slots.
create function fn_freizeit_standardslots() returns trigger language plpgsql as $$
begin
  insert into freizeit_slots (freizeit_id, name, position) values
    (new.id, 'Vormittag', 1), (new.id, 'Nachmittag', 2);
  return new;
end $$;
create trigger freizeit_standardslots after insert on freizeiten
  for each row execute function fn_freizeit_standardslots();

create table plan_eintraege (
  id           uuid primary key default gen_random_uuid(),
  freizeit_id  uuid not null references freizeiten(id) on delete cascade,
  datum        date not null,
  slot_id      uuid not null references freizeit_slots(id) on delete cascade,
  angebot_id   uuid references angebote(id) on delete set null,
  freitext     text,
  notiz        text,
  erstellt_von uuid references personen(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (angebot_id is not null or freitext is not null)
);
create index plan_eintraege_freizeit on plan_eintraege (freizeit_id, datum);

-- Der Slot muss zur Freizeit des Eintrags gehören.
create function fn_plan_eintrag_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from freizeit_slots s where s.id = new.slot_id and s.freizeit_id = new.freizeit_id) then
    raise exception 'Slot gehört nicht zu dieser Freizeit' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from freizeiten f where f.id = new.freizeit_id
                   and new.datum between f.start_datum and f.ende_datum) then
    raise exception 'Datum liegt außerhalb der Freizeit' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger plan_eintrag_pruefen before insert or update on plan_eintraege
  for each row execute function fn_plan_eintrag_pruefen();

-- ===== Hinweise und Absprachen (Freizeit ODER Treff) =====
-- (treffs existiert bereits, siehe 0001)
create table notizen (
  id           uuid primary key default gen_random_uuid(),
  freizeit_id  uuid references freizeiten(id) on delete cascade,
  treff_id     uuid references treffs(id)     on delete cascade,
  art          notiz_art not null,
  geltung      notiz_geltung not null default 'gesamt',
  datum        date,
  text         text not null check (length(trim(text)) > 0),
  erstellt_von uuid references personen(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((freizeit_id is not null) <> (treff_id is not null)),
  check (geltung = 'gesamt' or datum is not null),
  -- Treffs kennen nur Absprachen (keine Hinweise-vs.-Absprachen-Trennung)
  check (treff_id is null or art = 'absprache')
);
create index notizen_freizeit on notizen (freizeit_id);
create index notizen_treff on notizen (treff_id);
create trigger notizen_touch before update on notizen for each row execute function fn_touch_updated_at();

create table notiz_bestaetigungen (
  notiz_id  uuid references notizen(id)  on delete cascade,
  person_id uuid references personen(id) on delete cascade,
  at        timestamptz not null default now(),
  primary key (notiz_id, person_id)
);
create table notiz_kommentare (
  id         uuid primary key default gen_random_uuid(),
  notiz_id   uuid not null references notizen(id) on delete cascade,
  person_id  uuid not null references personen(id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);

-- ===== Lebensmittel: Bestand je Ort =====
create table lebensmittel_eingang (
  id           uuid primary key default gen_random_uuid(),
  ort_id       uuid not null references orte(id) on delete cascade,
  freizeit_id  uuid references freizeiten(id) on delete set null,
  name         text not null check (length(trim(name)) > 0),
  menge        numeric not null check (menge >= 0),
  einheit      text,
  datum        date not null default current_date,
  erstellt_von uuid references personen(id) on delete set null
);
create index lm_eingang_ort on lebensmittel_eingang (ort_id);
create table lebensmittel_verbrauch (
  id           uuid primary key default gen_random_uuid(),
  ort_id       uuid not null references orte(id) on delete cascade,
  freizeit_id  uuid references freizeiten(id) on delete set null,
  name         text not null check (length(trim(name)) > 0),
  menge        numeric not null check (menge > 0),
  datum        date not null,
  erstellt_von uuid references personen(id) on delete set null
);
create index lm_verbrauch_ort on lebensmittel_verbrauch (ort_id);

-- ===== Bewerbungen =====
create table bewerbungen (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references personen(id) on delete cascade,
  freizeit_id     uuid not null references freizeiten(id) on delete cascade,
  notiz           text,
  status          status_antrag not null default 'offen',
  entschieden_von uuid references personen(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (person_id, freizeit_id)
);

-- ===== Zusatzdaten aus KiJuKo (nur lesbar, vom Import befüllt) =====
create table freizeit_verpflegung (
  id          uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  datum       date,                                   -- NULL = Gesamtwerte
  mischkost   int not null default 0,
  vegetarisch int not null default 0,
  allergiker  int not null default 0
);
create unique index freizeit_verpflegung_uq on freizeit_verpflegung (freizeit_id, coalesce(datum, date '0001-01-01'));

create table freizeit_material (
  id          uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  kijuko_id   text unique,
  name        text not null,
  einheit     text,
  menge       numeric,
  notiz       text
);

-- ════════ 0003_treffs_dienste.sql ════════
-- KiJuB-Kompass · 0003 Treffs, Dienstplan, Abwesenheiten, Nachweise

create table treff_oeffnungszeiten (
  treff_id  uuid references treffs(id) on delete cascade,
  wochentag smallint check (wochentag between 1 and 7),       -- ISO: 1 = Montag … 7 = Sonntag
  von       time not null,
  bis       time not null check (bis > von),
  primary key (treff_id, wochentag)
);

-- Wiederkehrendes Wochenprogramm: ein Programmpunkt je Öffnungstag
create table treff_plan_eintraege (
  treff_id   uuid references treffs(id) on delete cascade,
  wochentag  smallint check (wochentag between 1 and 7),
  angebot_id uuid references angebote(id) on delete set null,
  freitext   text,
  notiz      text,
  primary key (treff_id, wochentag),
  check (angebot_id is not null or freitext is not null)
);

-- Dienste: ein Datensatz je Treff-Tag mit Dienst (regulär oder Sonderdienst).
-- Zeiten werden kopiert, damit spätere Änderungen der Öffnungszeit alte Nachweise nicht verändern.
create table dienste (
  id          uuid primary key default gen_random_uuid(),
  treff_id    uuid not null references treffs(id) on delete cascade,
  datum       date not null,
  von         time,
  bis         time,
  ist_sonder  boolean not null default false,
  bezeichnung text,
  check (not ist_sonder or (bezeichnung is not null and length(trim(bezeichnung)) > 0)),
  check (von is null or bis is null or bis > von)
);
create unique index dienste_regulaer_uq on dienste (treff_id, datum) where not ist_sonder;
create index dienste_treff_datum on dienste (treff_id, datum);

create table dienst_zuteilungen (
  dienst_id uuid references dienste(id)  on delete cascade,
  person_id uuid references personen(id) on delete cascade,
  primary key (dienst_id, person_id)
);
create index dienst_zuteilungen_person on dienst_zuteilungen (person_id);

create table dienst_wuensche (
  dienst_id       uuid references dienste(id)  on delete cascade,
  person_id       uuid references personen(id) on delete cascade,
  status          wunsch_status not null default 'offen',
  entschieden_von uuid references personen(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (dienst_id, person_id)
);

create table dienstplan_kommentare (
  id          uuid primary key default gen_random_uuid(),
  treff_id    uuid not null references treffs(id) on delete cascade,
  woche_start date not null check (extract(isodow from woche_start) = 1),
  person_id   uuid not null references personen(id) on delete cascade,
  text        text not null check (length(trim(text)) > 0),
  created_at  timestamptz not null default now()
);

-- Abwesenheiten gehören zur Person (gelten überall)
create table abwesenheiten (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references personen(id) on delete cascade,
  datum        date not null,
  typ          abwesenheit_typ not null,
  notiz        text,
  erstellt_von uuid references personen(id) on delete set null,
  unique (person_id, datum)
);

create table feiertage (
  id          uuid primary key default gen_random_uuid(),
  treff_id    uuid references treffs(id) on delete cascade,     -- NULL = gilt für alle Treffs
  datum       date not null,
  bezeichnung text not null check (length(trim(bezeichnung)) > 0)
);
create unique index feiertage_uq on feiertage (coalesce(treff_id, '00000000-0000-0000-0000-000000000000'::uuid), datum);

-- ===== Nachweis der Teilzeitkräfte =====
create table zeitnachweise (
  id              uuid primary key default gen_random_uuid(),
  treff_id        uuid not null references treffs(id) on delete cascade,
  person_id       uuid not null references personen(id) on delete cascade,
  monat           date not null check (extract(day from monat) = 1),
  status          nachweis_status not null default 'entwurf',
  unterschrift    text,
  freigegeben_von uuid references personen(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (treff_id, person_id, monat)
);
create trigger zeitnachweise_touch before update on zeitnachweise for each row execute function fn_touch_updated_at();

create table zeitnachweis_zeilen (
  id          uuid primary key default gen_random_uuid(),
  nachweis_id uuid not null references zeitnachweise(id) on delete cascade,
  datum       date not null,
  zeiten      text,
  stunden     numeric(5,2) check (stunden is null or stunden >= 0),
  quelle      text not null default 'manuell' check (quelle in ('dienst','abwesenheit','manuell'))
);
create index zeitnachweis_zeilen_nachweis on zeitnachweis_zeilen (nachweis_id, datum);

-- ════════ 0004_inhalte_betrieb.sql ════════
-- KiJuB-Kompass · 0004 Inhalte, Lernen, Katalog-Zusätze, Mitteilungen, Import

create table inhalte (                               -- selten geänderte, dokumentartige Inhalte
  schluessel text primary key check (schluessel in ('teamermappe','treffmappe','formular_beispiele')),
  daten      jsonb not null,
  updated_by uuid references personen(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table quiz_fragen (
  id         uuid primary key default gen_random_uuid(),
  thema      text not null check (thema in ('aufsicht','datenschutz','tagesablauf','regeln','schwimmen','gesundheit')),
  frage      text not null,
  antworten  jsonb not null check (jsonb_typeof(antworten) = 'array'),
  korrekt    smallint[] not null check (array_length(korrekt, 1) >= 1),
  erklaerung text
);
create table quiz_ergebnisse (
  person_id   uuid references personen(id) on delete cascade,
  thema       text not null,
  bester_wert smallint not null,
  gesamt      smallint not null,
  primary key (person_id, thema)
);

create table formular_entwuerfe (
  person_id  uuid references personen(id) on delete cascade,
  typ        formular_typ not null check (typ <> 'anwesenheit'),   -- Kindernamen nie speichern
  daten      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (person_id, typ)
);

-- ===== Katalog-Zusätze =====
create table angebot_bewertungen (
  angebot_id uuid references angebote(id) on delete cascade,
  person_id  uuid references personen(id) on delete cascade,
  sterne     smallint not null check (sterne between 1 and 5),
  primary key (angebot_id, person_id)
);
create table angebot_kommentare (
  id         uuid primary key default gen_random_uuid(),
  angebot_id uuid not null references angebote(id) on delete cascade,
  person_id  uuid not null references personen(id) on delete cascade,
  text       text not null check (length(trim(text)) > 0),
  created_at timestamptz not null default now()
);
create table angebot_favoriten (
  person_id  uuid references personen(id) on delete cascade,
  angebot_id uuid references angebote(id) on delete cascade,
  primary key (person_id, angebot_id)
);
create table angebot_vorschlaege (
  id              uuid primary key default gen_random_uuid(),
  eingereicht_von uuid not null references personen(id) on delete cascade,
  status          status_antrag not null default 'offen',
  daten           jsonb not null,
  created_at      timestamptz not null default now()
);

-- ===== Mitteilungen =====
create table push_abos (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references personen(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create table gelesen_stand (
  person_id uuid references personen(id) on delete cascade,
  bereich   text not null,
  bis       timestamptz not null,
  primary key (person_id, bereich)
);

-- ===== Import aus KiJuKo =====
create table import_laeufe (
  id            uuid primary key default gen_random_uuid(),
  quelle        text not null default 'kijuko',
  gestartet_von uuid references personen(id) on delete set null,
  datei_name    text,
  datei_sha256  text,
  backup_datum  date,
  ergebnis      jsonb not null,
  angewendet    boolean not null default false,
  created_at    timestamptz not null default now()
);
create table import_staende (
  tabelle      text not null,
  datensatz_id uuid not null,
  feld         text not null,
  wert         jsonb,
  lauf_id      uuid references import_laeufe(id) on delete set null,
  primary key (tabelle, datensatz_id, feld)
);

-- ════════ 0005_hilfsfunktionen.sql ════════
-- KiJuB-Kompass · 0005 Hilfsfunktionen für Rechte
-- Alle Funktionen laufen mit Rechten des Besitzers (security definer), damit Policies
-- keine Rekursion über die RLS der Team-Tabellen auslösen. Sie lesen nur die Identität
-- der aufrufenden Person (auth.uid()) und liefern Wahrheitswerte/IDs.

create function meine_person_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from personen where auth_user_id = auth.uid() and aktiv
$$;

create function ist_koord() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select ist_koordination from personen where auth_user_id = auth.uid() and aktiv), false)
$$;

create function ist_aktive_person() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select meine_person_id() is not null
$$;

create function meine_kategorie() returns kategorie
language sql stable security definer set search_path = public, pg_temp as $$
  select kategorie from personen where auth_user_id = auth.uid() and aktiv
$$;

-- Bewerbende: aktive Person, die keine Hauptamtliche*r ist
create function ist_bewerbend() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(meine_kategorie() <> 'Hauptamtliche*r', false)
$$;

-- ===== Freizeiten =====
create function ist_im_team(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team where freizeit_id = fid and person_id = meine_person_id())
$$;

create function ist_leitung(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team
                  where freizeit_id = fid and person_id = meine_person_id() and rolle = 'leitung')
$$;

create function ist_teamer(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team
                  where freizeit_id = fid and person_id = meine_person_id() and rolle = 'teamer')
$$;

create function ist_leitung_am_ort(oid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team t join freizeiten f on f.id = t.freizeit_id
                  where f.ort_id = oid and t.person_id = meine_person_id() and t.rolle = 'leitung')
$$;

-- ===== Treffs =====
create function ist_im_treff(tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_team where treff_id = tid and person_id = meine_person_id())
$$;

create function ist_treffleitung(tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_team
                  where treff_id = tid and person_id = meine_person_id() and rolle = 'treffleitung')
$$;

create function treff_von_dienst(did uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select treff_id from dienste where id = did
$$;

-- Treffleitung einer Person: gemeinsamer Treff, in dem die aufrufende Person Treffleitung ist
create function ist_treffleitung_von_person(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_team a join treff_team b on a.treff_id = b.treff_id
                  where a.person_id = pid and b.person_id = meine_person_id() and b.rolle = 'treffleitung')
$$;

create function teilt_team_mit(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team a join freizeit_team b on a.freizeit_id = b.freizeit_id
                  where a.person_id = pid and b.person_id = meine_person_id())
      or exists (select 1 from treff_team a join treff_team b on a.treff_id = b.treff_id
                  where a.person_id = pid and b.person_id = meine_person_id())
$$;

-- Treffmappe: Koordination, Treffleitung, BetreuerIn nur der Kategorie TZK
create function darf_treffmappe() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select ist_koord() or exists (
    select 1 from treff_team where person_id = meine_person_id()
       and (rolle = 'treffleitung' or meine_kategorie() = 'TZK'))
$$;

-- ===== Hinweise/Absprachen =====
-- Sichtbarkeit anhand der Zeilenwerte (nicht per Nachschlagen in der Tabelle):
-- Nur so greift die Regel auch bei INSERT ... RETURNING, wo die neue Zeile noch nicht lesbar ist.
create function notiz_sichtbar(fid uuid, tid uuid, a notiz_art) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select ist_koord()
      or (fid is not null and a = 'hinweis'   and ist_im_team(fid))
      or (fid is not null and a = 'absprache' and ist_leitung(fid))
      or (tid is not null and ist_im_treff(tid))
$$;

-- Für Kind-Tabellen (Bestätigungen, Kommentare): Sichtbarkeit der zugehörigen Notiz
create function darf_notiz_sehen(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and notiz_sichtbar(n.freizeit_id, n.treff_id, n.art))
$$;

create function darf_notiz_schreiben(fid uuid, tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select ist_koord()
      or (fid is not null and ist_leitung(fid))
      or (tid is not null and ist_treffleitung(tid))
$$;

-- Hinweise bestätigen nur TeamerInnen; Absprachen Leitung/Koordination; Treff-Absprachen das Treff-Team
create function darf_notiz_bestaetigen(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and (
       (n.freizeit_id is not null and n.art = 'hinweis'   and ist_teamer(n.freizeit_id))
    or (n.freizeit_id is not null and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_koord()))
    or (n.treff_id    is not null and (ist_im_treff(n.treff_id) or ist_koord()))))
$$;

create function darf_notiz_kommentieren(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and n.freizeit_id is not null
                    and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_koord()))
$$;

-- ===== Nachweis =====
create function nachweis_treff(nid uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select treff_id from zeitnachweise where id = nid
$$;

create function nachweis_person(nid uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select person_id from zeitnachweise where id = nid
$$;

create function nachweis_status_von(nid uuid) returns nachweis_status
language sql stable security definer set search_path = public, pg_temp as $$
  select status from zeitnachweise where id = nid
$$;

-- ===== Schutz der Personendaten =====
-- Wer nicht Koordination ist, darf nur Telefon, Ernährung und Notizen der EIGENEN Zeile ändern.
-- Ohne JWT (Migrationen, Import-Funktionen mit Service-Rolle) greift der Schutz nicht.
create function fn_personen_schutz() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or ist_koord() then
    return new;
  end if;
  if new.id is distinct from meine_person_id() then
    raise exception 'Nur die Koordination darf fremde Personendaten ändern' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'telefon' - 'ernaehrung' - 'notizen' - 'updated_at')
     is distinct from (to_jsonb(old) - 'telefon' - 'ernaehrung' - 'notizen' - 'updated_at') then
    raise exception 'Nur Telefon, Ernährung und Notizen dürfen selbst geändert werden' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger personen_schutz before update on personen
  for each row execute function fn_personen_schutz();

-- Status-Übergänge beim Nachweis: Freigabe nur Treffleitung/Koordination
create function fn_nachweis_status_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null then
    if (new.status = 'freigegeben' or old.status = 'freigegeben')
       and not (ist_treffleitung(new.treff_id) or ist_koord()) then
      raise exception 'Nur Treffleitung oder Koordination dürfen freigeben' using errcode = '42501';
    end if;
  end if;
  if new.status = 'freigegeben' and old.status <> 'freigegeben' then
    new.freigegeben_von = meine_person_id();
  elsif new.status <> 'freigegeben' then
    new.freigegeben_von = null;
  end if;
  return new;
end $$;
create trigger nachweis_status_pruefen before update on zeitnachweise
  for each row execute function fn_nachweis_status_pruefen();

-- ════════ 0006_rls.sql ════════
-- KiJuB-Kompass · 0006 Row Level Security (siehe docs/RECHTE.md)
-- Grundsatz: kein anonymer Zugriff; jede Policy stützt sich auf die Hilfsfunktionen aus 0005.

-- Standardwerte "erstellt_von" = aufrufende Person
alter table plan_eintraege        alter column erstellt_von set default meine_person_id();
alter table notizen               alter column erstellt_von set default meine_person_id();
alter table lebensmittel_eingang  alter column erstellt_von set default meine_person_id();
alter table lebensmittel_verbrauch alter column erstellt_von set default meine_person_id();
alter table abwesenheiten         alter column erstellt_von set default meine_person_id();

-- Rechte auf Tabellenebene: anonym nichts, angemeldet alles (die Policies entscheiden)
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ===== RLS einschalten =====
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Kurzform für "Koordination darf alles"
create procedure pr_koord_alles(tabelle regclass)
language plpgsql as $$
begin
  execute format('create policy koord_alles on %s for all to authenticated using (ist_koord()) with check (ist_koord())', tabelle);
end $$;

-- ===== Personen =====
create policy personen_lesen   on personen for select to authenticated
  using (id = meine_person_id() or ist_koord());
create policy personen_update  on personen for update to authenticated
  using (id = meine_person_id() or ist_koord()) with check (id = meine_person_id() or ist_koord());
create policy personen_insert  on personen for insert to authenticated with check (ist_koord());
create policy personen_delete  on personen for delete to authenticated using (ist_koord());

-- ===== Stammdaten, die jede aktive Person lesen darf =====
create policy lesen on orte          for select to authenticated using (ist_aktive_person());
create policy lesen on tags          for select to authenticated using (ist_aktive_person());
create policy lesen on einstellungen for select to authenticated using (ist_aktive_person());
create policy lesen on angebote      for select to authenticated using (ist_aktive_person());
create policy lesen on feiertage     for select to authenticated using (ist_aktive_person());
create policy lesen on quiz_fragen   for select to authenticated using (ist_aktive_person());
create policy lesen on freizeit_tags for select to authenticated using (ist_aktive_person());
call pr_koord_alles('orte');
call pr_koord_alles('tags');
call pr_koord_alles('einstellungen');
call pr_koord_alles('angebote');
call pr_koord_alles('quiz_fragen');
call pr_koord_alles('freizeit_tags');

-- Feiertage: Koordination alle, Treffleitung für den eigenen Treff
call pr_koord_alles('feiertage');
create policy treffleitung_schreiben on feiertage for all to authenticated
  using (treff_id is not null and ist_treffleitung(treff_id))
  with check (treff_id is not null and ist_treffleitung(treff_id));

-- ===== Freizeiten =====
create policy lesen on freizeiten for select to authenticated
  using (ist_koord() or ist_im_team(id) or ist_bewerbend());
call pr_koord_alles('freizeiten');

create policy lesen on freizeit_team for select to authenticated
  using (ist_koord() or ist_im_team(freizeit_id) or person_id = meine_person_id());
call pr_koord_alles('freizeit_team');

create policy lesen on freizeit_slots for select to authenticated
  using (ist_koord() or ist_im_team(freizeit_id));
create policy leitung_schreiben on freizeit_slots for all to authenticated
  using (ist_leitung(freizeit_id) or ist_koord())
  with check (ist_leitung(freizeit_id) or ist_koord());

-- Wochenplan: Team trägt Katalog-Punkte ein und ändert eigene Einträge; Leitung/Koordination alle.
-- Freitext nur Leitung/Koordination.
create policy lesen on plan_eintraege for select to authenticated
  using (ist_koord() or ist_im_team(freizeit_id));
create policy anlegen on plan_eintraege for insert to authenticated
  with check ((ist_im_team(freizeit_id) or ist_koord())
              and erstellt_von = meine_person_id()
              and (freitext is null or ist_leitung(freizeit_id) or ist_koord()));
create policy aendern on plan_eintraege for update to authenticated
  using (ist_leitung(freizeit_id) or ist_koord() or (ist_im_team(freizeit_id) and erstellt_von = meine_person_id()))
  with check ((ist_leitung(freizeit_id) or ist_koord() or (ist_im_team(freizeit_id) and erstellt_von = meine_person_id()))
              and (freitext is null or ist_leitung(freizeit_id) or ist_koord()));
create policy loeschen on plan_eintraege for delete to authenticated
  using (ist_leitung(freizeit_id) or ist_koord() or (ist_im_team(freizeit_id) and erstellt_von = meine_person_id()));

-- ===== Hinweise & Absprachen =====
create policy lesen on notizen for select to authenticated using (notiz_sichtbar(freizeit_id, treff_id, art));
create policy anlegen on notizen for insert to authenticated
  with check (darf_notiz_schreiben(freizeit_id, treff_id) and erstellt_von = meine_person_id());
create policy aendern on notizen for update to authenticated
  using (darf_notiz_schreiben(freizeit_id, treff_id))
  with check (darf_notiz_schreiben(freizeit_id, treff_id));
create policy loeschen on notizen for delete to authenticated
  using (darf_notiz_schreiben(freizeit_id, treff_id));

create policy lesen on notiz_bestaetigungen for select to authenticated using (darf_notiz_sehen(notiz_id));
create policy anlegen on notiz_bestaetigungen for insert to authenticated
  with check (person_id = meine_person_id() and darf_notiz_bestaetigen(notiz_id));
create policy loeschen on notiz_bestaetigungen for delete to authenticated
  using (person_id = meine_person_id());

create policy lesen on notiz_kommentare for select to authenticated using (darf_notiz_sehen(notiz_id));
create policy anlegen on notiz_kommentare for insert to authenticated
  with check (person_id = meine_person_id() and darf_notiz_kommentieren(notiz_id));
create policy aendern on notiz_kommentare for update to authenticated
  using (person_id = meine_person_id() or ist_koord())
  with check (person_id = meine_person_id() or ist_koord());
create policy loeschen on notiz_kommentare for delete to authenticated
  using (person_id = meine_person_id() or ist_koord());

-- ===== Lebensmittel (Leitung am Ort, Koordination) =====
create policy lesen on lebensmittel_eingang for select to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));
create policy anlegen on lebensmittel_eingang for insert to authenticated
  with check ((ist_koord() or ist_leitung_am_ort(ort_id)) and erstellt_von = meine_person_id());
create policy aendern on lebensmittel_eingang for update to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id)) with check (ist_koord() or ist_leitung_am_ort(ort_id));
create policy loeschen on lebensmittel_eingang for delete to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));

create policy lesen on lebensmittel_verbrauch for select to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));
create policy anlegen on lebensmittel_verbrauch for insert to authenticated
  with check ((ist_koord() or ist_leitung_am_ort(ort_id)) and erstellt_von = meine_person_id());
create policy aendern on lebensmittel_verbrauch for update to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id)) with check (ist_koord() or ist_leitung_am_ort(ort_id));
create policy loeschen on lebensmittel_verbrauch for delete to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));

-- KiJuKo-Zusatzdaten: nur lesen (Leitung, Koordination); Schreiben ausschließlich durch den Import
create policy lesen on freizeit_verpflegung for select to authenticated
  using (ist_koord() or ist_leitung(freizeit_id));
create policy lesen on freizeit_material for select to authenticated
  using (ist_koord() or ist_leitung(freizeit_id));

-- ===== Bewerbungen =====
create policy lesen on bewerbungen for select to authenticated
  using (person_id = meine_person_id() or ist_koord());
create policy anlegen on bewerbungen for insert to authenticated
  with check (
    person_id = meine_person_id() and ist_bewerbend() and status = 'offen'
    and not ist_im_team(freizeit_id)
    and exists (select 1 from freizeiten f
                 where f.id = freizeit_id and f.status = 'geplant'
                   and f.start_datum >= current_date +
                       coalesce((select (wert #>> '{}')::int from einstellungen
                                  where schluessel = 'bewerbung_vorlauf_tage'), 7)));
create policy zurueckziehen on bewerbungen for delete to authenticated
  using ((person_id = meine_person_id() and status = 'offen') or ist_koord());
create policy entscheiden on bewerbungen for update to authenticated
  using (ist_koord()) with check (ist_koord());

-- ===== Treffs =====
create policy lesen on treffs for select to authenticated using (ist_koord() or ist_im_treff(id));
call pr_koord_alles('treffs');
create policy lesen on treff_team for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id) or person_id = meine_person_id());
call pr_koord_alles('treff_team');
create policy lesen on treff_oeffnungszeiten for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
call pr_koord_alles('treff_oeffnungszeiten');

create policy lesen on treff_plan_eintraege for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
create policy schreiben on treff_plan_eintraege for all to authenticated
  using (ist_koord() or ist_im_treff(treff_id))
  with check (ist_koord() or ist_im_treff(treff_id));

-- ===== Dienste =====
create policy lesen on dienste for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
create policy schreiben on dienste for all to authenticated
  using (ist_koord() or ist_treffleitung(treff_id))
  with check (ist_koord() or ist_treffleitung(treff_id));

create policy lesen on dienst_zuteilungen for select to authenticated
  using (ist_koord() or ist_im_treff(treff_von_dienst(dienst_id)));
create policy schreiben on dienst_zuteilungen for all to authenticated
  using (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)))
  with check (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)));

create policy lesen on dienst_wuensche for select to authenticated
  using (ist_koord() or ist_im_treff(treff_von_dienst(dienst_id)));
create policy wuenschen on dienst_wuensche for insert to authenticated
  with check (person_id = meine_person_id() and status = 'offen'
              and ist_im_treff(treff_von_dienst(dienst_id)));
create policy zuruecknehmen on dienst_wuensche for delete to authenticated
  using ((person_id = meine_person_id() and status = 'offen')
         or ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)));
create policy entscheiden on dienst_wuensche for update to authenticated
  using (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)))
  with check (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)));

create policy lesen on dienstplan_kommentare for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
create policy anlegen on dienstplan_kommentare for insert to authenticated
  with check (person_id = meine_person_id() and (ist_koord() or ist_im_treff(treff_id)));
create policy loeschen on dienstplan_kommentare for delete to authenticated
  using (person_id = meine_person_id() or ist_koord() or ist_treffleitung(treff_id));

-- ===== Abwesenheiten =====
create policy lesen on abwesenheiten for select to authenticated
  using (person_id = meine_person_id() or ist_koord() or ist_treffleitung_von_person(person_id));
create policy schreiben on abwesenheiten for all to authenticated
  using (ist_koord() or ist_treffleitung_von_person(person_id))
  with check (ist_koord() or ist_treffleitung_von_person(person_id));

-- ===== Nachweis der Teilzeitkräfte =====
create policy lesen on zeitnachweise for select to authenticated
  using (person_id = meine_person_id() or ist_treffleitung(treff_id) or ist_koord());
create policy anlegen on zeitnachweise for insert to authenticated
  with check (person_id = meine_person_id() and ist_im_treff(treff_id) and status = 'entwurf');
create policy aendern on zeitnachweise for update to authenticated
  using ((person_id = meine_person_id() and status = 'entwurf') or ist_treffleitung(treff_id) or ist_koord())
  with check ((person_id = meine_person_id() and status in ('entwurf','eingereicht'))
              or ist_treffleitung(treff_id) or ist_koord());
create policy loeschen on zeitnachweise for delete to authenticated
  using ((person_id = meine_person_id() and status = 'entwurf') or ist_koord());

create policy lesen on zeitnachweis_zeilen for select to authenticated
  using (nachweis_person(nachweis_id) = meine_person_id()
         or ist_treffleitung(nachweis_treff(nachweis_id)) or ist_koord());
create policy schreiben on zeitnachweis_zeilen for all to authenticated
  using ((nachweis_person(nachweis_id) = meine_person_id() and nachweis_status_von(nachweis_id) = 'entwurf')
         or ist_treffleitung(nachweis_treff(nachweis_id)) or ist_koord())
  with check ((nachweis_person(nachweis_id) = meine_person_id() and nachweis_status_von(nachweis_id) = 'entwurf')
         or ist_treffleitung(nachweis_treff(nachweis_id)) or ist_koord());

-- ===== Inhalte & Lernen =====
create policy lesen on inhalte for select to authenticated
  using ((schluessel in ('teamermappe','formular_beispiele') and ist_aktive_person())
         or (schluessel = 'treffmappe' and darf_treffmappe()));
call pr_koord_alles('inhalte');

create policy eigene on quiz_ergebnisse for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
create policy koord_lesen on quiz_ergebnisse for select to authenticated using (ist_koord());
create policy eigene on formular_entwuerfe for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());

-- ===== Katalog-Zusätze =====
create policy lesen on angebot_bewertungen for select to authenticated using (ist_aktive_person());
create policy anlegen on angebot_bewertungen for insert to authenticated
  with check (person_id = meine_person_id());
create policy aendern on angebot_bewertungen for update to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
create policy loeschen on angebot_bewertungen for delete to authenticated
  using (person_id = meine_person_id() or ist_koord());

create policy lesen on angebot_kommentare for select to authenticated using (ist_aktive_person());
create policy anlegen on angebot_kommentare for insert to authenticated
  with check (person_id = meine_person_id());
create policy loeschen on angebot_kommentare for delete to authenticated
  using (person_id = meine_person_id() or ist_koord());

create policy eigene on angebot_favoriten for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());

create policy lesen on angebot_vorschlaege for select to authenticated
  using (eingereicht_von = meine_person_id() or ist_koord());
create policy einreichen on angebot_vorschlaege for insert to authenticated
  with check (eingereicht_von = meine_person_id() and status = 'offen');
call pr_koord_alles('angebot_vorschlaege');

-- ===== Mitteilungen & Betrieb =====
create policy eigene on push_abos for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
create policy eigene on gelesen_stand for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
call pr_koord_alles('import_laeufe');
call pr_koord_alles('import_staende');

drop procedure pr_koord_alles(regclass);

-- ════════ 0007_sichten_funktionen.sql ════════
-- KiJuB-Kompass · 0007 Sichten und Funktionen (RPC)

-- ===== Sichten mit Zeilen-/Spaltenrechten =====
-- Diese Sichten laufen bewusst mit den Rechten des Besitzers und filtern selbst:
-- Namen sieht, wer ein Team teilt; Kontaktdaten nur Leitung/Treffleitung und Koordination.

create view v_personen_namen as
  select p.id, p.vorname, p.nachname, p.farbe
    from personen p
   where meine_person_id() is not null
     and (p.id = meine_person_id() or ist_koord() or teilt_team_mit(p.id));

create view v_team_freizeit as
  select t.freizeit_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.mail            end as mail,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.telefon         end as telefon,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.ernaehrung::text end as ernaehrung,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.notizen         end as notizen,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.tzk_max_stunden end as tzk_max_stunden
    from freizeit_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_team(t.freizeit_id) or ist_koord());

create view v_team_treff as
  select t.treff_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.mail            end as mail,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.telefon         end as telefon,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.tzk_max_stunden end as tzk_max_stunden
    from treff_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_treff(t.treff_id) or ist_koord());

-- ===== Sichten mit den Rechten der aufrufenden Person =====
create view v_lebensmittel_bestand with (security_invoker = true) as
  select b.ort_id, b.name, b.einheit, b.erhalten, b.verbraucht,
         b.erhalten - b.verbraucht as rest,
         case when b.erhalten - b.verbraucht <= 0 then 'leer'
              when b.erhalten > 0 and (b.erhalten - b.verbraucht) <= 0.25 * b.erhalten then 'knapp'
              else 'ok' end as status
    from (select e.ort_id, e.name, max(e.einheit) as einheit, sum(e.menge) as erhalten,
                 coalesce((select sum(v.menge) from lebensmittel_verbrauch v
                            where v.ort_id = e.ort_id and v.name = e.name), 0) as verbraucht
            from lebensmittel_eingang e
           group by e.ort_id, e.name) b;

create view v_angebot_bewertung with (security_invoker = true) as
  select angebot_id, round(avg(sterne)::numeric, 2) as durchschnitt, count(*)::int as anzahl
    from angebot_bewertungen group by angebot_id;

-- ===== Bewerbungen =====
create function fn_bewerbung_annehmen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b bewerbungen;
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'angenommen', entschieden_von = meine_person_id()
   where id = p_id and status = 'offen' returning * into b;
  if b.id is null then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
  insert into freizeit_team (freizeit_id, person_id, rolle) values (b.freizeit_id, b.person_id, 'teamer')
    on conflict (freizeit_id, person_id) do nothing;
end $$;

create function fn_bewerbung_ablehnen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'abgelehnt', entschieden_von = meine_person_id()
   where id = p_id and status = 'offen';
  if not found then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
end $$;

-- ===== Vorschläge =====
create function fn_vorschlag_uebernehmen(p_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v angebot_vorschlaege; neu uuid;
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Vorschläge übernehmen' using errcode = '42501'; end if;
  select * into v from angebot_vorschlaege where id = p_id and status = 'offen' for update;
  if v.id is null then raise exception 'Vorschlag nicht gefunden oder bereits entschieden'; end if;
  insert into angebote (name, kategorie, dauer, gruppe, personal, raum, alter_gruppen, wetter,
                        material, vorbereitung, umsetzung, nachbereitung, autor)
  values (v.daten->>'name', (v.daten->>'kategorie')::angebot_kategorie,
          v.daten->>'dauer', v.daten->>'gruppe', v.daten->>'personal', v.daten->>'raum',
          coalesce(array(select jsonb_array_elements_text(v.daten->'alter_gruppen')), '{}'),
          nullif(v.daten->>'wetter','')::wetter_t,
          v.daten->>'material', v.daten->>'vorbereitung', v.daten->>'umsetzung', v.daten->>'nachbereitung',
          v.daten->>'autor')
  returning id into neu;
  update angebot_vorschlaege set status = 'angenommen' where id = p_id;
  return neu;
end $$;

create function fn_vorschlag_ablehnen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Vorschläge entscheiden' using errcode = '42501'; end if;
  update angebot_vorschlaege set status = 'abgelehnt' where id = p_id and status = 'offen';
  if not found then raise exception 'Vorschlag nicht gefunden oder bereits entschieden'; end if;
end $$;

-- ===== Dienstplan =====
-- Monatsmuster: p_muster = {"1":["<person-id>",…], "3":[…]} (Schlüssel = ISO-Wochentag).
-- Setzt die Zuteilung an allen passenden Öffnungstagen des Monats (ersetzt vorhandene Zuteilungen).
create function fn_dienste_monatsmuster(p_treff uuid, p_monat date, p_muster jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tag date; wt smallint; oz treff_oeffnungszeiten; d_id uuid; pid text; n int := 0;
  von_monat date := date_trunc('month', p_monat)::date;
begin
  if not (ist_koord() or ist_treffleitung(p_treff)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen den Dienstplan ändern' using errcode = '42501';
  end if;
  -- alle genannten Personen müssen im Treff sein
  for pid in select jsonb_array_elements_text(v) from jsonb_each(p_muster) as e(k, v) loop
    if not exists (select 1 from treff_team where treff_id = p_treff and person_id = pid::uuid) then
      raise exception 'Person % gehört nicht zu diesem Treff', pid using errcode = 'check_violation';
    end if;
  end loop;

  for tag in select generate_series(von_monat, (von_monat + interval '1 month - 1 day')::date, interval '1 day')::date loop
    wt := extract(isodow from tag)::smallint;
    continue when not (p_muster ? wt::text);
    select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = wt;
    continue when oz.treff_id is null;          -- kein Öffnungstag
    select id into d_id from dienste where treff_id = p_treff and datum = tag and not ist_sonder;
    if d_id is null then
      insert into dienste (treff_id, datum, von, bis) values (p_treff, tag, oz.von, oz.bis) returning id into d_id;
    end if;
    delete from dienst_zuteilungen where dienst_id = d_id;
    insert into dienst_zuteilungen (dienst_id, person_id)
      select d_id, x::uuid from jsonb_array_elements_text(p_muster -> wt::text) as x;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Dienste und Stunden je Person im Monat.
-- Treffleitung/Koordination sehen alle Team-Mitglieder (auch mit 0 Diensten), alle anderen nur sich selbst.
create function fn_dienst_statistik(p_treff uuid, p_monat date)
returns table (person_id uuid, dienste int, stunden numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare von_monat date := date_trunc('month', p_monat)::date; alle boolean;
begin
  if not (ist_koord() or ist_im_treff(p_treff)) then
    raise exception 'Kein Zugriff auf diesen Treff' using errcode = '42501';
  end if;
  alle := ist_koord() or ist_treffleitung(p_treff);
  return query
    select t.person_id,
           count(d.id)::int,
           coalesce(sum(extract(epoch from (d.bis - d.von)) / 3600.0), 0)::numeric(8,2)
      from treff_team t
      left join dienst_zuteilungen z on z.person_id = t.person_id
      left join dienste d on d.id = z.dienst_id and d.treff_id = p_treff
                         and d.datum >= von_monat and d.datum < (von_monat + interval '1 month')
     where t.treff_id = p_treff and (alle or t.person_id = meine_person_id())
     group by t.person_id;
end $$;

-- ===== Nachweis der Teilzeitkräfte =====
-- Befüllt Zeilen aus Diensten und Abwesenheiten; manuelle Zeilen bleiben erhalten.
create function fn_nachweis_befuellen(p_nachweis uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n zeitnachweise; von_monat date; bis_monat date; cnt int := 0;
begin
  select * into n from zeitnachweise where id = p_nachweis;
  if n.id is null then raise exception 'Nachweis nicht gefunden'; end if;
  if not (n.person_id = meine_person_id() or ist_treffleitung(n.treff_id) or ist_koord()) then
    raise exception 'Kein Zugriff auf diesen Nachweis' using errcode = '42501';
  end if;
  if n.status = 'freigegeben' then raise exception 'Freigegebene Nachweise sind gesperrt'; end if;
  von_monat := n.monat; bis_monat := (n.monat + interval '1 month')::date;

  delete from zeitnachweis_zeilen where nachweis_id = n.id and quelle in ('dienst','abwesenheit');

  insert into zeitnachweis_zeilen (nachweis_id, datum, zeiten, stunden, quelle)
  select n.id, d.datum,
         coalesce(case when d.von is not null and d.bis is not null
                       then to_char(d.von,'HH24:MI') || ' - ' || to_char(d.bis,'HH24:MI') end,
                  d.bezeichnung, '')
           || coalesce(' (Feiertag: ' || f.bezeichnung || ')', ''),
         case when d.von is not null and d.bis is not null
              then round((extract(epoch from (d.bis - d.von)) / 3600.0)::numeric, 2) end,
         'dienst'
    from dienste d
    join dienst_zuteilungen z on z.dienst_id = d.id and z.person_id = n.person_id
    left join lateral (select bezeichnung from feiertage ft
                        where ft.datum = d.datum and (ft.treff_id = n.treff_id or ft.treff_id is null)
                        order by ft.treff_id nulls last limit 1) f on true
   where d.treff_id = n.treff_id and d.datum >= von_monat and d.datum < bis_monat;

  insert into zeitnachweis_zeilen (nachweis_id, datum, zeiten, stunden, quelle)
  select n.id, a.datum,
         case a.typ when 'urlaub' then 'Urlaub' else 'Krank' end || coalesce(' – ' || a.notiz, ''),
         case when o.treff_id is not null then round((extract(epoch from (o.bis - o.von)) / 3600.0)::numeric, 2) end,
         'abwesenheit'
    from abwesenheiten a
    left join treff_oeffnungszeiten o on o.treff_id = n.treff_id and o.wochentag = extract(isodow from a.datum)
   where a.person_id = n.person_id and a.datum >= von_monat and a.datum < bis_monat;

  select count(*) into cnt from zeitnachweis_zeilen where nachweis_id = n.id;
  return cnt;
end $$;

-- ===== Ausführungsrechte: nur angemeldete Personen =====
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

-- ════════ 0008_standardrechte.sql ════════
-- KiJuB-Kompass · 0008 Standardrechte für künftige Objekte
-- Supabase vergibt für neu angelegte Tabellen und Funktionen im Schema "public" automatisch Rechte an
-- die Rolle "anon" (nicht angemeldet). Das wird hier abgestellt, damit auch künftige Migrationen
-- nicht versehentlich anonym zugänglich sind. Angemeldete Personen bekommen Rechte weiterhin
-- ausdrücklich pro Migration (grant) – ohne Policy sehen sie trotzdem nichts.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ════════ 0009_person_entfernen.sql ════════
-- KiJuB-Kompass · 0009 Personen entfernen
-- Schutz der letzten Koordination und Übersicht der Daten, die beim Löschen einer Person mitgehen.

-- Die letzte aktive Koordination darf weder gelöscht noch deaktiviert noch herabgestuft werden –
-- sonst könnte niemand mehr Zugänge verwalten. Der Schutz gilt für JEDEN Weg (App, Dashboard, SQL).
create function fn_letzte_koordination_schuetzen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.ist_koordination and old.aktiv
     and (tg_op = 'DELETE' or not new.ist_koordination or not new.aktiv) then
    if not exists (select 1 from personen p where p.id <> old.id and p.ist_koordination and p.aktiv) then
      raise exception 'Die letzte aktive Koordination kann nicht gelöscht, deaktiviert oder herabgestuft werden'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger letzte_koordination_schuetzen
  before update of ist_koordination, aktiv or delete on personen
  for each row execute function fn_letzte_koordination_schuetzen();

-- Was hängt an einer Person? Wird vor dem endgültigen Löschen angezeigt.
-- Beim Löschen verschwinden: Zuordnungen, Bewerbungen, Dienste/Wünsche, Abwesenheiten, Nachweise,
-- Bewertungen, Kommentare, Favoriten, Push-Abos. Verfasste Hinweise/Absprachen bleiben ohne Namen erhalten.
create function fn_person_datenuebersicht(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p personen;
begin
  if not ist_koord() then
    raise exception 'Nur die Koordination darf das sehen' using errcode = '42501';
  end if;
  select * into p from personen where id = p_id;
  if p.id is null then raise exception 'Person nicht gefunden'; end if;
  return jsonb_build_object(
    'hat_zugang',         p.auth_user_id is not null,
    'ist_koordination',   p.ist_koordination,
    'aktiv',              p.aktiv,
    'freizeiten',         (select count(*) from freizeit_team where person_id = p_id),
    'leitung_freizeiten', (select count(*) from freizeit_team where person_id = p_id and rolle = 'leitung'),
    'treffs',             (select count(*) from treff_team where person_id = p_id),
    'bewerbungen',        (select count(*) from bewerbungen where person_id = p_id),
    'dienste',            (select count(*) from dienst_zuteilungen where person_id = p_id),
    'abwesenheiten',      (select count(*) from abwesenheiten where person_id = p_id),
    'nachweise',          (select count(*) from zeitnachweise where person_id = p_id),
    'vorschlaege',        (select count(*) from angebot_vorschlaege where eingereicht_von = p_id),
    'notizen_verfasst',   (select count(*) from notizen where erstellt_von = p_id)
  );
end $$;

revoke execute on function fn_person_datenuebersicht(uuid) from public, anon;
grant  execute on function fn_person_datenuebersicht(uuid) to authenticated;

-- ════════ 0010_kijuko_import.sql ════════
-- KiJuB-Kompass · 0010 KiJuKo-Import (docs/IMPORT.md)
--
-- fn_kijuko_import(plan, anwenden, entscheidungen, datei):
--   Vorschau (anwenden = false): läuft den kompletten Import durch und macht ihn danach rückgängig –
--   die Vorschau zeigt also exakt, was der echte Lauf tun würde.
--   Anwenden (anwenden = true): dasselbe, aber verbindlich, in EINER Transaktion, mit Protokoll.
--
-- Regeln je Feld (neu = Wert aus KiJuKo, ist = Wert im Kompass, stand = Wert beim letzten Import):
--   1. neu fehlt oder ist leer   → nichts tun (leere Werte überschreiben nie)
--   2. ist = neu                 → nichts zu tun
--   3. neu = stand               → KiJuKo unverändert, der Kompass-Wert bleibt (auch bei Abweichung)
--   4. ist ist leer              → neu übernehmen
--   5. ist = stand               → im Kompass nicht angefasst, neu übernehmen
--   6. sonst                     → KONFLIKT: die Koordination entscheidet ('kijuko' oder 'kompass');
--                                  ohne Entscheidung bleibt der Kompass-Wert und der Konflikt bleibt offen.
-- Nie gelöscht wird, was in KiJuKo wegfällt: Personen/Freizeiten werden nur markiert,
-- Zuteilungen nur auf ausdrücklichen Wunsch entfernt.

-- ===== Hilfsfunktionen (intern, nicht von außen aufrufbar) =====

-- Entfernt null und leere Texte aus einem JSON-Objekt.
create function fn_import_sauber(p_obj jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from jsonb_each(p_obj) as e(k, v)
   where v <> 'null'::jsonb and v <> '""'::jsonb
$$;

-- Bringt einen Plan-Wert in die Darstellung der Spalte (Zeit "07:30" → "07:30:00", Enum, Zahl …),
-- damit Vergleiche mit dem Bestand stimmen. p_tabelle stammt nur aus festen Aufrufen in diesem Skript.
create function fn_import_norm(p_tabelle text, p_feld text, p_wert jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare v_r jsonb;
begin
  execute format('select to_jsonb(r) -> $1 from jsonb_populate_record(null::public.%I, jsonb_build_object($1::text, $2::jsonb)) r', p_tabelle)
    into v_r using p_feld, p_wert;
  return v_r;
end $$;

create function fn_import_zaehle(p_z jsonb, p_art text, p_aktion text) returns jsonb
language sql immutable as $$
  select jsonb_set(jsonb_set(p_z, array[p_art], coalesce(p_z -> p_art, '{}'::jsonb), true),
                   array[p_art, p_aktion], to_jsonb(coalesce((p_z #>> array[p_art, p_aktion])::int, 0) + 1), true)
$$;

create function fn_import_stand(p_tabelle text, p_id uuid, p_feld text, p_wert jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into import_staende (tabelle, datensatz_id, feld, wert) values (p_tabelle, p_id, p_feld, p_wert)
  on conflict (tabelle, datensatz_id, feld) do update set wert = excluded.wert
$$;

-- Gleicht EINE Zeile ab (anlegen oder feldweise zusammenführen), Regeln siehe oben.
create function fn_import_zeile(
  p_tabelle text, p_id uuid, p_kid text, p_neu jsonb, p_felder text[], p_extra jsonb, p_entsch jsonb,
  out o_id uuid, out o_aktion text, out o_felder jsonb, out o_konflikte jsonb)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ist jsonb; v_f text; v_neu jsonb; v_ist_w jsonb; v_last jsonb; v_hat_stand boolean;
  v_aend jsonb := '{}'::jsonb; v_schluessel text; v_entsch text; v_nimm boolean; v_stand boolean;
  v_stand_felder text[] := '{}'; v_ins jsonb; v_spalten text;
begin
  o_felder := '[]'::jsonb; o_konflikte := '[]'::jsonb;

  if p_id is null then
    v_ins := p_neu || jsonb_build_object('kijuko_id', p_kid) || coalesce(p_extra, '{}'::jsonb);
    select string_agg(quote_ident(k), ', ') into v_spalten from jsonb_object_keys(v_ins) k;
    execute format('insert into %1$I (%2$s) select %2$s from jsonb_populate_record(null::%1$I, $1) returning id', p_tabelle, v_spalten)
      into o_id using v_ins;
    o_aktion := 'neu';
    foreach v_f in array p_felder loop
      if p_neu ? v_f then v_stand_felder := v_stand_felder || v_f; end if;
    end loop;
  else
    o_id := p_id;
    execute format('select to_jsonb(t) from %I t where id = $1', p_tabelle) into v_ist using p_id;

    foreach v_f in array p_felder loop
      continue when not (p_neu ? v_f);
      v_neu := fn_import_norm(p_tabelle, v_f, p_neu -> v_f);
      v_ist_w := v_ist -> v_f;
      select s.wert into v_last from import_staende s where s.tabelle = p_tabelle and s.datensatz_id = p_id and s.feld = v_f;
      v_hat_stand := found;
      v_nimm := false; v_stand := true;

      if v_ist_w is not distinct from v_neu then
        null;                                                       -- Regel 2
      elsif v_hat_stand and v_last is not distinct from v_neu then
        null;                                                       -- Regel 3
      elsif v_ist_w is null or v_ist_w = 'null'::jsonb or v_ist_w = '""'::jsonb then
        v_nimm := true;                                             -- Regel 4
      elsif v_hat_stand and v_ist_w is not distinct from v_last then
        v_nimm := true;                                             -- Regel 5
      else                                                          -- Regel 6: Konflikt
        v_schluessel := format('%s:%s:%s', p_tabelle, p_id, v_f);
        v_entsch := p_entsch ->> v_schluessel;
        if v_entsch = 'kijuko' then
          v_nimm := true;
        else
          o_konflikte := o_konflikte || jsonb_build_object('schluessel', v_schluessel, 'feld', v_f, 'kompass', v_ist_w, 'kijuko', v_neu);
          v_stand := (v_entsch = 'kompass');                        -- offene Konflikte bleiben offen
        end if;
      end if;

      if v_nimm then
        v_aend := v_aend || jsonb_build_object(v_f, v_neu);
        o_felder := o_felder || jsonb_build_object('feld', v_f, 'von', v_ist_w, 'nach', v_neu);
      end if;
      if v_stand then v_stand_felder := v_stand_felder || v_f; end if;
    end loop;

    -- Verknüpfung mit einer bereits vorhandenen Zeile (noch ohne KiJuKo-ID)
    if v_ist -> 'kijuko_id' = 'null'::jsonb then
      v_aend := v_aend || jsonb_build_object('kijuko_id', p_kid) || coalesce(p_extra, '{}'::jsonb);
    end if;

    if v_aend <> '{}'::jsonb then
      execute format('update %1$I t set %2$s from jsonb_populate_record(null::%1$I, $2) r where t.id = $1',
                     p_tabelle,
                     (select string_agg(format('%1$I = r.%1$I', k), ', ') from jsonb_object_keys(v_aend) k))
        using p_id, v_aend;
    end if;
    o_aktion := case when v_aend <> '{}'::jsonb then 'geaendert' else 'unveraendert' end;
  end if;

  -- Stand festhalten (Grundlage der Konflikterkennung beim nächsten Import)
  foreach v_f in array v_stand_felder loop
    perform fn_import_stand(p_tabelle, o_id, v_f, fn_import_norm(p_tabelle, v_f, p_neu -> v_f));
  end loop;
end $$;

-- ===== Der eigentliche Lauf =====
create function fn_import_lauf(p_plan jsonb, p_entsch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  z jsonb := '{}'::jsonb;
  v_aend jsonb := '[]'::jsonb; v_konf jsonb := '[]'::jsonb; v_entf jsonb := '[]'::jsonb;
  v_hinw jsonb := coalesce(p_plan -> 'hinweise', '[]'::jsonb);
  m_orte jsonb := '{}'::jsonb; m_pers jsonb := '{}'::jsonb; m_frei jsonb := '{}'::jsonb;
  r jsonb; rec record; res record; ex record;
  v_id uuid; v_kid text; v_neu jsonb; v_name text; v_fremd text; v_max int;
  v_gew jsonb := '[]'::jsonb; v_fid uuid; v_pid uuid; v_rolle text; v_rolle_ist text;
  v_last jsonb; v_hat_stand boolean; v_key text; v_entsch text; v_paare text[] := '{}';
  v_ohne int := 0; v_bleibt int := 0; v_n int; v_ids text[];
begin
  ---------------------------------------------------------------- Orte
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'orte', '[]'::jsonb)) loop
    v_kid := r ->> 'kijuko_id';
    select o.id into v_id from orte o where o.kijuko_id = v_kid;
    if v_id is null then
      select o.id into v_id from orte o where o.kijuko_id is null and lower(o.name) = lower(r ->> 'name') limit 1;
    end if;
    v_neu := fn_import_sauber(jsonb_build_object('name', r -> 'name', 'adresse', r -> 'adresse', 'lieferstelle_nr', r -> 'lieferstelle_nr'));
    select * into res from fn_import_zeile('orte', v_id, v_kid, v_neu, array['name','adresse','lieferstelle_nr'], null, p_entsch);
    m_orte := m_orte || jsonb_build_object(v_kid, res.o_id);
    z := fn_import_zaehle(z, 'orte', res.o_aktion);
    v_konf := v_konf || coalesce((select jsonb_agg(k || jsonb_build_object('art', 'Ort', 'name', r ->> 'name'))
                                    from jsonb_array_elements(res.o_konflikte) k), '[]'::jsonb);
    if jsonb_array_length(res.o_felder) > 0 then
      v_aend := v_aend || jsonb_build_object('art', 'Ort', 'name', r ->> 'name', 'felder', res.o_felder);
    end if;
  end loop;

  ---------------------------------------------------------------- Personen
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'personen', '[]'::jsonb)) loop
    v_kid := r ->> 'kijuko_id';
    v_name := (r ->> 'vorname') || ' ' || (r ->> 'nachname');
    select p.id into v_id from personen p where p.kijuko_id = v_kid;
    if v_id is null then
      select p.id, p.kijuko_id into v_id, v_fremd from personen p where lower(p.mail) = lower(r ->> 'mail');
      if v_id is not null and v_fremd is not null then   -- Mail gehört schon zu einer anderen KiJuKo-Person
        v_hinw := v_hinw || to_jsonb(format('%s: Die Mail-Adresse gehört im Kompass schon zu einer anderen KiJuKo-Person – übersprungen.', v_name));
        continue;
      end if;
      if v_id is not null then
        v_hinw := v_hinw || to_jsonb(format('%s: Mit der vorhandenen Person (gleiche Mail-Adresse) verknüpft.', v_name));
      end if;
    end if;
    v_neu := fn_import_sauber(jsonb_build_object(
      'vorname', r -> 'vorname', 'nachname', r -> 'nachname', 'mail', r -> 'mail', 'telefon', r -> 'telefon',
      'ernaehrung', r -> 'ernaehrung', 'notizen', r -> 'notizen', 'kategorie', r -> 'kategorie', 'aktiv', r -> 'aktiv'));
    if v_id is not null and exists (select 1 from personen p where lower(p.mail) = lower(v_neu ->> 'mail') and p.id <> v_id) then
      v_neu := v_neu - 'mail';
      v_hinw := v_hinw || to_jsonb(format('%s: Die neue Mail-Adresse aus KiJuKo gehört im Kompass schon einer anderen Person – nicht übernommen.', v_name));
    end if;
    select * into res from fn_import_zeile('personen', v_id, v_kid, v_neu,
      array['vorname','nachname','mail','telefon','ernaehrung','notizen','kategorie','aktiv'],
      jsonb_build_object('kijuko_quelle', r -> 'kijuko_quelle'), p_entsch);
    m_pers := m_pers || jsonb_build_object(v_kid, res.o_id);
    z := fn_import_zaehle(z, 'personen', res.o_aktion);
    v_konf := v_konf || coalesce((select jsonb_agg(k || jsonb_build_object('art', 'Person', 'name', v_name))
                                    from jsonb_array_elements(res.o_konflikte) k), '[]'::jsonb);
    if jsonb_array_length(res.o_felder) > 0 then
      v_aend := v_aend || jsonb_build_object('art', 'Person', 'name', v_name, 'felder', res.o_felder);
      if exists (select 1 from jsonb_array_elements(res.o_felder) x where x ->> 'feld' = 'mail')
         and exists (select 1 from personen p where p.id = res.o_id and p.auth_user_id is not null) then
        v_hinw := v_hinw || to_jsonb(format('%s: Die Mail-Adresse wurde geändert, das Login-Konto läuft aber weiter unter der alten Adresse.', v_name));
      end if;
    end if;
  end loop;

  ---------------------------------------------------------------- Freizeiten
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) loop
    v_kid := r ->> 'kijuko_id';
    v_name := r ->> 'name';
    if (r ->> 'ende_datum')::date < (r ->> 'start_datum')::date then
      v_hinw := v_hinw || to_jsonb(format('%s: Das Ende liegt vor dem Start – übersprungen.', v_name));
      continue;
    end if;
    select f.id into v_id from freizeiten f where f.kijuko_id = v_kid;
    if v_id is null then
      select f.id into v_id from freizeiten f
       where f.kijuko_id is null and lower(f.name) = lower(v_name) and f.start_datum = (r ->> 'start_datum')::date limit 1;
      if v_id is not null then
        v_hinw := v_hinw || to_jsonb(format('%s: Mit der vorhandenen Freizeit (gleicher Name und Start) verknüpft.', v_name));
      end if;
    end if;
    v_neu := fn_import_sauber(jsonb_build_object(
      'name', r -> 'name', 'status', r -> 'status', 'ferienzeitraum', r -> 'ferienzeitraum', 'ferienwoche', r -> 'ferienwoche',
      'start_datum', r -> 'start_datum', 'ende_datum', r -> 'ende_datum',
      'arbeitsbeginn', r -> 'arbeitsbeginn', 'arbeitsende', r -> 'arbeitsende',
      'alter_von', r -> 'alter_von', 'alter_bis', r -> 'alter_bis', 'max_teilnehmende', r -> 'max_teilnehmende',
      'kijuko_code', r -> 'kijuko_code', 'kijuko_serie_id', r -> 'kijuko_serie_id',
      'ort_id', case when r ->> 'ort_kijuko_id' is not null then m_orte -> (r ->> 'ort_kijuko_id') end));
    -- Die Ferienwoche muss zur Ferienzeit passen (sonst würde die Datenbank den ganzen Import ablehnen)
    if v_neu ? 'ferienwoche' then
      v_max := case v_neu ->> 'ferienzeitraum' when 'sommer' then 6 when 'ostern' then 2 when 'herbst' then 2 else 0 end;
      if (v_neu ->> 'ferienwoche')::int > v_max or (v_neu ->> 'ferienwoche')::int < 1 then
        v_neu := v_neu - 'ferienwoche';
        v_hinw := v_hinw || to_jsonb(format('%s: Die Ferienwoche passt nicht zur Ferienzeit – nicht übernommen.', v_name));
      end if;
    end if;
    if (v_neu ->> 'alter_von') is not null and (v_neu ->> 'alter_bis') is not null
       and (v_neu ->> 'alter_bis')::int < (v_neu ->> 'alter_von')::int then
      v_neu := v_neu - 'alter_von' - 'alter_bis';
    end if;
    select * into res from fn_import_zeile('freizeiten', v_id, v_kid, v_neu,
      array['name','status','ferienzeitraum','ferienwoche','start_datum','ende_datum','arbeitsbeginn','arbeitsende',
            'alter_von','alter_bis','max_teilnehmende','kijuko_code','kijuko_serie_id','ort_id'],
      null, p_entsch);
    m_frei := m_frei || jsonb_build_object(v_kid, res.o_id);
    z := fn_import_zaehle(z, 'freizeiten', res.o_aktion);
    v_konf := v_konf || coalesce((select jsonb_agg(k || jsonb_build_object('art', 'Freizeit', 'name', v_name))
                                    from jsonb_array_elements(res.o_konflikte) k), '[]'::jsonb);
    if jsonb_array_length(res.o_felder) > 0 then
      v_aend := v_aend || jsonb_build_object('art', 'Freizeit', 'name', v_name, 'felder', res.o_felder);
    end if;
  end loop;

  ---------------------------------------------------------------- Zuteilungen (Leitung und Team)
  -- Gewünschter Zustand: Leitungen aus den Freizeiten, Ehrenamtliche aus den Zuteilungen (Leitung gewinnt).
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) loop
    for v_kid in select jsonb_array_elements_text(coalesce(r -> 'leitung_kijuko_ids', '[]'::jsonb)) loop
      v_gew := v_gew || jsonb_build_object('f', r ->> 'kijuko_id', 'p', v_kid, 'rolle', 'leitung');
    end loop;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'zuteilungen', '[]'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(v_gew) g
                    where g ->> 'f' = r ->> 'freizeit_kijuko_id' and g ->> 'p' = r ->> 'person_kijuko_id') then
      v_gew := v_gew || jsonb_build_object('f', r ->> 'freizeit_kijuko_id', 'p', r ->> 'person_kijuko_id', 'rolle', 'teamer');
    end if;
  end loop;

  for r in select * from jsonb_array_elements(v_gew) loop
    v_fid := (m_frei ->> (r ->> 'f'))::uuid;
    v_pid := (m_pers ->> (r ->> 'p'))::uuid;
    if v_fid is null or v_pid is null then v_ohne := v_ohne + 1; continue; end if;
    v_paare := v_paare || (v_fid::text || '|' || v_pid::text);
    v_rolle := r ->> 'rolle';
    select t.rolle::text into v_rolle_ist from freizeit_team t where t.freizeit_id = v_fid and t.person_id = v_pid;
    select s.wert into v_last from import_staende s where s.tabelle = 'freizeit_team' and s.datensatz_id = v_fid and s.feld = v_pid::text;
    v_hat_stand := found;

    if v_rolle_ist is null then
      if v_hat_stand then v_bleibt := v_bleibt + 1; continue; end if;   -- im Kompass bewusst entfernt, bleibt entfernt
      insert into freizeit_team (freizeit_id, person_id, rolle) values (v_fid, v_pid, v_rolle::freizeit_rolle);
      perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      z := fn_import_zaehle(z, 'zuteilungen', 'neu');
    elsif v_rolle_ist = v_rolle then
      perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      z := fn_import_zaehle(z, 'zuteilungen', 'unveraendert');
    elsif v_hat_stand and v_last = to_jsonb(v_rolle) then
      z := fn_import_zaehle(z, 'zuteilungen', 'unveraendert');           -- KiJuKo unverändert, Kompass-Rolle bleibt
    elsif v_hat_stand and v_last = to_jsonb(v_rolle_ist) then
      update freizeit_team t set rolle = v_rolle::freizeit_rolle where t.freizeit_id = v_fid and t.person_id = v_pid;
      perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      z := fn_import_zaehle(z, 'zuteilungen', 'geaendert');
    else
      v_key := format('freizeit_team:%s:%s', v_fid, v_pid);
      v_entsch := p_entsch ->> v_key;
      if v_entsch = 'kijuko' then
        update freizeit_team t set rolle = v_rolle::freizeit_rolle where t.freizeit_id = v_fid and t.person_id = v_pid;
        z := fn_import_zaehle(z, 'zuteilungen', 'geaendert');
      else
        v_konf := v_konf || jsonb_build_object('schluessel', v_key, 'art', 'Zuteilung', 'feld', 'rolle',
          'name', (select p.vorname || ' ' || p.nachname || ' in ' || f.name from personen p, freizeiten f where p.id = v_pid and f.id = v_fid),
          'kompass', to_jsonb(v_rolle_ist), 'kijuko', to_jsonb(v_rolle));
        z := fn_import_zaehle(z, 'zuteilungen', 'unveraendert');
      end if;
      if v_entsch is not null then
        perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      end if;
    end if;
  end loop;

  -- In KiJuKo entfallene Zuteilungen: nur auf ausdrücklichen Wunsch entfernen
  for rec in
    select s.datensatz_id as fid, s.feld::uuid as pid
      from import_staende s
      join freizeit_team t on t.freizeit_id = s.datensatz_id and t.person_id = s.feld::uuid
     where s.tabelle = 'freizeit_team'
       and s.datensatz_id::text in (select value from jsonb_each_text(m_frei))
       and not ((s.datensatz_id::text || '|' || s.feld) = any (v_paare))
  loop
    v_key := format('entfallen:%s:%s', rec.fid, rec.pid);
    v_name := (select p.vorname || ' ' || p.nachname || ' in ' || f.name from personen p, freizeiten f where p.id = rec.pid and f.id = rec.fid);
    if p_entsch ->> v_key = 'kijuko' then
      delete from freizeit_team t where t.freizeit_id = rec.fid and t.person_id = rec.pid;
      delete from import_staende s where s.tabelle = 'freizeit_team' and s.datensatz_id = rec.fid and s.feld = rec.pid::text;
      z := fn_import_zaehle(z, 'zuteilungen', 'entfernt');
    else
      v_entf := v_entf || jsonb_build_object('art', 'Zuteilung', 'name', v_name, 'schluessel', v_key);
      z := fn_import_zaehle(z, 'zuteilungen', 'entfallen');
    end if;
  end loop;

  ---------------------------------------------------------------- Entfallene Personen und Freizeiten (nur markieren)
  select coalesce(array_agg(x ->> 'kijuko_id'), '{}') into v_ids from jsonb_array_elements(coalesce(p_plan -> 'personen', '[]'::jsonb)) x;
  update personen set kijuko_entfallen_am = null where kijuko_id = any (v_ids) and kijuko_entfallen_am is not null;
  for rec in select p.id, p.vorname || ' ' || p.nachname as name from personen p
              where p.kijuko_id is not null and not (p.kijuko_id = any (v_ids)) loop
    update personen set kijuko_entfallen_am = coalesce(kijuko_entfallen_am, now()) where id = rec.id;
    v_entf := v_entf || jsonb_build_object('art', 'Person', 'name', rec.name, 'schluessel', 'person:' || rec.id);
  end loop;

  select coalesce(array_agg(x ->> 'kijuko_id'), '{}') into v_ids from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) x;
  update freizeiten set kijuko_entfallen_am = null where kijuko_id = any (v_ids) and kijuko_entfallen_am is not null;
  for rec in select f.id, f.name from freizeiten f where f.kijuko_id is not null and not (f.kijuko_id = any (v_ids)) loop
    update freizeiten set kijuko_entfallen_am = coalesce(kijuko_entfallen_am, now()) where id = rec.id;
    v_entf := v_entf || jsonb_build_object('art', 'Freizeit', 'name', rec.name, 'schluessel', 'freizeit:' || rec.id);
  end loop;

  ---------------------------------------------------------------- Verpflegung (Kopie der KiJuKo-Werte)
  for rec in select e.key as kid, e.value::uuid as fid from jsonb_each_text(m_frei) e loop
    for r in select * from jsonb_array_elements(coalesce(p_plan -> 'verpflegung', '[]'::jsonb)) x
              where x ->> 'freizeit_kijuko_id' = rec.kid loop
      select * into ex from freizeit_verpflegung fv
       where fv.freizeit_id = rec.fid and fv.datum is not distinct from nullif(r ->> 'datum', '')::date;
      if not found then
        insert into freizeit_verpflegung (freizeit_id, datum, mischkost, vegetarisch, allergiker)
        values (rec.fid, nullif(r ->> 'datum', '')::date, (r ->> 'mischkost')::int, (r ->> 'vegetarisch')::int, (r ->> 'allergiker')::int);
        z := fn_import_zaehle(z, 'verpflegung', 'neu');
      elsif ex.mischkost <> (r ->> 'mischkost')::int or ex.vegetarisch <> (r ->> 'vegetarisch')::int
            or ex.allergiker <> (r ->> 'allergiker')::int then
        update freizeit_verpflegung fv
           set mischkost = (r ->> 'mischkost')::int, vegetarisch = (r ->> 'vegetarisch')::int, allergiker = (r ->> 'allergiker')::int
         where fv.id = ex.id;
        z := fn_import_zaehle(z, 'verpflegung', 'geaendert');
      else
        z := fn_import_zaehle(z, 'verpflegung', 'unveraendert');
      end if;
    end loop;
    delete from freizeit_verpflegung fv
     where fv.freizeit_id = rec.fid
       and not exists (select 1 from jsonb_array_elements(coalesce(p_plan -> 'verpflegung', '[]'::jsonb)) x
                        where x ->> 'freizeit_kijuko_id' = rec.kid
                          and nullif(x ->> 'datum', '')::date is not distinct from fv.datum);
    get diagnostics v_n = row_count;
    for i in 1..v_n loop z := fn_import_zaehle(z, 'verpflegung', 'geloescht'); end loop;
  end loop;

  ---------------------------------------------------------------- Material (Kopie der KiJuKo-Werte)
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'material', '[]'::jsonb)) loop
    v_fid := (m_frei ->> (r ->> 'freizeit_kijuko_id'))::uuid;
    continue when v_fid is null;
    select * into ex from freizeit_material m where m.kijuko_id = r ->> 'kijuko_id';
    if not found then
      insert into freizeit_material (freizeit_id, kijuko_id, name, einheit, menge, notiz)
      values (v_fid, r ->> 'kijuko_id', r ->> 'name', r ->> 'einheit', (r ->> 'menge')::numeric, r ->> 'notiz');
      z := fn_import_zaehle(z, 'material', 'neu');
    elsif ex.freizeit_id <> v_fid or ex.name <> (r ->> 'name')
          or ex.einheit is distinct from (r ->> 'einheit') or ex.menge is distinct from (r ->> 'menge')::numeric
          or ex.notiz is distinct from (r ->> 'notiz') then
      update freizeit_material m
         set freizeit_id = v_fid, name = r ->> 'name', einheit = r ->> 'einheit',
             menge = (r ->> 'menge')::numeric, notiz = r ->> 'notiz'
       where m.id = ex.id;
      z := fn_import_zaehle(z, 'material', 'geaendert');
    else
      z := fn_import_zaehle(z, 'material', 'unveraendert');
    end if;
  end loop;
  select coalesce(array_agg(x ->> 'kijuko_id'), '{}') into v_ids from jsonb_array_elements(coalesce(p_plan -> 'material', '[]'::jsonb)) x;
  delete from freizeit_material m
   where m.kijuko_id is not null and not (m.kijuko_id = any (v_ids))
     and m.freizeit_id::text in (select value from jsonb_each_text(m_frei));
  get diagnostics v_n = row_count;
  for i in 1..v_n loop z := fn_import_zaehle(z, 'material', 'geloescht'); end loop;

  if v_ohne > 0 then
    v_hinw := v_hinw || to_jsonb(format('%s Zuteilung(en) konnten keiner Person oder Freizeit zugeordnet werden (siehe „Übersprungen").', v_ohne));
  end if;
  if v_bleibt > 0 then
    v_hinw := v_hinw || to_jsonb(format('%s Zuteilung(en) wurden im Kompass bewusst entfernt und bleiben entfernt.', v_bleibt));
  end if;

  return jsonb_build_object('zaehler', z, 'aenderungen', v_aend, 'konflikte', v_konf, 'entfallen', v_entf,
                            'hinweise', v_hinw, 'uebersprungen', coalesce(p_plan -> 'uebersprungen', '[]'::jsonb));
end $$;

-- ===== Öffentliche Funktion (nur Koordination) =====
create function fn_kijuko_import(
  p_plan jsonb, p_anwenden boolean default false, p_entscheidungen jsonb default '{}'::jsonb, p_datei jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_entsch jsonb := coalesce(p_entscheidungen, '{}'::jsonb);
begin
  if not ist_koord() then
    raise exception 'Nur die Koordination darf importieren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) <> 'object' or (p_plan ->> 'version') is distinct from '1' then
    raise exception 'Ungültiger Importplan' using errcode = '22023';
  end if;

  begin
    v_result := fn_import_lauf(p_plan, v_entsch);
    if not p_anwenden then
      raise exception 'Vorschau' using errcode = 'P0901';   -- macht den Probelauf rückgängig
    end if;
  exception when sqlstate 'P0901' then
    null;                                                   -- v_result bleibt erhalten, alle Änderungen sind zurückgerollt
  end;

  if p_anwenden then
    insert into import_laeufe (gestartet_von, datei_name, datei_sha256, backup_datum, ergebnis, angewendet)
    values (meine_person_id(), p_datei ->> 'name', p_datei ->> 'sha256', nullif(p_datei ->> 'backup_datum', '')::date,
            jsonb_build_object(
              'zaehler', v_result -> 'zaehler',
              'offene_konflikte', jsonb_array_length(v_result -> 'konflikte'),
              'entfallen', jsonb_array_length(v_result -> 'entfallen'),
              'uebersprungen', jsonb_array_length(v_result -> 'uebersprungen'),
              'hinweise', jsonb_array_length(v_result -> 'hinweise')),
            true);
  end if;
  return v_result || jsonb_build_object('angewendet', p_anwenden);
end $$;

-- Nur die öffentliche Funktion ist aufrufbar; die internen Helfer laufen nur innerhalb von fn_kijuko_import.
revoke execute on function fn_import_sauber(jsonb), fn_import_norm(text, text, jsonb), fn_import_zaehle(jsonb, text, text),
  fn_import_stand(text, uuid, text, jsonb),
  fn_import_zeile(text, uuid, text, jsonb, text[], jsonb, jsonb), fn_import_lauf(jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function fn_kijuko_import(jsonb, boolean, jsonb, jsonb) from public, anon;
grant  execute on function fn_kijuko_import(jsonb, boolean, jsonb, jsonb) to authenticated;

-- ════════ 0011_realtime.sql ════════
-- KiJuB-Kompass · 0011 Live-Aktualisierung (Supabase Realtime)
-- Die Tabellen der Freizeiten melden Änderungen an angemeldete Geräte, damit Wochenplan, Hinweise, Team und
-- Lebensmittel bei allen sofort aktuell sind. Es werden nur Zeilen geliefert, die die jeweilige Person laut
-- Zugriffsregeln (RLS) auch lesen darf. In Umgebungen ohne Realtime (z. B. den lokalen Tests) passiert nichts.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['plan_eintraege', 'freizeit_slots', 'notizen', 'notiz_bestaetigungen', 'notiz_kommentare',
                             'freizeit_team', 'lebensmittel_eingang', 'lebensmittel_verbrauch'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ════════ 0012_dienstplan.sql ════════
-- KiJuB-Kompass · 0012 Dienstplan: Funktionen für Wünsche und Zuteilungen, Live-Aktualisierung
--
-- Ein Dienst-Datensatz für einen regulären Öffnungstag entsteht erst, wenn jemand zuteilt oder einen Dienst wünscht.
-- BetreuerInnen dürfen keine Dienste anlegen – sie wünschen über fn_dienst_wunsch, die den Tag bei Bedarf selbst anlegt.

-- Zuteilungen nur für Personen des Treffs (gilt auch für direkte Schreibzugriffe)
create function fn_zuteilung_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from treff_team t join dienste d on d.treff_id = t.treff_id
                  where d.id = new.dienst_id and t.person_id = new.person_id) then
    raise exception 'Die Person gehört nicht zu diesem Treff' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger dienst_zuteilung_pruefen before insert or update on dienst_zuteilungen
  for each row execute function fn_zuteilung_pruefen();

-- Regulären Dienst für einen Öffnungstag anlegen (Zeiten werden aus den Öffnungszeiten kopiert); gibt die ID zurück.
create function fn_dienst_sicherstellen(p_treff uuid, p_datum date) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare oz treff_oeffnungszeiten; d_id uuid;
begin
  if not (ist_koord() or ist_treffleitung(p_treff)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen den Dienstplan ändern' using errcode = '42501';
  end if;
  select id into d_id from dienste where treff_id = p_treff and datum = p_datum and not ist_sonder;
  if d_id is not null then return d_id; end if;
  select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = extract(isodow from p_datum);
  if oz.treff_id is null then
    raise exception 'An diesem Tag ist der Treff nicht geöffnet' using errcode = 'check_violation';
  end if;
  insert into dienste (treff_id, datum, von, bis) values (p_treff, p_datum, oz.von, oz.bis) returning id into d_id;
  return d_id;
end $$;

-- Dienstwunsch der angemeldeten Person für einen Öffnungstag. Ein abgelehnter Wunsch kann erneut gestellt werden.
create function fn_dienst_wunsch(p_treff uuid, p_datum date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare oz treff_oeffnungszeiten; d_id uuid; ich uuid := meine_person_id();
begin
  if ich is null or not ist_im_treff(p_treff) then
    raise exception 'Nur Personen aus dem Treff können einen Dienst wünschen' using errcode = '42501';
  end if;
  if p_datum < current_date then
    raise exception 'Für vergangene Tage kann kein Dienst gewünscht werden' using errcode = 'check_violation';
  end if;
  select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = extract(isodow from p_datum);
  if oz.treff_id is null then
    raise exception 'An diesem Tag ist der Treff nicht geöffnet' using errcode = 'check_violation';
  end if;
  select id into d_id from dienste where treff_id = p_treff and datum = p_datum and not ist_sonder;
  if d_id is null then
    insert into dienste (treff_id, datum, von, bis) values (p_treff, p_datum, oz.von, oz.bis) returning id into d_id;
  end if;
  if exists (select 1 from dienst_zuteilungen where dienst_id = d_id and person_id = ich) then
    raise exception 'Du bist an diesem Tag schon eingeteilt' using errcode = 'check_violation';
  end if;
  insert into dienst_wuensche (dienst_id, person_id) values (d_id, ich)
  on conflict (dienst_id, person_id) do update
     set status = 'offen', entschieden_von = null, created_at = now()
   where dienst_wuensche.status = 'abgelehnt';
end $$;

-- Wunsch beantworten: bestätigen teilt die Person zugleich ein.
create function fn_wunsch_entscheiden(p_dienst uuid, p_person uuid, p_bestaetigen boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := treff_von_dienst(p_dienst);
begin
  if not (ist_koord() or ist_treffleitung(tid)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen Wünsche beantworten' using errcode = '42501';
  end if;
  update dienst_wuensche
     set status = case when p_bestaetigen then 'bestaetigt'::wunsch_status else 'abgelehnt'::wunsch_status end,
         entschieden_von = meine_person_id()
   where dienst_id = p_dienst and person_id = p_person and status = 'offen';
  if not found then
    raise exception 'Wunsch nicht gefunden oder bereits beantwortet' using errcode = 'check_violation';
  end if;
  if p_bestaetigen then
    insert into dienst_zuteilungen (dienst_id, person_id) values (p_dienst, p_person) on conflict do nothing;
  end if;
end $$;

-- Live-Aktualisierung des Dienstplans (nur Zeilen, die die Person laut Zugriffsregeln sehen darf).
-- Abwesenheiten und Nachweise bleiben bewusst draußen: sie sind personenbezogen.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'dienstplan_kommentare',
                             'feiertage', 'treff_team', 'treff_plan_eintraege'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Ausführungsrechte wie bei den übrigen Funktionen (Migration 0007): nur angemeldete Personen
revoke execute on function fn_dienst_sicherstellen(uuid, date), fn_dienst_wunsch(uuid, date),
  fn_wunsch_entscheiden(uuid, uuid, boolean), fn_zuteilung_pruefen() from public, anon;
grant execute on function fn_dienst_sicherstellen(uuid, date), fn_dienst_wunsch(uuid, date),
  fn_wunsch_entscheiden(uuid, uuid, boolean) to authenticated;

-- ════════ 0013_katalog.sql ════════
-- KiJuB-Kompass · 0013 Katalog: Kommentare mit Namen
--
-- Kommentare zu Programmpunkten sind für alle aktiven Personen sichtbar und zeigen den Namen der Schreibenden.
-- Die Namenssicht v_personen_namen liefert nur Personen aus gemeinsamen Teams; im Katalog kennt man sich aber nicht
-- unbedingt – deshalb eine eigene Sicht nur für Kommentare (Vor- und Nachname, sonst nichts aus dem Personenprofil).
create view v_angebot_kommentare as
  select k.id, k.angebot_id, k.person_id, k.text, k.created_at, p.vorname, p.nachname
    from angebot_kommentare k
    join personen p on p.id = k.person_id
   where ist_aktive_person();

revoke all on v_angebot_kommentare from anon;
grant select on v_angebot_kommentare to authenticated;

-- Ein Programmpunkt, der schon in einem Wochenplan steht, darf gelöscht werden: die Einträge bleiben mit seinem Namen
-- als Freitext erhalten (sonst würde die Regel „Programmpunkt oder Freitext“ das Löschen verhindern).
create function fn_angebot_loeschen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update plan_eintraege set freitext = old.name, angebot_id = null where angebot_id = old.id;
  update treff_plan_eintraege set freitext = old.name, angebot_id = null where angebot_id = old.id;
  return old;
end $$;
create trigger angebot_loeschen before delete on angebote for each row execute function fn_angebot_loeschen();
revoke execute on function fn_angebot_loeschen() from public, anon;

-- ════════ 0014_betrieb.sql ════════
-- KiJuB-Kompass · 0014 Betrieb: Lebenszeichen für die Datenbank
--
-- Kostenlose Supabase-Projekte werden nach einer Woche ohne Zugriffe pausiert. Ein geplanter Aufruf (GitHub Actions,
-- siehe .github/workflows/keepalive.yml) ruft diese Funktion auf: Sie berührt die Datenbank, gibt aber nur „ok“ zurück –
-- keine Daten, keine Uhrzeit, kein Hinweis auf Inhalte. Sie ist die einzige Funktion, die ohne Anmeldung ausführbar ist.
create function fn_ping() returns text
language sql stable as $$ select 'ok'::text $$;

grant execute on function fn_ping() to anon, authenticated;

-- Aufräumen: Die Schutzfunktion aus 0009 (nur als Trigger gedacht, nicht direkt aufrufbar) war noch für „public“ ausführbar.
-- Damit ist fn_ping die einzige Funktion, die ohne Anmeldung ausgeführt werden darf.
revoke execute on function fn_letzte_koordination_schuetzen() from public, anon;

-- ════════ 0015_mitteilungen.sql ════════
-- KiJuB-Kompass · 0015 Mitteilungen (Web-Push): wer bekommt was – entschieden in der Datenbank
--
-- Die Edge Function „push-senden“ verschickt die Mitteilungen, entscheidet aber NICHT selbst über Empfänger oder Inhalt:
-- Sie fragt fn_push_vorbereiten mit der Anmeldung der auslösenden Person. Nur was diese Person laut Regeln auslösen darf
-- und nur frische, eigene Vorgänge ergeben Empfänger; alles andere wird abgelehnt. Wiederholungen und Massenversand werden gebremst.

create table mitteilungen_log (
  id          uuid primary key default gen_random_uuid(),
  art         text not null,
  ref         uuid,
  schluessel  text not null default '',
  von_person  uuid references personen(id) on delete cascade,
  empfaenger  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index mitteilungen_log_person on mitteilungen_log (von_person, created_at);
alter table mitteilungen_log enable row level security;          -- keine Regel: nur die Funktionen unten schreiben und lesen

create function fn_push_name(pid uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select vorname || ' ' || nachname from personen where id = pid
$$;

-- Empfänger einer manuellen Mitteilung der Koordination.
-- ziel = {"art": "alle" | "koordination" | "kategorie" | "freizeit" | "treff", "kategorie": "leitung"|"teamer", "id": uuid, "rolle": "leitung"|"teamer"|"treffleitung"|"betreuerin"}
create function fn_push_ziel(p_ziel jsonb) returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a text := p_ziel ->> 'art'; r text := nullif(p_ziel ->> 'rolle', ''); k text := p_ziel ->> 'kategorie'; i uuid; ergebnis uuid[];
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Mitteilungen an Gruppen senden' using errcode = '42501'; end if;
  if a = 'alle' then
    ergebnis := array(select id from personen where aktiv);
  elsif a = 'koordination' then
    ergebnis := array(select id from personen where aktiv and ist_koordination);
  elsif a = 'kategorie' then
    if k = 'leitung' then
      ergebnis := array(select p.id from personen p where p.aktiv and (
        exists (select 1 from freizeit_team t where t.person_id = p.id and t.rolle = 'leitung')
        or exists (select 1 from treff_team t where t.person_id = p.id and t.rolle = 'treffleitung')));
    elsif k = 'teamer' then
      ergebnis := array(select p.id from personen p where p.aktiv and (
        exists (select 1 from freizeit_team t where t.person_id = p.id and t.rolle = 'teamer')
        or exists (select 1 from treff_team t where t.person_id = p.id and t.rolle = 'betreuerin')));
    else raise exception 'Unbekannte Kategorie' using errcode = 'check_violation'; end if;
  elsif a = 'freizeit' then
    i := (p_ziel ->> 'id')::uuid;
    if r is not null and r not in ('leitung', 'teamer') then raise exception 'Unbekannte Rolle' using errcode = 'check_violation'; end if;
    ergebnis := array(select t.person_id from freizeit_team t join personen p on p.id = t.person_id
                       where t.freizeit_id = i and p.aktiv and (r is null or t.rolle::text = r));
  elsif a = 'treff' then
    i := (p_ziel ->> 'id')::uuid;
    if r is not null and r not in ('treffleitung', 'betreuerin') then raise exception 'Unbekannte Rolle' using errcode = 'check_violation'; end if;
    ergebnis := array(select t.person_id from treff_team t join personen p on p.id = t.person_id
                       where t.treff_id = i and p.aktiv and (r is null or t.rolle::text = r));
  else
    raise exception 'Unbekanntes Ziel' using errcode = 'check_violation';
  end if;
  return coalesce(ergebnis, '{}');
end $$;

-- Vorschau für die Koordination: wie viele und welche Personen erreicht eine manuelle Mitteilung? (Die auslösende Person zählt nicht mit.)
create function fn_push_vorschau(p_ziel jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ids uuid[] := array(select x from unnest(fn_push_ziel(p_ziel)) as x where x is distinct from meine_person_id());
begin
  return jsonb_build_object(
    'anzahl', coalesce(array_length(ids, 1), 0),
    'personen', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.vorname || ' ' || p.nachname) order by p.nachname, p.vorname)
                            from personen p where p.id = any(ids)), '[]'::jsonb),
    'mit_geraet', (select count(distinct a.person_id) from push_abos a where a.person_id = any(ids)));
end $$;

-- Kernfunktion. art:
--   hinweis, absprache_freizeit (ref = Notiz), absprache_treff (ref = Notiz), dienstplan (ref = Treff, extra.personen),
--   dienstplan_kommentar (ref = Kommentar), wunsch_neu (ref = Treff, extra.datum), wunsch_antwort (ref = Dienst, extra.person),
--   bewerbung (ref = Freizeit), vorschlag (ref = Vorschlag), manuell (extra.ziel, extra.titel, extra.text), test
-- Ergebnis: {"empfaenger": [person-ids], "titel": …, "text": …, "url": …}
create function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  v_schluessel text := md5(coalesce(p_extra::text, ''));
  empf uuid[] := '{}'; titel text; txt text; url text;
  n notizen; f freizeiten; t treffs; k dienstplan_kommentare; d dienste; v angebot_vorschlaege; b bewerbungen; w dienst_wuensche; v_datum date; ziel jsonb;
  frisch interval := interval '10 minutes';
begin
  if ich is null or not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;

  -- Bremse: gleiche Mitteilung nicht mehrfach, insgesamt nicht zu viele
  if exists (select 1 from mitteilungen_log where von_person = ich and art = p_art and ref is not distinct from p_ref
                and mitteilungen_log.schluessel = v_schluessel and created_at > now() - interval '2 minutes') then
    raise exception 'Diese Mitteilung wurde gerade schon gesendet' using errcode = 'check_violation';
  end if;
  if (select count(*) from mitteilungen_log where von_person = ich and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Zu viele Mitteilungen in kurzer Zeit' using errcode = 'check_violation';
  end if;

  if p_art = 'hinweis' then
    select * into n from notizen where id = p_ref and art = 'hinweis' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select tm.person_id from freizeit_team tm join personen p on p.id = tm.person_id where tm.freizeit_id = f.id and p.aktiv);
    titel := 'Neuer Hinweis · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_freizeit' then
    select * into n from notizen where id = p_ref and art = 'absprache' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select x from (
        select tm.person_id as x from freizeit_team tm where tm.freizeit_id = f.id and tm.rolle = 'leitung'
        union select id from personen where ist_koordination) q
      join personen p on p.id = q.x where p.aktiv);
    titel := 'Neue Absprache · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_treff' then
    select * into n from notizen where id = p_ref and art = 'absprache' and treff_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = n.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neue Absprache · ' || t.name; txt := left(n.text, 140); url := '/treffs/' || t.id || '/absprachen';

  elsif p_art = 'dienstplan' then
    select * into t from treffs where id = p_ref;
    if t.id is null or not (ist_koord() or ist_treffleitung(t.id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                   where tm.treff_id = t.id and p.aktiv and tm.person_id in (select jsonb_array_elements_text(coalesce(p_extra -> 'personen', '[]'::jsonb))::uuid));
    titel := 'Dienstplan · ' || t.name; txt := 'Dein Dienstplan wurde geändert.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'dienstplan_kommentar' then
    select * into k from dienstplan_kommentare where id = p_ref;
    if k.id is null or k.person_id is distinct from ich or k.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = k.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neuer Kommentar · ' || t.name; txt := fn_push_name(ich) || ': ' || left(k.text, 120); url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_neu' then
    v_datum := (p_extra ->> 'datum')::date;
    select * into t from treffs where id = p_ref;
    select dw.* into w from dienst_wuensche dw join dienste dd on dd.id = dw.dienst_id
     where dd.treff_id = p_ref and dd.datum = v_datum and not dd.ist_sonder and dw.person_id = ich and dw.status = 'offen' and dw.created_at >= now() - frisch;
    if t.id is null or w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv);
    titel := 'Neuer Dienstwunsch · ' || t.name; txt := fn_push_name(ich) || ' wünscht den Dienst am ' || to_char(v_datum, 'DD.MM.YYYY') || '.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_antwort' then
    select * into d from dienste where id = p_ref;
    if d.id is null or not (ist_koord() or ist_treffleitung(d.treff_id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into w from dienst_wuensche where dienst_id = d.id and person_id = (p_extra ->> 'person')::uuid and status <> 'offen' and entschieden_von = ich;
    if w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = d.treff_id;
    empf := array(select p.id from personen p where p.id = w.person_id and p.aktiv);
    titel := 'Dienstwunsch · ' || t.name;
    txt := 'Dein Wunsch für den ' || to_char(d.datum, 'DD.MM.YYYY') || ' wurde ' || case w.status when 'bestaetigt' then 'bestätigt.' else 'abgelehnt.' end;
    url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'bewerbung' then
    select * into b from bewerbungen where freizeit_id = p_ref and person_id = ich and created_at >= now() - frisch;
    if b.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = b.freizeit_id;
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := 'Neue Bewerbung'; txt := fn_push_name(ich) || ' bewirbt sich für ' || f.name || '.'; url := '/bewerbungen';

  elsif p_art = 'vorschlag' then
    select * into v from angebot_vorschlaege where id = p_ref and eingereicht_von = ich and created_at >= now() - frisch;
    if v.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := 'Neuer Katalog-Vorschlag'; txt := fn_push_name(ich) || ': ' || left(coalesce(v.daten ->> 'name', ''), 100); url := '/katalog/vorschlaege';

  elsif p_art = 'manuell' then
    if not ist_koord() then raise exception 'Nur die Koordination darf Mitteilungen an Gruppen senden' using errcode = '42501'; end if;
    titel := trim(coalesce(p_extra ->> 'titel', '')); txt := trim(coalesce(p_extra ->> 'text', ''));
    if length(titel) not between 1 and 80 then raise exception 'Der Titel braucht 1 bis 80 Zeichen' using errcode = 'check_violation'; end if;
    if length(txt) not between 1 and 300 then raise exception 'Der Text braucht 1 bis 300 Zeichen' using errcode = 'check_violation'; end if;
    ziel := p_extra -> 'ziel';
    empf := fn_push_ziel(ziel);
    url := '/';

  elsif p_art = 'test' then
    empf := array[ich]; titel := 'Testmitteilung'; txt := 'Mitteilungen funktionieren auf diesem Gerät.'; url := '/mehr';

  else
    raise exception 'Unbekannte Art der Mitteilung' using errcode = 'check_violation';
  end if;

  -- Die auslösende Person bekommt ihre eigene Mitteilung nie (außer beim Test)
  if p_art <> 'test' then empf := array(select x from unnest(empf) as x where x is distinct from ich); end if;
  empf := array(select distinct x from unnest(empf) as x);

  insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger) values (p_art, p_ref, v_schluessel, ich, coalesce(array_length(empf, 1), 0));
  return jsonb_build_object('empfaenger', to_jsonb(empf), 'titel', titel, 'text', txt, 'url', url);
end $$;

revoke execute on function fn_push_name(uuid), fn_push_ziel(jsonb), fn_push_vorschau(jsonb), fn_push_vorbereiten(text, uuid, jsonb) from public, anon;
grant execute on function fn_push_vorschau(jsonb), fn_push_vorbereiten(text, uuid, jsonb) to authenticated;
-- fn_push_name und fn_push_ziel sind Hilfen und nur innerhalb der anderen Funktionen nutzbar (die laufen mit Rechten des Besitzers)
revoke execute on function fn_push_name(uuid), fn_push_ziel(jsonb) from authenticated;

revoke all on mitteilungen_log from anon, authenticated;

-- ════════ 0016_tagesprotokoll.sql ════════
-- KiJuB-Kompass · 0016 Tagesprotokoll und Notizen der Treffs
--
-- Tagesprotokoll: ein Eintrag je Treff und Tag mit Anzahl der Kinder (m/w/d – nur Zahlen, keine Namen), Verlauf des Tages
-- und besonderen Vorkommnissen. Alle im Treff-Team und die Koordination dürfen jederzeit lesen und bearbeiten.
-- Notizen und Listen (To-dos, Einkauf, offene Fragen) gehören zum Treff, nicht zum Tag, und bleiben offen, bis sie erledigt sind.
-- Erinnerung: fn_protokoll_erinnerungen() sagt der Edge Function „push-senden“ (Aufruf per Zeitplan), wem sie „Protokoll fehlt“ schicken soll.

create table treff_protokolle (
  id             uuid primary key default gen_random_uuid(),
  treff_id       uuid not null references treffs(id) on delete cascade,
  datum          date not null,
  anz_m          int  not null default 0 check (anz_m between 0 and 500),
  anz_w          int  not null default 0 check (anz_w between 0 and 500),
  anz_d          int  not null default 0 check (anz_d between 0 and 500),
  verlauf        text not null default '' check (length(verlauf) <= 5000),
  vorkommnisse   text not null default '' check (length(vorkommnisse) <= 5000),
  erstellt_von   uuid references personen(id) on delete set null,
  bearbeitet_von uuid references personen(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (treff_id, datum)
);
create index treff_protokolle_datum on treff_protokolle (treff_id, datum desc);

create type treff_aufgabe_art as enum ('todo', 'einkauf', 'frage', 'sonstiges');

create table treff_aufgaben (
  id             uuid primary key default gen_random_uuid(),
  treff_id       uuid not null references treffs(id) on delete cascade,
  art            treff_aufgabe_art not null default 'todo',
  text           text not null check (length(trim(text)) between 1 and 1000),
  antwort        text check (antwort is null or length(antwort) <= 2000),
  faellig_am     date,
  zustaendig     uuid references personen(id) on delete set null,
  protokoll_datum date,                                          -- aus dem Protokoll dieses Tages angelegt (nur zur Orientierung)
  erledigt       boolean not null default false,
  erledigt_von   uuid references personen(id) on delete set null,
  erledigt_am    timestamptz,
  erstellt_von   uuid references personen(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index treff_aufgaben_treff on treff_aufgaben (treff_id, erledigt, created_at desc);

-- ===== Regeln und Automatik =====

create function fn_protokoll_pruefen() returns trigger
language plpgsql as $$
begin
  if new.datum > (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Ein Protokoll kann nicht für einen Tag in der Zukunft geschrieben werden' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von);
    new.created_at := now();
  else
    if new.treff_id is distinct from old.treff_id or new.datum is distinct from old.datum then
      raise exception 'Treff und Datum eines Protokolls lassen sich nicht ändern' using errcode = 'check_violation';
    end if;
    if new.erstellt_von is not null then new.erstellt_von := old.erstellt_von; end if;   -- leer werden darf der Verfasser nur, wenn die Person entfernt wird
    new.created_at := old.created_at;
  end if;
  new.bearbeitet_von := coalesce(meine_person_id(), new.bearbeitet_von);
  new.updated_at := now();
  return new;
end $$;
create trigger treff_protokolle_pruefen before insert or update on treff_protokolle for each row execute function fn_protokoll_pruefen();

create function fn_aufgabe_pruefen() returns trigger
language plpgsql as $$
begin
  if new.zustaendig is not null and not exists (select 1 from treff_team where treff_id = new.treff_id and person_id = new.zustaendig) then
    raise exception 'Zuständig kann nur jemand aus dem Team des Treffs sein' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von);
    new.created_at := now();
    new.erledigt_von := null; new.erledigt_am := null; new.erledigt := false;
  else
    if new.treff_id is distinct from old.treff_id then
      raise exception 'Eine Notiz lässt sich nicht in einen anderen Treff verschieben' using errcode = 'check_violation';
    end if;
    if new.erstellt_von is not null then new.erstellt_von := old.erstellt_von; end if;
    new.created_at := old.created_at;
    if new.erledigt and not old.erledigt then
      new.erledigt_von := meine_person_id(); new.erledigt_am := now();
    elsif not new.erledigt then
      new.erledigt_von := null; new.erledigt_am := null;
    else
      if new.erledigt_von is not null then new.erledigt_von := old.erledigt_von; end if;
      new.erledigt_am := old.erledigt_am;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger treff_aufgaben_pruefen before insert or update on treff_aufgaben for each row execute function fn_aufgabe_pruefen();

-- ===== Zugriff =====

alter table treff_protokolle enable row level security;
alter table treff_aufgaben   enable row level security;
revoke all on treff_protokolle, treff_aufgaben from anon;
grant select, insert, update, delete on treff_protokolle, treff_aufgaben to authenticated;

create policy lesen on treff_protokolle for select to authenticated using (ist_koord() or ist_im_treff(treff_id));
create policy anlegen on treff_protokolle for insert to authenticated with check (ist_koord() or ist_im_treff(treff_id));
create policy aendern on treff_protokolle for update to authenticated
  using (ist_koord() or ist_im_treff(treff_id)) with check (ist_koord() or ist_im_treff(treff_id));
create policy loeschen on treff_protokolle for delete to authenticated using (ist_koord() or ist_treffleitung(treff_id));

create policy alles on treff_aufgaben for all to authenticated
  using (ist_koord() or ist_im_treff(treff_id)) with check (ist_koord() or ist_im_treff(treff_id));

-- ===== Live-Aktualisierung =====
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['treff_protokolle', 'treff_aufgaben'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ===== Erinnerung „Protokoll fehlt“ =====
-- Ergebnis: [{"treff": uuid, "empfaenger": [person-ids], "titel": …, "text": …, "url": …}, …]
-- Ein Treff kommt dran, wenn heute (Ortszeit) geöffnet ist, die Öffnungszeit seit mindestens 15 Minuten (höchstens 3 Stunden) vorbei ist,
-- kein Feiertag ist, noch kein Protokoll für heute existiert und noch nicht erinnert wurde. Empfänger: Treffleitung und die heute Eingeteilten.
create function fn_protokoll_erinnerungen() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  jetzt timestamp := now() at time zone 'Europe/Berlin';
  heute date := jetzt::date;
  r record; empf uuid[]; ergebnis jsonb := '[]'::jsonb;
begin
  for r in
    select t.id, t.name from treffs t
      join treff_oeffnungszeiten o on o.treff_id = t.id and o.wochentag = extract(isodow from heute)::int
     where jetzt >= heute + o.bis + interval '15 minutes' and jetzt <= heute + o.bis + interval '3 hours'
       and not exists (select 1 from treff_protokolle p where p.treff_id = t.id and p.datum = heute)
       and not exists (select 1 from feiertage f where f.datum = heute and (f.treff_id is null or f.treff_id = t.id))
       and not exists (select 1 from mitteilungen_log l where l.art = 'protokoll_erinnerung' and l.ref = t.id and l.schluessel = heute::text)
  loop
    empf := array(select p.id from personen p where p.aktiv and p.id in (
        select tm.person_id from treff_team tm where tm.treff_id = r.id and tm.rolle = 'treffleitung'
        union
        select z.person_id from dienst_zuteilungen z join dienste d on d.id = z.dienst_id where d.treff_id = r.id and d.datum = heute));
    insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger)
    values ('protokoll_erinnerung', r.id, heute::text, null, coalesce(array_length(empf, 1), 0));
    if coalesce(array_length(empf, 1), 0) > 0 then
      ergebnis := ergebnis || jsonb_build_object('treff', r.id, 'empfaenger', to_jsonb(empf),
        'titel', 'Tagesprotokoll fehlt · ' || r.name, 'text', 'Bitte das Protokoll für heute eintragen.', 'url', '/treffs/' || r.id || '/protokoll');
    end if;
  end loop;
  return ergebnis;
end $$;

revoke execute on function fn_protokoll_pruefen(), fn_aufgabe_pruefen(), fn_protokoll_erinnerungen() from public, anon, authenticated;
grant execute on function fn_protokoll_erinnerungen() to service_role;

-- ════════ 0017_mitteilungen_mehr.sql ════════
-- KiJuB-Kompass · 0017 Mitteilungen: Bewerbung angenommen, Nachweis eingereicht, Lebensmittel knapp oder leer
--
-- Neue Arten für fn_push_vorbereiten (Empfänger und Text entscheidet weiterhin die Datenbank):
--   bewerbung_angenommen   → die Person, deren Bewerbung die Koordination gerade angenommen hat
--   nachweis_eingereicht   → Treffleitung des Treffs (ohne Treffleitung: Koordination), ausgelöst von der Person, die eingereicht hat
--   lebensmittel           → Koordination, wenn ein Artikel durch eine frische eigene Buchung knapp oder leer ist (je Artikel und Stand einmal in 24 Stunden)
-- Zusätzlich brauchen wir Zeitstempel, damit „frisch“ geprüft werden kann: Bewerbungen bekommen entschieden_am, Verbrauchsbuchungen created_at.
-- Beim Tagesprotokoll gibt es bewusst keine Mitteilung an die Koordination (nur die Erinnerung an Treffleitung und Eingeteilte aus 0016).

alter table bewerbungen add column entschieden_am timestamptz;
alter table lebensmittel_verbrauch add column created_at timestamptz not null default now();

create or replace function fn_bewerbung_annehmen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b bewerbungen;
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'angenommen', entschieden_von = meine_person_id(), entschieden_am = now()
   where id = p_id and status = 'offen' returning * into b;
  if b.id is null then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
  insert into freizeit_team (freizeit_id, person_id, rolle) values (b.freizeit_id, b.person_id, 'teamer')
    on conflict (freizeit_id, person_id) do nothing;
end $$;

create or replace function fn_bewerbung_ablehnen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'abgelehnt', entschieden_von = meine_person_id(), entschieden_am = now()
   where id = p_id and status = 'offen';
  if not found then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
end $$;

-- Kernfunktion. art:
--   hinweis, absprache_freizeit (ref = Notiz), absprache_treff (ref = Notiz), dienstplan (ref = Treff, extra.personen),
--   dienstplan_kommentar (ref = Kommentar), wunsch_neu (ref = Treff, extra.datum), wunsch_antwort (ref = Dienst, extra.person),
--   bewerbung (ref = Freizeit), vorschlag (ref = Vorschlag), manuell (extra.ziel, extra.titel, extra.text), test,
--   bewerbung_angenommen (ref = Bewerbung), nachweis_eingereicht (ref = Nachweis), lebensmittel (ref = Ort, extra.name = Artikel)
-- Ergebnis: {"empfaenger": [person-ids], "titel": …, "text": …, "url": …}
create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  v_schluessel text := md5(coalesce(p_extra::text, ''));
  empf uuid[] := '{}'; titel text; txt text; url text;
  n notizen; f freizeiten; t treffs; k dienstplan_kommentare; d dienste; v angebot_vorschlaege; b bewerbungen; w dienst_wuensche; v_datum date; ziel jsonb;
  frisch interval := interval '10 minutes';
  bw bewerbungen; zn zeitnachweise; lv lebensmittel_verbrauch; lb record; v_name text; v_ort text; v_rest text;
  monate text[] := array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
begin
  if ich is null or not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;

  -- Bremse: gleiche Mitteilung nicht mehrfach, insgesamt nicht zu viele
  if exists (select 1 from mitteilungen_log where von_person = ich and art = p_art and ref is not distinct from p_ref
                and mitteilungen_log.schluessel = v_schluessel and created_at > now() - interval '2 minutes') then
    raise exception 'Diese Mitteilung wurde gerade schon gesendet' using errcode = 'check_violation';
  end if;
  if (select count(*) from mitteilungen_log where von_person = ich and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Zu viele Mitteilungen in kurzer Zeit' using errcode = 'check_violation';
  end if;

  if p_art = 'hinweis' then
    select * into n from notizen where id = p_ref and art = 'hinweis' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select tm.person_id from freizeit_team tm join personen p on p.id = tm.person_id where tm.freizeit_id = f.id and p.aktiv);
    titel := 'Neuer Hinweis · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_freizeit' then
    select * into n from notizen where id = p_ref and art = 'absprache' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select x from (
        select tm.person_id as x from freizeit_team tm where tm.freizeit_id = f.id and tm.rolle = 'leitung'
        union select id from personen where ist_koordination) q
      join personen p on p.id = q.x where p.aktiv);
    titel := 'Neue Absprache · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_treff' then
    select * into n from notizen where id = p_ref and art = 'absprache' and treff_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = n.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neue Absprache · ' || t.name; txt := left(n.text, 140); url := '/treffs/' || t.id || '/absprachen';

  elsif p_art = 'dienstplan' then
    select * into t from treffs where id = p_ref;
    if t.id is null or not (ist_koord() or ist_treffleitung(t.id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                   where tm.treff_id = t.id and p.aktiv and tm.person_id in (select jsonb_array_elements_text(coalesce(p_extra -> 'personen', '[]'::jsonb))::uuid));
    titel := 'Dienstplan · ' || t.name; txt := 'Dein Dienstplan wurde geändert.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'dienstplan_kommentar' then
    select * into k from dienstplan_kommentare where id = p_ref;
    if k.id is null or k.person_id is distinct from ich or k.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = k.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neuer Kommentar · ' || t.name; txt := fn_push_name(ich) || ': ' || left(k.text, 120); url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_neu' then
    v_datum := (p_extra ->> 'datum')::date;
    select * into t from treffs where id = p_ref;
    select dw.* into w from dienst_wuensche dw join dienste dd on dd.id = dw.dienst_id
     where dd.treff_id = p_ref and dd.datum = v_datum and not dd.ist_sonder and dw.person_id = ich and dw.status = 'offen' and dw.created_at >= now() - frisch;
    if t.id is null or w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv);
    titel := 'Neuer Dienstwunsch · ' || t.name; txt := fn_push_name(ich) || ' wünscht den Dienst am ' || to_char(v_datum, 'DD.MM.YYYY') || '.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_antwort' then
    select * into d from dienste where id = p_ref;
    if d.id is null or not (ist_koord() or ist_treffleitung(d.treff_id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into w from dienst_wuensche where dienst_id = d.id and person_id = (p_extra ->> 'person')::uuid and status <> 'offen' and entschieden_von = ich;
    if w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = d.treff_id;
    empf := array(select p.id from personen p where p.id = w.person_id and p.aktiv);
    titel := 'Dienstwunsch · ' || t.name;
    txt := 'Dein Wunsch für den ' || to_char(d.datum, 'DD.MM.YYYY') || ' wurde ' || case w.status when 'bestaetigt' then 'bestätigt.' else 'abgelehnt.' end;
    url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'bewerbung' then
    select * into b from bewerbungen where freizeit_id = p_ref and person_id = ich and created_at >= now() - frisch;
    if b.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = b.freizeit_id;
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := 'Neue Bewerbung'; txt := fn_push_name(ich) || ' bewirbt sich für ' || f.name || '.'; url := '/bewerbungen';

  elsif p_art = 'vorschlag' then
    select * into v from angebot_vorschlaege where id = p_ref and eingereicht_von = ich and created_at >= now() - frisch;
    if v.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := 'Neuer Katalog-Vorschlag'; txt := fn_push_name(ich) || ': ' || left(coalesce(v.daten ->> 'name', ''), 100); url := '/katalog/vorschlaege';

  elsif p_art = 'bewerbung_angenommen' then
    if not ist_koord() then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into bw from bewerbungen where id = p_ref and status = 'angenommen' and entschieden_von = ich and entschieden_am >= now() - frisch;
    if bw.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = bw.freizeit_id;
    empf := array(select id from personen where id = bw.person_id and aktiv);
    titel := 'Bewerbung angenommen';
    txt := 'Du bist dabei: ' || f.name || ' (' || to_char(f.start_datum, 'DD.MM.YYYY') || ' – ' || to_char(f.ende_datum, 'DD.MM.YYYY') || ').';
    url := '/freizeiten/' || f.id;

  elsif p_art = 'nachweis_eingereicht' then
    select * into zn from zeitnachweise where id = p_ref and person_id = ich and status = 'eingereicht' and updated_at >= now() - frisch;
    if zn.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = zn.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv);
    if coalesce(array_length(empf, 1), 0) = 0 then empf := array(select id from personen where ist_koordination and aktiv); end if;      -- ohne Treffleitung: Koordination
    titel := 'Nachweis eingereicht · ' || t.name;
    txt := fn_push_name(ich) || ' hat den Nachweis für ' || monate[extract(month from zn.monat)::int] || ' ' || extract(year from zn.monat)::int || ' eingereicht.';
    url := '/treffs/' || t.id || '/nachweis';

  elsif p_art = 'lebensmittel' then
    -- Ein Artikel ist nach einer eigenen, frischen Buchung knapp oder leer geworden: die Koordination kauft nach.
    -- Ist er es nicht, oder wurde diese Lage schon gemeldet (24 Stunden, gleicher Stand), gibt es keine Empfänger und kein Protokoll.
    v_name := trim(coalesce(p_extra ->> 'name', ''));
    select * into lv from lebensmittel_verbrauch where ort_id = p_ref and name = v_name and erstellt_von = ich and created_at >= now() - frisch order by created_at desc limit 1;
    if lv.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into lb from v_lebensmittel_bestand where ort_id = p_ref and name = v_name;
    if lb.name is null or lb.status not in ('knapp', 'leer') then
      return jsonb_build_object('empfaenger', '[]'::jsonb, 'titel', '', 'text', '', 'url', '');
    end if;
    v_schluessel := md5(p_ref::text || '|' || v_name || '|' || lb.status);
    if exists (select 1 from mitteilungen_log where art = 'lebensmittel' and ref = p_ref and mitteilungen_log.schluessel = v_schluessel and created_at > now() - interval '24 hours') then
      return jsonb_build_object('empfaenger', '[]'::jsonb, 'titel', '', 'text', '', 'url', '');
    end if;
    select name into v_ort from orte where id = p_ref;
    v_rest := replace(rtrim(rtrim(to_char(lb.rest, 'FM999990.00'), '0'), '.'), '.', ',');
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := case lb.status when 'leer' then 'Lebensmittel aufgebraucht' else 'Lebensmittel knapp' end;
    txt := coalesce(v_ort, 'Ort') || ': ' || v_name || case lb.status when 'leer' then ' ist aufgebraucht.' else ' wird knapp (noch ' || v_rest || coalesce(' ' || lb.einheit, '') || ').' end;
    url := case when lv.freizeit_id is not null then '/freizeiten/' || lv.freizeit_id || '/lebensmittel' else '/freizeiten' end;

  elsif p_art = 'manuell' then
    if not ist_koord() then raise exception 'Nur die Koordination darf Mitteilungen an Gruppen senden' using errcode = '42501'; end if;
    titel := trim(coalesce(p_extra ->> 'titel', '')); txt := trim(coalesce(p_extra ->> 'text', ''));
    if length(titel) not between 1 and 80 then raise exception 'Der Titel braucht 1 bis 80 Zeichen' using errcode = 'check_violation'; end if;
    if length(txt) not between 1 and 300 then raise exception 'Der Text braucht 1 bis 300 Zeichen' using errcode = 'check_violation'; end if;
    ziel := p_extra -> 'ziel';
    empf := fn_push_ziel(ziel);
    url := '/';

  elsif p_art = 'test' then
    empf := array[ich]; titel := 'Testmitteilung'; txt := 'Mitteilungen funktionieren auf diesem Gerät.'; url := '/mehr';

  else
    raise exception 'Unbekannte Art der Mitteilung' using errcode = 'check_violation';
  end if;

  -- Die auslösende Person bekommt ihre eigene Mitteilung nie (außer beim Test)
  if p_art <> 'test' then empf := array(select x from unnest(empf) as x where x is distinct from ich); end if;
  empf := array(select distinct x from unnest(empf) as x);

  insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger) values (p_art, p_ref, v_schluessel, ich, coalesce(array_length(empf, 1), 0));
  return jsonb_build_object('empfaenger', to_jsonb(empf), 'titel', titel, 'text', txt, 'url', url);
end $$;

-- ════════ 0018_koordination_getrennt.sql ════════
-- KiJuB-Kompass · 0018 Koordination getrennt: Freizeitenkoordination und Treffkoordination
--
-- Bisher gab es eine einzige Koordination mit allen Rechten. Jetzt gibt es zwei Bereiche – eine Person kann beide sein:
--   Freizeitenkoordination: Freizeiten (Stammdaten, Team, Wochenplan, Hinweise, Absprachen), Bewerbungen, Lebensmittel, KiJuKo-Import
--   Treffkoordination:      Treffs (Stammdaten, Team, Öffnungszeiten, Wochenprogramm), Dienstplan, Wünsche, Abwesenheiten, Feiertage,
--                           Nachweise, Tagesprotokolle, Notizen, Treff-Absprachen
--   Gemeinsam (jede der beiden): Personen und Zugänge, Orte, Katalog, Quiz, Mappen, Einstellungen, manuelle Mitteilungen
--                           (an Freizeiten nur Freizeitenkoordination, an Treffs nur Treffkoordination)
-- Bestehende Koordinationen bekommen beide Bereiche – es ändert sich für niemanden etwas, bis die Bereiche getrennt vergeben werden.
-- „ist_koordination“ bleibt als abgeleitete Angabe „Koordination irgendeines Bereichs“ erhalten (ist_koord() und der Altbestand nutzen sie).

alter table personen
  add column ist_freizeitkoordination boolean not null default false,
  add column ist_treffkoordination    boolean not null default false;
update personen set ist_freizeitkoordination = ist_koordination, ist_treffkoordination = ist_koordination where ist_koordination;

-- ist_koordination = Freizeiten- ODER Treffkoordination. Wer (wie Altcode und Import) nur ist_koordination setzt, meint beide Bereiche.
create function fn_koordination_abgleichen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.ist_koordination and not new.ist_freizeitkoordination and not new.ist_treffkoordination then
      new.ist_freizeitkoordination := true; new.ist_treffkoordination := true;
    end if;
  elsif new.ist_koordination is distinct from old.ist_koordination
        and new.ist_freizeitkoordination is not distinct from old.ist_freizeitkoordination
        and new.ist_treffkoordination is not distinct from old.ist_treffkoordination then
    new.ist_freizeitkoordination := new.ist_koordination; new.ist_treffkoordination := new.ist_koordination;
  end if;
  new.ist_koordination := new.ist_freizeitkoordination or new.ist_treffkoordination;
  return new;
end $$;
-- Der Name sorgt dafür, dass dieser Abgleich vor dem Schutz der letzten Koordination läuft
create trigger koord_00_abgleichen before insert or update on personen for each row execute function fn_koordination_abgleichen();

-- Die letzte aktive Person je Bereich darf weder gelöscht noch deaktiviert noch herabgestuft werden.
create or replace function fn_letzte_koordination_schuetzen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.ist_freizeitkoordination and old.aktiv
     and (tg_op = 'DELETE' or not new.ist_freizeitkoordination or not new.aktiv) then
    if not exists (select 1 from personen p where p.id <> old.id and p.ist_freizeitkoordination and p.aktiv) then
      raise exception 'Die letzte aktive Koordination der Freizeiten kann nicht gelöscht, deaktiviert oder herabgestuft werden'
        using errcode = 'check_violation';
    end if;
  end if;
  if old.ist_treffkoordination and old.aktiv
     and (tg_op = 'DELETE' or not new.ist_treffkoordination or not new.aktiv) then
    if not exists (select 1 from personen p where p.id <> old.id and p.ist_treffkoordination and p.aktiv) then
      raise exception 'Die letzte aktive Koordination der Treffs kann nicht gelöscht, deaktiviert oder herabgestuft werden'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger letzte_koordination_schuetzen on personen;
create trigger letzte_koordination_schuetzen
  before update of ist_koordination, ist_freizeitkoordination, ist_treffkoordination, aktiv or delete on personen
  for each row execute function fn_letzte_koordination_schuetzen();

-- ===== Hilfsfunktionen =====
create function ist_freizeitkoord() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select ist_freizeitkoordination from personen where auth_user_id = auth.uid() and aktiv), false)
$$;
create function ist_treffkoord() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select ist_treffkoordination from personen where auth_user_id = auth.uid() and aktiv), false)
$$;
revoke execute on function ist_freizeitkoord(), ist_treffkoord(), fn_koordination_abgleichen() from public, anon;
grant execute on function ist_freizeitkoord(), ist_treffkoord() to authenticated;

-- Hinweise und Absprachen: Freizeit-Notizen betreffen die Freizeitenkoordination, Treff-Notizen die Treffkoordination
create or replace function notiz_sichtbar(fid uuid, tid uuid, a notiz_art) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (fid is not null and ist_freizeitkoord())
      or (tid is not null and ist_treffkoord())
      or (fid is not null and a = 'hinweis'   and ist_im_team(fid))
      or (fid is not null and a = 'absprache' and ist_leitung(fid))
      or (tid is not null and ist_im_treff(tid))
$$;

create or replace function darf_notiz_schreiben(fid uuid, tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (fid is not null and (ist_freizeitkoord() or ist_leitung(fid)))
      or (tid is not null and (ist_treffkoord() or ist_treffleitung(tid)))
$$;

create or replace function darf_notiz_bestaetigen(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and (
       (n.freizeit_id is not null and n.art = 'hinweis'   and ist_teamer(n.freizeit_id))
    or (n.freizeit_id is not null and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_freizeitkoord()))
    or (n.treff_id    is not null and (ist_im_treff(n.treff_id) or ist_treffkoord()))))
$$;

create or replace function darf_notiz_kommentieren(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and n.freizeit_id is not null
                    and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_freizeitkoord()))
$$;

-- Sichten: Kontaktdaten der Teams sehen Leitung bzw. die Koordination des jeweiligen Bereichs
create or replace view v_team_freizeit as
  select t.freizeit_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.mail            end as mail,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.telefon         end as telefon,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.ernaehrung::text end as ernaehrung,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.notizen         end as notizen,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.tzk_max_stunden end as tzk_max_stunden
    from freizeit_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_team(t.freizeit_id) or ist_freizeitkoord());

create or replace view v_team_treff as
  select t.treff_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.mail            end as mail,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.telefon         end as telefon,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.tzk_max_stunden end as tzk_max_stunden
    from treff_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_treff(t.treff_id) or ist_treffkoord());

-- ===== Zugriffsregeln der Tabellen und Funktionen je Bereich umstellen =====
-- Die Regeln selbst bleiben unverändert; nur „ist_koord()“ (irgendeine Koordination) wird durch die Koordination des Bereichs ersetzt.
do $$
declare r record; q text; w text;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname, p.qual, p.with_check,
           case when p.tablename = any(array['freizeiten', 'freizeit_team', 'freizeit_slots', 'plan_eintraege', 'freizeit_verpflegung', 'freizeit_material', 'freizeit_tags', 'lebensmittel_eingang', 'lebensmittel_verbrauch', 'bewerbungen', 'import_laeufe', 'import_staende', 'notiz_kommentare']) then 'ist_freizeitkoord()' else 'ist_treffkoord()' end as ziel
      from pg_policies p
     where p.schemaname = 'public' and p.tablename = any(array['freizeiten', 'freizeit_team', 'freizeit_slots', 'plan_eintraege', 'freizeit_verpflegung', 'freizeit_material', 'freizeit_tags', 'lebensmittel_eingang', 'lebensmittel_verbrauch', 'bewerbungen', 'import_laeufe', 'import_staende', 'notiz_kommentare'] || array['treffs', 'treff_team', 'treff_oeffnungszeiten', 'treff_plan_eintraege', 'dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'dienstplan_kommentare', 'abwesenheiten', 'feiertage', 'zeitnachweise', 'zeitnachweis_zeilen', 'treff_protokolle', 'treff_aufgaben'])
  loop
    q := replace(r.qual, 'ist_koord()', r.ziel);
    w := replace(r.with_check, 'ist_koord()', r.ziel);
    if q is distinct from r.qual or w is distinct from r.with_check then
      execute format('alter policy %I on %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
        case when r.qual is not null then format('using (%s)', q) else '' end,
        case when r.with_check is not null then format('with check (%s)', w) else '' end);
    end if;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid, p.proname,
           case when p.proname = any(array['fn_bewerbung_annehmen', 'fn_bewerbung_ablehnen', 'fn_kijuko_import']) then 'ist_freizeitkoord()' else 'ist_treffkoord()' end as ziel
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any(array['fn_bewerbung_annehmen', 'fn_bewerbung_ablehnen', 'fn_kijuko_import'] || array['fn_dienste_monatsmuster', 'fn_dienst_statistik', 'fn_nachweis_befuellen', 'fn_dienst_sicherstellen', 'fn_wunsch_entscheiden', 'fn_nachweis_status_pruefen', 'darf_treffmappe'])
  loop
    execute replace(pg_get_functiondef(r.oid), 'ist_koord()', r.ziel);
  end loop;
end $$;

-- ===== Mitteilungen =====
create or replace function fn_push_ziel(p_ziel jsonb) returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a text := p_ziel ->> 'art'; r text := nullif(p_ziel ->> 'rolle', ''); k text := p_ziel ->> 'kategorie'; i uuid; ergebnis uuid[];
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Mitteilungen an Gruppen senden' using errcode = '42501'; end if;
  if a = 'freizeit' and not ist_freizeitkoord() then raise exception 'Nur die Freizeitenkoordination darf an Freizeiten senden' using errcode = '42501'; end if;
  if a = 'treff' and not ist_treffkoord() then raise exception 'Nur die Treffkoordination darf an Treffs senden' using errcode = '42501'; end if;
  if a = 'alle' then
    ergebnis := array(select id from personen where aktiv);
  elsif a = 'koordination' then
    ergebnis := array(select id from personen where aktiv and ist_koordination);
  elsif a = 'kategorie' then
    if k = 'leitung' then
      ergebnis := array(select p.id from personen p where p.aktiv and (
        exists (select 1 from freizeit_team t where t.person_id = p.id and t.rolle = 'leitung')
        or exists (select 1 from treff_team t where t.person_id = p.id and t.rolle = 'treffleitung')));
    elsif k = 'teamer' then
      ergebnis := array(select p.id from personen p where p.aktiv and (
        exists (select 1 from freizeit_team t where t.person_id = p.id and t.rolle = 'teamer')
        or exists (select 1 from treff_team t where t.person_id = p.id and t.rolle = 'betreuerin')));
    else raise exception 'Unbekannte Kategorie' using errcode = 'check_violation'; end if;
  elsif a = 'freizeit' then
    i := (p_ziel ->> 'id')::uuid;
    if r is not null and r not in ('leitung', 'teamer') then raise exception 'Unbekannte Rolle' using errcode = 'check_violation'; end if;
    ergebnis := array(select t.person_id from freizeit_team t join personen p on p.id = t.person_id
                       where t.freizeit_id = i and p.aktiv and (r is null or t.rolle::text = r));
  elsif a = 'treff' then
    i := (p_ziel ->> 'id')::uuid;
    if r is not null and r not in ('treffleitung', 'betreuerin') then raise exception 'Unbekannte Rolle' using errcode = 'check_violation'; end if;
    ergebnis := array(select t.person_id from treff_team t join personen p on p.id = t.person_id
                       where t.treff_id = i and p.aktiv and (r is null or t.rolle::text = r));
  else
    raise exception 'Unbekanntes Ziel' using errcode = 'check_violation';
  end if;
  return coalesce(ergebnis, '{}');
end $$;

-- Kernfunktion. art:
--   hinweis, absprache_freizeit (ref = Notiz), absprache_treff (ref = Notiz), dienstplan (ref = Treff, extra.personen),
--   dienstplan_kommentar (ref = Kommentar), wunsch_neu (ref = Treff, extra.datum), wunsch_antwort (ref = Dienst, extra.person),
--   bewerbung (ref = Freizeit), vorschlag (ref = Vorschlag), manuell (extra.ziel, extra.titel, extra.text), test,
--   (ab 0018 je nach Bereich an die Freizeiten- bzw. Treffkoordination)
--   bewerbung_angenommen (ref = Bewerbung), nachweis_eingereicht (ref = Nachweis), lebensmittel (ref = Ort, extra.name = Artikel)
-- Ergebnis: {"empfaenger": [person-ids], "titel": …, "text": …, "url": …}
create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  v_schluessel text := md5(coalesce(p_extra::text, ''));
  empf uuid[] := '{}'; titel text; txt text; url text;
  n notizen; f freizeiten; t treffs; k dienstplan_kommentare; d dienste; v angebot_vorschlaege; b bewerbungen; w dienst_wuensche; v_datum date; ziel jsonb;
  frisch interval := interval '10 minutes';
  bw bewerbungen; zn zeitnachweise; lv lebensmittel_verbrauch; lb record; v_name text; v_ort text; v_rest text;
  monate text[] := array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
begin
  if ich is null or not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;

  -- Bremse: gleiche Mitteilung nicht mehrfach, insgesamt nicht zu viele
  if exists (select 1 from mitteilungen_log where von_person = ich and art = p_art and ref is not distinct from p_ref
                and mitteilungen_log.schluessel = v_schluessel and created_at > now() - interval '2 minutes') then
    raise exception 'Diese Mitteilung wurde gerade schon gesendet' using errcode = 'check_violation';
  end if;
  if (select count(*) from mitteilungen_log where von_person = ich and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Zu viele Mitteilungen in kurzer Zeit' using errcode = 'check_violation';
  end if;

  if p_art = 'hinweis' then
    select * into n from notizen where id = p_ref and art = 'hinweis' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select tm.person_id from freizeit_team tm join personen p on p.id = tm.person_id where tm.freizeit_id = f.id and p.aktiv);
    titel := 'Neuer Hinweis · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_freizeit' then
    select * into n from notizen where id = p_ref and art = 'absprache' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select x from (
        select tm.person_id as x from freizeit_team tm where tm.freizeit_id = f.id and tm.rolle = 'leitung'
        union select id from personen where ist_freizeitkoordination) q
      join personen p on p.id = q.x where p.aktiv);
    titel := 'Neue Absprache · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_treff' then
    select * into n from notizen where id = p_ref and art = 'absprache' and treff_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = n.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neue Absprache · ' || t.name; txt := left(n.text, 140); url := '/treffs/' || t.id || '/absprachen';

  elsif p_art = 'dienstplan' then
    select * into t from treffs where id = p_ref;
    if t.id is null or not (ist_treffkoord() or ist_treffleitung(t.id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                   where tm.treff_id = t.id and p.aktiv and tm.person_id in (select jsonb_array_elements_text(coalesce(p_extra -> 'personen', '[]'::jsonb))::uuid));
    titel := 'Dienstplan · ' || t.name; txt := 'Dein Dienstplan wurde geändert.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'dienstplan_kommentar' then
    select * into k from dienstplan_kommentare where id = p_ref;
    if k.id is null or k.person_id is distinct from ich or k.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = k.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neuer Kommentar · ' || t.name; txt := fn_push_name(ich) || ': ' || left(k.text, 120); url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_neu' then
    v_datum := (p_extra ->> 'datum')::date;
    select * into t from treffs where id = p_ref;
    select dw.* into w from dienst_wuensche dw join dienste dd on dd.id = dw.dienst_id
     where dd.treff_id = p_ref and dd.datum = v_datum and not dd.ist_sonder and dw.person_id = ich and dw.status = 'offen' and dw.created_at >= now() - frisch;
    if t.id is null or w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv);
    titel := 'Neuer Dienstwunsch · ' || t.name; txt := fn_push_name(ich) || ' wünscht den Dienst am ' || to_char(v_datum, 'DD.MM.YYYY') || '.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_antwort' then
    select * into d from dienste where id = p_ref;
    if d.id is null or not (ist_treffkoord() or ist_treffleitung(d.treff_id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into w from dienst_wuensche where dienst_id = d.id and person_id = (p_extra ->> 'person')::uuid and status <> 'offen' and entschieden_von = ich;
    if w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = d.treff_id;
    empf := array(select p.id from personen p where p.id = w.person_id and p.aktiv);
    titel := 'Dienstwunsch · ' || t.name;
    txt := 'Dein Wunsch für den ' || to_char(d.datum, 'DD.MM.YYYY') || ' wurde ' || case w.status when 'bestaetigt' then 'bestätigt.' else 'abgelehnt.' end;
    url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'bewerbung' then
    select * into b from bewerbungen where freizeit_id = p_ref and person_id = ich and created_at >= now() - frisch;
    if b.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = b.freizeit_id;
    empf := array(select id from personen where ist_freizeitkoordination and aktiv);
    titel := 'Neue Bewerbung'; txt := fn_push_name(ich) || ' bewirbt sich für ' || f.name || '.'; url := '/bewerbungen';

  elsif p_art = 'vorschlag' then
    select * into v from angebot_vorschlaege where id = p_ref and eingereicht_von = ich and created_at >= now() - frisch;
    if v.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := 'Neuer Katalog-Vorschlag'; txt := fn_push_name(ich) || ': ' || left(coalesce(v.daten ->> 'name', ''), 100); url := '/katalog/vorschlaege';

  elsif p_art = 'bewerbung_angenommen' then
    if not ist_freizeitkoord() then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into bw from bewerbungen where id = p_ref and status = 'angenommen' and entschieden_von = ich and entschieden_am >= now() - frisch;
    if bw.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = bw.freizeit_id;
    empf := array(select id from personen where id = bw.person_id and aktiv);
    titel := 'Bewerbung angenommen';
    txt := 'Du bist dabei: ' || f.name || ' (' || to_char(f.start_datum, 'DD.MM.YYYY') || ' – ' || to_char(f.ende_datum, 'DD.MM.YYYY') || ').';
    url := '/freizeiten/' || f.id;

  elsif p_art = 'nachweis_eingereicht' then
    select * into zn from zeitnachweise where id = p_ref and person_id = ich and status = 'eingereicht' and updated_at >= now() - frisch;
    if zn.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = zn.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv);
    if coalesce(array_length(empf, 1), 0) = 0 then empf := array(select id from personen where ist_treffkoordination and aktiv); end if;      -- ohne Treffleitung: Koordination
    titel := 'Nachweis eingereicht · ' || t.name;
    txt := fn_push_name(ich) || ' hat den Nachweis für ' || monate[extract(month from zn.monat)::int] || ' ' || extract(year from zn.monat)::int || ' eingereicht.';
    url := '/treffs/' || t.id || '/nachweis';

  elsif p_art = 'lebensmittel' then
    -- Ein Artikel ist nach einer eigenen, frischen Buchung knapp oder leer geworden: die Koordination kauft nach.
    -- Ist er es nicht, oder wurde diese Lage schon gemeldet (24 Stunden, gleicher Stand), gibt es keine Empfänger und kein Protokoll.
    v_name := trim(coalesce(p_extra ->> 'name', ''));
    select * into lv from lebensmittel_verbrauch where ort_id = p_ref and name = v_name and erstellt_von = ich and created_at >= now() - frisch order by created_at desc limit 1;
    if lv.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into lb from v_lebensmittel_bestand where ort_id = p_ref and name = v_name;
    if lb.name is null or lb.status not in ('knapp', 'leer') then
      return jsonb_build_object('empfaenger', '[]'::jsonb, 'titel', '', 'text', '', 'url', '');
    end if;
    v_schluessel := md5(p_ref::text || '|' || v_name || '|' || lb.status);
    if exists (select 1 from mitteilungen_log where art = 'lebensmittel' and ref = p_ref and mitteilungen_log.schluessel = v_schluessel and created_at > now() - interval '24 hours') then
      return jsonb_build_object('empfaenger', '[]'::jsonb, 'titel', '', 'text', '', 'url', '');
    end if;
    select name into v_ort from orte where id = p_ref;
    v_rest := replace(rtrim(rtrim(to_char(lb.rest, 'FM999990.00'), '0'), '.'), '.', ',');
    empf := array(select id from personen where ist_freizeitkoordination and aktiv);
    titel := case lb.status when 'leer' then 'Lebensmittel aufgebraucht' else 'Lebensmittel knapp' end;
    txt := coalesce(v_ort, 'Ort') || ': ' || v_name || case lb.status when 'leer' then ' ist aufgebraucht.' else ' wird knapp (noch ' || v_rest || coalesce(' ' || lb.einheit, '') || ').' end;
    url := case when lv.freizeit_id is not null then '/freizeiten/' || lv.freizeit_id || '/lebensmittel' else '/freizeiten' end;

  elsif p_art = 'manuell' then
    if not ist_koord() then raise exception 'Nur die Koordination darf Mitteilungen an Gruppen senden' using errcode = '42501'; end if;
    titel := trim(coalesce(p_extra ->> 'titel', '')); txt := trim(coalesce(p_extra ->> 'text', ''));
    if length(titel) not between 1 and 80 then raise exception 'Der Titel braucht 1 bis 80 Zeichen' using errcode = 'check_violation'; end if;
    if length(txt) not between 1 and 300 then raise exception 'Der Text braucht 1 bis 300 Zeichen' using errcode = 'check_violation'; end if;
    ziel := p_extra -> 'ziel';
    empf := fn_push_ziel(ziel);
    url := '/';

  elsif p_art = 'test' then
    empf := array[ich]; titel := 'Testmitteilung'; txt := 'Mitteilungen funktionieren auf diesem Gerät.'; url := '/mehr';

  else
    raise exception 'Unbekannte Art der Mitteilung' using errcode = 'check_violation';
  end if;

  -- Die auslösende Person bekommt ihre eigene Mitteilung nie (außer beim Test)
  if p_art <> 'test' then empf := array(select x from unnest(empf) as x where x is distinct from ich); end if;
  empf := array(select distinct x from unnest(empf) as x);

  insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger) values (p_art, p_ref, v_schluessel, ich, coalesce(array_length(empf, 1), 0));
  return jsonb_build_object('empfaenger', to_jsonb(empf), 'titel', titel, 'text', txt, 'url', url);
end $$;

-- ════════ 0019_fehlermeldungen.sql ════════
-- KiJuB-Kompass · 0019 Fehlermeldungen
--
-- Wenn in der App etwas Unerwartetes schiefgeht, meldet sie das selbsttätig – ohne Personendaten: keine Person, keine Namen,
-- keine Kennungen in Adresse und Text. Gleiche Fehler (gleiche Version, Seite und Meldung) werden gezählt, nicht vervielfacht.
-- Lesen, abhaken und löschen darf jede Koordination; melden geht nur über die Funktion (mit Begrenzung gegen Überflutung).
-- Meldungen werden nach 90 Tagen ohne Wiederholung gelöscht.

create table fehlermeldungen (
  id        uuid primary key default gen_random_uuid(),
  version   text not null check (length(version) <= 40),
  seite     text not null check (length(seite) <= 200),       -- Adresse ohne Kennungen, z. B. /treffs/:id/protokoll
  meldung   text not null check (length(meldung) <= 400),
  stapel    text check (stapel is null or length(stapel) <= 1500),
  anzahl    int  not null default 1,
  erstmals  timestamptz not null default now(),
  zuletzt   timestamptz not null default now(),
  erledigt  boolean not null default false
);
create unique index fehlermeldungen_gleich on fehlermeldungen (version, seite, meldung);
create index fehlermeldungen_zuletzt on fehlermeldungen (zuletzt desc);

alter table fehlermeldungen enable row level security;
revoke all on fehlermeldungen from anon;
revoke insert on fehlermeldungen from authenticated;
grant select, update, delete on fehlermeldungen to authenticated;
create policy lesen     on fehlermeldungen for select to authenticated using (ist_koord());
create policy aendern   on fehlermeldungen for update to authenticated using (ist_koord()) with check (ist_koord());
create policy loeschen  on fehlermeldungen for delete to authenticated using (ist_koord());

-- Entfernt alles, was nach einer Person oder Kennung aussieht: UUIDs, Mail-Adressen, Telefon- und lange Zahlenfolgen.
create function fn_fehler_bereinigen(t text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(t, ''), '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
             '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[mail]', 'g'),
           '\+?[0-9][0-9 /()-]{6,}[0-9]', '[zahl]', 'g')
$$;

-- Meldet einen Fehler. Nur angemeldete Personen; die Datenbank bereinigt noch einmal, begrenzt die Menge
-- (höchstens 300 Meldungen pro Stunde insgesamt) und räumt alte Einträge auf.
create function fn_fehler_melden(p_version text, p_seite text, p_meldung text, p_stapel text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v text; s text; m text; st text;
begin
  if not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if (select coalesce(sum(anzahl), 0) from fehlermeldungen where zuletzt > now() - interval '1 hour') >= 300 then return; end if;
  v := left(trim(coalesce(p_version, '')), 40);
  s := left(fn_fehler_bereinigen(p_seite), 200);
  m := trim(left(fn_fehler_bereinigen(p_meldung), 400));
  st := nullif(left(fn_fehler_bereinigen(p_stapel), 1500), '');
  if m = '' then return; end if;
  insert into fehlermeldungen (version, seite, meldung, stapel) values (coalesce(nullif(v, ''), 'unbekannt'), coalesce(nullif(s, ''), '/'), m, st)
  on conflict (version, seite, meldung)
  do update set anzahl = fehlermeldungen.anzahl + 1, zuletzt = now(), erledigt = false, stapel = coalesce(fehlermeldungen.stapel, excluded.stapel);
  delete from fehlermeldungen where zuletzt < now() - interval '90 days';
end $$;

revoke execute on function fn_fehler_bereinigen(text), fn_fehler_melden(text, text, text, text) from public, anon;
grant execute on function fn_fehler_melden(text, text, text, text) to authenticated;
revoke execute on function fn_fehler_bereinigen(text) from authenticated;

-- ════════ 0020_heute.sql ════════
-- KiJuB-Kompass · 0020 Startseite „Heute“ in einem Aufruf und „Neu seit deinem letzten Besuch“
--
-- fn_heute liefert alles, was die Startseite braucht, in einem einzigen Aufruf statt in zehn. Die Funktion läuft mit den Rechten
-- der aufrufenden Person (security invoker): Zeilenregeln gelten wie bei jeder Abfrage, jede Person bekommt nur, was sie sehen darf.
-- Welche Freizeiten und Treffs gemeint sind, bestimmt die Oberfläche (aktuelle Freizeiten, eigene Treffs …) und übergibt sie als Anfrage;
-- die Funktion rechnet nur Teile aus, die angefragt werden.
--
-- „Neu seit deinem letzten Besuch“: Ein Besuch endet nach 30 Minuten ohne Aufruf der Startseite. Beim nächsten Besuch gilt das Ende des
-- vorigen als Bezugszeit. Was andere seitdem angelegt haben, erscheint in „neu“ (höchstens 30 Einträge, dazu die Gesamtzahl);
-- eigene Änderungen zählen nie. Die Person kann „Alles gesehen“ wählen (fn_besuch_quittieren).

create table besuche (
  person_id         uuid primary key references personen(id) on delete cascade,
  letzter_kontakt   timestamptz not null,
  vorheriger_besuch timestamptz
);
alter table besuche enable row level security;
revoke all on besuche from anon;
grant select, insert, update on besuche to authenticated;
create policy eigene on besuche for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());

-- Anfrage (alle Schlüssel optional):
--   notiz_freizeiten [uuid], notiz_treffs [uuid]   Hinweise/Absprachen, Wochenplan-Neuigkeiten
--   team_freizeiten [uuid]                         Teamzeilen (wer ist Leitung/TeamerIn)
--   plan_freizeiten [uuid]                         Wochenplan des Tages
--   kachel_treffs [uuid]                           Protokolle von heute, offene Notizen, Neuigkeiten der Treffs
--   bestand bool, nachweise bool, bewerbungen bool, vorschlaege bool, fehler bool
--   wuensche: "alle" oder [uuid] (Treffs), sonst nicht angefragt
--   besuch bool                                    „Neu seit letztem Besuch“ berechnen (und den Besuch vermerken)
create function fn_heute(p_heute date, p_anfrage jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  a jsonb := coalesce(p_anfrage, '{}'::jsonb);
  nf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_freizeiten', '[]'::jsonb)) x);
  nt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_treffs', '[]'::jsonb)) x);
  tf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'team_freizeiten', '[]'::jsonb)) x);
  pf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'plan_freizeiten', '[]'::jsonb)) x);
  kt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'kachel_treffs', '[]'::jsonb)) x);
  wt uuid[];
  r jsonb := '{}'::jsonb;
  b besuche; seit timestamptz; neu jsonb := '[]'::jsonb; neu_gesamt int := 0;
begin
  if ich is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;

  -- Hinweise und Absprachen samt Bestätigungen
  r := r || jsonb_build_object('notizen', coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'art', n.art, 'geltung', n.geltung, 'datum', n.datum, 'text', n.text, 'created_at', n.created_at,
             'freizeit_id', n.freizeit_id, 'treff_id', n.treff_id, 'quelle', coalesce(f.name, t.name, ''),
             'bestaetigt_von', coalesce((select jsonb_agg(nb.person_id) from notiz_bestaetigungen nb where nb.notiz_id = n.id), '[]'::jsonb))
           order by n.created_at desc)
      from (select * from notizen where freizeit_id = any(nf) or treff_id = any(nt) order by created_at desc limit 200) n
      left join freizeiten f on f.id = n.freizeit_id
      left join treffs t on t.id = n.treff_id), '[]'::jsonb));

  r := r || jsonb_build_object('team', coalesce((select jsonb_agg(jsonb_build_object('freizeit_id', freizeit_id, 'person_id', person_id, 'rolle', rolle))
                                                   from freizeit_team where freizeit_id = any(tf)), '[]'::jsonb));

  r := r || jsonb_build_object('plan', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'freizeit_id', e.freizeit_id, 'titel', coalesce(an.name, e.freitext, ''), 'slot', coalesce(s.name, ''), 'position', coalesce(s.position, 0)))
      from plan_eintraege e
      left join angebote an on an.id = e.angebot_id
      left join freizeit_slots s on s.id = e.slot_id
     where e.freizeit_id = any(pf) and e.datum = p_heute), '[]'::jsonb));

  if coalesce((a ->> 'bestand')::boolean, false) then
    r := r || jsonb_build_object('bestand', coalesce((select jsonb_agg(jsonb_build_object('ort_id', ort_id, 'name', name, 'einheit', einheit, 'rest', rest, 'status', status))
                                                        from v_lebensmittel_bestand where status in ('knapp', 'leer')), '[]'::jsonb));
    r := r || jsonb_build_object('orte', coalesce((select jsonb_object_agg(o.id, o.name) from orte o
                                                    where o.id in (select ort_id from v_lebensmittel_bestand where status in ('knapp', 'leer'))), '{}'::jsonb));
  end if;

  if a -> 'wuensche' is not null and a -> 'wuensche' <> 'null'::jsonb then
    if jsonb_typeof(a -> 'wuensche') = 'array' then wt := array(select x::uuid from jsonb_array_elements_text(a -> 'wuensche') x); end if;
    r := r || jsonb_build_object('wuensche', coalesce((
      select jsonb_agg(jsonb_build_object('person_id', w.person_id, 'datum', d.datum, 'treff_id', d.treff_id))
        from dienst_wuensche w join dienste d on d.id = w.dienst_id
       where w.status = 'offen' and d.datum >= p_heute and (wt is null or d.treff_id = any(wt))), '[]'::jsonb));
    r := r || jsonb_build_object('treff_namen', coalesce((select jsonb_object_agg(id, name) from treffs), '{}'::jsonb));
  end if;

  if coalesce((a ->> 'bewerbungen')::boolean, false) then
    r := r || jsonb_build_object('bewerbungen', (select count(*) from bewerbungen where status = 'offen'));
  end if;
  if coalesce((a ->> 'vorschlaege')::boolean, false) then
    r := r || jsonb_build_object('vorschlaege', (select count(*) from angebot_vorschlaege where status = 'offen'));
  end if;
  if coalesce((a ->> 'nachweise')::boolean, false) then
    r := r || jsonb_build_object('nachweise', (select count(*) from zeitnachweise where status = 'eingereicht'));
  end if;
  if coalesce((a ->> 'fehler')::boolean, false) then
    r := r || jsonb_build_object('fehler', (select count(*) from fehlermeldungen where not erledigt));
  end if;

  -- Protokolle von heute und offene Notizen der Treffs (Kacheln)
  r := r || jsonb_build_object(
    'protokolliert', coalesce((select jsonb_agg(treff_id) from treff_protokolle where datum = p_heute and treff_id = any(kt)), '[]'::jsonb),
    'offene_notizen', coalesce((select jsonb_object_agg(treff_id, n) from (select treff_id, count(*) as n from treff_aufgaben where not erledigt and treff_id = any(kt) group by treff_id) x), '{}'::jsonb));

  -- Neu seit dem letzten Besuch
  if coalesce((a ->> 'besuch')::boolean, false) then
    select * into b from besuche where person_id = ich;
    if b.person_id is null then
      insert into besuche (person_id, letzter_kontakt) values (ich, now());
    elsif now() - b.letzter_kontakt > interval '30 minutes' then
      update besuche set vorheriger_besuch = b.letzter_kontakt, letzter_kontakt = now() where person_id = ich;
      seit := b.letzter_kontakt;
    else
      update besuche set letzter_kontakt = now() where person_id = ich;
      seit := b.vorheriger_besuch;
    end if;
    if seit is not null then
      seit := greatest(seit, now() - interval '30 days');
      with e as (
        select n.created_at as zeit, n.art::text as art, left(n.text, 120) as text, coalesce(f.name, t.name, '') as quelle,
               case when n.freizeit_id is not null then '/freizeiten/' || n.freizeit_id || '/hinweise' else '/treffs/' || n.treff_id || '/absprachen' end as url
          from notizen n left join freizeiten f on f.id = n.freizeit_id left join treffs t on t.id = n.treff_id
         where n.created_at > seit and n.erstellt_von is distinct from ich and (n.freizeit_id = any(nf) or n.treff_id = any(nt))
        union all
        select p.created_at, 'plan', left(coalesce(an.name, p.freitext, ''), 120) || ' (' || to_char(p.datum, 'DD.MM.') || ')', f.name, '/freizeiten/' || p.freizeit_id || '/plan'
          from plan_eintraege p join freizeiten f on f.id = p.freizeit_id left join angebote an on an.id = p.angebot_id
         where p.created_at > seit and p.erstellt_von is distinct from ich and p.freizeit_id = any(nf)
        union all
        select pr.updated_at, 'protokoll', 'Protokoll vom ' || to_char(pr.datum, 'DD.MM.YYYY'), t.name, '/treffs/' || pr.treff_id || '/protokoll'
          from treff_protokolle pr join treffs t on t.id = pr.treff_id
         where pr.updated_at > seit and pr.bearbeitet_von is distinct from ich and pr.treff_id = any(kt)
        union all
        select au.created_at, 'notiz', left(au.text, 120), t.name, '/treffs/' || au.treff_id || '/notizen'
          from treff_aufgaben au join treffs t on t.id = au.treff_id
         where au.created_at > seit and au.erstellt_von is distinct from ich and not au.erledigt and au.treff_id = any(kt)
        union all
        select k.created_at, 'kommentar', left(k.text, 120), t.name, '/treffs/' || k.treff_id || '/dienstplan'
          from dienstplan_kommentare k join treffs t on t.id = k.treff_id
         where k.created_at > seit and k.person_id is distinct from ich and k.treff_id = any(kt)
        union all
        select bw.created_at, 'bewerbung', 'Neue Bewerbung', f.name, '/bewerbungen'
          from bewerbungen bw join freizeiten f on f.id = bw.freizeit_id
         where coalesce((a ->> 'bewerbungen')::boolean, false) and bw.status = 'offen' and bw.created_at > seit
        union all
        select v.created_at, 'vorschlag', left(coalesce(v.daten ->> 'name', 'Vorschlag'), 120), 'Katalog', '/katalog/vorschlaege'
          from angebot_vorschlaege v
         where coalesce((a ->> 'vorschlaege')::boolean, false) and v.status = 'offen' and v.created_at > seit
        union all
        select z.updated_at, 'nachweis', 'Nachweis eingereicht', t.name, '/treffs/' || z.treff_id || '/nachweis'
          from zeitnachweise z join treffs t on t.id = z.treff_id
         where coalesce((a ->> 'nachweise')::boolean, false) and z.status = 'eingereicht' and z.updated_at > seit and z.person_id is distinct from ich
      )
      select coalesce(jsonb_agg(jsonb_build_object('zeit', x.zeit, 'art', x.art, 'text', x.text, 'quelle', x.quelle, 'url', x.url) order by x.zeit desc), '[]'::jsonb), max(x.gesamt)
        into neu, neu_gesamt
        from (select e.*, count(*) over () as gesamt from e order by e.zeit desc limit 30) x;
    end if;
    r := r || jsonb_build_object('seit', seit, 'neu', coalesce(neu, '[]'::jsonb), 'neu_gesamt', coalesce(neu_gesamt, 0));
  end if;

  return r;
end $$;

-- „Alles gesehen“: der nächste Besuch beginnt ab jetzt
create function fn_besuch_quittieren() returns void
language sql security invoker set search_path = public, pg_temp as $$
  update besuche set vorheriger_besuch = now() where person_id = meine_person_id()
$$;

revoke execute on function fn_heute(date, jsonb), fn_besuch_quittieren() from public, anon;
grant execute on function fn_heute(date, jsonb), fn_besuch_quittieren() to authenticated;

-- ════════ 0021_bewerbung_rolle_treff_aufraeumen.sql ════════
-- KiJuB-Kompass · 0021 Bewerbung mit Rollenwahl annehmen, Aufräumen beim Entfernen aus einem Treff
--
-- 1. Beim Annehmen einer Bewerbung wählt die Freizeitenkoordination die Rolle (TeamerIn oder Leitung); ohne Angabe bleibt es TeamerIn.
--    Ist die Person schon im Team, wird sie nur zur Leitung hochgestuft, nie herabgestuft. Die Mitteilung nennt die Rolle.
-- 2. Wer aus einem Treff entfernt wird, steht nicht mehr in künftigen Diensten und hat dort keine offenen Wünsche mehr.
--    Vergangene Dienste bleiben (sie sind Grundlage der Nachweise).

drop function fn_bewerbung_annehmen(uuid);
create function fn_bewerbung_annehmen(p_id uuid, p_rolle freizeit_rolle default 'teamer') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b bewerbungen;
begin
  if not ist_freizeitkoord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'angenommen', entschieden_von = meine_person_id(), entschieden_am = now()
   where id = p_id and status = 'offen' returning * into b;
  if b.id is null then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
  insert into freizeit_team (freizeit_id, person_id, rolle) values (b.freizeit_id, b.person_id, coalesce(p_rolle, 'teamer'))
    on conflict (freizeit_id, person_id)
    do update set rolle = case when excluded.rolle = 'leitung' then 'leitung'::freizeit_rolle else freizeit_team.rolle end;
end $$;
revoke execute on function fn_bewerbung_annehmen(uuid, freizeit_rolle) from public, anon;
grant execute on function fn_bewerbung_annehmen(uuid, freizeit_rolle) to authenticated;

create function fn_treff_team_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  delete from dienst_zuteilungen z using dienste d
   where z.dienst_id = d.id and d.treff_id = old.treff_id and z.person_id = old.person_id and d.datum >= heute;
  delete from dienst_wuensche w using dienste d
   where w.dienst_id = d.id and d.treff_id = old.treff_id and w.person_id = old.person_id and d.datum >= heute;
  return old;
end $$;
create trigger treff_team_aufraeumen after delete on treff_team for each row execute function fn_treff_team_aufraeumen();
revoke execute on function fn_treff_team_aufraeumen() from public, anon, authenticated;

-- Kernfunktion. art:
--   hinweis, absprache_freizeit (ref = Notiz), absprache_treff (ref = Notiz), dienstplan (ref = Treff, extra.personen),
--   dienstplan_kommentar (ref = Kommentar), wunsch_neu (ref = Treff, extra.datum), wunsch_antwort (ref = Dienst, extra.person),
--   bewerbung (ref = Freizeit), vorschlag (ref = Vorschlag), manuell (extra.ziel, extra.titel, extra.text), test,
--   (ab 0018 je nach Bereich an die Freizeiten- bzw. Treffkoordination)
--   bewerbung_angenommen (ref = Bewerbung), nachweis_eingereicht (ref = Nachweis), lebensmittel (ref = Ort, extra.name = Artikel)
-- Ergebnis: {"empfaenger": [person-ids], "titel": …, "text": …, "url": …}
create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  v_schluessel text := md5(coalesce(p_extra::text, ''));
  empf uuid[] := '{}'; titel text; txt text; url text;
  n notizen; f freizeiten; t treffs; k dienstplan_kommentare; d dienste; v angebot_vorschlaege; b bewerbungen; w dienst_wuensche; v_datum date; ziel jsonb;
  frisch interval := interval '10 minutes';
  bw bewerbungen; zn zeitnachweise; lv lebensmittel_verbrauch; lb record; v_name text; v_ort text; v_rest text; v_rolle text;
  monate text[] := array['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
begin
  if ich is null or not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;

  -- Bremse: gleiche Mitteilung nicht mehrfach, insgesamt nicht zu viele
  if exists (select 1 from mitteilungen_log where von_person = ich and art = p_art and ref is not distinct from p_ref
                and mitteilungen_log.schluessel = v_schluessel and created_at > now() - interval '2 minutes') then
    raise exception 'Diese Mitteilung wurde gerade schon gesendet' using errcode = 'check_violation';
  end if;
  if (select count(*) from mitteilungen_log where von_person = ich and created_at > now() - interval '1 hour') >= 60 then
    raise exception 'Zu viele Mitteilungen in kurzer Zeit' using errcode = 'check_violation';
  end if;

  if p_art = 'hinweis' then
    select * into n from notizen where id = p_ref and art = 'hinweis' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select tm.person_id from freizeit_team tm join personen p on p.id = tm.person_id where tm.freizeit_id = f.id and p.aktiv);
    titel := 'Neuer Hinweis · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_freizeit' then
    select * into n from notizen where id = p_ref and art = 'absprache' and freizeit_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = n.freizeit_id;
    empf := array(select x from (
        select tm.person_id as x from freizeit_team tm where tm.freizeit_id = f.id and tm.rolle = 'leitung'
        union select id from personen where ist_freizeitkoordination) q
      join personen p on p.id = q.x where p.aktiv);
    titel := 'Neue Absprache · ' || f.name; txt := left(n.text, 140); url := '/freizeiten/' || f.id || '/hinweise';

  elsif p_art = 'absprache_treff' then
    select * into n from notizen where id = p_ref and art = 'absprache' and treff_id is not null;
    if n.id is null or n.erstellt_von is distinct from ich or n.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = n.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neue Absprache · ' || t.name; txt := left(n.text, 140); url := '/treffs/' || t.id || '/absprachen';

  elsif p_art = 'dienstplan' then
    select * into t from treffs where id = p_ref;
    if t.id is null or not (ist_treffkoord() or ist_treffleitung(t.id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                   where tm.treff_id = t.id and p.aktiv and tm.person_id in (select jsonb_array_elements_text(coalesce(p_extra -> 'personen', '[]'::jsonb))::uuid));
    titel := 'Dienstplan · ' || t.name; txt := 'Dein Dienstplan wurde geändert.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'dienstplan_kommentar' then
    select * into k from dienstplan_kommentare where id = p_ref;
    if k.id is null or k.person_id is distinct from ich or k.created_at < now() - frisch then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = k.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and p.aktiv);
    titel := 'Neuer Kommentar · ' || t.name; txt := fn_push_name(ich) || ': ' || left(k.text, 120); url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_neu' then
    v_datum := (p_extra ->> 'datum')::date;
    select * into t from treffs where id = p_ref;
    select dw.* into w from dienst_wuensche dw join dienste dd on dd.id = dw.dienst_id
     where dd.treff_id = p_ref and dd.datum = v_datum and not dd.ist_sonder and dw.person_id = ich and dw.status = 'offen' and dw.created_at >= now() - frisch;
    if t.id is null or w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv);
    titel := 'Neuer Dienstwunsch · ' || t.name; txt := fn_push_name(ich) || ' wünscht den Dienst am ' || to_char(v_datum, 'DD.MM.YYYY') || '.'; url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'wunsch_antwort' then
    select * into d from dienste where id = p_ref;
    if d.id is null or not (ist_treffkoord() or ist_treffleitung(d.treff_id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into w from dienst_wuensche where dienst_id = d.id and person_id = (p_extra ->> 'person')::uuid and status <> 'offen' and entschieden_von = ich;
    if w.dienst_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = d.treff_id;
    empf := array(select p.id from personen p where p.id = w.person_id and p.aktiv);
    titel := 'Dienstwunsch · ' || t.name;
    txt := 'Dein Wunsch für den ' || to_char(d.datum, 'DD.MM.YYYY') || ' wurde ' || case w.status when 'bestaetigt' then 'bestätigt.' else 'abgelehnt.' end;
    url := '/treffs/' || t.id || '/dienstplan';

  elsif p_art = 'bewerbung' then
    select * into b from bewerbungen where freizeit_id = p_ref and person_id = ich and created_at >= now() - frisch;
    if b.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = b.freizeit_id;
    empf := array(select id from personen where ist_freizeitkoordination and aktiv);
    titel := 'Neue Bewerbung'; txt := fn_push_name(ich) || ' bewirbt sich für ' || f.name || '.'; url := '/bewerbungen';

  elsif p_art = 'vorschlag' then
    select * into v from angebot_vorschlaege where id = p_ref and eingereicht_von = ich and created_at >= now() - frisch;
    if v.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := 'Neuer Katalog-Vorschlag'; txt := fn_push_name(ich) || ': ' || left(coalesce(v.daten ->> 'name', ''), 100); url := '/katalog/vorschlaege';

  elsif p_art = 'bewerbung_angenommen' then
    if not ist_freizeitkoord() then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into bw from bewerbungen where id = p_ref and status = 'angenommen' and entschieden_von = ich and entschieden_am >= now() - frisch;
    if bw.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = bw.freizeit_id;
    empf := array(select id from personen where id = bw.person_id and aktiv);
    select rolle::text into v_rolle from freizeit_team where freizeit_id = f.id and person_id = bw.person_id;
    titel := 'Bewerbung angenommen';
    txt := case when v_rolle = 'leitung' then 'Du bist als Leitung dabei: ' else 'Du bist dabei: ' end
           || f.name || ' (' || to_char(f.start_datum, 'DD.MM.YYYY') || ' – ' || to_char(f.ende_datum, 'DD.MM.YYYY') || ').';
    url := '/freizeiten/' || f.id;

  elsif p_art = 'nachweis_eingereicht' then
    select * into zn from zeitnachweise where id = p_ref and person_id = ich and status = 'eingereicht' and updated_at >= now() - frisch;
    if zn.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = zn.treff_id;
    empf := array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id where tm.treff_id = t.id and tm.rolle = 'treffleitung' and p.aktiv);
    if coalesce(array_length(empf, 1), 0) = 0 then empf := array(select id from personen where ist_treffkoordination and aktiv); end if;      -- ohne Treffleitung: Koordination
    titel := 'Nachweis eingereicht · ' || t.name;
    txt := fn_push_name(ich) || ' hat den Nachweis für ' || monate[extract(month from zn.monat)::int] || ' ' || extract(year from zn.monat)::int || ' eingereicht.';
    url := '/treffs/' || t.id || '/nachweis';

  elsif p_art = 'lebensmittel' then
    -- Ein Artikel ist nach einer eigenen, frischen Buchung knapp oder leer geworden: die Koordination kauft nach.
    -- Ist er es nicht, oder wurde diese Lage schon gemeldet (24 Stunden, gleicher Stand), gibt es keine Empfänger und kein Protokoll.
    v_name := trim(coalesce(p_extra ->> 'name', ''));
    select * into lv from lebensmittel_verbrauch where ort_id = p_ref and name = v_name and erstellt_von = ich and created_at >= now() - frisch order by created_at desc limit 1;
    if lv.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into lb from v_lebensmittel_bestand where ort_id = p_ref and name = v_name;
    if lb.name is null or lb.status not in ('knapp', 'leer') then
      return jsonb_build_object('empfaenger', '[]'::jsonb, 'titel', '', 'text', '', 'url', '');
    end if;
    v_schluessel := md5(p_ref::text || '|' || v_name || '|' || lb.status);
    if exists (select 1 from mitteilungen_log where art = 'lebensmittel' and ref = p_ref and mitteilungen_log.schluessel = v_schluessel and created_at > now() - interval '24 hours') then
      return jsonb_build_object('empfaenger', '[]'::jsonb, 'titel', '', 'text', '', 'url', '');
    end if;
    select name into v_ort from orte where id = p_ref;
    v_rest := replace(rtrim(rtrim(to_char(lb.rest, 'FM999990.00'), '0'), '.'), '.', ',');
    empf := array(select id from personen where ist_freizeitkoordination and aktiv);
    titel := case lb.status when 'leer' then 'Lebensmittel aufgebraucht' else 'Lebensmittel knapp' end;
    txt := coalesce(v_ort, 'Ort') || ': ' || v_name || case lb.status when 'leer' then ' ist aufgebraucht.' else ' wird knapp (noch ' || v_rest || coalesce(' ' || lb.einheit, '') || ').' end;
    url := case when lv.freizeit_id is not null then '/freizeiten/' || lv.freizeit_id || '/lebensmittel' else '/freizeiten' end;

  elsif p_art = 'manuell' then
    if not ist_koord() then raise exception 'Nur die Koordination darf Mitteilungen an Gruppen senden' using errcode = '42501'; end if;
    titel := trim(coalesce(p_extra ->> 'titel', '')); txt := trim(coalesce(p_extra ->> 'text', ''));
    if length(titel) not between 1 and 80 then raise exception 'Der Titel braucht 1 bis 80 Zeichen' using errcode = 'check_violation'; end if;
    if length(txt) not between 1 and 300 then raise exception 'Der Text braucht 1 bis 300 Zeichen' using errcode = 'check_violation'; end if;
    ziel := p_extra -> 'ziel';
    empf := fn_push_ziel(ziel);
    url := '/';

  elsif p_art = 'test' then
    empf := array[ich]; titel := 'Testmitteilung'; txt := 'Mitteilungen funktionieren auf diesem Gerät.'; url := '/mehr';

  else
    raise exception 'Unbekannte Art der Mitteilung' using errcode = 'check_violation';
  end if;

  -- Die auslösende Person bekommt ihre eigene Mitteilung nie (außer beim Test)
  if p_art <> 'test' then empf := array(select x from unnest(empf) as x where x is distinct from ich); end if;
  empf := array(select distinct x from unnest(empf) as x);

  insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger) values (p_art, p_ref, v_schluessel, ich, coalesce(array_length(empf, 1), 0));
  return jsonb_build_object('empfaenger', to_jsonb(empf), 'titel', titel, 'text', txt, 'url', url);
end $$;

-- ════════ 0022_nachweise_erstellen.sql ════════
-- KiJuB-Kompass · 0022: Stundennachweise für Teilzeitkräfte erstellen
--
-- Bisher konnte nur die Person selbst ihren Nachweis anlegen. Jetzt können Treffleitung und Treffkoordination die Nachweise eines Monats
-- erstellen lassen: für eine Person oder für alle Teilzeitkräfte (Kategorie TZK) des Treffs. Die Zeilen werden aus dem Dienstplan
-- und den Abwesenheiten befüllt. Vorhandene Nachweise bleiben unverändert. Die Rechte der Tabelle ändern sich nicht (jede Person legt
-- weiterhin nur ihren eigenen Nachweis selbst an); das Erstellen für andere geht nur über diese Funktion.

create function fn_nachweise_erstellen(p_treff uuid, p_monat date, p_person uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_monat date := date_trunc('month', p_monat)::date;
  r record;
  v_id uuid;
  erstellt int := 0;
begin
  if not (ist_treffleitung(p_treff) or ist_treffkoord()) then
    raise exception 'Nur Treffleitung und Treffkoordination erstellen Nachweise für andere' using errcode = '42501';
  end if;

  for r in
    select tt.person_id
      from treff_team tt
      join personen p on p.id = tt.person_id
     where tt.treff_id = p_treff and p.aktiv
       and ((p_person is null and p.kategorie = 'TZK') or tt.person_id = p_person)
       and not exists (select 1 from zeitnachweise z where z.treff_id = p_treff and z.person_id = tt.person_id and z.monat = v_monat)
     order by tt.person_id
  loop
    insert into zeitnachweise (treff_id, person_id, monat) values (p_treff, r.person_id, v_monat) returning id into v_id;
    perform fn_nachweis_befuellen(v_id);
    erstellt := erstellt + 1;
  end loop;
  return erstellt;
end $$;

revoke execute on function fn_nachweise_erstellen(uuid, date, uuid) from public, anon;
grant execute on function fn_nachweise_erstellen(uuid, date, uuid) to authenticated;

-- ════════ 0023_ueberschneidung_akzeptiert.sql ════════
-- KiJuB-Kompass · 0023: Überschneidungen von Freizeiten bewusst akzeptieren
--
-- Eine Person kann auf dem Papier in zwei Freizeiten zur selben Zeit eingeteilt sein, und in der Praxis geht das trotzdem (zum Beispiel,
-- weil sie nur an einzelnen Tagen dabei ist). Die Freizeitenkoordination kann so eine Überschneidung akzeptieren; die Warnung verschwindet dann.
-- Gespeichert wird das Paar aus Person und zwei Freizeiten (die kleinere Kennung steht immer in freizeit_a), mit Notiz, wer es wann akzeptiert hat.
-- Verlässt die Person eine der beiden Freizeiten, entfällt die Akzeptanz: Wird sie später wieder eingeteilt, wird erneut gewarnt.

create table freizeit_ueberschneidungen_ok (
  person_id      uuid not null references personen(id) on delete cascade,
  freizeit_a     uuid not null references freizeiten(id) on delete cascade,
  freizeit_b     uuid not null references freizeiten(id) on delete cascade,
  notiz          text check (notiz is null or length(notiz) <= 500),
  akzeptiert_von uuid references personen(id) on delete set null,
  akzeptiert_am  timestamptz not null default now(),
  primary key (person_id, freizeit_a, freizeit_b),
  check (freizeit_a < freizeit_b)
);
create index freizeit_ueberschneidungen_ok_b on freizeit_ueberschneidungen_ok (freizeit_b);

alter table freizeit_ueberschneidungen_ok enable row level security;
create policy koordination on freizeit_ueberschneidungen_ok for all to authenticated
  using (ist_freizeitkoord()) with check (ist_freizeitkoord());
revoke all on freizeit_ueberschneidungen_ok from anon;
grant select, insert, update, delete on freizeit_ueberschneidungen_ok to authenticated;

-- Wer akzeptiert hat und wann, setzt die Datenbank selbst (nicht der Browser)
create function fn_ueberschneidung_stempel() returns trigger
language plpgsql as $$
begin
  new.akzeptiert_von := meine_person_id();
  new.akzeptiert_am := now();
  return new;
end $$;
create trigger ueberschneidung_stempel before insert or update on freizeit_ueberschneidungen_ok
  for each row execute function fn_ueberschneidung_stempel();

-- Verlässt die Person eine Freizeit, entfallen ihre Akzeptanzen für diese Freizeit
create function fn_ueberschneidung_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from freizeit_ueberschneidungen_ok
   where person_id = old.person_id and (freizeit_a = old.freizeit_id or freizeit_b = old.freizeit_id);
  return old;
end $$;
create trigger ueberschneidung_aufraeumen after delete on freizeit_team
  for each row execute function fn_ueberschneidung_aufraeumen();

revoke execute on function fn_ueberschneidung_stempel(), fn_ueberschneidung_aufraeumen() from public, anon, authenticated;

-- ════════ 0024_dienstplan_anwenden.sql ════════
-- KiJuB-Kompass · 0024: Dienstplan gezielt ändern (Personen hinzufügen und entfernen)
--
-- Die Treffleitung teilt oft einen ganzen Monat auf einmal ein. Der Browser berechnet, welche Personen an welchen Tagen dazukommen oder
-- wegfallen (nach Vorschau und eigener Entscheidung bei Konflikten) und schickt genau diese Liste. Die Funktion übernimmt sie in einem Schritt:
-- ganz oder gar nicht. Vorhandene Einteilungen bleiben, wenn sie nicht ausdrücklich entfernt werden; ein regulärer Dienst wird bei Bedarf
-- mit der Öffnungszeit des Wochentags angelegt. Sie ersetzt das Monatsmuster nicht (fn_dienste_monatsmuster bleibt bestehen), ändert aber
-- nichts am Rest der Rechte.
--
--   p_zuteilen / p_entfernen: Liste von {"datum": "JJJJ-MM-TT", "person": "<uuid>"}; alle Tage müssen im Monat liegen.

create function fn_dienstplan_anwenden(p_treff uuid, p_monat date, p_zuteilen jsonb, p_entfernen jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_start date := date_trunc('month', p_monat)::date;
  v_ende  date := (date_trunc('month', p_monat) + interval '1 month')::date;     -- ausschließlich
  e jsonb; v_datum date; v_person uuid; v_wt smallint; oz treff_oeffnungszeiten; d_id uuid; n int;
  zugeteilt int := 0; entfernt int := 0;
begin
  if not (ist_treffleitung(p_treff) or ist_treffkoord()) then
    raise exception 'Nur Treffleitung und Treffkoordination dürfen den Dienstplan ändern' using errcode = '42501';
  end if;
  if jsonb_typeof(p_zuteilen) is distinct from 'array' or jsonb_typeof(p_entfernen) is distinct from 'array' then
    raise exception 'Die Listen müssen Arrays sein' using errcode = 'check_violation';
  end if;

  -- Entfernen: nur aus dem regulären Dienst des Tages
  for e in select * from jsonb_array_elements(p_entfernen) loop
    v_datum := (e ->> 'datum')::date;
    v_person := (e ->> 'person')::uuid;
    if v_datum < v_start or v_datum >= v_ende then
      raise exception 'Der Tag % liegt nicht im Monat', v_datum using errcode = 'check_violation';
    end if;
    select id into d_id from dienste where treff_id = p_treff and datum = v_datum and not ist_sonder;
    if d_id is not null then
      delete from dienst_zuteilungen where dienst_id = d_id and person_id = v_person;
      get diagnostics n = row_count;
      entfernt := entfernt + n;
    end if;
  end loop;

  -- Hinzufügen: Dienst anlegen, falls es noch keinen gibt; vorhandene Einteilungen bleiben
  for e in select * from jsonb_array_elements(p_zuteilen) loop
    v_datum := (e ->> 'datum')::date;
    v_person := (e ->> 'person')::uuid;
    if v_datum < v_start or v_datum >= v_ende then
      raise exception 'Der Tag % liegt nicht im Monat', v_datum using errcode = 'check_violation';
    end if;
    if not exists (select 1 from treff_team where treff_id = p_treff and person_id = v_person) then
      raise exception 'Person % gehört nicht zu diesem Treff', v_person using errcode = 'check_violation';
    end if;
    select id into d_id from dienste where treff_id = p_treff and datum = v_datum and not ist_sonder;
    if d_id is null then
      v_wt := extract(isodow from v_datum)::smallint;
      select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = v_wt;
      if oz.treff_id is null then
        raise exception 'Am % ist der Treff nicht geöffnet', v_datum using errcode = 'check_violation';
      end if;
      insert into dienste (treff_id, datum, von, bis) values (p_treff, v_datum, oz.von, oz.bis) returning id into d_id;
    end if;
    insert into dienst_zuteilungen (dienst_id, person_id) values (d_id, v_person) on conflict do nothing;
    get diagnostics n = row_count;
    zugeteilt := zugeteilt + n;
  end loop;

  return jsonb_build_object('zugeteilt', zugeteilt, 'entfernt', entfernt);
end $$;

revoke execute on function fn_dienstplan_anwenden(uuid, date, jsonb, jsonb) from public, anon;
grant execute on function fn_dienstplan_anwenden(uuid, date, jsonb, jsonb) to authenticated;

-- ════════ 0025_wuensche_bestaetigen.sql ════════
-- KiJuB-Kompass · 0025: Mehrere Dienstwünsche auf einmal bestätigen; Einteilen erfüllt einen offenen Wunsch
--
-- 1) fn_wuensche_bestaetigen: Die Treffleitung bestätigt eine Liste offener Wünsche ihres Treffs in einem Schritt (ganz oder gar nicht).
--    Welche Wünsche (ohne Konflikt wie Urlaub oder Feiertag) bestätigt werden, entscheidet die Oberfläche; die Funktion prüft nur Rechte
--    und Zugehörigkeit. Bereits beantwortete Wünsche werden übersprungen. Ergebnis: Zahl der bestätigten Wünsche.
-- 2) Wird eine Person für einen Dienst eingeteilt, den sie sich gewünscht hat (Zuteilen, Monat einteilen, Tabelle), gilt ihr offener
--    Wunsch als bestätigt – sonst stünde sie eingeteilt und zugleich mit offenem Wunsch im Plan.
--
--   p_wuensche: Liste von {"dienst": "<uuid>", "person": "<uuid>"}

create function fn_wuensche_bestaetigen(p_treff uuid, p_wuensche jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; v_dienst uuid; v_person uuid; n int := 0;
begin
  if not (ist_treffleitung(p_treff) or ist_treffkoord()) then
    raise exception 'Nur Treffleitung und Treffkoordination dürfen Wünsche beantworten' using errcode = '42501';
  end if;
  if jsonb_typeof(p_wuensche) is distinct from 'array' then
    raise exception 'Die Liste muss ein Array sein' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(p_wuensche) loop
    v_dienst := (e ->> 'dienst')::uuid;
    v_person := (e ->> 'person')::uuid;
    if treff_von_dienst(v_dienst) is distinct from p_treff then
      raise exception 'Der Dienst gehört nicht zu diesem Treff' using errcode = 'check_violation';
    end if;
    update dienst_wuensche set status = 'bestaetigt', entschieden_von = meine_person_id()
     where dienst_id = v_dienst and person_id = v_person and status = 'offen';
    if found then
      insert into dienst_zuteilungen (dienst_id, person_id) values (v_dienst, v_person) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function fn_wuensche_bestaetigen(uuid, jsonb) from public, anon;
grant execute on function fn_wuensche_bestaetigen(uuid, jsonb) to authenticated;

create function fn_zuteilung_erfuellt_wunsch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update dienst_wuensche set status = 'bestaetigt', entschieden_von = meine_person_id()
   where dienst_id = new.dienst_id and person_id = new.person_id and status = 'offen';
  return null;
end $$;

revoke execute on function fn_zuteilung_erfuellt_wunsch() from public, anon;

create trigger dienst_zuteilungen_wunsch after insert on dienst_zuteilungen
  for each row execute function fn_zuteilung_erfuellt_wunsch();

-- ════════ 0026_schliesszeiten_farbe.sql ════════
-- KiJuB-Kompass · 0026: Schließzeiten der Treffs, Erinnerung „Tagesprotokoll fehlt“ ans ganze Team, Farbe je Freizeit
--
-- 1) Schließzeiten: Treffleitung und Treffkoordination tragen Zeiträume ein, in denen ein Treff geschlossen ist (z. B. Sommerpause).
--    An diesen Tagen ist kein Tagesprotokoll nötig, es gibt keine Erinnerung, und der reguläre Dienst lässt sich weder einteilen
--    noch wünschen (Sonderdienste bleiben möglich).
-- 2) Die Erinnerung „Tagesprotokoll fehlt“ geht an das ganze Team des Treffs (bisher: Treffleitung und die heute Eingeteilten).
-- 3) Startseite (fn_heute): Protokolle („fehlt“ und „neu geschrieben“) zählen nur für die Treffs, die die Startseite dafür anfragt
--    (protokoll_treffs) – die Oberfläche fragt nur die eigenen Treffs an, nicht alle Treffs der Treffkoordination. Neu: „geschlossen“
--    nennt die angefragten Treffs, die heute wegen Feiertag oder Schließzeit zu haben.
-- 4) Farbe je Freizeit: wählbar aus einer festen Palette; leer = automatisch aus der ID.

-- ===== 1) Schließzeiten =====
create table treff_schliesszeiten (
  id           uuid primary key default gen_random_uuid(),
  treff_id     uuid not null references treffs(id) on delete cascade,
  von          date not null,
  bis          date not null,
  grund        text not null default '' check (length(grund) <= 200),
  erstellt_von uuid references personen(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (bis >= von and bis - von <= 366)
);
create index treff_schliesszeiten_treff on treff_schliesszeiten (treff_id, von);

create function fn_schliesszeit_pruefen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von); new.created_at := now();
  else new.erstellt_von := old.erstellt_von; new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger treff_schliesszeiten_pruefen before insert or update on treff_schliesszeiten for each row execute function fn_schliesszeit_pruefen();
revoke execute on function fn_schliesszeit_pruefen() from public, anon;

alter table treff_schliesszeiten enable row level security;
revoke all on treff_schliesszeiten from anon;
grant select, insert, update, delete on treff_schliesszeiten to authenticated;
create policy lesen on treff_schliesszeiten for select to authenticated using (ist_aktive_person());
create policy schreiben on treff_schliesszeiten for all to authenticated
  using (ist_treffkoord() or ist_treffleitung(treff_id)) with check (ist_treffkoord() or ist_treffleitung(treff_id));

-- Ist der Treff an diesem Tag wegen einer Schließzeit zu?
create function ist_geschlossen(p_treff uuid, p_datum date) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_schliesszeiten where treff_id = p_treff and p_datum between von and bis)
$$;
revoke execute on function ist_geschlossen(uuid, date) from public, anon;
grant execute on function ist_geschlossen(uuid, date) to authenticated;

-- Kein regulärer Dienst an Schließtagen: weder einteilen noch wünschen (gilt für alle Wege, auch Funktionen und direkte Zugriffe)
create function fn_schliesstag_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare d dienste;
begin
  if tg_table_name = 'dienst_wuensche' then
    if to_jsonb(new) ->> 'status' <> 'offen' then return new; end if;     -- beantworten bleibt möglich
  end if;
  select * into d from dienste where id = new.dienst_id;
  if not d.ist_sonder and ist_geschlossen(d.treff_id, d.datum) then
    raise exception 'Am % ist der Treff geschlossen', to_char(d.datum, 'DD.MM.YYYY') using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function fn_schliesstag_pruefen() from public, anon;
create trigger dienst_zuteilungen_schliesstag before insert on dienst_zuteilungen for each row execute function fn_schliesstag_pruefen();
create trigger dienst_wuensche_schliesstag before insert or update on dienst_wuensche for each row execute function fn_schliesstag_pruefen();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'treff_schliesszeiten') then
    alter publication supabase_realtime add table public.treff_schliesszeiten;
  end if;
end $$;

-- ===== 2) Erinnerung „Tagesprotokoll fehlt“: an das ganze Team, nicht an Schließtagen =====
create or replace function fn_protokoll_erinnerungen() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  jetzt timestamp := now() at time zone 'Europe/Berlin';
  heute date := jetzt::date;
  r record; empf uuid[]; ergebnis jsonb := '[]'::jsonb;
begin
  for r in
    select t.id, t.name from treffs t
      join treff_oeffnungszeiten o on o.treff_id = t.id and o.wochentag = extract(isodow from heute)::int
     where jetzt >= heute + o.bis + interval '15 minutes' and jetzt <= heute + o.bis + interval '3 hours'
       and not exists (select 1 from treff_protokolle p where p.treff_id = t.id and p.datum = heute)
       and not exists (select 1 from feiertage f where f.datum = heute and (f.treff_id is null or f.treff_id = t.id))
       and not ist_geschlossen(t.id, heute)
       and not exists (select 1 from mitteilungen_log l where l.art = 'protokoll_erinnerung' and l.ref = t.id and l.schluessel = heute::text)
  loop
    empf := array(select p.id from personen p join treff_team tm on tm.person_id = p.id where tm.treff_id = r.id and p.aktiv);
    insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger)
    values ('protokoll_erinnerung', r.id, heute::text, null, coalesce(array_length(empf, 1), 0));
    if coalesce(array_length(empf, 1), 0) > 0 then
      ergebnis := ergebnis || jsonb_build_object('treff', r.id, 'empfaenger', to_jsonb(empf),
        'titel', 'Tagesprotokoll fehlt · ' || r.name, 'text', 'Bitte das Protokoll für heute eintragen.', 'url', '/treffs/' || r.id || '/protokoll');
    end if;
  end loop;
  return ergebnis;
end $$;

-- ===== 3) Startseite =====
--   neu in p_anfrage: protokoll_treffs [uuid] – Treffs für „Protokoll fehlt“ und „Protokoll neu“ (ohne Angabe: kachel_treffs wie bisher)
--   neu im Ergebnis:  geschlossen [uuid]      – angefragte Treffs, die heute Feiertag oder Schließzeit haben
create or replace function fn_heute(p_heute date, p_anfrage jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  a jsonb := coalesce(p_anfrage, '{}'::jsonb);
  nf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_freizeiten', '[]'::jsonb)) x);
  nt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_treffs', '[]'::jsonb)) x);
  tf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'team_freizeiten', '[]'::jsonb)) x);
  pf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'plan_freizeiten', '[]'::jsonb)) x);
  kt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'kachel_treffs', '[]'::jsonb)) x);
  pt uuid[] := case when a ? 'protokoll_treffs' then array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'protokoll_treffs', '[]'::jsonb)) x) else kt end;
  wt uuid[];
  r jsonb := '{}'::jsonb;
  b besuche; seit timestamptz; neu jsonb := '[]'::jsonb; neu_gesamt int := 0;
begin
  if ich is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;

  -- Hinweise und Absprachen samt Bestätigungen
  r := r || jsonb_build_object('notizen', coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'art', n.art, 'geltung', n.geltung, 'datum', n.datum, 'text', n.text, 'created_at', n.created_at,
             'freizeit_id', n.freizeit_id, 'treff_id', n.treff_id, 'quelle', coalesce(f.name, t.name, ''),
             'bestaetigt_von', coalesce((select jsonb_agg(nb.person_id) from notiz_bestaetigungen nb where nb.notiz_id = n.id), '[]'::jsonb))
           order by n.created_at desc)
      from (select * from notizen where freizeit_id = any(nf) or treff_id = any(nt) order by created_at desc limit 200) n
      left join freizeiten f on f.id = n.freizeit_id
      left join treffs t on t.id = n.treff_id), '[]'::jsonb));

  r := r || jsonb_build_object('team', coalesce((select jsonb_agg(jsonb_build_object('freizeit_id', freizeit_id, 'person_id', person_id, 'rolle', rolle))
                                                   from freizeit_team where freizeit_id = any(tf)), '[]'::jsonb));

  r := r || jsonb_build_object('plan', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'freizeit_id', e.freizeit_id, 'titel', coalesce(an.name, e.freitext, ''), 'slot', coalesce(s.name, ''), 'position', coalesce(s.position, 0)))
      from plan_eintraege e
      left join angebote an on an.id = e.angebot_id
      left join freizeit_slots s on s.id = e.slot_id
     where e.freizeit_id = any(pf) and e.datum = p_heute), '[]'::jsonb));

  if coalesce((a ->> 'bestand')::boolean, false) then
    r := r || jsonb_build_object('bestand', coalesce((select jsonb_agg(jsonb_build_object('ort_id', ort_id, 'name', name, 'einheit', einheit, 'rest', rest, 'status', status))
                                                        from v_lebensmittel_bestand where status in ('knapp', 'leer')), '[]'::jsonb));
    r := r || jsonb_build_object('orte', coalesce((select jsonb_object_agg(o.id, o.name) from orte o
                                                    where o.id in (select ort_id from v_lebensmittel_bestand where status in ('knapp', 'leer'))), '{}'::jsonb));
  end if;

  if a -> 'wuensche' is not null and a -> 'wuensche' <> 'null'::jsonb then
    if jsonb_typeof(a -> 'wuensche') = 'array' then wt := array(select x::uuid from jsonb_array_elements_text(a -> 'wuensche') x); end if;
    r := r || jsonb_build_object('wuensche', coalesce((
      select jsonb_agg(jsonb_build_object('person_id', w.person_id, 'datum', d.datum, 'treff_id', d.treff_id))
        from dienst_wuensche w join dienste d on d.id = w.dienst_id
       where w.status = 'offen' and d.datum >= p_heute and (wt is null or d.treff_id = any(wt))), '[]'::jsonb));
    r := r || jsonb_build_object('treff_namen', coalesce((select jsonb_object_agg(id, name) from treffs), '{}'::jsonb));
  end if;

  if coalesce((a ->> 'bewerbungen')::boolean, false) then
    r := r || jsonb_build_object('bewerbungen', (select count(*) from bewerbungen where status = 'offen'));
  end if;
  if coalesce((a ->> 'vorschlaege')::boolean, false) then
    r := r || jsonb_build_object('vorschlaege', (select count(*) from angebot_vorschlaege where status = 'offen'));
  end if;
  if coalesce((a ->> 'nachweise')::boolean, false) then
    r := r || jsonb_build_object('nachweise', (select count(*) from zeitnachweise where status = 'eingereicht'));
  end if;
  if coalesce((a ->> 'fehler')::boolean, false) then
    r := r || jsonb_build_object('fehler', (select count(*) from fehlermeldungen where not erledigt));
  end if;

  -- Protokolle von heute (nur protokoll_treffs), offene Notizen der Treffs (Kacheln) und heute geschlossene Treffs
  r := r || jsonb_build_object(
    'protokolliert', coalesce((select jsonb_agg(treff_id) from treff_protokolle where datum = p_heute and treff_id = any(pt)), '[]'::jsonb),
    'offene_notizen', coalesce((select jsonb_object_agg(treff_id, n) from (select treff_id, count(*) as n from treff_aufgaben where not erledigt and treff_id = any(kt) group by treff_id) x), '{}'::jsonb),
    'geschlossen', coalesce((select jsonb_agg(t.id) from treffs t
                              where t.id = any(kt || pt)
                                and (ist_geschlossen(t.id, p_heute) or exists (select 1 from feiertage f where f.datum = p_heute and (f.treff_id is null or f.treff_id = t.id)))), '[]'::jsonb));

  -- Neu seit dem letzten Besuch
  if coalesce((a ->> 'besuch')::boolean, false) then
    select * into b from besuche where person_id = ich;
    if b.person_id is null then
      insert into besuche (person_id, letzter_kontakt) values (ich, now());
    elsif now() - b.letzter_kontakt > interval '30 minutes' then
      update besuche set vorheriger_besuch = b.letzter_kontakt, letzter_kontakt = now() where person_id = ich;
      seit := b.letzter_kontakt;
    else
      update besuche set letzter_kontakt = now() where person_id = ich;
      seit := b.vorheriger_besuch;
    end if;
    if seit is not null then
      seit := greatest(seit, now() - interval '30 days');
      with e as (
        select n.created_at as zeit, n.art::text as art, left(n.text, 120) as text, coalesce(f.name, t.name, '') as quelle,
               case when n.freizeit_id is not null then '/freizeiten/' || n.freizeit_id || '/hinweise' else '/treffs/' || n.treff_id || '/absprachen' end as url
          from notizen n left join freizeiten f on f.id = n.freizeit_id left join treffs t on t.id = n.treff_id
         where n.created_at > seit and n.erstellt_von is distinct from ich and (n.freizeit_id = any(nf) or n.treff_id = any(nt))
        union all
        select p.created_at, 'plan', left(coalesce(an.name, p.freitext, ''), 120) || ' (' || to_char(p.datum, 'DD.MM.') || ')', f.name, '/freizeiten/' || p.freizeit_id || '/plan'
          from plan_eintraege p join freizeiten f on f.id = p.freizeit_id left join angebote an on an.id = p.angebot_id
         where p.created_at > seit and p.erstellt_von is distinct from ich and p.freizeit_id = any(nf)
        union all
        select pr.updated_at, 'protokoll', 'Protokoll vom ' || to_char(pr.datum, 'DD.MM.YYYY'), t.name, '/treffs/' || pr.treff_id || '/protokoll'
          from treff_protokolle pr join treffs t on t.id = pr.treff_id
         where pr.updated_at > seit and pr.bearbeitet_von is distinct from ich and pr.treff_id = any(pt)
        union all
        select au.created_at, 'notiz', left(au.text, 120), t.name, '/treffs/' || au.treff_id || '/notizen'
          from treff_aufgaben au join treffs t on t.id = au.treff_id
         where au.created_at > seit and au.erstellt_von is distinct from ich and not au.erledigt and au.treff_id = any(kt)
        union all
        select k.created_at, 'kommentar', left(k.text, 120), t.name, '/treffs/' || k.treff_id || '/dienstplan'
          from dienstplan_kommentare k join treffs t on t.id = k.treff_id
         where k.created_at > seit and k.person_id is distinct from ich and k.treff_id = any(kt)
        union all
        select bw.created_at, 'bewerbung', 'Neue Bewerbung', f.name, '/bewerbungen'
          from bewerbungen bw join freizeiten f on f.id = bw.freizeit_id
         where coalesce((a ->> 'bewerbungen')::boolean, false) and bw.status = 'offen' and bw.created_at > seit
        union all
        select v.created_at, 'vorschlag', left(coalesce(v.daten ->> 'name', 'Vorschlag'), 120), 'Katalog', '/katalog/vorschlaege'
          from angebot_vorschlaege v
         where coalesce((a ->> 'vorschlaege')::boolean, false) and v.status = 'offen' and v.created_at > seit
        union all
        select z.updated_at, 'nachweis', 'Nachweis eingereicht', t.name, '/treffs/' || z.treff_id || '/nachweis'
          from zeitnachweise z join treffs t on t.id = z.treff_id
         where coalesce((a ->> 'nachweise')::boolean, false) and z.status = 'eingereicht' and z.updated_at > seit and z.person_id is distinct from ich
      )
      select coalesce(jsonb_agg(jsonb_build_object('zeit', x.zeit, 'art', x.art, 'text', x.text, 'quelle', x.quelle, 'url', x.url) order by x.zeit desc), '[]'::jsonb), max(x.gesamt)
        into neu, neu_gesamt
        from (select e.*, count(*) over () as gesamt from e order by e.zeit desc limit 30) x;
    end if;
    r := r || jsonb_build_object('seit', seit, 'neu', coalesce(neu, '[]'::jsonb), 'neu_gesamt', coalesce(neu_gesamt, 0));
  end if;

  return r;
end $$;

-- ===== 4) Farbe je Freizeit =====
alter table freizeiten add column farbe text
  check (farbe is null or farbe in ('blau', 'orange', 'gruen', 'lila', 'gold', 'petrol', 'pink', 'oliv', 'tuerkis', 'rost'));

-- ════════ 0027_feiertag_schliesst.sql ════════
-- KiJuB-Kompass · 0027: Feiertage schließen den Treff
--
-- Bisher waren Feiertage nur ein Hinweis (die Treffleitung konnte trotzdem einteilen). Jetzt gilt ein Feiertag – für diesen Treff oder
-- für alle Treffs – wie ein Tag einer Schließzeit: Der reguläre Dienst lässt sich weder einteilen noch wünschen (Trigger aus 0026),
-- es ist kein Tagesprotokoll nötig und es gibt keine Erinnerung (wie schon bisher). Sonderdienste bleiben möglich.

create or replace function ist_geschlossen(p_treff uuid, p_datum date) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_schliesszeiten where treff_id = p_treff and p_datum between von and bis)
      or exists (select 1 from feiertage where datum = p_datum and (treff_id is null or treff_id = p_treff))
$$;

-- ════════ 0028_protokoll_vorlagen.sql ════════
-- KiJuB-Kompass · 0028: Vorlagen für das Tagesprotokoll je Wochentag
--
-- Je Treff und Wochentag ein Text, mit dem das Feld „Was war los?“ eines neuen Protokolls vorbelegt wird (z. B. feste Gliederung oder
-- der übliche Programmpunkt des Tages). Zahlen und Vorkommnisse werden nie vorbelegt. Lesen darf das Team des Treffs und die
-- Treffkoordination; pflegen dürfen Treffleitung und Treffkoordination. Ein leerer Text bedeutet: keine Vorlage (Zeile wird gelöscht).

create table treff_protokoll_vorlagen (
  treff_id        uuid not null references treffs(id) on delete cascade,
  wochentag       smallint not null check (wochentag between 1 and 7),
  text            text not null check (length(trim(text)) between 1 and 2000),
  bearbeitet_von  uuid references personen(id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (treff_id, wochentag)
);

create function fn_protokoll_vorlage_pruefen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.treff_id is distinct from old.treff_id or new.wochentag is distinct from old.wochentag) then
    raise exception 'Treff und Wochentag einer Vorlage lassen sich nicht ändern' using errcode = 'check_violation';
  end if;
  new.bearbeitet_von := coalesce(meine_person_id(), new.bearbeitet_von);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function fn_protokoll_vorlage_pruefen() from public, anon;
create trigger treff_protokoll_vorlagen_pruefen before insert or update on treff_protokoll_vorlagen
  for each row execute function fn_protokoll_vorlage_pruefen();

alter table treff_protokoll_vorlagen enable row level security;
revoke all on treff_protokoll_vorlagen from anon;
grant select, insert, update, delete on treff_protokoll_vorlagen to authenticated;
create policy lesen on treff_protokoll_vorlagen for select to authenticated using (ist_treffkoord() or ist_im_treff(treff_id));
create policy schreiben on treff_protokoll_vorlagen for all to authenticated
  using (ist_treffkoord() or ist_treffleitung(treff_id)) with check (ist_treffkoord() or ist_treffleitung(treff_id));

-- ════════ 0029_checkliste.sql ════════
-- KiJuB-Kompass · 0029: Checkliste zur Vorbereitung einer Freizeit
--
-- Die Freizeitenkoordination pflegt eine Standard-Checkliste (checkliste_vorlage). Jeder Punkt ist relativ zu Start oder Ende fällig,
-- kann auf eine Stelle der App verweisen (ziel) und kann automatisch erkannt werden (automatik, z. B. „Wochenplan steht“).
-- Je Freizeit halten checkliste_status (Stand der Standardpunkte) und checkliste_eigene (zusätzliche Punkte der Leitung) fest, was
-- erledigt oder nicht relevant ist. Lesen und ändern dürfen die Leitungen der Freizeit und die Freizeitenkoordination.
-- fn_checkliste liefert die Punkte samt Fälligkeit und automatischer Erkennung; die Erinnerung „heute fällig“ geht einmal je Freizeit
-- und Tag an die Leitungen (über den Zeitplan der Erinnerungen, siehe fn_protokoll_erinnerungen unten).

-- ===== Tabellen =====
create table checkliste_vorlage (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null check (length(trim(titel)) between 1 and 200),
  beschreibung text not null default '' check (length(beschreibung) <= 2000),
  bezug        text not null default 'start' check (bezug in ('start', 'ende')),
  tage         int  not null default 0 check (tage between -365 and 365),          -- negativ = vorher, positiv = nachher
  ziel         text check (ziel in ('team', 'plan', 'hinweise', 'lebensmittel', 'teamermappe', 'quiz', 'formulare')),
  automatik    text check (automatik in ('leitung', 'team', 'bewerbungen', 'wochenplan', 'hinweis', 'hinweise_gesehen', 'lebensmittel')),
  position     int  not null default 0,
  aktiv        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger checkliste_vorlage_touch before update on checkliste_vorlage for each row execute function fn_touch_updated_at();

create table checkliste_status (
  freizeit_id  uuid not null references freizeiten(id) on delete cascade,
  vorlage_id   uuid not null references checkliste_vorlage(id) on delete cascade,
  status       text not null default 'offen' check (status in ('offen', 'erledigt', 'nicht_relevant')),
  notiz        text not null default '' check (length(notiz) <= 1000),
  geaendert_von uuid references personen(id) on delete set null,
  geaendert_am  timestamptz not null default now(),
  primary key (freizeit_id, vorlage_id)
);

create table checkliste_eigene (
  id            uuid primary key default gen_random_uuid(),
  freizeit_id   uuid not null references freizeiten(id) on delete cascade,
  titel         text not null check (length(trim(titel)) between 1 and 200),
  beschreibung  text not null default '' check (length(beschreibung) <= 2000),
  faellig_am    date,
  status        text not null default 'offen' check (status in ('offen', 'erledigt', 'nicht_relevant')),
  notiz         text not null default '' check (length(notiz) <= 1000),
  erstellt_von  uuid references personen(id) on delete set null,
  geaendert_von uuid references personen(id) on delete set null,
  geaendert_am  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index checkliste_eigene_freizeit on checkliste_eigene (freizeit_id);

-- Wer und wann: setzt die Datenbank, nicht die Oberfläche
create function fn_checkliste_vermerken() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.freizeit_id is distinct from old.freizeit_id then
    raise exception 'Ein Punkt lässt sich nicht in eine andere Freizeit verschieben' using errcode = 'check_violation';
  end if;
  new.geaendert_von := coalesce(meine_person_id(), new.geaendert_von);
  new.geaendert_am := now();
  if tg_table_name = 'checkliste_eigene' then
    if tg_op = 'INSERT' then new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von); new.created_at := now();
    else new.erstellt_von := old.erstellt_von; new.created_at := old.created_at; end if;
  end if;
  return new;
end $$;
revoke execute on function fn_checkliste_vermerken() from public, anon;
create trigger checkliste_status_vermerken before insert or update on checkliste_status for each row execute function fn_checkliste_vermerken();
create trigger checkliste_eigene_vermerken before insert or update on checkliste_eigene for each row execute function fn_checkliste_vermerken();

-- ===== Zugriff =====
alter table checkliste_vorlage enable row level security;
alter table checkliste_status  enable row level security;
alter table checkliste_eigene  enable row level security;
revoke all on checkliste_vorlage, checkliste_status, checkliste_eigene from anon;
grant select, insert, update, delete on checkliste_vorlage, checkliste_status, checkliste_eigene to authenticated;

create policy lesen on checkliste_vorlage for select to authenticated using (ist_aktive_person());
create policy pflegen on checkliste_vorlage for all to authenticated using (ist_freizeitkoord()) with check (ist_freizeitkoord());
create policy alles on checkliste_status for all to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id)) with check (ist_freizeitkoord() or ist_leitung(freizeit_id));
create policy alles on checkliste_eigene for all to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id)) with check (ist_freizeitkoord() or ist_leitung(freizeit_id));

-- ===== Automatisch erkannte Punkte =====
-- Nur intern (ohne eigene Rechteprüfung): wird von fn_checkliste und der Erinnerung benutzt.
create function checkliste_automatik(p_freizeit uuid, p_art text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f freizeiten;
begin
  select * into f from freizeiten where id = p_freizeit;
  if f.id is null or p_art is null then return false; end if;
  return case p_art
    when 'leitung' then exists (select 1 from freizeit_team where freizeit_id = f.id and rolle = 'leitung')
    when 'team' then exists (select 1 from freizeit_team where freizeit_id = f.id and rolle = 'teamer')
    when 'bewerbungen' then not exists (select 1 from bewerbungen where freizeit_id = f.id and status = 'offen')
    when 'wochenplan' then (select count(distinct datum) from plan_eintraege where freizeit_id = f.id and datum between f.start_datum and f.ende_datum)
                           = (f.ende_datum - f.start_datum + 1)
    when 'hinweis' then exists (select 1 from notizen where freizeit_id = f.id and art = 'hinweis')
    when 'hinweise_gesehen' then exists (select 1 from notizen where freizeit_id = f.id and art = 'hinweis')
      and not exists (select 1 from notizen n join freizeit_team t on t.freizeit_id = f.id and t.rolle = 'teamer'
                       where n.freizeit_id = f.id and n.art = 'hinweis'
                         and not exists (select 1 from notiz_bestaetigungen b where b.notiz_id = n.id and b.person_id = t.person_id))
    when 'lebensmittel' then f.ort_id is not null
      and exists (select 1 from lebensmittel_eingang e where e.ort_id = f.ort_id and (e.freizeit_id = f.id or e.datum >= f.start_datum - 60))
    else false
  end;
end $$;
revoke execute on function checkliste_automatik(uuid, text) from public, anon, authenticated;

-- Alle Punkte einer Freizeit: Standardpunkte (aktiv) und eigene, mit Fälligkeit und Stand. Nur intern.
create function checkliste_punkte(p_freizeit uuid)
returns table (art text, id uuid, titel text, beschreibung text, faellig date, ziel text, automatik text, auto_erfuellt boolean,
               status text, notiz text, geaendert_von uuid, geaendert_am timestamptz, reihenfolge int)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'vorlage', v.id, v.titel, v.beschreibung,
         (case when v.bezug = 'start' then f.start_datum else f.ende_datum end) + v.tage,
         v.ziel, v.automatik, checkliste_automatik(f.id, v.automatik),
         coalesce(s.status, 'offen'), coalesce(s.notiz, ''), s.geaendert_von, s.geaendert_am, v.position
    from freizeiten f
    join checkliste_vorlage v on v.aktiv
    left join checkliste_status s on s.freizeit_id = f.id and s.vorlage_id = v.id
   where f.id = p_freizeit
  union all
  select 'eigen', e.id, e.titel, e.beschreibung, e.faellig_am, null, null, false, e.status, e.notiz, e.geaendert_von, e.geaendert_am, 100000
    from checkliste_eigene e where e.freizeit_id = p_freizeit
$$;
revoke execute on function checkliste_punkte(uuid) from public, anon, authenticated;

-- Für die Oberfläche: die Punkte der angefragten Freizeiten, soweit die Person sie sehen darf (Leitung der Freizeit, Freizeitenkoordination).
-- Erfüllt ist ein Punkt, wenn er erledigt ist oder – solange niemand „nicht relevant“ gesetzt hat – automatisch erkannt wird.
create function fn_checkliste(p_freizeiten uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'freizeit_id', f.id, 'art', p.art, 'id', p.id, 'titel', p.titel, 'beschreibung', p.beschreibung, 'faellig', p.faellig,
           'ziel', p.ziel, 'automatik', p.automatik, 'auto_erfuellt', p.auto_erfuellt, 'status', p.status, 'notiz', p.notiz,
           'geaendert_von', p.geaendert_von, 'geaendert_am', p.geaendert_am)
         order by f.start_datum, f.id, p.faellig nulls last, p.reihenfolge, p.titel), '[]'::jsonb)
    from freizeiten f, lateral checkliste_punkte(f.id) p
   where f.id = any(p_freizeiten) and (ist_freizeitkoord() or ist_leitung(f.id))
$$;
revoke execute on function fn_checkliste(uuid[]) from public, anon;
grant execute on function fn_checkliste(uuid[]) to authenticated;

-- ===== Erinnerung „heute fällig“ =====
-- Einmal je Freizeit und Tag an die aktiven Leitungen: alle offenen, nicht automatisch erfüllten Punkte, die heute fällig sind.
create function fn_checkliste_erinnerungen() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  heute date := (now() at time zone 'Europe/Berlin')::date;
  f record; punkte text[]; empf uuid[]; ergebnis jsonb := '[]'::jsonb;
begin
  for f in select id, name from freizeiten
            where status = 'geplant' and heute between start_datum - 366 and ende_datum + 366
              and not exists (select 1 from mitteilungen_log l where l.art = 'checkliste_erinnerung' and l.ref = freizeiten.id and l.schluessel = heute::text)
  loop
    punkte := array(select p.titel from checkliste_punkte(f.id) p
                     where p.faellig = heute and p.status = 'offen' and not p.auto_erfuellt order by p.reihenfolge, p.titel);
    continue when coalesce(array_length(punkte, 1), 0) = 0;
    empf := array(select p.id from freizeit_team t join personen p on p.id = t.person_id where t.freizeit_id = f.id and t.rolle = 'leitung' and p.aktiv);
    insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger)
    values ('checkliste_erinnerung', f.id, heute::text, null, coalesce(array_length(empf, 1), 0));
    if coalesce(array_length(empf, 1), 0) > 0 then
      ergebnis := ergebnis || jsonb_build_object('freizeit', f.id, 'empfaenger', to_jsonb(empf),
        'titel', 'Vorbereitung · ' || f.name,
        'text', case when array_length(punkte, 1) = 1 then 'Heute fällig: ' || punkte[1] else array_length(punkte, 1) || ' Punkte sind heute fällig.' end,
        'url', '/freizeiten/' || f.id || '/vorbereitung');
    end if;
  end loop;
  return ergebnis;
end $$;
revoke execute on function fn_checkliste_erinnerungen() from public, anon, authenticated;
grant execute on function fn_checkliste_erinnerungen() to service_role;

-- Der Zeitplan der Erinnerungen (GitHub, push-senden mit CRON_SECRET) ruft fn_protokoll_erinnerungen auf. Damit die Edge Function
-- nicht neu bereitgestellt werden muss, liefert sie ab jetzt beide Arten: „Tagesprotokoll fehlt“ und „Checkliste heute fällig“.
alter function fn_protokoll_erinnerungen() rename to fn_protokoll_erinnerungen_treffs;
create function fn_protokoll_erinnerungen() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select fn_protokoll_erinnerungen_treffs() || fn_checkliste_erinnerungen()
$$;
revoke execute on function fn_protokoll_erinnerungen() from public, anon, authenticated;
grant execute on function fn_protokoll_erinnerungen() to service_role;

-- ===== Vorschlag für die Standard-Checkliste (die Freizeitenkoordination passt sie in der App an) =====
insert into checkliste_vorlage (position, titel, beschreibung, bezug, tage, ziel, automatik) values
  (10,  'Leitung steht fest', 'Die Freizeitenkoordination hat die Leitung (ggf. zwei) zugeordnet.', 'start', -84, 'team', 'leitung'),
  (20,  'Team ist zusammengestellt', 'Alle TeamerInnen sind zugeordnet. Fehlt noch jemand, sprich die Freizeitenkoordination an.', 'start', -42, 'team', 'team'),
  (30,  'Offene Bewerbungen sind entschieden', 'Bewerbungen entscheidet die Freizeitenkoordination – frag nach, wenn noch welche offen sind.', 'start', -42, null, 'bewerbungen'),
  (40,  'Vortreffen mit dem Team geplant', 'Termin und Ort festlegen und als Hinweis für das Team eintragen.', 'start', -35, 'hinweise', null),
  (50,  'Team kennt Teamermappe und Quiz', 'Weise das Team auf die Teamermappe (Qualitätsstandards, Notfall) und das Quiz hin.', 'start', -28, 'teamermappe', null),
  (60,  'Ernährung und Allergien im Team geprüft', 'Im Reiter Team stehen die Ernährungsangaben; Besonderheiten mit Einkauf und Küche klären.', 'start', -21, 'team', null),
  (70,  'Wochenplan steht', 'Für jeden Tag der Freizeit ist mindestens ein Programmpunkt eingetragen.', 'start', -14, 'plan', 'wochenplan'),
  (80,  'Infos für das Team veröffentlicht', 'Treffpunkt, Abfahrt, Packliste usw. als Hinweis eintragen – das Team bestätigt mit „gesehen“.', 'start', -14, 'hinweise', 'hinweis'),
  (90,  'Lebensmittel-Bestand am Ort geprüft', 'Was ist noch da, was wird geliefert? Eingänge im Reiter Lebensmittel erfassen.', 'start', -7, 'lebensmittel', 'lebensmittel'),
  (100, 'Formulare vorbereitet', 'Anwesenheitsliste und weitere Vordrucke ausfüllen bzw. ausdrucken.', 'start', -7, 'formulare', null),
  (110, 'Alle haben die Hinweise gesehen', 'Jede TeamerIn hat alle Hinweise bestätigt.', 'start', -3, 'hinweise', 'hinweise_gesehen'),
  (120, 'Notfallnummern und Erste-Hilfe-Material geprüft', 'Notfall-Box in der Teamermappe ansehen, Erste-Hilfe-Kasten auf Vollständigkeit prüfen.', 'start', -3, 'teamermappe', null),
  (130, 'Lebensmittel-Verbrauch vollständig gebucht', 'Damit der Bestand am Ort für die nächste Freizeit stimmt.', 'ende', 3, 'lebensmittel', null),
  (140, 'Nachbesprechung mit dem Team', 'Was lief gut, was nehmen wir mit? Ergebnisse ggf. an die Freizeitenkoordination.', 'ende', 14, null, null);

-- ════════ 0030_bewerbungen_mehr.sql ════════
-- KiJuB-Kompass · 0030: Bewerbungsfrist einstellbar, Freizeiten für Bewerbungen schließen, Bewerbung für Ferienzeit/-wochen
--
-- 1) Die Frist „Bewerbung bis n Tage vor Beginn“ (einstellungen.bewerbung_vorlauf_tage) ändert nur die Freizeitenkoordination, 0 bis 90 Tage.
-- 2) freizeiten.bewerbung_offen: Ist eine Freizeit voll, schließt die Freizeitenkoordination sie für Bewerbungen; neue Bewerbungen
--    lehnt die Datenbank dann ab (bestehende bleiben und werden wie bisher entschieden).
-- 3) bewerbungen_zeitraum: Mitarbeitende bewerben sich für eine Ferienzeit eines Jahres – optional nur für bestimmte Wochen –, ohne eine
--    Freizeit zu wählen. Die Freizeitenkoordination ordnet sie einer passenden Freizeit zu (fn_zeitraum_zuordnen); dabei entsteht eine
--    angenommene Bewerbung für diese Freizeit, sodass die Person wie gewohnt „Bewerbung angenommen“ erfährt. Mitteilung an die
--    Freizeitenkoordination bei neuer Zeitraum-Bewerbung; auf der Startseite zählen offene Zeitraum-Bewerbungen bei „Bewerbungen“ mit.

-- ===== 1) Bewerbungsfrist =====
do $$
declare r record;
begin
  for r in select policyname, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'einstellungen' and policyname <> 'lesen' loop
    execute format('alter policy %I on public.einstellungen %s %s', r.policyname,
      case when r.qual is not null then format('using (%s)', replace(replace(r.qual, 'ist_koord()', 'ist_freizeitkoord()'), 'ist_treffkoord()', 'ist_freizeitkoord()')) else '' end,
      case when r.with_check is not null then format('with check (%s)', replace(replace(r.with_check, 'ist_koord()', 'ist_freizeitkoord()'), 'ist_treffkoord()', 'ist_freizeitkoord()')) else '' end);
  end loop;
end $$;
alter table einstellungen add constraint einstellungen_vorlauf_check
  check (schluessel <> 'bewerbung_vorlauf_tage' or (jsonb_typeof(wert) = 'number' and (wert #>> '{}')::numeric between 0 and 90 and (wert #>> '{}')::numeric = trunc((wert #>> '{}')::numeric)));

-- ===== 2) Freizeit für Bewerbungen schließen =====
alter table freizeiten add column bewerbung_offen boolean not null default true;

drop policy anlegen on bewerbungen;
create policy anlegen on bewerbungen for insert to authenticated
  with check (
    person_id = meine_person_id() and ist_bewerbend() and status = 'offen'
    and not ist_im_team(freizeit_id)
    and exists (select 1 from freizeiten f
                 where f.id = freizeit_id and f.status = 'geplant' and f.bewerbung_offen
                   and f.start_datum >= current_date +
                       coalesce((select (wert #>> '{}')::int from einstellungen
                                  where schluessel = 'bewerbung_vorlauf_tage'), 7)));

-- ===== 3) Bewerbung für eine Ferienzeit =====
create table bewerbungen_zeitraum (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references personen(id) on delete cascade,
  jahr            int  not null check (jahr between 2020 and 2100),
  ferienzeitraum  ferienzeitraum_t not null,
  wochen          smallint[] not null default '{}',              -- leer = jede Woche der Ferienzeit
  notiz           text check (notiz is null or length(notiz) <= 2000),
  status          text not null default 'offen' check (status in ('offen', 'erledigt')),
  erledigt_von    uuid references personen(id) on delete set null,
  erledigt_am     timestamptz,
  created_at      timestamptz not null default now(),
  unique (person_id, jahr, ferienzeitraum),
  check (wochen <@ array[1,2,3,4,5,6]::smallint[]
         and (ferienzeitraum = 'sommer' or wochen <@ array[1,2]::smallint[]))
);
create index bewerbungen_zeitraum_offen on bewerbungen_zeitraum (status, jahr);

create function fn_zeitraum_pruefen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now(); new.erledigt_von := null; new.erledigt_am := null;
    if not ist_freizeitkoord() then new.status := 'offen'; end if;
  else
    if new.person_id is distinct from old.person_id or new.jahr is distinct from old.jahr or new.ferienzeitraum is distinct from old.ferienzeitraum then
      raise exception 'Person, Jahr und Ferienzeit einer Bewerbung lassen sich nicht ändern' using errcode = 'check_violation';
    end if;
    new.created_at := old.created_at;
    if new.status is distinct from old.status then
      new.erledigt_von := case when new.status = 'erledigt' then meine_person_id() end;
      new.erledigt_am := case when new.status = 'erledigt' then now() end;
    else
      new.erledigt_von := old.erledigt_von; new.erledigt_am := old.erledigt_am;
    end if;
  end if;
  new.wochen := array(select distinct w from unnest(new.wochen) w order by w);
  return new;
end $$;
revoke execute on function fn_zeitraum_pruefen() from public, anon;
create trigger bewerbungen_zeitraum_pruefen before insert or update on bewerbungen_zeitraum for each row execute function fn_zeitraum_pruefen();

alter table bewerbungen_zeitraum enable row level security;
revoke all on bewerbungen_zeitraum from anon;
grant select, insert, update, delete on bewerbungen_zeitraum to authenticated;
create policy lesen on bewerbungen_zeitraum for select to authenticated using (person_id = meine_person_id() or ist_freizeitkoord());
create policy anlegen on bewerbungen_zeitraum for insert to authenticated
  with check (person_id = meine_person_id() and ist_bewerbend() and status = 'offen'
              and jahr >= extract(year from current_date)::int and jahr <= extract(year from current_date)::int + 1);
create policy aendern on bewerbungen_zeitraum for update to authenticated
  using ((person_id = meine_person_id() and status = 'offen') or ist_freizeitkoord())
  with check ((person_id = meine_person_id() and status = 'offen') or ist_freizeitkoord());
create policy zurueckziehen on bewerbungen_zeitraum for delete to authenticated
  using ((person_id = meine_person_id() and status = 'offen') or ist_freizeitkoord());

-- Zuordnen: Die Person kommt ins Team der Freizeit (Rolle wählbar); für die Freizeit entsteht eine angenommene Bewerbung
-- (Grundlage der Mitteilung „Bewerbung angenommen“). Die Zeitraum-Bewerbung bleibt offen, bis die Koordination sie als erledigt markiert.
-- Ergebnis: ID der angenommenen Bewerbung.
create function fn_zeitraum_zuordnen(p_zeitraum uuid, p_freizeit uuid, p_rolle freizeit_rolle default 'teamer') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare z bewerbungen_zeitraum; f freizeiten; b_id uuid;
begin
  if not ist_freizeitkoord() then raise exception 'Nur die Freizeitenkoordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  select * into z from bewerbungen_zeitraum where id = p_zeitraum;
  if z.id is null then raise exception 'Bewerbung nicht gefunden' using errcode = 'check_violation'; end if;
  select * into f from freizeiten where id = p_freizeit;
  if f.id is null or f.status <> 'geplant' then raise exception 'Die Freizeit gibt es nicht oder sie ist abgesagt' using errcode = 'check_violation'; end if;
  insert into bewerbungen (person_id, freizeit_id, notiz, status, entschieden_von, entschieden_am)
  values (z.person_id, f.id, z.notiz, 'angenommen', meine_person_id(), now())
  on conflict (person_id, freizeit_id) do update
     set status = 'angenommen', entschieden_von = excluded.entschieden_von, entschieden_am = excluded.entschieden_am
  returning id into b_id;
  insert into freizeit_team (freizeit_id, person_id, rolle) values (f.id, z.person_id, coalesce(p_rolle, 'teamer'))
    on conflict (freizeit_id, person_id)
    do update set rolle = case when excluded.rolle = 'leitung' then 'leitung'::freizeit_rolle else freizeit_team.rolle end;
  return b_id;
end $$;
revoke execute on function fn_zeitraum_zuordnen(uuid, uuid, freizeit_rolle) from public, anon;
grant execute on function fn_zeitraum_zuordnen(uuid, uuid, freizeit_rolle) to authenticated;

-- Text einer Zeitraum-Bewerbung: „Sommer 2027 (Woche 1, 3)“ bzw. „Ostern 2027“
create function zeitraum_text(z bewerbungen_zeitraum) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case z.ferienzeitraum when 'ostern' then 'Ostern' when 'sommer' then 'Sommer' else 'Herbst' end || ' ' || z.jahr
         || case when cardinality(z.wochen) = 0 then '' else ' (Woche ' || array_to_string(z.wochen, ', ') || ')' end
$$;
revoke execute on function zeitraum_text(bewerbungen_zeitraum) from public, anon;

-- ===== Mitteilung bei neuer Zeitraum-Bewerbung =====
-- Damit die Edge Function unverändert bleibt, behandelt fn_push_vorbereiten die neue Art selbst und reicht alles andere weiter.
alter function fn_push_vorbereiten(text, uuid, jsonb) rename to fn_push_vorbereiten_basis;
revoke execute on function fn_push_vorbereiten_basis(text, uuid, jsonb) from public, anon, authenticated;
create function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare z bewerbungen_zeitraum; ich uuid := meine_person_id();
begin
  if p_art = 'bewerbung_zeitraum' then
    select * into z from bewerbungen_zeitraum where id = p_ref and person_id = ich and created_at >= now() - interval '10 minutes';
    if z.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv)),
      'titel', 'Neue Bewerbung', 'text', fn_push_name(ich) || ' bewirbt sich für ' || zeitraum_text(z) || '.', 'url', '/bewerbungen');
  end if;
  return fn_push_vorbereiten_basis(p_art, p_ref, p_extra);
end $$;
revoke execute on function fn_push_vorbereiten(text, uuid, jsonb) from public, anon;
grant execute on function fn_push_vorbereiten(text, uuid, jsonb) to authenticated;

-- ===== Startseite: offene Zeitraum-Bewerbungen zählen bei „Bewerbungen“ mit =====
alter function fn_heute(date, jsonb) rename to fn_heute_basis;
revoke execute on function fn_heute_basis(date, jsonb) from public, anon;          -- fn_heute läuft mit den Rechten der Person und ruft sie auf
create function fn_heute(p_heute date, p_anfrage jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare r jsonb;
begin
  r := fn_heute_basis(p_heute, p_anfrage);
  if coalesce((p_anfrage ->> 'bewerbungen')::boolean, false) then
    r := r || jsonb_build_object('bewerbungen', coalesce((r ->> 'bewerbungen')::int, 0) + (select count(*) from bewerbungen_zeitraum where status = 'offen'));
  end if;
  return r;
end $$;
revoke execute on function fn_heute(date, jsonb) from public, anon;
grant execute on function fn_heute(date, jsonb) to authenticated;

-- ════════ 0031_checkliste_termine.sql ════════
-- KiJuB-Kompass · 0031: Checkliste überarbeitet – Termine, Themen, Fälligkeit ab Ferienbeginn
--
-- Nach Durchsicht mit der Fachseite:
-- * Entfernt: „Leitung steht fest“, „Team ist zusammengestellt“, „Offene Bewerbungen sind entschieden“, „Infos für das Team
--   veröffentlicht“, „Alle haben die Hinweise gesehen“, „Lebensmittel-Verbrauch vollständig gebucht“.
-- * „Team kennt Teamermappe und Quiz“ und „Ernährung und Allergien im Team geprüft“ sind jetzt Themen des Vortreffens.
-- * Neu: „Vorgespräch mit der Freizeitenkoordination“, fällig 4 Wochen vor Beginn der Ferien (nicht der Freizeit).
-- * „Vortreffen mit dem Team“ ist 10 Tage vor Beginn der Freizeit fällig.
--
-- Technisch:
-- * bezug 'ferien': Fälligkeit relativ zum Ferienbeginn = Montag der Ferienwoche 1 (aus Ferienwoche und Start der Freizeit
--   berechnet; ohne Ferienwoche gilt der Start der Freizeit).
-- * termin_art ('hinweis' | 'absprache'): Der Punkt bekommt einen Termin. fn_checkliste_termin trägt ihn ein und legt dazu einen
--   Hinweis für das Team bzw. eine Absprache mit der Freizeitenkoordination an (ein geänderter Termin ersetzt sie).
-- * automatik 'termin': erledigt, sobald der eingetragene Termin vorbei ist.
-- * themen: Unterpunkte, die bei diesem Punkt besprochen werden; abgehakt wird je Freizeit (checkliste_status.themen_erledigt).

-- ===== Spalten =====
alter table checkliste_vorlage drop constraint checkliste_vorlage_bezug_check;
alter table checkliste_vorlage add constraint checkliste_vorlage_bezug_check check (bezug in ('start', 'ende', 'ferien'));
alter table checkliste_vorlage drop constraint checkliste_vorlage_automatik_check;
alter table checkliste_vorlage add constraint checkliste_vorlage_automatik_check
  check (automatik in ('leitung', 'team', 'bewerbungen', 'wochenplan', 'hinweis', 'hinweise_gesehen', 'lebensmittel', 'termin'));
alter table checkliste_vorlage add column termin_art text check (termin_art in ('hinweis', 'absprache'));
alter table checkliste_vorlage add column themen text[] not null default '{}'
  check (cardinality(themen) <= 20 and array_position(themen, '') is null);
alter table checkliste_vorlage add constraint checkliste_vorlage_termin_check check (automatik is distinct from 'termin' or termin_art is not null);

alter table checkliste_status add column termin timestamptz;
alter table checkliste_status add column termin_notiz_id uuid references notizen(id) on delete set null;
alter table checkliste_status add column themen_erledigt smallint[] not null default '{}';

-- ===== Ferienbeginn einer Freizeit =====
create function ferienbeginn(f freizeiten) returns date
language sql immutable set search_path = public, pg_temp as $$
  select case when f.ferienwoche is null then f.start_datum
              else (f.start_datum - (extract(isodow from f.start_datum)::int - 1)) - (f.ferienwoche - 1) * 7 end
$$;
revoke execute on function ferienbeginn(freizeiten) from public, anon;

-- ===== Punkte neu (mehr Spalten) =====
drop function fn_checkliste(uuid[]);
drop function checkliste_punkte(uuid);

create function checkliste_punkte(p_freizeit uuid)
returns table (art text, id uuid, titel text, beschreibung text, faellig date, ziel text, automatik text, auto_erfuellt boolean,
               status text, notiz text, geaendert_von uuid, geaendert_am timestamptz, reihenfolge int,
               termin_art text, termin timestamptz, themen text[], themen_erledigt smallint[])
language sql stable security definer set search_path = public, pg_temp as $$
  select 'vorlage', v.id, v.titel, v.beschreibung,
         (case v.bezug when 'start' then f.start_datum when 'ende' then f.ende_datum else ferienbeginn(f) end) + v.tage,
         v.ziel, v.automatik,
         case when v.automatik = 'termin' then coalesce(s.termin < now(), false) else checkliste_automatik(f.id, v.automatik) end,
         coalesce(s.status, 'offen'), coalesce(s.notiz, ''), s.geaendert_von, s.geaendert_am, v.position,
         v.termin_art, s.termin, v.themen, coalesce(s.themen_erledigt, '{}')
    from freizeiten f
    join checkliste_vorlage v on v.aktiv
    left join checkliste_status s on s.freizeit_id = f.id and s.vorlage_id = v.id
   where f.id = p_freizeit
  union all
  select 'eigen', e.id, e.titel, e.beschreibung, e.faellig_am, null, null, false, e.status, e.notiz, e.geaendert_von, e.geaendert_am, 100000,
         null, null, '{}', '{}'
    from checkliste_eigene e where e.freizeit_id = p_freizeit
$$;
revoke execute on function checkliste_punkte(uuid) from public, anon, authenticated;

create function fn_checkliste(p_freizeiten uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'freizeit_id', f.id, 'art', p.art, 'id', p.id, 'titel', p.titel, 'beschreibung', p.beschreibung, 'faellig', p.faellig,
           'ziel', p.ziel, 'automatik', p.automatik, 'auto_erfuellt', p.auto_erfuellt, 'status', p.status, 'notiz', p.notiz,
           'geaendert_von', p.geaendert_von, 'geaendert_am', p.geaendert_am,
           'termin_art', p.termin_art, 'termin', p.termin, 'themen', to_jsonb(p.themen), 'themen_erledigt', to_jsonb(p.themen_erledigt))
         order by f.start_datum, f.id, p.faellig nulls last, p.reihenfolge, p.titel), '[]'::jsonb)
    from freizeiten f, lateral checkliste_punkte(f.id) p
   where f.id = any(p_freizeiten) and (ist_freizeitkoord() or ist_leitung(f.id))
$$;
revoke execute on function fn_checkliste(uuid[]) from public, anon;
grant execute on function fn_checkliste(uuid[]) to authenticated;

-- ===== Termin eintragen =====
-- Trägt den Termin eines Punktes ein (oder löscht ihn mit p_termin = null) und legt dazu einen Hinweis für das Team bzw. eine Absprache
-- mit der Freizeitenkoordination an; ein früher angelegter Eintrag dieses Punktes wird ersetzt. Ergebnis: ID des neuen Eintrags
-- (für die Mitteilung), null beim Löschen.
create function fn_checkliste_termin(p_freizeit uuid, p_vorlage uuid, p_termin timestamptz, p_text text default '') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v checkliste_vorlage; s checkliste_status; n_id uuid; lokal timestamp; txt text;
  tage text[] := array['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
begin
  if not (ist_freizeitkoord() or ist_leitung(p_freizeit)) then
    raise exception 'Nur die Leitung der Freizeit und die Freizeitenkoordination dürfen Termine eintragen' using errcode = '42501';
  end if;
  select * into v from checkliste_vorlage where id = p_vorlage;
  if v.id is null or v.termin_art is null then raise exception 'Für diesen Punkt gibt es keinen Termin' using errcode = 'check_violation'; end if;
  if length(coalesce(p_text, '')) > 1000 then raise exception 'Der Text ist zu lang (höchstens 1000 Zeichen)' using errcode = 'check_violation'; end if;

  select * into s from checkliste_status where freizeit_id = p_freizeit and vorlage_id = p_vorlage;
  if s.termin_notiz_id is not null then delete from notizen where id = s.termin_notiz_id; end if;

  if p_termin is not null then
    lokal := p_termin at time zone 'Europe/Berlin';
    txt := v.titel || ': ' || tage[extract(isodow from lokal)::int] || ', ' || to_char(lokal, 'DD.MM.YYYY') || ', ' || to_char(lokal, 'HH24:MI') || ' Uhr'
           || case when trim(coalesce(p_text, '')) <> '' then E'\n' || trim(p_text) else '' end
           || case when cardinality(v.themen) > 0 then E'\nThemen: ' || array_to_string(v.themen, ', ') else '' end;
    insert into notizen (freizeit_id, art, geltung, datum, text, erstellt_von)
    values (p_freizeit, v.termin_art::notiz_art, 'tag', lokal::date, txt, meine_person_id())
    returning id into n_id;
  end if;

  insert into checkliste_status (freizeit_id, vorlage_id, termin, termin_notiz_id)
  values (p_freizeit, p_vorlage, p_termin, n_id)
  on conflict (freizeit_id, vorlage_id) do update set termin = excluded.termin, termin_notiz_id = excluded.termin_notiz_id;
  return n_id;
end $$;
revoke execute on function fn_checkliste_termin(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function fn_checkliste_termin(uuid, uuid, timestamptz, text) to authenticated;

-- ===== Inhalt der Standard-Checkliste =====
delete from checkliste_vorlage where titel in (
  'Leitung steht fest', 'Team ist zusammengestellt', 'Offene Bewerbungen sind entschieden', 'Infos für das Team veröffentlicht',
  'Alle haben die Hinweise gesehen', 'Lebensmittel-Verbrauch vollständig gebucht',
  'Team kennt Teamermappe und Quiz', 'Ernährung und Allergien im Team geprüft');

update checkliste_vorlage
   set titel = 'Vortreffen mit dem Team',
       beschreibung = 'Termin für das Treffen mit allen Teammitgliedern festlegen. Beim Eintragen bekommt das Team einen Hinweis mit Termin und Themen; erledigt, sobald das Treffen stattgefunden hat.',
       bezug = 'start', tage = -10, ziel = 'hinweise', automatik = 'termin', termin_art = 'hinweis', position = 20,
       themen = array['Teamermappe und Quiz (Qualitätsstandards, Notfall)', 'Ernährung und Allergien im Team']
 where titel = 'Vortreffen mit dem Team geplant';

insert into checkliste_vorlage (position, titel, beschreibung, bezug, tage, ziel, automatik, termin_art) values
  (10, 'Vorgespräch mit der Freizeitenkoordination',
   'Gemeinsam einen Termin vereinbaren – spätestens 4 Wochen vor Beginn der Ferien. Beim Eintragen entsteht eine Absprache, die die Freizeitenkoordination sieht und bestätigt; erledigt, sobald das Gespräch stattgefunden hat.',
   'ferien', -28, null, 'termin', 'absprache');
