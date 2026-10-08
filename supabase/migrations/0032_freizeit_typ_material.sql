-- KiJuB-Kompass · 0032: Freizeit-Typ, Abend nur bei Übernachtungsfreizeiten, Materialliste, Checkliste (zweite Durchsicht)
--
-- 1) freizeiten.typ: 1 Themenfreizeit, 2 Betreuungsfreizeit, 3 Großfreizeit, 4 Übernachtungsfreizeit (leer = noch nicht festgelegt).
-- 2) Wochenplan: Standard sind die Abschnitte Vormittag und Nachmittag. Einen Abschnitt „Abend“ gibt es nur bei Übernachtungsfreizeiten
--    (Typ 4); er ist freiwillig. „Wochenplan steht“ heißt jetzt: an jedem Tag ist Vormittag und Nachmittag belegt.
-- 3) Materialliste: Die Leitung schreibt die Liste in der App (freizeit_materialliste) und gibt sie an die Freizeitenkoordination ab
--    (fn_materialliste_abgeben, Mitteilung an die Freizeitenkoordination). Abgeben hakt den Checklisten-Punkt ab; wer die Liste außerhalb
--    der App schreibt, hakt ihn von Hand ab.
-- 4) Standard-Checkliste nach der zweiten Durchsicht mit der Fachseite (siehe unten).

-- ===== 1) Typ =====
alter table freizeiten add column typ smallint check (typ between 1 and 4);

-- ===== 2) Abend nur bei Übernachtungsfreizeiten =====
create function fn_slot_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if lower(trim(new.name)) = 'abend' and not exists (select 1 from freizeiten where id = new.freizeit_id and typ = 4) then
    raise exception 'Einen Abend-Abschnitt gibt es nur bei Übernachtungsfreizeiten (Typ 4)' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function fn_slot_pruefen() from public, anon;
create trigger freizeit_slots_pruefen before insert or update of name on freizeit_slots for each row execute function fn_slot_pruefen();

-- ===== 3) Materialliste =====
create table freizeit_materialliste (
  id           uuid primary key default gen_random_uuid(),
  freizeit_id  uuid not null references freizeiten(id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 200),
  menge        text not null default '' check (length(menge) <= 100),
  notiz        text not null default '' check (length(notiz) <= 500),
  erstellt_von uuid references personen(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index freizeit_materialliste_freizeit on freizeit_materialliste (freizeit_id, created_at);

create table materialliste_abgabe (
  freizeit_id   uuid primary key references freizeiten(id) on delete cascade,
  abgegeben_von uuid references personen(id) on delete set null,
  abgegeben_am  timestamptz not null default now()
);

create function fn_materialliste_vermerken() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von); new.created_at := now();
  else
    if new.freizeit_id is distinct from old.freizeit_id then raise exception 'Material lässt sich nicht in eine andere Freizeit verschieben' using errcode = 'check_violation'; end if;
    new.erstellt_von := old.erstellt_von; new.created_at := old.created_at;
  end if;
  return new;
end $$;
revoke execute on function fn_materialliste_vermerken() from public, anon;
create trigger freizeit_materialliste_vermerken before insert or update on freizeit_materialliste for each row execute function fn_materialliste_vermerken();

alter table freizeit_materialliste enable row level security;
alter table materialliste_abgabe enable row level security;
revoke all on freizeit_materialliste, materialliste_abgabe from anon;
grant select, insert, update, delete on freizeit_materialliste to authenticated;
grant select on materialliste_abgabe to authenticated;          -- geschrieben wird nur über fn_materialliste_abgeben
create policy alles on freizeit_materialliste for all to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id)) with check (ist_freizeitkoord() or ist_leitung(freizeit_id));
create policy lesen on materialliste_abgabe for select to authenticated using (ist_freizeitkoord() or ist_leitung(freizeit_id));

