-- KiJuB-Kompass · 0010 KiJuKo-Import (docs/IMPORT.md)
--
-- fn_kijuko_import(plan, anwenden, entscheidungen, datei):
--   Vorschau (anwenden = false): läuft den kompletten Import durch und macht ihn danach rückgängig –
--   die Vorschau zeigt also exakt, was der echte Lauf tun würde.
--   Anwenden (anwenden = true): dasselbe, aber verbindlich, in EINER Transaktion, mit Protokoll.
--
-- Regeln je Feld (neu = Wert aus KiJuKo, ist = Wert im Kompass, stand = Wert beim letzten Import):
--   1. neu fehlt oder ist leer   → nichts tun (leere Werte überschreiben nie)
--   2. ist = neu                 → nichts zu tun
--   3. neu = stand               → KiJuKo unverändert, der Kompass-Wert bleibt (auch bei Abweichung)
--   4. ist ist leer              → neu übernehmen
--   5. ist = stand               → im Kompass nicht angefasst, neu übernehmen
--   6. sonst                     → KONFLIKT: die Koordination entscheidet ('kijuko' oder 'kompass');
--                                  ohne Entscheidung bleibt der Kompass-Wert und der Konflikt bleibt offen.
-- Nie gelöscht wird, was in KiJuKo wegfällt: Personen/Freizeiten werden nur markiert,
-- Zuteilungen nur auf ausdrücklichen Wunsch entfernt.

-- ===== Hilfsfunktionen (intern, nicht von außen aufrufbar) =====

