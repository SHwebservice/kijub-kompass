-- KiJuB-Kompass · 0025: Mehrere Dienstwünsche auf einmal bestätigen; Einteilen erfüllt einen offenen Wunsch
--
-- 1) fn_wuensche_bestaetigen: Die Treffleitung bestätigt eine Liste offener Wünsche ihres Treffs in einem Schritt (ganz oder gar nicht).
--    Welche Wünsche (ohne Konflikt wie Urlaub oder Feiertag) bestätigt werden, entscheidet die Oberfläche; die Funktion prüft nur Rechte
--    und Zugehörigkeit. Bereits beantwortete Wünsche werden übersprungen. Ergebnis: Zahl der bestätigten Wünsche.
-- 2) Wird eine Person für einen Dienst eingeteilt, den sie sich gewünscht hat (Zuteilen, Monat einteilen, Tabelle), gilt ihr offener
--    Wunsch als bestätigt – sonst stünde sie eingeteilt und zugleich mit offenem Wunsch im Plan.
--
--   p_wuensche: Liste von {"dienst": "<uuid>", "person": "<uuid>"}

create function fn_wuensche_bestaetigen(p_treff uuid, p_wuensche jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare e jsonb; v_dienst uuid; v_person uuid; n int := 0;
begin
  if not (ist_treffleitung(p_treff) or ist_treffkoord()) then
    raise exception 'Nur Treffleitung und Treffkoordination dürfen Wünsche beantworten' using errcode = '42501';
  end if;
  if jsonb_typeof(p_wuensche) is distinct from 'array' then
    raise exception 'Die Liste muss ein Array sein' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_array_elements(p_wuensche) loop
    v_dienst := (e ->> 'dienst')::uuid;
    v_person := (e ->> 'person')::uuid;
    if treff_von_dienst(v_dienst) is distinct from p_treff then
      raise exception 'Der Dienst gehört nicht zu diesem Treff' using errcode = 'check_violation';
    end if;
    update dienst_wuensche set status = 'bestaetigt', entschieden_von = meine_person_id()
     where dienst_id = v_dienst and person_id = v_person and status = 'offen';
    if found then
      insert into dienst_zuteilungen (dienst_id, person_id) values (v_dienst, v_person) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function fn_wuensche_bestaetigen(uuid, jsonb) from public, anon;
grant execute on function fn_wuensche_bestaetigen(uuid, jsonb) to authenticated;

create function fn_zuteilung_erfuellt_wunsch() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update dienst_wuensche set status = 'bestaetigt', entschieden_von = meine_person_id()
   where dienst_id = new.dienst_id and person_id = new.person_id and status = 'offen';
  return null;
end $$;

revoke execute on function fn_zuteilung_erfuellt_wunsch() from public, anon;

create trigger dienst_zuteilungen_wunsch after insert on dienst_zuteilungen
  for each row execute function fn_zuteilung_erfuellt_wunsch();
