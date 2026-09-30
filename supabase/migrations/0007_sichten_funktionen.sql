-- KiJuB-Kompass · 0007 Sichten und Funktionen (RPC)

-- ===== Sichten mit Zeilen-/Spaltenrechten =====
-- Diese Sichten laufen bewusst mit den Rechten des Besitzers und filtern selbst:
-- Namen sieht, wer ein Team teilt; Kontaktdaten nur Leitung/Treffleitung und Koordination.

create view v_personen_namen as
  select p.id, p.vorname, p.nachname, p.farbe
    from personen p
   where meine_person_id() is not null
     and (p.id = meine_person_id() or ist_koord() or teilt_team_mit(p.id));

create view v_team_freizeit as
  select t.freizeit_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.mail            end as mail,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.telefon         end as telefon,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.ernaehrung::text end as ernaehrung,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.notizen         end as notizen,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.tzk_max_stunden end as tzk_max_stunden
    from freizeit_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_team(t.freizeit_id) or ist_koord());

create view v_team_treff as
  select t.treff_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.mail            end as mail,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.telefon         end as telefon,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_treffleitung(t.treff_id) or ist_koord() then p.tzk_max_stunden end as tzk_max_stunden
    from treff_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_treff(t.treff_id) or ist_koord());

-- ===== Sichten mit den Rechten der aufrufenden Person =====
create view v_lebensmittel_bestand with (security_invoker = true) as
  select b.ort_id, b.name, b.einheit, b.erhalten, b.verbraucht,
         b.erhalten - b.verbraucht as rest,
         case when b.erhalten - b.verbraucht <= 0 then 'leer'
              when b.erhalten > 0 and (b.erhalten - b.verbraucht) <= 0.25 * b.erhalten then 'knapp'
              else 'ok' end as status
    from (select e.ort_id, e.name, max(e.einheit) as einheit, sum(e.menge) as erhalten,
                 coalesce((select sum(v.menge) from lebensmittel_verbrauch v
                            where v.ort_id = e.ort_id and v.name = e.name), 0) as verbraucht
            from lebensmittel_eingang e
           group by e.ort_id, e.name) b;

create view v_angebot_bewertung with (security_invoker = true) as
  select angebot_id, round(avg(sterne)::numeric, 2) as durchschnitt, count(*)::int as anzahl
    from angebot_bewertungen group by angebot_id;

-- ===== Bewerbungen =====
create function fn_bewerbung_annehmen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare b bewerbungen;
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'angenommen', entschieden_von = meine_person_id()
   where id = p_id and status = 'offen' returning * into b;
  if b.id is null then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
  insert into freizeit_team (freizeit_id, person_id, rolle) values (b.freizeit_id, b.person_id, 'teamer')
    on conflict (freizeit_id, person_id) do nothing;
end $$;

create function fn_bewerbung_ablehnen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Bewerbungen entscheiden' using errcode = '42501'; end if;
  update bewerbungen set status = 'abgelehnt', entschieden_von = meine_person_id()
   where id = p_id and status = 'offen';
  if not found then raise exception 'Bewerbung nicht gefunden oder bereits entschieden'; end if;
end $$;

