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
