-- KiJuB-Kompass: Nachtrag der Migrationen 0011 bis 0021 (fuer Projekte, die bis 0010 eingespielt sind)

-- ════════ 0011_realtime.sql ════════
-- KiJuB-Kompass · 0011 Live-Aktualisierung (Supabase Realtime)
-- Die Tabellen der Freizeiten melden Änderungen an angemeldete Geräte, damit Wochenplan, Hinweise, Team und
-- Lebensmittel bei allen sofort aktuell sind. Es werden nur Zeilen geliefert, die die jeweilige Person laut
-- Zugriffsregeln (RLS) auch lesen darf. In Umgebungen ohne Realtime (z. B. den lokalen Tests) passiert nichts.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['plan_eintraege', 'freizeit_slots', 'notizen', 'notiz_bestaetigungen', 'notiz_kommentare',
                             'freizeit_team', 'lebensmittel_eingang', 'lebensmittel_verbrauch'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ════════ 0012_dienstplan.sql ════════
-- KiJuB-Kompass · 0012 Dienstplan: Funktionen für Wünsche und Zuteilungen, Live-Aktualisierung
--
-- Ein Dienst-Datensatz für einen regulären Öffnungstag entsteht erst, wenn jemand zuteilt oder einen Dienst wünscht.
-- BetreuerInnen dürfen keine Dienste anlegen – sie wünschen über fn_dienst_wunsch, die den Tag bei Bedarf selbst anlegt.

-- Zuteilungen nur für Personen des Treffs (gilt auch für direkte Schreibzugriffe)
create function fn_zuteilung_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from treff_team t join dienste d on d.treff_id = t.treff_id
                  where d.id = new.dienst_id and t.person_id = new.person_id) then
    raise exception 'Die Person gehört nicht zu diesem Treff' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger dienst_zuteilung_pruefen before insert or update on dienst_zuteilungen
  for each row execute function fn_zuteilung_pruefen();

