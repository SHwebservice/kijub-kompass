-- KiJuB-Kompass · 0037: Teamprotokolle gegliedert, mit Entwurf, gemeldeten Änderungen und Rücksicht auf neue Teammitglieder
--
-- 1) Gliederung: Ein Protokoll besteht aus Abschnitten (abschnitte = [{titel, text}], Überschrift + Ergebnis; in der App einklappbar)
--    und am Ende optional dem nächsten Treffen (naechstes_datum, naechstes_zeit) sowie den Aufgaben und Zielen (aufgaben).
--    Die Spalte `text` füllt die Datenbank als reinen Text aus allem (für Suche/Export und ältere Stände der App).
--    Bestehende Protokolle werden zu einem Abschnitt ohne Überschrift. Wer nur `text` schreibt, bekommt ebenfalls einen solchen Abschnitt.
-- 2) Entwurf (entwurf): sehen nur Treffleitung und Treffkoordination, ohne Mitteilung und ohne „gelesen“. Mit dem Veröffentlichen
--    (entwurf → false) setzt die Datenbank gemeldet_am/gemeldet_von; erst dann darf die Mitteilung an das Team raus. Zurück zum Entwurf geht nicht.
-- 3) Änderung melden (fn_teamprotokoll_aenderung_melden): setzt den Gelesen-Stand zurück, alle lesen erneut; Mitteilung 'teamprotokoll_geaendert'.
-- 4) Neue Teammitglieder: Wer einem Treff zugeordnet wird, bekommt die schon veröffentlichten Protokolle als „vor Eintritt“ vermerkt
--    (treff_teamprotokoll_gelesen.vor_eintritt) – sie gelten nicht als ungelesen, erscheinen bei der Treffleitung aber nicht als „gelesen“.
--    Wird eine Änderung gemeldet, zählt das Protokoll auch für sie wieder als ungelesen.
--
-- Mitteilungen: fn_push_vorbereiten wird hier NICHT neu geschrieben, sondern umbenannt (fn_push_vorbereiten_vor_0037) und von einer neuen
-- fn_push_vorbereiten umhüllt, die nur die Arten 'teamprotokoll' und 'teamprotokoll_geaendert' selbst beantwortet. Wer fn_push_vorbereiten
-- später neu schreibt, muss diese beiden Zweige übernehmen.
--
-- Die Datei läuft auch ein zweites Mal ohne Schaden (falls ein erster Versuch im SQL Editor mittendrin abbrach), und sie kommt
-- ohne Zeichenketten mit Backslash aus – Zeilenumbrüche entstehen mit chr(10).

alter table treff_teamprotokolle
  add column if not exists abschnitte jsonb not null default '[]',
  add column if not exists naechstes_datum date,
  add column if not exists naechstes_zeit  time,
  add column if not exists aufgaben        text not null default '' check (length(aufgaben) <= 5000),
  add column if not exists entwurf         boolean not null default false,
  add column if not exists gemeldet_am     timestamptz,
  add column if not exists gemeldet_von    uuid references personen(id) on delete set null;
alter table treff_teamprotokolle drop constraint if exists treff_teamprotokolle_text_check;
alter table treff_teamprotokolle alter column text set default '';

alter table treff_teamprotokoll_gelesen add column if not exists vor_eintritt boolean not null default false;

-- Bestand: ein Abschnitt ohne Überschrift; gemeldet beim Anlegen (der Trigger kommt erst danach)
update treff_teamprotokolle set abschnitte = jsonb_build_array(jsonb_build_object('titel', '', 'text', text)), gemeldet_am = created_at, gemeldet_von = erstellt_von
 where abschnitte = '[]'::jsonb and gemeldet_am is null;