-- Abgeben (auch erneut nach Änderungen): vermerkt wer und wann. Eine leere Liste lässt sich nicht abgeben.
create function fn_materialliste_abgeben(p_freizeit uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (ist_freizeitkoord() or ist_leitung(p_freizeit)) then
    raise exception 'Nur die Leitung der Freizeit darf die Materialliste abgeben' using errcode = '42501';
  end if;
  if not exists (select 1 from freizeit_materialliste where freizeit_id = p_freizeit) then
    raise exception 'Die Materialliste ist noch leer' using errcode = 'check_violation';
  end if;
  insert into materialliste_abgabe (freizeit_id, abgegeben_von, abgegeben_am) values (p_freizeit, meine_person_id(), now())
  on conflict (freizeit_id) do update set abgegeben_von = excluded.abgegeben_von, abgegeben_am = excluded.abgegeben_am;
end $$;
revoke execute on function fn_materialliste_abgeben(uuid) from public, anon;
grant execute on function fn_materialliste_abgeben(uuid) to authenticated;

-- Mitteilung „Materialliste abgegeben“ an die Freizeitenkoordination (ref = Freizeit; nur direkt nach der eigenen Abgabe)
create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare z bewerbungen_zeitraum; a materialliste_abgabe; f freizeiten; ich uuid := meine_person_id();
begin
  if p_art = 'bewerbung_zeitraum' then
    select * into z from bewerbungen_zeitraum where id = p_ref and person_id = ich and created_at >= now() - interval '10 minutes';
    if z.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv)),
      'titel', 'Neue Bewerbung', 'text', fn_push_name(ich) || ' bewirbt sich für ' || zeitraum_text(z) || '.', 'url', '/bewerbungen');
  elsif p_art = 'materialliste' then
    select * into a from materialliste_abgabe where freizeit_id = p_ref and abgegeben_von = ich and abgegeben_am >= now() - interval '10 minutes';
    if a.freizeit_id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into f from freizeiten where id = p_ref;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select id from personen where ist_freizeitkoordination and aktiv and id <> ich)),
      'titel', 'Materialliste · ' || f.name, 'text', fn_push_name(ich) || ' hat die Materialliste abgegeben (' ||
        (select count(*) from freizeit_materialliste where freizeit_id = f.id) || ' Positionen).', 'url', '/freizeiten/' || f.id || '/material');
  end if;
  return fn_push_vorbereiten_basis(p_art, p_ref, p_extra);
end $$;

-- ===== Automatik: Wochenplan (Vormittag und Nachmittag) und Materialliste =====
alter table checkliste_vorlage drop constraint checkliste_vorlage_automatik_check;
alter table checkliste_vorlage add constraint checkliste_vorlage_automatik_check
  check (automatik in ('leitung', 'team', 'bewerbungen', 'wochenplan', 'hinweis', 'hinweise_gesehen', 'lebensmittel', 'termin', 'materialliste'));
alter table checkliste_vorlage drop constraint checkliste_vorlage_ziel_check;
alter table checkliste_vorlage add constraint checkliste_vorlage_ziel_check
  check (ziel in ('team', 'plan', 'hinweise', 'lebensmittel', 'teamermappe', 'quiz', 'formulare', 'material'));

create or replace function checkliste_automatik(p_freizeit uuid, p_art text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f freizeiten;
begin
  select * into f from freizeiten where id = p_freizeit;
  if f.id is null or p_art is null then return false; end if;
  return case p_art
    when 'leitung' then exists (select 1 from freizeit_team where freizeit_id = f.id and rolle = 'leitung')
    when 'team' then exists (select 1 from freizeit_team where freizeit_id = f.id and rolle = 'teamer')
    when 'bewerbungen' then not exists (select 1 from bewerbungen where freizeit_id = f.id and status = 'offen')
    -- jeder Tag hat einen Eintrag am Vormittag und am Nachmittag (der Abend ist freiwillig)
    when 'wochenplan' then not exists (
      select 1 from generate_series(f.start_datum, f.ende_datum, interval '1 day') g(tag), unnest(array['vormittag', 'nachmittag']) a(abschnitt)
       where not exists (select 1 from plan_eintraege e join freizeit_slots s on s.id = e.slot_id
                          where e.freizeit_id = f.id and e.datum = g.tag::date and lower(s.name) = a.abschnitt))
    when 'hinweis' then exists (select 1 from notizen where freizeit_id = f.id and art = 'hinweis')
    when 'hinweise_gesehen' then exists (select 1 from notizen where freizeit_id = f.id and art = 'hinweis')
      and not exists (select 1 from notizen n join freizeit_team t on t.freizeit_id = f.id and t.rolle = 'teamer'
                       where n.freizeit_id = f.id and n.art = 'hinweis'
                         and not exists (select 1 from notiz_bestaetigungen b where b.notiz_id = n.id and b.person_id = t.person_id))
    when 'lebensmittel' then f.ort_id is not null
      and exists (select 1 from lebensmittel_eingang e where e.ort_id = f.ort_id and (e.freizeit_id = f.id or e.datum >= f.start_datum - 60))
    when 'materialliste' then exists (select 1 from materialliste_abgabe where freizeit_id = f.id)
    else false
  end;
end $$;

-- ===== 4) Standard-Checkliste (zweite Durchsicht) =====
delete from checkliste_vorlage where titel = 'Notfallnummern und Erste-Hilfe-Material geprüft';

