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
