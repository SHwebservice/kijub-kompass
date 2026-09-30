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
