-- KiJuB-Kompass · 0018 Koordination getrennt: Freizeitenkoordination und Treffkoordination
--
-- Bisher gab es eine einzige Koordination mit allen Rechten. Jetzt gibt es zwei Bereiche – eine Person kann beide sein:
--   Freizeitenkoordination: Freizeiten (Stammdaten, Team, Wochenplan, Hinweise, Absprachen), Bewerbungen, Lebensmittel, KiJuKo-Import
--   Treffkoordination:      Treffs (Stammdaten, Team, Öffnungszeiten, Wochenprogramm), Dienstplan, Wünsche, Abwesenheiten, Feiertage,
--                           Nachweise, Tagesprotokolle, Notizen, Treff-Absprachen
--   Gemeinsam (jede der beiden): Personen und Zugänge, Orte, Katalog, Quiz, Mappen, Einstellungen, manuelle Mitteilungen
--                           (an Freizeiten nur Freizeitenkoordination, an Treffs nur Treffkoordination)
-- Bestehende Koordinationen bekommen beide Bereiche – es ändert sich für niemanden etwas, bis die Bereiche getrennt vergeben werden.
-- „ist_koordination“ bleibt als abgeleitete Angabe „Koordination irgendeines Bereichs“ erhalten (ist_koord() und der Altbestand nutzen sie).

alter table personen
  add column ist_freizeitkoordination boolean not null default false,
  add column ist_treffkoordination    boolean not null default false;
update personen set ist_freizeitkoordination = ist_koordination, ist_treffkoordination = ist_koordination where ist_koordination;

-- ist_koordination = Freizeiten- ODER Treffkoordination. Wer (wie Altcode und Import) nur ist_koordination setzt, meint beide Bereiche.
create function fn_koordination_abgleichen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.ist_koordination and not new.ist_freizeitkoordination and not new.ist_treffkoordination then
      new.ist_freizeitkoordination := true; new.ist_treffkoordination := true;
    end if;
  elsif new.ist_koordination is distinct from old.ist_koordination
        and new.ist_freizeitkoordination is not distinct from old.ist_freizeitkoordination
        and new.ist_treffkoordination is not distinct from old.ist_treffkoordination then
    new.ist_freizeitkoordination := new.ist_koordination; new.ist_treffkoordination := new.ist_koordination;
  end if;
  new.ist_koordination := new.ist_freizeitkoordination or new.ist_treffkoordination;
  return new;
end $$;
-- Der Name sorgt dafür, dass dieser Abgleich vor dem Schutz der letzten Koordination läuft
create trigger koord_00_abgleichen before insert or update on personen for each row execute function fn_koordination_abgleichen();

-- Die letzte aktive Person je Bereich darf weder gelöscht noch deaktiviert noch herabgestuft werden.
create or replace function fn_letzte_koordination_schuetzen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.ist_freizeitkoordination and old.aktiv
     and (tg_op = 'DELETE' or not new.ist_freizeitkoordination or not new.aktiv) then
    if not exists (select 1 from personen p where p.id <> old.id and p.ist_freizeitkoordination and p.aktiv) then
      raise exception 'Die letzte aktive Koordination der Freizeiten kann nicht gelöscht, deaktiviert oder herabgestuft werden'
        using errcode = 'check_violation';
    end if;
  end if;
  if old.ist_treffkoordination and old.aktiv
     and (tg_op = 'DELETE' or not new.ist_treffkoordination or not new.aktiv) then
    if not exists (select 1 from personen p where p.id <> old.id and p.ist_treffkoordination and p.aktiv) then
      raise exception 'Die letzte aktive Koordination der Treffs kann nicht gelöscht, deaktiviert oder herabgestuft werden'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger letzte_koordination_schuetzen on personen;
create trigger letzte_koordination_schuetzen
  before update of ist_koordination, ist_freizeitkoordination, ist_treffkoordination, aktiv or delete on personen
  for each row execute function fn_letzte_koordination_schuetzen();

