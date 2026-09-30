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
