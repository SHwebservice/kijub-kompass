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