-- ===== Hilfsfunktionen =====
create function ist_freizeitkoord() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select ist_freizeitkoordination from personen where auth_user_id = auth.uid() and aktiv), false)
$$;
create function ist_treffkoord() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select ist_treffkoordination from personen where auth_user_id = auth.uid() and aktiv), false)
$$;
revoke execute on function ist_freizeitkoord(), ist_treffkoord(), fn_koordination_abgleichen() from public, anon;
grant execute on function ist_freizeitkoord(), ist_treffkoord() to authenticated;

-- Hinweise und Absprachen: Freizeit-Notizen betreffen die Freizeitenkoordination, Treff-Notizen die Treffkoordination
create or replace function notiz_sichtbar(fid uuid, tid uuid, a notiz_art) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (fid is not null and ist_freizeitkoord())
      or (tid is not null and ist_treffkoord())
      or (fid is not null and a = 'hinweis'   and ist_im_team(fid))
      or (fid is not null and a = 'absprache' and ist_leitung(fid))
      or (tid is not null and ist_im_treff(tid))
$$;

create or replace function darf_notiz_schreiben(fid uuid, tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (fid is not null and (ist_freizeitkoord() or ist_leitung(fid)))
      or (tid is not null and (ist_treffkoord() or ist_treffleitung(tid)))
$$;

create or replace function darf_notiz_bestaetigen(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and (
       (n.freizeit_id is not null and n.art = 'hinweis'   and ist_teamer(n.freizeit_id))
    or (n.freizeit_id is not null and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_freizeitkoord()))
    or (n.treff_id    is not null and (ist_im_treff(n.treff_id) or ist_treffkoord()))))
$$;

create or replace function darf_notiz_kommentieren(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and n.freizeit_id is not null
                    and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_freizeitkoord()))
$$;

-- Sichten: Kontaktdaten der Teams sehen Leitung bzw. die Koordination des jeweiligen Bereichs
create or replace view v_team_freizeit as
  select t.freizeit_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.mail            end as mail,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.telefon         end as telefon,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.ernaehrung::text end as ernaehrung,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.notizen         end as notizen,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.tzk_max_stunden end as tzk_max_stunden
    from freizeit_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_team(t.freizeit_id) or ist_freizeitkoord());

create or replace view v_team_treff as
  select t.treff_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.mail            end as mail,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.telefon         end as telefon,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_treffleitung(t.treff_id) or ist_treffkoord() then p.tzk_max_stunden end as tzk_max_stunden
    from treff_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_treff(t.treff_id) or ist_treffkoord());