-- Regulären Dienst für einen Öffnungstag anlegen (Zeiten werden aus den Öffnungszeiten kopiert); gibt die ID zurück.
create function fn_dienst_sicherstellen(p_treff uuid, p_datum date) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare oz treff_oeffnungszeiten; d_id uuid;
begin
  if not (ist_koord() or ist_treffleitung(p_treff)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen den Dienstplan ändern' using errcode = '42501';
  end if;
  select id into d_id from dienste where treff_id = p_treff and datum = p_datum and not ist_sonder;
  if d_id is not null then return d_id; end if;
  select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = extract(isodow from p_datum);
  if oz.treff_id is null then
    raise exception 'An diesem Tag ist der Treff nicht geöffnet' using errcode = 'check_violation';
  end if;
  insert into dienste (treff_id, datum, von, bis) values (p_treff, p_datum, oz.von, oz.bis) returning id into d_id;
  return d_id;
end $$;

-- Dienstwunsch der angemeldeten Person für einen Öffnungstag. Ein abgelehnter Wunsch kann erneut gestellt werden.
create function fn_dienst_wunsch(p_treff uuid, p_datum date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare oz treff_oeffnungszeiten; d_id uuid; ich uuid := meine_person_id();
begin
  if ich is null or not ist_im_treff(p_treff) then
    raise exception 'Nur Personen aus dem Treff können einen Dienst wünschen' using errcode = '42501';
  end if;
  if p_datum < current_date then
    raise exception 'Für vergangene Tage kann kein Dienst gewünscht werden' using errcode = 'check_violation';
  end if;
  select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = extract(isodow from p_datum);
  if oz.treff_id is null then
    raise exception 'An diesem Tag ist der Treff nicht geöffnet' using errcode = 'check_violation';
  end if;
  select id into d_id from dienste where treff_id = p_treff and datum = p_datum and not ist_sonder;
  if d_id is null then
    insert into dienste (treff_id, datum, von, bis) values (p_treff, p_datum, oz.von, oz.bis) returning id into d_id;
  end if;
  if exists (select 1 from dienst_zuteilungen where dienst_id = d_id and person_id = ich) then
    raise exception 'Du bist an diesem Tag schon eingeteilt' using errcode = 'check_violation';
  end if;
  insert into dienst_wuensche (dienst_id, person_id) values (d_id, ich)
  on conflict (dienst_id, person_id) do update
     set status = 'offen', entschieden_von = null, created_at = now()
   where dienst_wuensche.status = 'abgelehnt';
end $$;

-- Wunsch beantworten: bestätigen teilt die Person zugleich ein.
create function fn_wunsch_entscheiden(p_dienst uuid, p_person uuid, p_bestaetigen boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := treff_von_dienst(p_dienst);
begin
  if not (ist_koord() or ist_treffleitung(tid)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen Wünsche beantworten' using errcode = '42501';
  end if;
  update dienst_wuensche
     set status = case when p_bestaetigen then 'bestaetigt'::wunsch_status else 'abgelehnt'::wunsch_status end,
         entschieden_von = meine_person_id()
   where dienst_id = p_dienst and person_id = p_person and status = 'offen';
  if not found then
    raise exception 'Wunsch nicht gefunden oder bereits beantwortet' using errcode = 'check_violation';
  end if;
  if p_bestaetigen then
    insert into dienst_zuteilungen (dienst_id, person_id) values (p_dienst, p_person) on conflict do nothing;
  end if;
end $$;

-- Live-Aktualisierung des Dienstplans (nur Zeilen, die die Person laut Zugriffsregeln sehen darf).
-- Abwesenheiten und Nachweise bleiben bewusst draußen: sie sind personenbezogen.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'dienstplan_kommentare',
                             'feiertage', 'treff_team', 'treff_plan_eintraege'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- Ausführungsrechte wie bei den übrigen Funktionen (Migration 0007): nur angemeldete Personen
revoke execute on function fn_dienst_sicherstellen(uuid, date), fn_dienst_wunsch(uuid, date),
  fn_wunsch_entscheiden(uuid, uuid, boolean), fn_zuteilung_pruefen() from public, anon;
grant execute on function fn_dienst_sicherstellen(uuid, date), fn_dienst_wunsch(uuid, date),
  fn_wunsch_entscheiden(uuid, uuid, boolean) to authenticated;

-- ════════ 0013_katalog.sql ════════
-- KiJuB-Kompass · 0013 Katalog: Kommentare mit Namen
--
-- Kommentare zu Programmpunkten sind für alle aktiven Personen sichtbar und zeigen den Namen der Schreibenden.
-- Die Namenssicht v_personen_namen liefert nur Personen aus gemeinsamen Teams; im Katalog kennt man sich aber nicht
-- unbedingt – deshalb eine eigene Sicht nur für Kommentare (Vor- und Nachname, sonst nichts aus dem Personenprofil).
create view v_angebot_kommentare as
  select k.id, k.angebot_id, k.person_id, k.text, k.created_at, p.vorname, p.nachname
    from angebot_kommentare k
    join personen p on p.id = k.person_id
   where ist_aktive_person();

revoke all on v_angebot_kommentare from anon;
grant select on v_angebot_kommentare to authenticated;

-- Ein Programmpunkt, der schon in einem Wochenplan steht, darf gelöscht werden: die Einträge bleiben mit seinem Namen
-- als Freitext erhalten (sonst würde die Regel „Programmpunkt oder Freitext“ das Löschen verhindern).
create function fn_angebot_loeschen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update plan_eintraege set freitext = old.name, angebot_id = null where angebot_id = old.id;
  update treff_plan_eintraege set freitext = old.name, angebot_id = null where angebot_id = old.id;
  return old;
end $$;
create trigger angebot_loeschen before delete on angebote for each row execute function fn_angebot_loeschen();
revoke execute on function fn_angebot_loeschen() from public, anon;

-- ════════ 0014_betrieb.sql ════════
-- KiJuB-Kompass · 0014 Betrieb: Lebenszeichen für die Datenbank
--
-- Kostenlose Supabase-Projekte werden nach einer Woche ohne Zugriffe pausiert. Ein geplanter Aufruf (GitHub Actions,
-- siehe .github/workflows/keepalive.yml) ruft diese Funktion auf: Sie berührt die Datenbank, gibt aber nur „ok“ zurück –
-- keine Daten, keine Uhrzeit, kein Hinweis auf Inhalte. Sie ist die einzige Funktion, die ohne Anmeldung ausführbar ist.
create function fn_ping() returns text
language sql stable as $$ select 'ok'::text $$;

grant execute on function fn_ping() to anon, authenticated;

-- Aufräumen: Die Schutzfunktion aus 0009 (nur als Trigger gedacht, nicht direkt aufrufbar) war noch für „public“ ausführbar.
-- Damit ist fn_ping die einzige Funktion, die ohne Anmeldung ausgeführt werden darf.
revoke execute on function fn_letzte_koordination_schuetzen() from public, anon;

-- ════════ 0015_mitteilungen.sql ════════
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

-- ════════ 0016_tagesprotokoll.sql ════════
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

-- ════════ 0017_mitteilungen_mehr.sql ════════
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

-- ════════ 0018_koordination_getrennt.sql ════════
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

-- ════════ 0019_fehlermeldungen.sql ════════
-- KiJuB-Kompass · 0019 Fehlermeldungen
--
-- Wenn in der App etwas Unerwartetes schiefgeht, meldet sie das selbsttätig – ohne Personendaten: keine Person, keine Namen,
-- keine Kennungen in Adresse und Text. Gleiche Fehler (gleiche Version, Seite und Meldung) werden gezählt, nicht vervielfacht.
-- Lesen, abhaken und löschen darf jede Koordination; melden geht nur über die Funktion (mit Begrenzung gegen Überflutung).
-- Meldungen werden nach 90 Tagen ohne Wiederholung gelöscht.

create table fehlermeldungen (
  id        uuid primary key default gen_random_uuid(),
  version   text not null check (length(version) <= 40),
  seite     text not null check (length(seite) <= 200),       -- Adresse ohne Kennungen, z. B. /treffs/:id/protokoll
  meldung   text not null check (length(meldung) <= 400),
  stapel    text check (stapel is null or length(stapel) <= 1500),
  anzahl    int  not null default 1,
  erstmals  timestamptz not null default now(),
  zuletzt   timestamptz not null default now(),
  erledigt  boolean not null default false
);
create unique index fehlermeldungen_gleich on fehlermeldungen (version, seite, meldung);
create index fehlermeldungen_zuletzt on fehlermeldungen (zuletzt desc);

alter table fehlermeldungen enable row level security;
revoke all on fehlermeldungen from anon;
revoke insert on fehlermeldungen from authenticated;
grant select, update, delete on fehlermeldungen to authenticated;
create policy lesen     on fehlermeldungen for select to authenticated using (ist_koord());
create policy aendern   on fehlermeldungen for update to authenticated using (ist_koord()) with check (ist_koord());
create policy loeschen  on fehlermeldungen for delete to authenticated using (ist_koord());

-- Entfernt alles, was nach einer Person oder Kennung aussieht: UUIDs, Mail-Adressen, Telefon- und lange Zahlenfolgen.
create function fn_fehler_bereinigen(t text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(t, ''), '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
             '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[mail]', 'g'),
           '\+?[0-9][0-9 /()-]{6,}[0-9]', '[zahl]', 'g')
$$;

-- Meldet einen Fehler. Nur angemeldete Personen; die Datenbank bereinigt noch einmal, begrenzt die Menge
-- (höchstens 300 Meldungen pro Stunde insgesamt) und räumt alte Einträge auf.
create function fn_fehler_melden(p_version text, p_seite text, p_meldung text, p_stapel text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v text; s text; m text; st text;
begin
  if not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if (select coalesce(sum(anzahl), 0) from fehlermeldungen where zuletzt > now() - interval '1 hour') >= 300 then return; end if;
  v := left(trim(coalesce(p_version, '')), 40);
  s := left(fn_fehler_bereinigen(p_seite), 200);
  m := trim(left(fn_fehler_bereinigen(p_meldung), 400));
  st := nullif(left(fn_fehler_bereinigen(p_stapel), 1500), '');
  if m = '' then return; end if;
  insert into fehlermeldungen (version, seite, meldung, stapel) values (coalesce(nullif(v, ''), 'unbekannt'), coalesce(nullif(s, ''), '/'), m, st)
  on conflict (version, seite, meldung)
  do update set anzahl = fehlermeldungen.anzahl + 1, zuletzt = now(), erledigt = false, stapel = coalesce(fehlermeldungen.stapel, excluded.stapel);
  delete from fehlermeldungen where zuletzt < now() - interval '90 days';
end $$;

revoke execute on function fn_fehler_bereinigen(text), fn_fehler_melden(text, text, text, text) from public, anon;
grant execute on function fn_fehler_melden(text, text, text, text) to authenticated;
revoke execute on function fn_fehler_bereinigen(text) from authenticated;

-- ════════ 0020_heute.sql ════════
-- KiJuB-Kompass · 0020 Startseite „Heute“ in einem Aufruf und „Neu seit deinem letzten Besuch“
--
-- fn_heute liefert alles, was die Startseite braucht, in einem einzigen Aufruf statt in zehn. Die Funktion läuft mit den Rechten
-- der aufrufenden Person (security invoker): Zeilenregeln gelten wie bei jeder Abfrage, jede Person bekommt nur, was sie sehen darf.
-- Welche Freizeiten und Treffs gemeint sind, bestimmt die Oberfläche (aktuelle Freizeiten, eigene Treffs …) und übergibt sie als Anfrage;
-- die Funktion rechnet nur Teile aus, die angefragt werden.
--
-- „Neu seit deinem letzten Besuch“: Ein Besuch endet nach 30 Minuten ohne Aufruf der Startseite. Beim nächsten Besuch gilt das Ende des
-- vorigen als Bezugszeit. Was andere seitdem angelegt haben, erscheint in „neu“ (höchstens 30 Einträge, dazu die Gesamtzahl);
-- eigene Änderungen zählen nie. Die Person kann „Alles gesehen“ wählen (fn_besuch_quittieren).

create table besuche (
  person_id         uuid primary key references personen(id) on delete cascade,
  letzter_kontakt   timestamptz not null,
  vorheriger_besuch timestamptz
);
alter table besuche enable row level security;
revoke all on besuche from anon;
grant select, insert, update on besuche to authenticated;
create policy eigene on besuche for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());

-- Anfrage (alle Schlüssel optional):
--   notiz_freizeiten [uuid], notiz_treffs [uuid]   Hinweise/Absprachen, Wochenplan-Neuigkeiten
--   team_freizeiten [uuid]                         Teamzeilen (wer ist Leitung/TeamerIn)
--   plan_freizeiten [uuid]                         Wochenplan des Tages
--   kachel_treffs [uuid]                           Protokolle von heute, offene Notizen, Neuigkeiten der Treffs
--   bestand bool, nachweise bool, bewerbungen bool, vorschlaege bool, fehler bool
--   wuensche: "alle" oder [uuid] (Treffs), sonst nicht angefragt
--   besuch bool                                    „Neu seit letztem Besuch“ berechnen (und den Besuch vermerken)
create function fn_heute(p_heute date, p_anfrage jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  a jsonb := coalesce(p_anfrage, '{}'::jsonb);
  nf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_freizeiten', '[]'::jsonb)) x);
  nt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_treffs', '[]'::jsonb)) x);
  tf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'team_freizeiten', '[]'::jsonb)) x);
  pf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'plan_freizeiten', '[]'::jsonb)) x);
  kt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'kachel_treffs', '[]'::jsonb)) x);
  wt uuid[];
  r jsonb := '{}'::jsonb;
  b besuche; seit timestamptz; neu jsonb := '[]'::jsonb; neu_gesamt int := 0;
