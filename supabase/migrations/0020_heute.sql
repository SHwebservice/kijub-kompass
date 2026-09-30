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