-- ===== Vorschläge =====
create function fn_vorschlag_uebernehmen(p_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v angebot_vorschlaege; neu uuid;
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Vorschläge übernehmen' using errcode = '42501'; end if;
  select * into v from angebot_vorschlaege where id = p_id and status = 'offen' for update;
  if v.id is null then raise exception 'Vorschlag nicht gefunden oder bereits entschieden'; end if;
  insert into angebote (name, kategorie, dauer, gruppe, personal, raum, alter_gruppen, wetter,
                        material, vorbereitung, umsetzung, nachbereitung, autor)
  values (v.daten->>'name', (v.daten->>'kategorie')::angebot_kategorie,
          v.daten->>'dauer', v.daten->>'gruppe', v.daten->>'personal', v.daten->>'raum',
          coalesce(array(select jsonb_array_elements_text(v.daten->'alter_gruppen')), '{}'),
          nullif(v.daten->>'wetter','')::wetter_t,
          v.daten->>'material', v.daten->>'vorbereitung', v.daten->>'umsetzung', v.daten->>'nachbereitung',
          v.daten->>'autor')
  returning id into neu;
  update angebot_vorschlaege set status = 'angenommen' where id = p_id;
  return neu;
end $$;

create function fn_vorschlag_ablehnen(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not ist_koord() then raise exception 'Nur die Koordination darf Vorschläge entscheiden' using errcode = '42501'; end if;
  update angebot_vorschlaege set status = 'abgelehnt' where id = p_id and status = 'offen';
  if not found then raise exception 'Vorschlag nicht gefunden oder bereits entschieden'; end if;
end $$;

-- ===== Dienstplan =====
-- Monatsmuster: p_muster = {"1":["<person-id>",…], "3":[…]} (Schlüssel = ISO-Wochentag).
-- Setzt die Zuteilung an allen passenden Öffnungstagen des Monats (ersetzt vorhandene Zuteilungen).
create function fn_dienste_monatsmuster(p_treff uuid, p_monat date, p_muster jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tag date; wt smallint; oz treff_oeffnungszeiten; d_id uuid; pid text; n int := 0;
  von_monat date := date_trunc('month', p_monat)::date;
begin
  if not (ist_koord() or ist_treffleitung(p_treff)) then
    raise exception 'Nur Treffleitung oder Koordination dürfen den Dienstplan ändern' using errcode = '42501';
  end if;
  -- alle genannten Personen müssen im Treff sein
  for pid in select jsonb_array_elements_text(v) from jsonb_each(p_muster) as e(k, v) loop
    if not exists (select 1 from treff_team where treff_id = p_treff and person_id = pid::uuid) then
      raise exception 'Person % gehört nicht zu diesem Treff', pid using errcode = 'check_violation';
    end if;
  end loop;

  for tag in select generate_series(von_monat, (von_monat + interval '1 month - 1 day')::date, interval '1 day')::date loop
    wt := extract(isodow from tag)::smallint;
    continue when not (p_muster ? wt::text);
    select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = wt;
    continue when oz.treff_id is null;          -- kein Öffnungstag
    select id into d_id from dienste where treff_id = p_treff and datum = tag and not ist_sonder;
    if d_id is null then
      insert into dienste (treff_id, datum, von, bis) values (p_treff, tag, oz.von, oz.bis) returning id into d_id;
    end if;
    delete from dienst_zuteilungen where dienst_id = d_id;
    insert into dienst_zuteilungen (dienst_id, person_id)
      select d_id, x::uuid from jsonb_array_elements_text(p_muster -> wt::text) as x;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Dienste und Stunden je Person im Monat.
-- Treffleitung/Koordination sehen alle Team-Mitglieder (auch mit 0 Diensten), alle anderen nur sich selbst.
create function fn_dienst_statistik(p_treff uuid, p_monat date)
returns table (person_id uuid, dienste int, stunden numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare von_monat date := date_trunc('month', p_monat)::date; alle boolean;
begin
  if not (ist_koord() or ist_im_treff(p_treff)) then
    raise exception 'Kein Zugriff auf diesen Treff' using errcode = '42501';
  end if;
  alle := ist_koord() or ist_treffleitung(p_treff);
  return query
    select t.person_id,
           count(d.id)::int,
           coalesce(sum(extract(epoch from (d.bis - d.von)) / 3600.0), 0)::numeric(8,2)
      from treff_team t
      left join dienst_zuteilungen z on z.person_id = t.person_id
      left join dienste d on d.id = z.dienst_id and d.treff_id = p_treff
                         and d.datum >= von_monat and d.datum < (von_monat + interval '1 month')
     where t.treff_id = p_treff and (alle or t.person_id = meine_person_id())
     group by t.person_id;
end $$;

-- ===== Nachweis der Teilzeitkräfte =====
-- Befüllt Zeilen aus Diensten und Abwesenheiten; manuelle Zeilen bleiben erhalten.
create function fn_nachweis_befuellen(p_nachweis uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n zeitnachweise; von_monat date; bis_monat date; cnt int := 0;
begin
  select * into n from zeitnachweise where id = p_nachweis;
  if n.id is null then raise exception 'Nachweis nicht gefunden'; end if;
  if not (n.person_id = meine_person_id() or ist_treffleitung(n.treff_id) or ist_koord()) then
    raise exception 'Kein Zugriff auf diesen Nachweis' using errcode = '42501';
  end if;
  if n.status = 'freigegeben' then raise exception 'Freigegebene Nachweise sind gesperrt'; end if;
  von_monat := n.monat; bis_monat := (n.monat + interval '1 month')::date;

  delete from zeitnachweis_zeilen where nachweis_id = n.id and quelle in ('dienst','abwesenheit');

  insert into zeitnachweis_zeilen (nachweis_id, datum, zeiten, stunden, quelle)
  select n.id, d.datum,
         coalesce(case when d.von is not null and d.bis is not null
                       then to_char(d.von,'HH24:MI') || ' - ' || to_char(d.bis,'HH24:MI') end,
                  d.bezeichnung, '')
           || coalesce(' (Feiertag: ' || f.bezeichnung || ')', ''),
         case when d.von is not null and d.bis is not null
              then round((extract(epoch from (d.bis - d.von)) / 3600.0)::numeric, 2) end,
         'dienst'
    from dienste d
    join dienst_zuteilungen z on z.dienst_id = d.id and z.person_id = n.person_id
    left join lateral (select bezeichnung from feiertage ft
                        where ft.datum = d.datum and (ft.treff_id = n.treff_id or ft.treff_id is null)
                        order by ft.treff_id nulls last limit 1) f on true
   where d.treff_id = n.treff_id and d.datum >= von_monat and d.datum < bis_monat;

  insert into zeitnachweis_zeilen (nachweis_id, datum, zeiten, stunden, quelle)
  select n.id, a.datum,
         case a.typ when 'urlaub' then 'Urlaub' else 'Krank' end || coalesce(' – ' || a.notiz, ''),
         case when o.treff_id is not null then round((extract(epoch from (o.bis - o.von)) / 3600.0)::numeric, 2) end,
         'abwesenheit'
    from abwesenheiten a
    left join treff_oeffnungszeiten o on o.treff_id = n.treff_id and o.wochentag = extract(isodow from a.datum)
   where a.person_id = n.person_id and a.datum >= von_monat and a.datum < bis_monat;

  select count(*) into cnt from zeitnachweis_zeilen where nachweis_id = n.id;
  return cnt;
end $$;

-- ===== Ausführungsrechte: nur angemeldete Personen =====
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant  execute on all functions in schema public to authenticated;
grant select on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
