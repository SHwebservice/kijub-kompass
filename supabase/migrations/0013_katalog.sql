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
