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
