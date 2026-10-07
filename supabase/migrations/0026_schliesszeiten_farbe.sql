-- KiJuB-Kompass · 0026: Schließzeiten der Treffs, Erinnerung „Tagesprotokoll fehlt“ ans ganze Team, Farbe je Freizeit
--
-- 1) Schließzeiten: Treffleitung und Treffkoordination tragen Zeiträume ein, in denen ein Treff geschlossen ist (z. B. Sommerpause).
--    An diesen Tagen ist kein Tagesprotokoll nötig, es gibt keine Erinnerung, und der reguläre Dienst lässt sich weder einteilen
--    noch wünschen (Sonderdienste bleiben möglich).
-- 2) Die Erinnerung „Tagesprotokoll fehlt“ geht an das ganze Team des Treffs (bisher: Treffleitung und die heute Eingeteilten).
-- 3) Startseite (fn_heute): Protokolle („fehlt“ und „neu geschrieben“) zählen nur für die Treffs, die die Startseite dafür anfragt
--    (protokoll_treffs) – die Oberfläche fragt nur die eigenen Treffs an, nicht alle Treffs der Treffkoordination. Neu: „geschlossen“
--    nennt die angefragten Treffs, die heute wegen Feiertag oder Schließzeit zu haben.
-- 4) Farbe je Freizeit: wählbar aus einer festen Palette; leer = automatisch aus der ID.

-- ===== 1) Schließzeiten =====
create table treff_schliesszeiten (
  id           uuid primary key default gen_random_uuid(),
  treff_id     uuid not null references treffs(id) on delete cascade,
  von          date not null,
  bis          date not null,
  grund        text not null default '' check (length(grund) <= 200),
  erstellt_von uuid references personen(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (bis >= von and bis - von <= 366)
);
create index treff_schliesszeiten_treff on treff_schliesszeiten (treff_id, von);

create function fn_schliesszeit_pruefen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von); new.created_at := now();
  else new.erstellt_von := old.erstellt_von; new.created_at := old.created_at; end if;
  return new;
end $$;
create trigger treff_schliesszeiten_pruefen before insert or update on treff_schliesszeiten for each row execute function fn_schliesszeit_pruefen();
revoke execute on function fn_schliesszeit_pruefen() from public, anon;

alter table treff_schliesszeiten enable row level security;
revoke all on treff_schliesszeiten from anon;
grant select, insert, update, delete on treff_schliesszeiten to authenticated;
create policy lesen on treff_schliesszeiten for select to authenticated using (ist_aktive_person());
create policy schreiben on treff_schliesszeiten for all to authenticated
  using (ist_treffkoord() or ist_treffleitung(treff_id)) with check (ist_treffkoord() or ist_treffleitung(treff_id));

-- Ist der Treff an diesem Tag wegen einer Schließzeit zu?
create function ist_geschlossen(p_treff uuid, p_datum date) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_schliesszeiten where treff_id = p_treff and p_datum between von and bis)
$$;
revoke execute on function ist_geschlossen(uuid, date) from public, anon;
grant execute on function ist_geschlossen(uuid, date) to authenticated;

-- Kein regulärer Dienst an Schließtagen: weder einteilen noch wünschen (gilt für alle Wege, auch Funktionen und direkte Zugriffe)
create function fn_schliesstag_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare d dienste;
begin
  if tg_table_name = 'dienst_wuensche' then
    if to_jsonb(new) ->> 'status' <> 'offen' then return new; end if;     -- beantworten bleibt möglich
  end if;
  select * into d from dienste where id = new.dienst_id;
  if not d.ist_sonder and ist_geschlossen(d.treff_id, d.datum) then
    raise exception 'Am % ist der Treff geschlossen', to_char(d.datum, 'DD.MM.YYYY') using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke execute on function fn_schliesstag_pruefen() from public, anon;
