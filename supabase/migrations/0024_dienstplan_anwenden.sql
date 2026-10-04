-- KiJuB-Kompass · 0024: Dienstplan gezielt ändern (Personen hinzufügen und entfernen)
--
-- Die Treffleitung teilt oft einen ganzen Monat auf einmal ein. Der Browser berechnet, welche Personen an welchen Tagen dazukommen oder
-- wegfallen (nach Vorschau und eigener Entscheidung bei Konflikten) und schickt genau diese Liste. Die Funktion übernimmt sie in einem Schritt:
-- ganz oder gar nicht. Vorhandene Einteilungen bleiben, wenn sie nicht ausdrücklich entfernt werden; ein regulärer Dienst wird bei Bedarf
-- mit der Öffnungszeit des Wochentags angelegt. Sie ersetzt das Monatsmuster nicht (fn_dienste_monatsmuster bleibt bestehen), ändert aber
-- nichts am Rest der Rechte.
--
--   p_zuteilen / p_entfernen: Liste von {"datum": "JJJJ-MM-TT", "person": "<uuid>"}; alle Tage müssen im Monat liegen.

create function fn_dienstplan_anwenden(p_treff uuid, p_monat date, p_zuteilen jsonb, p_entfernen jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_start date := date_trunc('month', p_monat)::date;
  v_ende  date := (date_trunc('month', p_monat) + interval '1 month')::date;     -- ausschließlich
  e jsonb; v_datum date; v_person uuid; v_wt smallint; oz treff_oeffnungszeiten; d_id uuid; n int;
  zugeteilt int := 0; entfernt int := 0;
begin
  if not (ist_treffleitung(p_treff) or ist_treffkoord()) then
    raise exception 'Nur Treffleitung und Treffkoordination dürfen den Dienstplan ändern' using errcode = '42501';
  end if;
  if jsonb_typeof(p_zuteilen) is distinct from 'array' or jsonb_typeof(p_entfernen) is distinct from 'array' then
    raise exception 'Die Listen müssen Arrays sein' using errcode = 'check_violation';
  end if;

  -- Entfernen: nur aus dem regulären Dienst des Tages
  for e in select * from jsonb_array_elements(p_entfernen) loop
    v_datum := (e ->> 'datum')::date;
    v_person := (e ->> 'person')::uuid;
    if v_datum < v_start or v_datum >= v_ende then
      raise exception 'Der Tag % liegt nicht im Monat', v_datum using errcode = 'check_violation';
    end if;
    select id into d_id from dienste where treff_id = p_treff and datum = v_datum and not ist_sonder;
    if d_id is not null then
      delete from dienst_zuteilungen where dienst_id = d_id and person_id = v_person;
      get diagnostics n = row_count;
      entfernt := entfernt + n;
    end if;
  end loop;

  -- Hinzufügen: Dienst anlegen, falls es noch keinen gibt; vorhandene Einteilungen bleiben
  for e in select * from jsonb_array_elements(p_zuteilen) loop
    v_datum := (e ->> 'datum')::date;
    v_person := (e ->> 'person')::uuid;
    if v_datum < v_start or v_datum >= v_ende then
      raise exception 'Der Tag % liegt nicht im Monat', v_datum using errcode = 'check_violation';
    end if;
    if not exists (select 1 from treff_team where treff_id = p_treff and person_id = v_person) then
      raise exception 'Person % gehört nicht zu diesem Treff', v_person using errcode = 'check_violation';
    end if;
    select id into d_id from dienste where treff_id = p_treff and datum = v_datum and not ist_sonder;
    if d_id is null then
      v_wt := extract(isodow from v_datum)::smallint;
      select * into oz from treff_oeffnungszeiten where treff_id = p_treff and wochentag = v_wt;
      if oz.treff_id is null then
        raise exception 'Am % ist der Treff nicht geöffnet', v_datum using errcode = 'check_violation';
      end if;
      insert into dienste (treff_id, datum, von, bis) values (p_treff, v_datum, oz.von, oz.bis) returning id into d_id;
    end if;
    insert into dienst_zuteilungen (dienst_id, person_id) values (d_id, v_person) on conflict do nothing;
    get diagnostics n = row_count;
    zugeteilt := zugeteilt + n;
  end loop;

  return jsonb_build_object('zugeteilt', zugeteilt, 'entfernt', entfernt);
end $$;

revoke execute on function fn_dienstplan_anwenden(uuid, date, jsonb, jsonb) from public, anon;
grant execute on function fn_dienstplan_anwenden(uuid, date, jsonb, jsonb) to authenticated;