begin
  if ich is null then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;

  -- Hinweise und Absprachen samt Bestätigungen
  r := r || jsonb_build_object('notizen', coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'art', n.art, 'geltung', n.geltung, 'datum', n.datum, 'text', n.text, 'created_at', n.created_at,
             'freizeit_id', n.freizeit_id, 'treff_id', n.treff_id, 'quelle', coalesce(f.name, t.name, ''),
             'bestaetigt_von', coalesce((select jsonb_agg(nb.person_id) from notiz_bestaetigungen nb where nb.notiz_id = n.id), '[]'::jsonb))
           order by n.created_at desc)
      from (select * from notizen where freizeit_id = any(nf) or treff_id = any(nt) order by created_at desc limit 200) n
      left join freizeiten f on f.id = n.freizeit_id
      left join treffs t on t.id = n.treff_id), '[]'::jsonb));

  r := r || jsonb_build_object('team', coalesce((select jsonb_agg(jsonb_build_object('freizeit_id', freizeit_id, 'person_id', person_id, 'rolle', rolle))
                                                   from freizeit_team where freizeit_id = any(tf)), '[]'::jsonb));

  r := r || jsonb_build_object('plan', coalesce((
    select jsonb_agg(jsonb_build_object('id', e.id, 'freizeit_id', e.freizeit_id, 'titel', coalesce(an.name, e.freitext, ''), 'slot', coalesce(s.name, ''), 'position', coalesce(s.position, 0)))
      from plan_eintraege e
      left join angebote an on an.id = e.angebot_id
      left join freizeit_slots s on s.id = e.slot_id
     where e.freizeit_id = any(pf) and e.datum = p_heute), '[]'::jsonb));

  if coalesce((a ->> 'bestand')::boolean, false) then
    r := r || jsonb_build_object('bestand', coalesce((select jsonb_agg(jsonb_build_object('ort_id', ort_id, 'name', name, 'einheit', einheit, 'rest', rest, 'status', status))
                                                        from v_lebensmittel_bestand where status in ('knapp', 'leer')), '[]'::jsonb));
    r := r || jsonb_build_object('orte', coalesce((select jsonb_object_agg(o.id, o.name) from orte o
                                                    where o.id in (select ort_id from v_lebensmittel_bestand where status in ('knapp', 'leer'))), '{}'::jsonb));
  end if;

  if a -> 'wuensche' is not null and a -> 'wuensche' <> 'null'::jsonb then
    if jsonb_typeof(a -> 'wuensche') = 'array' then wt := array(select x::uuid from jsonb_array_elements_text(a -> 'wuensche') x); end if;
    r := r || jsonb_build_object('wuensche', coalesce((
      select jsonb_agg(jsonb_build_object('person_id', w.person_id, 'datum', d.datum, 'treff_id', d.treff_id))
        from dienst_wuensche w join dienste d on d.id = w.dienst_id
       where w.status = 'offen' and d.datum >= p_heute and (wt is null or d.treff_id = any(wt))), '[]'::jsonb));
    r := r || jsonb_build_object('treff_namen', coalesce((select jsonb_object_agg(id, name) from treffs), '{}'::jsonb));
  end if;

  if coalesce((a ->> 'bewerbungen')::boolean, false) then
    r := r || jsonb_build_object('bewerbungen', (select count(*) from bewerbungen where status = 'offen'));
  end if;
  if coalesce((a ->> 'vorschlaege')::boolean, false) then
    r := r || jsonb_build_object('vorschlaege', (select count(*) from angebot_vorschlaege where status = 'offen'));
  end if;
  if coalesce((a ->> 'nachweise')::boolean, false) then
    r := r || jsonb_build_object('nachweise', (select count(*) from zeitnachweise where status = 'eingereicht'));
  end if;
  if coalesce((a ->> 'fehler')::boolean, false) then
    r := r || jsonb_build_object('fehler', (select count(*) from fehlermeldungen where not erledigt));
  end if;

  -- Protokolle von heute und offene Notizen der Treffs (Kacheln)
  r := r || jsonb_build_object(
    'protokolliert', coalesce((select jsonb_agg(treff_id) from treff_protokolle where datum = p_heute and treff_id = any(kt)), '[]'::jsonb),
    'offene_notizen', coalesce((select jsonb_object_agg(treff_id, n) from (select treff_id, count(*) as n from treff_aufgaben where not erledigt and treff_id = any(kt) group by treff_id) x), '{}'::jsonb));

  -- Neu seit dem letzten Besuch
  if coalesce((a ->> 'besuch')::boolean, false) then
    select * into b from besuche where person_id = ich;
    if b.person_id is null then
      insert into besuche (person_id, letzter_kontakt) values (ich, now());
    elsif now() - b.letzter_kontakt > interval '30 minutes' then
      update besuche set vorheriger_besuch = b.letzter_kontakt, letzter_kontakt = now() where person_id = ich;
      seit := b.letzter_kontakt;
    else
      update besuche set letzter_kontakt = now() where person_id = ich;
      seit := b.vorheriger_besuch;
    end if;
    if seit is not null then
      seit := greatest(seit, now() - interval '30 days');
      with e as (
        select n.created_at as zeit, n.art::text as art, left(n.text, 120) as text, coalesce(f.name, t.name, '') as quelle,
               case when n.freizeit_id is not null then '/freizeiten/' || n.freizeit_id || '/hinweise' else '/treffs/' || n.treff_id || '/absprachen' end as url
          from notizen n left join freizeiten f on f.id = n.freizeit_id left join treffs t on t.id = n.treff_id
         where n.created_at > seit and n.erstellt_von is distinct from ich and (n.freizeit_id = any(nf) or n.treff_id = any(nt))
        union all
        select p.created_at, 'plan', left(coalesce(an.name, p.freitext, ''), 120) || ' (' || to_char(p.datum, 'DD.MM.') || ')', f.name, '/freizeiten/' || p.freizeit_id || '/plan'
          from plan_eintraege p join freizeiten f on f.id = p.freizeit_id left join angebote an on an.id = p.angebot_id
         where p.created_at > seit and p.erstellt_von is distinct from ich and p.freizeit_id = any(nf)
        union all
        select pr.updated_at, 'protokoll', 'Protokoll vom ' || to_char(pr.datum, 'DD.MM.YYYY'), t.name, '/treffs/' || pr.treff_id || '/protokoll'
          from treff_protokolle pr join treffs t on t.id = pr.treff_id
         where pr.updated_at > seit and pr.bearbeitet_von is distinct from ich and pr.treff_id = any(kt)
        union all
        select au.created_at, 'notiz', left(au.text, 120), t.name, '/treffs/' || au.treff_id || '/notizen'
          from treff_aufgaben au join treffs t on t.id = au.treff_id
         where au.created_at > seit and au.erstellt_von is distinct from ich and not au.erledigt and au.treff_id = any(kt)
        union all
        select k.created_at, 'kommentar', left(k.text, 120), t.name, '/treffs/' || k.treff_id || '/dienstplan'
          from dienstplan_kommentare k join treffs t on t.id = k.treff_id
         where k.created_at > seit and k.person_id is distinct from ich and k.treff_id = any(kt)
        union all
        select bw.created_at, 'bewerbung', 'Neue Bewerbung', f.name, '/bewerbungen'
          from bewerbungen bw join freizeiten f on f.id = bw.freizeit_id
         where coalesce((a ->> 'bewerbungen')::boolean, false) and bw.status = 'offen' and bw.created_at > seit
        union all
        select v.created_at, 'vorschlag', left(coalesce(v.daten ->> 'name', 'Vorschlag'), 120), 'Katalog', '/katalog/vorschlaege'
          from angebot_vorschlaege v
         where coalesce((a ->> 'vorschlaege')::boolean, false) and v.status = 'offen' and v.created_at > seit
        union all
        select z.updated_at, 'nachweis', 'Nachweis eingereicht', t.name, '/treffs/' || z.treff_id || '/nachweis'
          from zeitnachweise z join treffs t on t.id = z.treff_id
         where coalesce((a ->> 'nachweise')::boolean, false) and z.status = 'eingereicht' and z.updated_at > seit and z.person_id is distinct from ich
      )
      select coalesce(jsonb_agg(jsonb_build_object('zeit', x.zeit, 'art', x.art, 'text', x.text, 'quelle', x.quelle, 'url', x.url) order by x.zeit desc), '[]'::jsonb), max(x.gesamt)
        into neu, neu_gesamt
        from (select e.*, count(*) over () as gesamt from e order by e.zeit desc limit 30) x;
    end if;
    r := r || jsonb_build_object('seit', seit, 'neu', coalesce(neu, '[]'::jsonb), 'neu_gesamt', coalesce(neu_gesamt, 0));
  end if;

  return r;