create trigger dienst_zuteilungen_schliesstag before insert on dienst_zuteilungen for each row execute function fn_schliesstag_pruefen();
create trigger dienst_wuensche_schliesstag before insert or update on dienst_wuensche for each row execute function fn_schliesstag_pruefen();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'treff_schliesszeiten') then
    alter publication supabase_realtime add table public.treff_schliesszeiten;
  end if;
end $$;

-- ===== 2) Erinnerung „Tagesprotokoll fehlt“: an das ganze Team, nicht an Schließtagen =====
create or replace function fn_protokoll_erinnerungen() returns jsonb
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
       and not ist_geschlossen(t.id, heute)
       and not exists (select 1 from mitteilungen_log l where l.art = 'protokoll_erinnerung' and l.ref = t.id and l.schluessel = heute::text)
  loop
    empf := array(select p.id from personen p join treff_team tm on tm.person_id = p.id where tm.treff_id = r.id and p.aktiv);
    insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger)
    values ('protokoll_erinnerung', r.id, heute::text, null, coalesce(array_length(empf, 1), 0));
    if coalesce(array_length(empf, 1), 0) > 0 then
      ergebnis := ergebnis || jsonb_build_object('treff', r.id, 'empfaenger', to_jsonb(empf),
        'titel', 'Tagesprotokoll fehlt · ' || r.name, 'text', 'Bitte das Protokoll für heute eintragen.', 'url', '/treffs/' || r.id || '/protokoll');
    end if;
  end loop;
  return ergebnis;
end $$;

-- ===== 3) Startseite =====
--   neu in p_anfrage: protokoll_treffs [uuid] – Treffs für „Protokoll fehlt“ und „Protokoll neu“ (ohne Angabe: kachel_treffs wie bisher)
--   neu im Ergebnis:  geschlossen [uuid]      – angefragte Treffs, die heute Feiertag oder Schließzeit haben
create or replace function fn_heute(p_heute date, p_anfrage jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  ich uuid := meine_person_id();
  a jsonb := coalesce(p_anfrage, '{}'::jsonb);
  nf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_freizeiten', '[]'::jsonb)) x);
  nt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'notiz_treffs', '[]'::jsonb)) x);
  tf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'team_freizeiten', '[]'::jsonb)) x);
  pf uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'plan_freizeiten', '[]'::jsonb)) x);
  kt uuid[] := array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'kachel_treffs', '[]'::jsonb)) x);
  pt uuid[] := case when a ? 'protokoll_treffs' then array(select x::uuid from jsonb_array_elements_text(coalesce(a -> 'protokoll_treffs', '[]'::jsonb)) x) else kt end;
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

  -- Protokolle von heute (nur protokoll_treffs), offene Notizen der Treffs (Kacheln) und heute geschlossene Treffs
  r := r || jsonb_build_object(
    'protokolliert', coalesce((select jsonb_agg(treff_id) from treff_protokolle where datum = p_heute and treff_id = any(pt)), '[]'::jsonb),
    'offene_notizen', coalesce((select jsonb_object_agg(treff_id, n) from (select treff_id, count(*) as n from treff_aufgaben where not erledigt and treff_id = any(kt) group by treff_id) x), '{}'::jsonb),
    'geschlossen', coalesce((select jsonb_agg(t.id) from treffs t
                              where t.id = any(kt || pt)
                                and (ist_geschlossen(t.id, p_heute) or exists (select 1 from feiertage f where f.datum = p_heute and (f.treff_id is null or f.treff_id = t.id)))), '[]'::jsonb));

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
         where pr.updated_at > seit and pr.bearbeitet_von is distinct from ich and pr.treff_id = any(pt)
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

-- ===== 4) Farbe je Freizeit =====
alter table freizeiten add column farbe text
  check (farbe is null or farbe in ('blau', 'orange', 'gruen', 'lila', 'gold', 'petrol', 'pink', 'oliv', 'tuerkis', 'rost'));