update checkliste_vorlage set position = 30,
       beschreibung = 'An jedem Tag ist am Vormittag und am Nachmittag etwas eingetragen. Einen Abend-Abschnitt gibt es nur bei Übernachtungsfreizeiten; er ist freiwillig.'
 where titel = 'Wochenplan steht';

update checkliste_vorlage set titel = 'Lebensmittel kontrollieren', automatik = null, position = 40,
       beschreibung = 'Bestand am Ort ansehen: Ist genug da? Bestellung und Nachkauf übernimmt die Freizeitenkoordination.'
 where titel = 'Lebensmittel-Bestand am Ort geprüft';

update checkliste_vorlage set titel = 'Leitungsmappe überprüft', tage = -4, ziel = null, position = 45,
       beschreibung = 'Die Freizeitenkoordination stellt die Leitungsmappe mit allen benötigten Formularen bereit. Prüfen, ob alles vollständig ist.'
 where titel = 'Formulare vorbereitet';

update checkliste_vorlage set bezug = 'ende', tage = 0, position = 60,
       beschreibung = 'Am letzten Tag der Freizeit: Was lief gut, was nehmen wir mit?'
 where titel = 'Nachbesprechung mit dem Team';

update checkliste_vorlage set position = 10 where titel = 'Vorgespräch mit der Freizeitenkoordination';
update checkliste_vorlage set position = 20 where titel = 'Vortreffen mit dem Team';

insert into checkliste_vorlage (position, titel, beschreibung, bezug, tage, ziel, automatik, termin_art, themen) values
  (15, 'Materialliste geschrieben und an die Freizeitenkoordination abgegeben',
   'Im Reiter „Material“ die Liste schreiben und abgeben – oder, wenn die Liste anders abgegeben wurde, hier abhaken.',
   'start', -28, 'material', 'materialliste', null, '{}'),
  (35, 'Übergabe der Räumlichkeiten',
   'Die Räume vor Ort übernehmen und dabei diese Punkte durchgehen.', 'start', -14, null, null, null,
   array['Schlüssel übernommen (Anzahl notiert)', 'Zählerstände abgelesen (Strom, Wasser, ggf. Gas)', 'Vorhandene Schäden und Mängel dokumentiert (mit Fotos)',
         'Inventar und Ausstattung geprüft', 'Küche und Hygiene geprüft (Kühlschrank, Geschirr, Reinigungsmittel)',
         'Fluchtwege, Notausgänge und Feuerlöscher angesehen', 'Erste-Hilfe-Kasten vor Ort geprüft', 'Müllentsorgung geklärt',
         'Hausordnung und Besonderheiten besprochen', 'Ansprechperson vor Ort mit Telefonnummer notiert', 'Rückgabe-Termin und Zustand bei Rückgabe vereinbart']),
  (50, 'Material überprüft', 'Ist das Material vollständig da und einsatzbereit?', 'start', -3, 'material', null, null, '{}'),
  (70, 'Nachgespräch mit der Freizeitenkoordination',
   'Etwa 4 Wochen nach Ende gemeinsam auf die Freizeit zurückschauen. Beim Eintragen entsteht eine Absprache, die die Freizeitenkoordination sieht und bestätigt; erledigt, sobald das Gespräch stattgefunden hat.',
   'ende', 28, null, 'termin', 'absprache', '{}');
