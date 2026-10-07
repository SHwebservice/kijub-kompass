-- KiJuB-Kompass · 0027: Feiertage schließen den Treff
--
-- Bisher waren Feiertage nur ein Hinweis (die Treffleitung konnte trotzdem einteilen). Jetzt gilt ein Feiertag – für diesen Treff oder
-- für alle Treffs – wie ein Tag einer Schließzeit: Der reguläre Dienst lässt sich weder einteilen noch wünschen (Trigger aus 0026),
-- es ist kein Tagesprotokoll nötig und es gibt keine Erinnerung (wie schon bisher). Sonderdienste bleiben möglich.

create or replace function ist_geschlossen(p_treff uuid, p_datum date) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_schliesszeiten where treff_id = p_treff and p_datum between von and bis)
      or exists (select 1 from feiertage where datum = p_datum and (treff_id is null or treff_id = p_treff))
$$;