end $$;

-- „Alles gesehen“: der nächste Besuch beginnt ab jetzt
create function fn_besuch_quittieren() returns void
language sql security invoker set search_path = public, pg_temp as $$
  update besuche set vorheriger_besuch = now() where person_id = meine_person_id()
$$;

revoke execute on function fn_heute(date, jsonb), fn_besuch_quittieren() from public, anon;
grant execute on function fn_heute(date, jsonb), fn_besuch_quittieren() to authenticated;

-- ════════ 0021_bewerbung_rolle_treff_aufraeumen.sql ════════
-- KiJuB-Kompass · 0021 Bewerbung mit Rollenwahl annehmen, Aufräumen beim Entfernen aus einem Treff
--
-- 1. Beim Annehmen einer Bewerbung wählt die Freizeitenkoordination die Rolle (TeamerIn oder Leitung); ohne Angabe bleibt es TeamerIn.
--    Ist die Person schon im Team, wird sie nur zur Leitung hochgestuft, nie herabgestuft. Die Mitteilung nennt die Rolle.
-- 2. Wer aus einem Treff entfernt wird, steht nicht mehr in künftigen Diensten und hat dort keine offenen Wünsche mehr.
--    Vergangene Dienste bleiben (sie sind Grundlage der Nachweise).

drop function fn_bewerbung_annehmen(uuid);
create function fn_bewerbung_annehmen(p_id uuid, p_rolle freizeit_rolle default 'teamer') returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b bewerbungen;
begin
  if not ist_freizeitkoord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'angenommen', entschieden_von = meine_person_id(), entschieden_am = now()
   where id = p_id and status = 'offen' returning * into b;
  if b.id is null then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
  insert into freizeit_team (freizeit_id, person_id, rolle) values (b.freizeit_id, b.person_id, coalesce(p_rolle, 'teamer'))
    on conflict (freizeit_id, person_id)
    do update set rolle = case when excluded.rolle = 'leitung' then 'leitung'::freizeit_rolle else freizeit_team.rolle end;
