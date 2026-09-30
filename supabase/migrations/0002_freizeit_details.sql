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
