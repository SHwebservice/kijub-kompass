-- KiJuB-Kompass · 0022: Stundennachweise für Teilzeitkräfte erstellen
--
-- Bisher konnte nur die Person selbst ihren Nachweis anlegen. Jetzt können Treffleitung und Treffkoordination die Nachweise eines Monats
-- erstellen lassen: für eine Person oder für alle Teilzeitkräfte (Kategorie TZK) des Treffs. Die Zeilen werden aus dem Dienstplan
-- und den Abwesenheiten befüllt. Vorhandene Nachweise bleiben unverändert. Die Rechte der Tabelle ändern sich nicht (jede Person legt
-- weiterhin nur ihren eigenen Nachweis selbst an); das Erstellen für andere geht nur über diese Funktion.

create function fn_nachweise_erstellen(p_treff uuid, p_monat date, p_person uuid default null) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_monat date := date_trunc('month', p_monat)::date;
  r record;
  v_id uuid;
  erstellt int := 0;
begin
  if not (ist_treffleitung(p_treff) or ist_treffkoord()) then
    raise exception 'Nur Treffleitung und Treffkoordination erstellen Nachweise für andere' using errcode = '42501';
  end if;

  for r in
    select tt.person_id
      from treff_team tt
      join personen p on p.id = tt.person_id
     where tt.treff_id = p_treff and p.aktiv
       and ((p_person is null and p.kategorie = 'TZK') or tt.person_id = p_person)
       and not exists (select 1 from zeitnachweise z where z.treff_id = p_treff and z.person_id = tt.person_id and z.monat = v_monat)
     order by tt.person_id
  loop
    insert into zeitnachweise (treff_id, person_id, monat) values (p_treff, r.person_id, v_monat) returning id into v_id;
    perform fn_nachweis_befuellen(v_id);
    erstellt := erstellt + 1;
  end loop;
  return erstellt;
end $$;

revoke execute on function fn_nachweise_erstellen(uuid, date, uuid) from public, anon;
grant execute on function fn_nachweise_erstellen(uuid, date, uuid) to authenticated;