-- Entfernt null und leere Texte aus einem JSON-Objekt.
create function fn_import_sauber(p_obj jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from jsonb_each(p_obj) as e(k, v)
   where v <> 'null'::jsonb and v <> '""'::jsonb
$$;

-- Bringt einen Plan-Wert in die Darstellung der Spalte (Zeit "07:30" → "07:30:00", Enum, Zahl …),
-- damit Vergleiche mit dem Bestand stimmen. p_tabelle stammt nur aus festen Aufrufen in diesem Skript.
create function fn_import_norm(p_tabelle text, p_feld text, p_wert jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare v_r jsonb;
begin
  execute format('select to_jsonb(r) -> $1 from jsonb_populate_record(null::public.%I, jsonb_build_object($1::text, $2::jsonb)) r', p_tabelle)
    into v_r using p_feld, p_wert;
  return v_r;
end $$;

create function fn_import_zaehle(p_z jsonb, p_art text, p_aktion text) returns jsonb
language sql immutable as $$
  select jsonb_set(jsonb_set(p_z, array[p_art], coalesce(p_z -> p_art, '{}'::jsonb), true),
                   array[p_art, p_aktion], to_jsonb(coalesce((p_z #>> array[p_art, p_aktion])::int, 0) + 1), true)
$$;

create function fn_import_stand(p_tabelle text, p_id uuid, p_feld text, p_wert jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into import_staende (tabelle, datensatz_id, feld, wert) values (p_tabelle, p_id, p_feld, p_wert)
  on conflict (tabelle, datensatz_id, feld) do update set wert = excluded.wert
$$;

-- Gleicht EINE Zeile ab (anlegen oder feldweise zusammenführen), Regeln siehe oben.
create function fn_import_zeile(
  p_tabelle text, p_id uuid, p_kid text, p_neu jsonb, p_felder text[], p_extra jsonb, p_entsch jsonb,
  out o_id uuid, out o_aktion text, out o_felder jsonb, out o_konflikte jsonb)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ist jsonb; v_f text; v_neu jsonb; v_ist_w jsonb; v_last jsonb; v_hat_stand boolean;
  v_aend jsonb := '{}'::jsonb; v_schluessel text; v_entsch text; v_nimm boolean; v_stand boolean;
  v_stand_felder text[] := '{}'; v_ins jsonb; v_spalten text;
begin
  o_felder := '[]'::jsonb; o_konflikte := '[]'::jsonb;

  if p_id is null then
    v_ins := p_neu || jsonb_build_object('kijuko_id', p_kid) || coalesce(p_extra, '{}'::jsonb);
    select string_agg(quote_ident(k), ', ') into v_spalten from jsonb_object_keys(v_ins) k;
    execute format('insert into %1$I (%2$s) select %2$s from jsonb_populate_record(null::%1$I, $1) returning id', p_tabelle, v_spalten)
      into o_id using v_ins;
    o_aktion := 'neu';
    foreach v_f in array p_felder loop
      if p_neu ? v_f then v_stand_felder := v_stand_felder || v_f; end if;
    end loop;
  else
    o_id := p_id;
    execute format('select to_jsonb(t) from %I t where id = $1', p_tabelle) into v_ist using p_id;

    foreach v_f in array p_felder loop
      continue when not (p_neu ? v_f);
      v_neu := fn_import_norm(p_tabelle, v_f, p_neu -> v_f);
      v_ist_w := v_ist -> v_f;
      select s.wert into v_last from import_staende s where s.tabelle = p_tabelle and s.datensatz_id = p_id and s.feld = v_f;
      v_hat_stand := found;
      v_nimm := false; v_stand := true;

      if v_ist_w is not distinct from v_neu then
        null;                                                       -- Regel 2
      elsif v_hat_stand and v_last is not distinct from v_neu then
        null;                                                       -- Regel 3
      elsif v_ist_w is null or v_ist_w = 'null'::jsonb or v_ist_w = '""'::jsonb then
        v_nimm := true;                                             -- Regel 4
      elsif v_hat_stand and v_ist_w is not distinct from v_last then
        v_nimm := true;                                             -- Regel 5
      else                                                          -- Regel 6: Konflikt
        v_schluessel := format('%s:%s:%s', p_tabelle, p_id, v_f);
        v_entsch := p_entsch ->> v_schluessel;
        if v_entsch = 'kijuko' then
          v_nimm := true;
        else
          o_konflikte := o_konflikte || jsonb_build_object('schluessel', v_schluessel, 'feld', v_f, 'kompass', v_ist_w, 'kijuko', v_neu);
          v_stand := (v_entsch = 'kompass');                        -- offene Konflikte bleiben offen
        end if;
      end if;

      if v_nimm then
        v_aend := v_aend || jsonb_build_object(v_f, v_neu);
        o_felder := o_felder || jsonb_build_object('feld', v_f, 'von', v_ist_w, 'nach', v_neu);
      end if;
      if v_stand then v_stand_felder := v_stand_felder || v_f; end if;
    end loop;

    -- Verknüpfung mit einer bereits vorhandenen Zeile (noch ohne KiJuKo-ID)
    if v_ist -> 'kijuko_id' = 'null'::jsonb then
      v_aend := v_aend || jsonb_build_object('kijuko_id', p_kid) || coalesce(p_extra, '{}'::jsonb);
    end if;

    if v_aend <> '{}'::jsonb then
      execute format('update %1$I t set %2$s from jsonb_populate_record(null::%1$I, $2) r where t.id = $1',
                     p_tabelle,
                     (select string_agg(format('%1$I = r.%1$I', k), ', ') from jsonb_object_keys(v_aend) k))
        using p_id, v_aend;
    end if;
    o_aktion := case when v_aend <> '{}'::jsonb then 'geaendert' else 'unveraendert' end;
  end if;

  -- Stand festhalten (Grundlage der Konflikterkennung beim nächsten Import)
  foreach v_f in array v_stand_felder loop
    perform fn_import_stand(p_tabelle, o_id, v_f, fn_import_norm(p_tabelle, v_f, p_neu -> v_f));
  end loop;
end $$;

-- ===== Der eigentliche Lauf =====
create function fn_import_lauf(p_plan jsonb, p_entsch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  z jsonb := '{}'::jsonb;
  v_aend jsonb := '[]'::jsonb; v_konf jsonb := '[]'::jsonb; v_entf jsonb := '[]'::jsonb;
  v_hinw jsonb := coalesce(p_plan -> 'hinweise', '[]'::jsonb);
  m_orte jsonb := '{}'::jsonb; m_pers jsonb := '{}'::jsonb; m_frei jsonb := '{}'::jsonb;
  r jsonb; rec record; res record; ex record;
  v_id uuid; v_kid text; v_neu jsonb; v_name text; v_fremd text; v_max int;
  v_gew jsonb := '[]'::jsonb; v_fid uuid; v_pid uuid; v_rolle text; v_rolle_ist text;
  v_last jsonb; v_hat_stand boolean; v_key text; v_entsch text; v_paare text[] := '{}';
  v_ohne int := 0; v_bleibt int := 0; v_n int; v_ids text[];
begin
  ---------------------------------------------------------------- Orte
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'orte', '[]'::jsonb)) loop
    v_kid := r ->> 'kijuko_id';
    select o.id into v_id from orte o where o.kijuko_id = v_kid;
    if v_id is null then
      select o.id into v_id from orte o where o.kijuko_id is null and lower(o.name) = lower(r ->> 'name') limit 1;
    end if;
    v_neu := fn_import_sauber(jsonb_build_object('name', r -> 'name', 'adresse', r -> 'adresse', 'lieferstelle_nr', r -> 'lieferstelle_nr'));
    select * into res from fn_import_zeile('orte', v_id, v_kid, v_neu, array['name','adresse','lieferstelle_nr'], null, p_entsch);
    m_orte := m_orte || jsonb_build_object(v_kid, res.o_id);
    z := fn_import_zaehle(z, 'orte', res.o_aktion);
    v_konf := v_konf || coalesce((select jsonb_agg(k || jsonb_build_object('art', 'Ort', 'name', r ->> 'name'))
                                    from jsonb_array_elements(res.o_konflikte) k), '[]'::jsonb);
    if jsonb_array_length(res.o_felder) > 0 then
      v_aend := v_aend || jsonb_build_object('art', 'Ort', 'name', r ->> 'name', 'felder', res.o_felder);
    end if;
  end loop;

  ---------------------------------------------------------------- Personen
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'personen', '[]'::jsonb)) loop
    v_kid := r ->> 'kijuko_id';
    v_name := (r ->> 'vorname') || ' ' || (r ->> 'nachname');
    select p.id into v_id from personen p where p.kijuko_id = v_kid;
    if v_id is null then
      select p.id, p.kijuko_id into v_id, v_fremd from personen p where lower(p.mail) = lower(r ->> 'mail');
      if v_id is not null and v_fremd is not null then   -- Mail gehört schon zu einer anderen KiJuKo-Person
        v_hinw := v_hinw || to_jsonb(format('%s: Die Mail-Adresse gehört im Kompass schon zu einer anderen KiJuKo-Person – übersprungen.', v_name));
        continue;
      end if;
      if v_id is not null then
        v_hinw := v_hinw || to_jsonb(format('%s: Mit der vorhandenen Person (gleiche Mail-Adresse) verknüpft.', v_name));
      end if;
    end if;
    v_neu := fn_import_sauber(jsonb_build_object(
      'vorname', r -> 'vorname', 'nachname', r -> 'nachname', 'mail', r -> 'mail', 'telefon', r -> 'telefon',
      'ernaehrung', r -> 'ernaehrung', 'notizen', r -> 'notizen', 'kategorie', r -> 'kategorie', 'aktiv', r -> 'aktiv'));
    if v_id is not null and exists (select 1 from personen p where lower(p.mail) = lower(v_neu ->> 'mail') and p.id <> v_id) then
      v_neu := v_neu - 'mail';
      v_hinw := v_hinw || to_jsonb(format('%s: Die neue Mail-Adresse aus KiJuKo gehört im Kompass schon einer anderen Person – nicht übernommen.', v_name));
    end if;
    select * into res from fn_import_zeile('personen', v_id, v_kid, v_neu,
      array['vorname','nachname','mail','telefon','ernaehrung','notizen','kategorie','aktiv'],
      jsonb_build_object('kijuko_quelle', r -> 'kijuko_quelle'), p_entsch);
    m_pers := m_pers || jsonb_build_object(v_kid, res.o_id);
    z := fn_import_zaehle(z, 'personen', res.o_aktion);
    v_konf := v_konf || coalesce((select jsonb_agg(k || jsonb_build_object('art', 'Person', 'name', v_name))
                                    from jsonb_array_elements(res.o_konflikte) k), '[]'::jsonb);
    if jsonb_array_length(res.o_felder) > 0 then
      v_aend := v_aend || jsonb_build_object('art', 'Person', 'name', v_name, 'felder', res.o_felder);
      if exists (select 1 from jsonb_array_elements(res.o_felder) x where x ->> 'feld' = 'mail')
         and exists (select 1 from personen p where p.id = res.o_id and p.auth_user_id is not null) then
        v_hinw := v_hinw || to_jsonb(format('%s: Die Mail-Adresse wurde geändert, das Login-Konto läuft aber weiter unter der alten Adresse.', v_name));
      end if;
    end if;
  end loop;

  ---------------------------------------------------------------- Freizeiten
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) loop
    v_kid := r ->> 'kijuko_id';
    v_name := r ->> 'name';
    if (r ->> 'ende_datum')::date < (r ->> 'start_datum')::date then
      v_hinw := v_hinw || to_jsonb(format('%s: Das Ende liegt vor dem Start – übersprungen.', v_name));
      continue;
    end if;
    select f.id into v_id from freizeiten f where f.kijuko_id = v_kid;
    if v_id is null then
      select f.id into v_id from freizeiten f
       where f.kijuko_id is null and lower(f.name) = lower(v_name) and f.start_datum = (r ->> 'start_datum')::date limit 1;
      if v_id is not null then
        v_hinw := v_hinw || to_jsonb(format('%s: Mit der vorhandenen Freizeit (gleicher Name und Start) verknüpft.', v_name));
      end if;
    end if;
    v_neu := fn_import_sauber(jsonb_build_object(
      'name', r -> 'name', 'status', r -> 'status', 'ferienzeitraum', r -> 'ferienzeitraum', 'ferienwoche', r -> 'ferienwoche',
      'start_datum', r -> 'start_datum', 'ende_datum', r -> 'ende_datum',
      'arbeitsbeginn', r -> 'arbeitsbeginn', 'arbeitsende', r -> 'arbeitsende',
      'alter_von', r -> 'alter_von', 'alter_bis', r -> 'alter_bis', 'max_teilnehmende', r -> 'max_teilnehmende',
      'kijuko_code', r -> 'kijuko_code', 'kijuko_serie_id', r -> 'kijuko_serie_id',
      'ort_id', case when r ->> 'ort_kijuko_id' is not null then m_orte -> (r ->> 'ort_kijuko_id') end));
    -- Die Ferienwoche muss zur Ferienzeit passen (sonst würde die Datenbank den ganzen Import ablehnen)
    if v_neu ? 'ferienwoche' then
      v_max := case v_neu ->> 'ferienzeitraum' when 'sommer' then 6 when 'ostern' then 2 when 'herbst' then 2 else 0 end;
      if (v_neu ->> 'ferienwoche')::int > v_max or (v_neu ->> 'ferienwoche')::int < 1 then
        v_neu := v_neu - 'ferienwoche';
        v_hinw := v_hinw || to_jsonb(format('%s: Die Ferienwoche passt nicht zur Ferienzeit – nicht übernommen.', v_name));
      end if;
    end if;
    if (v_neu ->> 'alter_von') is not null and (v_neu ->> 'alter_bis') is not null
       and (v_neu ->> 'alter_bis')::int < (v_neu ->> 'alter_von')::int then
      v_neu := v_neu - 'alter_von' - 'alter_bis';
    end if;
    select * into res from fn_import_zeile('freizeiten', v_id, v_kid, v_neu,
      array['name','status','ferienzeitraum','ferienwoche','start_datum','ende_datum','arbeitsbeginn','arbeitsende',
            'alter_von','alter_bis','max_teilnehmende','kijuko_code','kijuko_serie_id','ort_id'],
      null, p_entsch);
    m_frei := m_frei || jsonb_build_object(v_kid, res.o_id);
    z := fn_import_zaehle(z, 'freizeiten', res.o_aktion);
    v_konf := v_konf || coalesce((select jsonb_agg(k || jsonb_build_object('art', 'Freizeit', 'name', v_name))
                                    from jsonb_array_elements(res.o_konflikte) k), '[]'::jsonb);
    if jsonb_array_length(res.o_felder) > 0 then
      v_aend := v_aend || jsonb_build_object('art', 'Freizeit', 'name', v_name, 'felder', res.o_felder);
    end if;
  end loop;

  ---------------------------------------------------------------- Zuteilungen (Leitung und Team)
  -- Gewünschter Zustand: Leitungen aus den Freizeiten, Ehrenamtliche aus den Zuteilungen (Leitung gewinnt).
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) loop
    for v_kid in select jsonb_array_elements_text(coalesce(r -> 'leitung_kijuko_ids', '[]'::jsonb)) loop
      v_gew := v_gew || jsonb_build_object('f', r ->> 'kijuko_id', 'p', v_kid, 'rolle', 'leitung');
    end loop;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'zuteilungen', '[]'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(v_gew) g
                    where g ->> 'f' = r ->> 'freizeit_kijuko_id' and g ->> 'p' = r ->> 'person_kijuko_id') then
      v_gew := v_gew || jsonb_build_object('f', r ->> 'freizeit_kijuko_id', 'p', r ->> 'person_kijuko_id', 'rolle', 'teamer');
    end if;
  end loop;

  for r in select * from jsonb_array_elements(v_gew) loop
    v_fid := (m_frei ->> (r ->> 'f'))::uuid;
    v_pid := (m_pers ->> (r ->> 'p'))::uuid;
    if v_fid is null or v_pid is null then v_ohne := v_ohne + 1; continue; end if;
    v_paare := v_paare || (v_fid::text || '|' || v_pid::text);
    v_rolle := r ->> 'rolle';
    select t.rolle::text into v_rolle_ist from freizeit_team t where t.freizeit_id = v_fid and t.person_id = v_pid;
    select s.wert into v_last from import_staende s where s.tabelle = 'freizeit_team' and s.datensatz_id = v_fid and s.feld = v_pid::text;
    v_hat_stand := found;

    if v_rolle_ist is null then
      if v_hat_stand then v_bleibt := v_bleibt + 1; continue; end if;   -- im Kompass bewusst entfernt, bleibt entfernt
      insert into freizeit_team (freizeit_id, person_id, rolle) values (v_fid, v_pid, v_rolle::freizeit_rolle);
      perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      z := fn_import_zaehle(z, 'zuteilungen', 'neu');
    elsif v_rolle_ist = v_rolle then
      perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      z := fn_import_zaehle(z, 'zuteilungen', 'unveraendert');
    elsif v_hat_stand and v_last = to_jsonb(v_rolle) then
      z := fn_import_zaehle(z, 'zuteilungen', 'unveraendert');           -- KiJuKo unverändert, Kompass-Rolle bleibt
    elsif v_hat_stand and v_last = to_jsonb(v_rolle_ist) then
      update freizeit_team t set rolle = v_rolle::freizeit_rolle where t.freizeit_id = v_fid and t.person_id = v_pid;
      perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      z := fn_import_zaehle(z, 'zuteilungen', 'geaendert');
    else
      v_key := format('freizeit_team:%s:%s', v_fid, v_pid);
      v_entsch := p_entsch ->> v_key;
      if v_entsch = 'kijuko' then
        update freizeit_team t set rolle = v_rolle::freizeit_rolle where t.freizeit_id = v_fid and t.person_id = v_pid;
        z := fn_import_zaehle(z, 'zuteilungen', 'geaendert');
      else
        v_konf := v_konf || jsonb_build_object('schluessel', v_key, 'art', 'Zuteilung', 'feld', 'rolle',
          'name', (select p.vorname || ' ' || p.nachname || ' in ' || f.name from personen p, freizeiten f where p.id = v_pid and f.id = v_fid),
          'kompass', to_jsonb(v_rolle_ist), 'kijuko', to_jsonb(v_rolle));
        z := fn_import_zaehle(z, 'zuteilungen', 'unveraendert');
      end if;
      if v_entsch is not null then
        perform fn_import_stand('freizeit_team', v_fid, v_pid::text, to_jsonb(v_rolle));
      end if;
    end if;
  end loop;

  -- In KiJuKo entfallene Zuteilungen: nur auf ausdrücklichen Wunsch entfernen
  for rec in
    select s.datensatz_id as fid, s.feld::uuid as pid
      from import_staende s
      join freizeit_team t on t.freizeit_id = s.datensatz_id and t.person_id = s.feld::uuid
     where s.tabelle = 'freizeit_team'
       and s.datensatz_id::text in (select value from jsonb_each_text(m_frei))
       and not ((s.datensatz_id::text || '|' || s.feld) = any (v_paare))
  loop
    v_key := format('entfallen:%s:%s', rec.fid, rec.pid);
    v_name := (select p.vorname || ' ' || p.nachname || ' in ' || f.name from personen p, freizeiten f where p.id = rec.pid and f.id = rec.fid);
    if p_entsch ->> v_key = 'kijuko' then
      delete from freizeit_team t where t.freizeit_id = rec.fid and t.person_id = rec.pid;
      delete from import_staende s where s.tabelle = 'freizeit_team' and s.datensatz_id = rec.fid and s.feld = rec.pid::text;
      z := fn_import_zaehle(z, 'zuteilungen', 'entfernt');
    else
      v_entf := v_entf || jsonb_build_object('art', 'Zuteilung', 'name', v_name, 'schluessel', v_key);
      z := fn_import_zaehle(z, 'zuteilungen', 'entfallen');
    end if;
  end loop;

  ---------------------------------------------------------------- Entfallene Personen und Freizeiten (nur markieren)
  select coalesce(array_agg(x ->> 'kijuko_id'), '{}') into v_ids from jsonb_array_elements(coalesce(p_plan -> 'personen', '[]'::jsonb)) x;
  update personen set kijuko_entfallen_am = null where kijuko_id = any (v_ids) and kijuko_entfallen_am is not null;
  for rec in select p.id, p.vorname || ' ' || p.nachname as name from personen p
              where p.kijuko_id is not null and not (p.kijuko_id = any (v_ids)) loop
    update personen set kijuko_entfallen_am = coalesce(kijuko_entfallen_am, now()) where id = rec.id;
    v_entf := v_entf || jsonb_build_object('art', 'Person', 'name', rec.name, 'schluessel', 'person:' || rec.id);
  end loop;

  select coalesce(array_agg(x ->> 'kijuko_id'), '{}') into v_ids from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) x;
  update freizeiten set kijuko_entfallen_am = null where kijuko_id = any (v_ids) and kijuko_entfallen_am is not null;
  for rec in select f.id, f.name from freizeiten f where f.kijuko_id is not null and not (f.kijuko_id = any (v_ids)) loop
    update freizeiten set kijuko_entfallen_am = coalesce(kijuko_entfallen_am, now()) where id = rec.id;
    v_entf := v_entf || jsonb_build_object('art', 'Freizeit', 'name', rec.name, 'schluessel', 'freizeit:' || rec.id);
  end loop;

  ---------------------------------------------------------------- Verpflegung (Kopie der KiJuKo-Werte)
  for rec in select e.key as kid, e.value::uuid as fid from jsonb_each_text(m_frei) e loop
    for r in select * from jsonb_array_elements(coalesce(p_plan -> 'verpflegung', '[]'::jsonb)) x
              where x ->> 'freizeit_kijuko_id' = rec.kid loop
      select * into ex from freizeit_verpflegung fv
       where fv.freizeit_id = rec.fid and fv.datum is not distinct from nullif(r ->> 'datum', '')::date;
      if not found then
        insert into freizeit_verpflegung (freizeit_id, datum, mischkost, vegetarisch, allergiker)
        values (rec.fid, nullif(r ->> 'datum', '')::date, (r ->> 'mischkost')::int, (r ->> 'vegetarisch')::int, (r ->> 'allergiker')::int);
        z := fn_import_zaehle(z, 'verpflegung', 'neu');
      elsif ex.mischkost <> (r ->> 'mischkost')::int or ex.vegetarisch <> (r ->> 'vegetarisch')::int
            or ex.allergiker <> (r ->> 'allergiker')::int then
        update freizeit_verpflegung fv
           set mischkost = (r ->> 'mischkost')::int, vegetarisch = (r ->> 'vegetarisch')::int, allergiker = (r ->> 'allergiker')::int
         where fv.id = ex.id;
        z := fn_import_zaehle(z, 'verpflegung', 'geaendert');
      else
        z := fn_import_zaehle(z, 'verpflegung', 'unveraendert');
      end if;
    end loop;
    delete from freizeit_verpflegung fv
     where fv.freizeit_id = rec.fid
       and not exists (select 1 from jsonb_array_elements(coalesce(p_plan -> 'verpflegung', '[]'::jsonb)) x
                        where x ->> 'freizeit_kijuko_id' = rec.kid
                          and nullif(x ->> 'datum', '')::date is not distinct from fv.datum);
    get diagnostics v_n = row_count;
    for i in 1..v_n loop z := fn_import_zaehle(z, 'verpflegung', 'geloescht'); end loop;
  end loop;

  ---------------------------------------------------------------- Material (Kopie der KiJuKo-Werte)
  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'material', '[]'::jsonb)) loop
    v_fid := (m_frei ->> (r ->> 'freizeit_kijuko_id'))::uuid;
    continue when v_fid is null;
    select * into ex from freizeit_material m where m.kijuko_id = r ->> 'kijuko_id';
    if not found then
      insert into freizeit_material (freizeit_id, kijuko_id, name, einheit, menge, notiz)
      values (v_fid, r ->> 'kijuko_id', r ->> 'name', r ->> 'einheit', (r ->> 'menge')::numeric, r ->> 'notiz');
      z := fn_import_zaehle(z, 'material', 'neu');
    elsif ex.freizeit_id <> v_fid or ex.name <> (r ->> 'name')
          or ex.einheit is distinct from (r ->> 'einheit') or ex.menge is distinct from (r ->> 'menge')::numeric
          or ex.notiz is distinct from (r ->> 'notiz') then
      update freizeit_material m
         set freizeit_id = v_fid, name = r ->> 'name', einheit = r ->> 'einheit',
             menge = (r ->> 'menge')::numeric, notiz = r ->> 'notiz'
       where m.id = ex.id;
      z := fn_import_zaehle(z, 'material', 'geaendert');
    else
      z := fn_import_zaehle(z, 'material', 'unveraendert');
    end if;
  end loop;
  select coalesce(array_agg(x ->> 'kijuko_id'), '{}') into v_ids from jsonb_array_elements(coalesce(p_plan -> 'material', '[]'::jsonb)) x;
  delete from freizeit_material m
   where m.kijuko_id is not null and not (m.kijuko_id = any (v_ids))
     and m.freizeit_id::text in (select value from jsonb_each_text(m_frei));
  get diagnostics v_n = row_count;
  for i in 1..v_n loop z := fn_import_zaehle(z, 'material', 'geloescht'); end loop;

  if v_ohne > 0 then
    v_hinw := v_hinw || to_jsonb(format('%s Zuteilung(en) konnten keiner Person oder Freizeit zugeordnet werden (siehe „Übersprungen").', v_ohne));
  end if;
  if v_bleibt > 0 then
    v_hinw := v_hinw || to_jsonb(format('%s Zuteilung(en) wurden im Kompass bewusst entfernt und bleiben entfernt.', v_bleibt));
  end if;

  return jsonb_build_object('zaehler', z, 'aenderungen', v_aend, 'konflikte', v_konf, 'entfallen', v_entf,
                            'hinweise', v_hinw, 'uebersprungen', coalesce(p_plan -> 'uebersprungen', '[]'::jsonb));