create or replace function fn_teamprotokoll_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare inhalt text;
begin
  if exists (select 1 from unnest(new.anwesend) a(pid) where not exists (select 1 from treff_team t where t.treff_id = new.treff_id and t.person_id = a.pid)) then
    raise exception 'Anwesend können nur Personen aus dem Team des Treffs sein' using errcode = 'check_violation';
  end if;
  new.anwesend := array(select distinct x from unnest(new.anwesend) x);

  -- Abschnitte: wer nur `text` schreibt (oder ändert), bekommt einen Abschnitt ohne Überschrift
  if new.abschnitte is null or jsonb_typeof(new.abschnitte) <> 'array' then
    raise exception 'Die Abschnitte müssen eine Liste sein' using errcode = 'check_violation';
  end if;
  if (tg_op = 'INSERT' and jsonb_array_length(new.abschnitte) = 0 and trim(coalesce(new.text, '')) <> '')
     or (tg_op = 'UPDATE' and new.text is distinct from old.text and new.abschnitte = old.abschnitte) then
    new.abschnitte := jsonb_build_array(jsonb_build_object('titel', '', 'text', trim(coalesce(new.text, ''))));
  end if;
  if exists (select 1 from jsonb_array_elements(new.abschnitte) e
             where jsonb_typeof(e) <> 'object' or jsonb_typeof(coalesce(e -> 'titel', '""')) <> 'string' or jsonb_typeof(coalesce(e -> 'text', '""')) <> 'string'
                or length(trim(coalesce(e ->> 'titel', ''))) > 200) then
    raise exception 'Jeder Abschnitt braucht eine Überschrift (höchstens 200 Zeichen) und einen Text' using errcode = 'check_violation';
  end if;
  new.abschnitte := coalesce((
    select jsonb_agg(jsonb_build_object('titel', trim(coalesce(e ->> 'titel', '')), 'text', trim(coalesce(e ->> 'text', ''))) order by nr)
    from jsonb_array_elements(new.abschnitte) with ordinality x(e, nr)
    where trim(coalesce(e ->> 'titel', '')) <> '' or trim(coalesce(e ->> 'text', '')) <> ''), '[]');
  if jsonb_array_length(new.abschnitte) > 50 then raise exception 'Höchstens 50 Abschnitte' using errcode = 'check_violation'; end if;

  new.aufgaben := trim(coalesce(new.aufgaben, ''));
  if new.naechstes_datum is null then new.naechstes_zeit := null; end if;

  -- reiner Text aus allem
  select string_agg(case when e ->> 'titel' <> '' then e ->> 'titel' || case when e ->> 'text' <> '' then chr(10) || (e ->> 'text') else '' end else e ->> 'text' end, chr(10) || chr(10) order by nr)
    into inhalt from jsonb_array_elements(new.abschnitte) with ordinality x(e, nr);
  if new.naechstes_datum is not null then
    inhalt := concat_ws(chr(10) || chr(10), inhalt, 'Nächstes Treffen: ' || to_char(new.naechstes_datum, 'DD.MM.YYYY') || coalesce(' um ' || to_char(new.naechstes_zeit, 'HH24:MI') || ' Uhr', ''));
  end if;
  if new.aufgaben <> '' then inhalt := concat_ws(chr(10) || chr(10), inhalt, 'Aufgaben und Ziele:' || chr(10) || new.aufgaben); end if;
  new.text := coalesce(inhalt, '');
  if length(new.text) > 20000 then raise exception 'Das Protokoll ist zu lang (höchstens 20000 Zeichen)' using errcode = 'check_violation'; end if;
  if not new.entwurf and new.text = '' then raise exception 'Ein veröffentlichtes Protokoll braucht einen Inhalt' using errcode = 'check_violation'; end if;

  if tg_op = 'INSERT' then
    new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von); new.created_at := now();
    if new.entwurf then new.gemeldet_am := null; new.gemeldet_von := null;
    else new.gemeldet_am := now(); new.gemeldet_von := coalesce(meine_person_id(), new.erstellt_von); end if;
  else
    if new.treff_id is distinct from old.treff_id then raise exception 'Ein Protokoll lässt sich nicht in einen anderen Treff verschieben' using errcode = 'check_violation'; end if;
    if new.entwurf and not old.entwurf then raise exception 'Ein veröffentlichtes Protokoll wird nicht wieder zum Entwurf' using errcode = 'check_violation'; end if;
    new.erstellt_von := old.erstellt_von; new.created_at := old.created_at;
    if old.entwurf and not new.entwurf then
      new.gemeldet_am := now(); new.gemeldet_von := coalesce(meine_person_id(), new.gemeldet_von);
    elsif coalesce(current_setting('kompass.teamprotokoll_melden', true), '') <> 'ja' then
      new.gemeldet_am := old.gemeldet_am; new.gemeldet_von := old.gemeldet_von;     -- melden nur über fn_teamprotokoll_aenderung_melden
    end if;
  end if;
  new.bearbeitet_von := coalesce(meine_person_id(), new.bearbeitet_von);
  new.updated_at := now();
  return new;
end $fn$;

-- Entwürfe sehen nur Treffleitung und Treffkoordination
drop policy if exists lesen on treff_teamprotokolle;
create policy lesen on treff_teamprotokolle for select to authenticated
  using (ist_treffkoord() or ist_treffleitung(treff_id) or (not entwurf and ist_im_treff(treff_id)));

