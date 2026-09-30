-- KiJuB-Kompass: Nachtrag für Projekte, in denen 0018 schon eingespielt ist, 0017, 0019, 0020 und 0021 aber noch fehlen.
--
-- Enthält: die Spalten aus 0017, die Ablehnen-Funktion (aus 0017, mit dem Bereich der Freizeitenkoordination aus 0018),
-- dann 0019, 0020 und 0021 unverändert. Die Annahme-Funktion und die Mitteilungsfunktion aus 0017 entfallen bewusst:
-- 0021 ersetzt sie vollständig (mit allen Neuerungen aus 0017 und 0018).
-- Nur in einem solchen Projekt ausführen (Prüfung: Spalte bewerbungen.entschieden_am fehlt, personen.ist_treffkoordination ist da).

-- ════════ Rest von 0017 ════════
alter table bewerbungen add column entschieden_am timestamptz;
alter table lebensmittel_verbrauch add column created_at timestamptz not null default now();

create or replace function fn_bewerbung_ablehnen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ist_freizeitkoord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'abgelehnt', entschieden_von = meine_person_id(), entschieden_am = now()
   where id = p_id and status = 'offen';
  if not found then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
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