end $$;

-- ===== Öffentliche Funktion (nur Koordination) =====
create function fn_kijuko_import(
  p_plan jsonb, p_anwenden boolean default false, p_entscheidungen jsonb default '{}'::jsonb, p_datei jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_entsch jsonb := coalesce(p_entscheidungen, '{}'::jsonb);
begin
  if not ist_koord() then
    raise exception 'Nur die Koordination darf importieren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) <> 'object' or (p_plan ->> 'version') is distinct from '1' then
    raise exception 'Ungültiger Importplan' using errcode = '22023';
  end if;

  begin
    v_result := fn_import_lauf(p_plan, v_entsch);
    if not p_anwenden then
      raise exception 'Vorschau' using errcode = 'P0901';   -- macht den Probelauf rückgängig
    end if;
  exception when sqlstate 'P0901' then
    null;                                                   -- v_result bleibt erhalten, alle Änderungen sind zurückgerollt
  end;

  if p_anwenden then
    insert into import_laeufe (gestartet_von, datei_name, datei_sha256, backup_datum, ergebnis, angewendet)
    values (meine_person_id(), p_datei ->> 'name', p_datei ->> 'sha256', nullif(p_datei ->> 'backup_datum', '')::date,
            jsonb_build_object(
              'zaehler', v_result -> 'zaehler',
              'offene_konflikte', jsonb_array_length(v_result -> 'konflikte'),
              'entfallen', jsonb_array_length(v_result -> 'entfallen'),
              'uebersprungen', jsonb_array_length(v_result -> 'uebersprungen'),
              'hinweise', jsonb_array_length(v_result -> 'hinweise')),
            true);
  end if;
  return v_result || jsonb_build_object('angewendet', p_anwenden);
end $$;

-- Nur die öffentliche Funktion ist aufrufbar; die internen Helfer laufen nur innerhalb von fn_kijuko_import.
revoke execute on function fn_import_sauber(jsonb), fn_import_norm(text, text, jsonb), fn_import_zaehle(jsonb, text, text),
  fn_import_stand(text, uuid, text, jsonb),
  fn_import_zeile(text, uuid, text, jsonb, text[], jsonb, jsonb), fn_import_lauf(jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function fn_kijuko_import(jsonb, boolean, jsonb, jsonb) from public, anon;
grant  execute on function fn_kijuko_import(jsonb, boolean, jsonb, jsonb) to authenticated;