-- „Gelesen“ gibt es nur bei veröffentlichten Protokollen
create or replace function darf_teamprotokoll_sehen(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $fn$
  select exists (select 1 from treff_teamprotokolle p where p.id = pid and not p.entwurf and (ist_treffkoord() or ist_im_treff(p.treff_id)))
$fn$;

-- Änderung ans Team melden: Gelesen-Stand zurücksetzen, gemeldet_am/-von setzen (danach darf die Mitteilung raus)
create or replace function fn_teamprotokoll_aenderung_melden(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare tp treff_teamprotokolle;
begin
  select * into tp from treff_teamprotokolle where id = p_id;
  if tp.id is null or not (ist_treffkoord() or ist_treffleitung(tp.treff_id)) then
    raise exception 'Keine Berechtigung' using errcode = '42501';
  end if;
  if tp.entwurf then raise exception 'Ein Entwurf wird veröffentlicht, nicht gemeldet' using errcode = 'check_violation'; end if;
  perform set_config('kompass.teamprotokoll_melden', 'ja', true);
  update treff_teamprotokolle set gemeldet_am = now(), gemeldet_von = meine_person_id() where id = p_id;
  perform set_config('kompass.teamprotokoll_melden', '', true);
  delete from treff_teamprotokoll_gelesen where protokoll_id = p_id;
end $fn$;
revoke execute on function fn_teamprotokoll_aenderung_melden(uuid) from public, anon;
grant execute on function fn_teamprotokoll_aenderung_melden(uuid) to authenticated;

-- Neu im Team: bisherige Protokolle gelten als „vor Eintritt“ und damit nicht als ungelesen
create or replace function fn_treff_team_teamprotokolle() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  insert into treff_teamprotokoll_gelesen (protokoll_id, person_id, vor_eintritt)
  select p.id, new.person_id, true from treff_teamprotokolle p where p.treff_id = new.treff_id and not p.entwurf
  on conflict do nothing;
  return null;
end $fn$;
revoke execute on function fn_treff_team_teamprotokolle() from public, anon;
drop trigger if exists treff_team_teamprotokolle on treff_team;
create trigger treff_team_teamprotokolle after insert on treff_team for each row execute function fn_treff_team_teamprotokolle();

-- ===== Mitteilungen 'teamprotokoll' (veröffentlicht) und 'teamprotokoll_geaendert' (Änderung gemeldet) =====
-- Umbenennen nur, wenn fn_push_vorbereiten noch nicht die Hülle ist. Hat eine spätere Migration sie überschrieben (z. B. 0036 erst nach
-- 0037 eingespielt), wird deren Fassung zur neuen inneren Funktion – ein erneuter Lauf von 0037 stellt die Hülle so wieder her.
do $do$
begin
  if exists (select 1 from pg_proc where proname = 'fn_push_vorbereiten' and pronamespace = 'public'::regnamespace
             and prosrc not like '%fn_push_vorbereiten_vor_0037%') then
    drop function if exists fn_push_vorbereiten_vor_0037(text, uuid, jsonb);
    alter function fn_push_vorbereiten(text, uuid, jsonb) rename to fn_push_vorbereiten_vor_0037;
  end if;
end $do$;
revoke execute on function fn_push_vorbereiten_vor_0037(text, uuid, jsonb) from public, anon, authenticated;

create or replace function fn_push_vorbereiten(p_art text, p_ref uuid default null, p_extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare tp treff_teamprotokolle; t treffs; ich uuid := meine_person_id();
begin
  if p_art in ('teamprotokoll', 'teamprotokoll_geaendert') then
    select * into tp from treff_teamprotokolle where id = p_ref and not entwurf and gemeldet_von = ich and gemeldet_am >= now() - interval '10 minutes';
    if tp.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    select * into t from treffs where id = tp.treff_id;
    return jsonb_build_object(
      'empfaenger', to_jsonb(array(select tm.person_id from treff_team tm join personen p on p.id = tm.person_id
                                   where tm.treff_id = t.id and p.aktiv and tm.person_id <> ich)),
      'titel', case when p_art = 'teamprotokoll' then 'Neues Teamprotokoll · ' else 'Teamprotokoll geändert · ' end || t.name,
      'text', tp.titel || ' (' || to_char(tp.datum, 'DD.MM.YYYY') || ') – ' || case when p_art = 'teamprotokoll' then 'bitte lesen.' else 'bitte noch einmal lesen.' end,
      'url', '/treffs/' || t.id || '/teamprotokolle');
  end if;
  return fn_push_vorbereiten_vor_0037(p_art, p_ref, p_extra);
end $fn$;
revoke execute on function fn_push_vorbereiten(text, uuid, jsonb) from public, anon;
grant execute on function fn_push_vorbereiten(text, uuid, jsonb) to authenticated;
