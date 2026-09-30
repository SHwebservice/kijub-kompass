-- KiJuB-Kompass · alle Migrationen in einer Datei (GENERIERT – nicht von Hand ändern)
-- Erzeugt mit: npm run sql:bundle
-- Nur für ein LEERES Projekt gedacht: einmal komplett im SQL Editor ausführen.
-- Enthalten: 0001_stammdaten.sql, 0002_freizeit_details.sql, 0003_treffs_dienste.sql, 0004_inhalte_betrieb.sql, 0005_hilfsfunktionen.sql, 0006_rls.sql, 0007_sichten_funktionen.sql, 0008_standardrechte.sql, 0009_person_entfernen.sql

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