end $$;
revoke execute on function fn_bewerbung_annehmen(uuid, freizeit_rolle) from public, anon;
grant execute on function fn_bewerbung_annehmen(uuid, freizeit_rolle) to authenticated;

create function fn_treff_team_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  delete from dienst_zuteilungen z using dienste d
   where z.dienst_id = d.id and d.treff_id = old.treff_id and z.person_id = old.person_id and d.datum >= heute;
  delete from dienst_wuensche w using dienste d
   where w.dienst_id = d.id and d.treff_id = old.treff_id and w.person_id = old.person_id and d.datum >= heute;
  return old;
end $$;
create trigger treff_team_aufraeumen after delete on treff_team for each row execute function fn_treff_team_aufraeumen();
revoke execute on function fn_treff_team_aufraeumen() from public, anon, authenticated;

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
  bw bewerbungen; zn zeitnachweise; lv lebensmittel_verbrauch; lb record; v_name text; v_ort text; v_rest text; v_rolle text;
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
    select rolle::text into v_rolle from freizeit_team where freizeit_id = f.id and person_id = bw.person_id;
    titel := 'Bewerbung angenommen';
    txt := case when v_rolle = 'leitung' then 'Du bist als Leitung dabei: ' else 'Du bist dabei: ' end
           || f.name || ' (' || to_char(f.start_datum, 'DD.MM.YYYY') || ' – ' || to_char(f.ende_datum, 'DD.MM.YYYY') || ').';
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