-- ===== Zugriffsregeln der Tabellen und Funktionen je Bereich umstellen =====
-- Die Regeln selbst bleiben unverändert; nur „ist_koord()“ (irgendeine Koordination) wird durch die Koordination des Bereichs ersetzt.
do $$
declare r record; q text; w text;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname, p.qual, p.with_check,
           case when p.tablename = any(array['freizeiten', 'freizeit_team', 'freizeit_slots', 'plan_eintraege', 'freizeit_verpflegung', 'freizeit_material', 'freizeit_tags', 'lebensmittel_eingang', 'lebensmittel_verbrauch', 'bewerbungen', 'import_laeufe', 'import_staende', 'notiz_kommentare']) then 'ist_freizeitkoord()' else 'ist_treffkoord()' end as ziel
      from pg_policies p
     where p.schemaname = 'public' and p.tablename = any(array['freizeiten', 'freizeit_team', 'freizeit_slots', 'plan_eintraege', 'freizeit_verpflegung', 'freizeit_material', 'freizeit_tags', 'lebensmittel_eingang', 'lebensmittel_verbrauch', 'bewerbungen', 'import_laeufe', 'import_staende', 'notiz_kommentare'] || array['treffs', 'treff_team', 'treff_oeffnungszeiten', 'treff_plan_eintraege', 'dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'dienstplan_kommentare', 'abwesenheiten', 'feiertage', 'zeitnachweise', 'zeitnachweis_zeilen', 'treff_protokolle', 'treff_aufgaben'])
  loop
    q := replace(r.qual, 'ist_koord()', r.ziel);
    w := replace(r.with_check, 'ist_koord()', r.ziel);
    if q is distinct from r.qual or w is distinct from r.with_check then
      execute format('alter policy %I on %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
        case when r.qual is not null then format('using (%s)', q) else '' end,
        case when r.with_check is not null then format('with check (%s)', w) else '' end);
    end if;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in
    select p.oid, p.proname,
           case when p.proname = any(array['fn_bewerbung_annehmen', 'fn_bewerbung_ablehnen', 'fn_kijuko_import']) then 'ist_freizeitkoord()' else 'ist_treffkoord()' end as ziel
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any(array['fn_bewerbung_annehmen', 'fn_bewerbung_ablehnen', 'fn_kijuko_import'] || array['fn_dienste_monatsmuster', 'fn_dienst_statistik', 'fn_nachweis_befuellen', 'fn_dienst_sicherstellen', 'fn_wunsch_entscheiden', 'fn_nachweis_status_pruefen', 'darf_treffmappe'])
  loop
    execute replace(pg_get_functiondef(r.oid), 'ist_koord()', r.ziel);
  end loop;
end $$;

-- ===== Mitteilungen =====
create or replace function fn_push_ziel(p_ziel jsonb) returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare a text := p_ziel ->> 'art'; r text := nullif(p_ziel ->> 'rolle', ''); k text := p_ziel ->> 'kategorie'; i uuid; ergebnis uuid[];
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Mitteilungen an Gruppen senden' using errcode = '42501'; end if;
  if a = 'freizeit' and not ist_freizeitkoord() then raise exception 'Nur die Freizeitenkoordination darf an Freizeiten senden' using errcode = '42501'; end if;
  if a = 'treff' and not ist_treffkoord() then raise exception 'Nur die Treffkoordination darf an Treffs senden' using errcode = '42501'; end if;
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

-- Kernfunktion. art:
--   hinweis, absprache_freizeit (ref = Notiz), absprache_treff (ref = Notiz), dienstplan (ref = Treff, extra.personen),
--   dienstplan_kommentar (ref = Kommentar), wunsch_neu (ref = Treff, extra.datum), wunsch_antwort (ref = Dienst, extra.person),
--   bewerbung (ref = Freizeit), vorschlag (ref = Vorschlag), manuell (extra.ziel, extra.titel, extra.text), test,
--   (ab 0018 je nach Bereich an die Freizeiten- bzw. Treffkoordination)
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
        union select id from personen where ist_freizeitkoordination) q
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
    if t.id is null or not (ist_treffkoord() or ist_treffleitung(t.id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
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
    if d.id is null or not (ist_treffkoord() or ist_treffleitung(d.treff_id)) then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
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
    empf := array(select id from personen where ist_freizeitkoordination and aktiv);
    titel := 'Neue Bewerbung'; txt := fn_push_name(ich) || ' bewirbt sich für ' || f.name || '.'; url := '/bewerbungen';

  elsif p_art = 'vorschlag' then
    select * into v from angebot_vorschlaege where id = p_ref and eingereicht_von = ich and created_at >= now() - frisch;
    if v.id is null then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
    empf := array(select id from personen where ist_koordination and aktiv);
    titel := 'Neuer Katalog-Vorschlag'; txt := fn_push_name(ich) || ': ' || left(coalesce(v.daten ->> 'name', ''), 100); url := '/katalog/vorschlaege';

  elsif p_art = 'bewerbung_angenommen' then
    if not ist_freizeitkoord() then raise exception 'Mitteilung nicht zulässig' using errcode = '42501'; end if;
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
    if coalesce(array_length(empf, 1), 0) = 0 then empf := array(select id from personen where ist_treffkoordination and aktiv); end if;      -- ohne Treffleitung: Koordination
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
    empf := array(select id from personen where ist_freizeitkoordination and aktiv);
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
