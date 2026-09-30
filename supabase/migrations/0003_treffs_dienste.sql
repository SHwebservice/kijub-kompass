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
