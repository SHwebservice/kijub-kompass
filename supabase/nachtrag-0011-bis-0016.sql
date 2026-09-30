-- KiJuB-Kompass: Nachtrag der Migrationen 0011 bis 0016 (fuer Projekte, die bis 0010 eingespielt sind)

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
