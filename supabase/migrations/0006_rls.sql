-- KiJuB-Kompass · 0006 Row Level Security (siehe docs/RECHTE.md)
-- Grundsatz: kein anonymer Zugriff; jede Policy stützt sich auf die Hilfsfunktionen aus 0005.

-- Standardwerte "erstellt_von" = aufrufende Person
alter table plan_eintraege        alter column erstellt_von set default meine_person_id();
alter table notizen               alter column erstellt_von set default meine_person_id();
alter table lebensmittel_eingang  alter column erstellt_von set default meine_person_id();
alter table lebensmittel_verbrauch alter column erstellt_von set default meine_person_id();
alter table abwesenheiten         alter column erstellt_von set default meine_person_id();

-- Rechte auf Tabellenebene: anonym nichts, angemeldet alles (die Policies entscheiden)
revoke all on all tables    in schema public from anon;
revoke all on all functions in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ===== RLS einschalten =====
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Kurzform für "Koordination darf alles"
create procedure pr_koord_alles(tabelle regclass)
language plpgsql as $$
begin
  execute format('create policy koord_alles on %s for all to authenticated using (ist_koord()) with check (ist_koord())', tabelle);
end $$;

-- ===== Personen =====
create policy personen_lesen   on personen for select to authenticated
  using (id = meine_person_id() or ist_koord());
create policy personen_update  on personen for update to authenticated
  using (id = meine_person_id() or ist_koord()) with check (id = meine_person_id() or ist_koord());
create policy personen_insert  on personen for insert to authenticated with check (ist_koord());
create policy personen_delete  on personen for delete to authenticated using (ist_koord());

-- ===== Stammdaten, die jede aktive Person lesen darf =====
create policy lesen on orte          for select to authenticated using (ist_aktive_person());
create policy lesen on tags          for select to authenticated using (ist_aktive_person());
create policy lesen on einstellungen for select to authenticated using (ist_aktive_person());
create policy lesen on angebote      for select to authenticated using (ist_aktive_person());
create policy lesen on feiertage     for select to authenticated using (ist_aktive_person());
create policy lesen on quiz_fragen   for select to authenticated using (ist_aktive_person());
create policy lesen on freizeit_tags for select to authenticated using (ist_aktive_person());
call pr_koord_alles('orte');
call pr_koord_alles('tags');
call pr_koord_alles('einstellungen');
call pr_koord_alles('angebote');
call pr_koord_alles('quiz_fragen');
call pr_koord_alles('freizeit_tags');

-- Feiertage: Koordination alle, Treffleitung für den eigenen Treff
call pr_koord_alles('feiertage');
create policy treffleitung_schreiben on feiertage for all to authenticated
  using (treff_id is not null and ist_treffleitung(treff_id))
  with check (treff_id is not null and ist_treffleitung(treff_id));

-- ===== Freizeiten =====
create policy lesen on freizeiten for select to authenticated
  using (ist_koord() or ist_im_team(id) or ist_bewerbend());
call pr_koord_alles('freizeiten');

create policy lesen on freizeit_team for select to authenticated
  using (ist_koord() or ist_im_team(freizeit_id) or person_id = meine_person_id());
call pr_koord_alles('freizeit_team');

create policy lesen on freizeit_slots for select to authenticated
  using (ist_koord() or ist_im_team(freizeit_id));
create policy leitung_schreiben on freizeit_slots for all to authenticated
  using (ist_leitung(freizeit_id) or ist_koord())
  with check (ist_leitung(freizeit_id) or ist_koord());

-- Wochenplan: Team trägt Katalog-Punkte ein und ändert eigene Einträge; Leitung/Koordination alle.
-- Freitext nur Leitung/Koordination.
create policy lesen on plan_eintraege for select to authenticated
  using (ist_koord() or ist_im_team(freizeit_id));
create policy anlegen on plan_eintraege for insert to authenticated
  with check ((ist_im_team(freizeit_id) or ist_koord())
              and erstellt_von = meine_person_id()
              and (freitext is null or ist_leitung(freizeit_id) or ist_koord()));
create policy aendern on plan_eintraege for update to authenticated
  using (ist_leitung(freizeit_id) or ist_koord() or (ist_im_team(freizeit_id) and erstellt_von = meine_person_id()))
  with check ((ist_leitung(freizeit_id) or ist_koord() or (ist_im_team(freizeit_id) and erstellt_von = meine_person_id()))
              and (freitext is null or ist_leitung(freizeit_id) or ist_koord()));
create policy loeschen on plan_eintraege for delete to authenticated
  using (ist_leitung(freizeit_id) or ist_koord() or (ist_im_team(freizeit_id) and erstellt_von = meine_person_id()));

-- ===== Hinweise & Absprachen =====
create policy lesen on notizen for select to authenticated using (notiz_sichtbar(freizeit_id, treff_id, art));
create policy anlegen on notizen for insert to authenticated
  with check (darf_notiz_schreiben(freizeit_id, treff_id) and erstellt_von = meine_person_id());
create policy aendern on notizen for update to authenticated
  using (darf_notiz_schreiben(freizeit_id, treff_id))
  with check (darf_notiz_schreiben(freizeit_id, treff_id));
create policy loeschen on notizen for delete to authenticated
  using (darf_notiz_schreiben(freizeit_id, treff_id));

create policy lesen on notiz_bestaetigungen for select to authenticated using (darf_notiz_sehen(notiz_id));
create policy anlegen on notiz_bestaetigungen for insert to authenticated
  with check (person_id = meine_person_id() and darf_notiz_bestaetigen(notiz_id));
create policy loeschen on notiz_bestaetigungen for delete to authenticated
  using (person_id = meine_person_id());

create policy lesen on notiz_kommentare for select to authenticated using (darf_notiz_sehen(notiz_id));
create policy anlegen on notiz_kommentare for insert to authenticated
  with check (person_id = meine_person_id() and darf_notiz_kommentieren(notiz_id));
create policy aendern on notiz_kommentare for update to authenticated
  using (person_id = meine_person_id() or ist_koord())
  with check (person_id = meine_person_id() or ist_koord());
create policy loeschen on notiz_kommentare for delete to authenticated
  using (person_id = meine_person_id() or ist_koord());

-- ===== Lebensmittel (Leitung am Ort, Koordination) =====
create policy lesen on lebensmittel_eingang for select to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));
create policy anlegen on lebensmittel_eingang for insert to authenticated
  with check ((ist_koord() or ist_leitung_am_ort(ort_id)) and erstellt_von = meine_person_id());
create policy aendern on lebensmittel_eingang for update to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id)) with check (ist_koord() or ist_leitung_am_ort(ort_id));
create policy loeschen on lebensmittel_eingang for delete to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));

create policy lesen on lebensmittel_verbrauch for select to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));
create policy anlegen on lebensmittel_verbrauch for insert to authenticated
  with check ((ist_koord() or ist_leitung_am_ort(ort_id)) and erstellt_von = meine_person_id());
create policy aendern on lebensmittel_verbrauch for update to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id)) with check (ist_koord() or ist_leitung_am_ort(ort_id));
create policy loeschen on lebensmittel_verbrauch for delete to authenticated
  using (ist_koord() or ist_leitung_am_ort(ort_id));

-- KiJuKo-Zusatzdaten: nur lesen (Leitung, Koordination); Schreiben ausschließlich durch den Import
create policy lesen on freizeit_verpflegung for select to authenticated
  using (ist_koord() or ist_leitung(freizeit_id));
create policy lesen on freizeit_material for select to authenticated
  using (ist_koord() or ist_leitung(freizeit_id));

-- ===== Bewerbungen =====
create policy lesen on bewerbungen for select to authenticated
  using (person_id = meine_person_id() or ist_koord());
create policy anlegen on bewerbungen for insert to authenticated
  with check (
    person_id = meine_person_id() and ist_bewerbend() and status = 'offen'
    and not ist_im_team(freizeit_id)
    and exists (select 1 from freizeiten f
                 where f.id = freizeit_id and f.status = 'geplant'
                   and f.start_datum >= current_date +
                       coalesce((select (wert #>> '{}')::int from einstellungen
                                  where schluessel = 'bewerbung_vorlauf_tage'), 7)));
create policy zurueckziehen on bewerbungen for delete to authenticated
  using ((person_id = meine_person_id() and status = 'offen') or ist_koord());
create policy entscheiden on bewerbungen for update to authenticated
  using (ist_koord()) with check (ist_koord());

-- ===== Treffs =====
create policy lesen on treffs for select to authenticated using (ist_koord() or ist_im_treff(id));
call pr_koord_alles('treffs');
create policy lesen on treff_team for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id) or person_id = meine_person_id());
call pr_koord_alles('treff_team');
create policy lesen on treff_oeffnungszeiten for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
call pr_koord_alles('treff_oeffnungszeiten');

create policy lesen on treff_plan_eintraege for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
create policy schreiben on treff_plan_eintraege for all to authenticated
  using (ist_koord() or ist_im_treff(treff_id))
  with check (ist_koord() or ist_im_treff(treff_id));

-- ===== Dienste =====
create policy lesen on dienste for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
create policy schreiben on dienste for all to authenticated
  using (ist_koord() or ist_treffleitung(treff_id))
  with check (ist_koord() or ist_treffleitung(treff_id));

create policy lesen on dienst_zuteilungen for select to authenticated
  using (ist_koord() or ist_im_treff(treff_von_dienst(dienst_id)));
create policy schreiben on dienst_zuteilungen for all to authenticated
  using (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)))
  with check (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)));

create policy lesen on dienst_wuensche for select to authenticated
  using (ist_koord() or ist_im_treff(treff_von_dienst(dienst_id)));
create policy wuenschen on dienst_wuensche for insert to authenticated
  with check (person_id = meine_person_id() and status = 'offen'
              and ist_im_treff(treff_von_dienst(dienst_id)));
create policy zuruecknehmen on dienst_wuensche for delete to authenticated
  using ((person_id = meine_person_id() and status = 'offen')
         or ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)));
create policy entscheiden on dienst_wuensche for update to authenticated
  using (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)))
  with check (ist_koord() or ist_treffleitung(treff_von_dienst(dienst_id)));

create policy lesen on dienstplan_kommentare for select to authenticated
  using (ist_koord() or ist_im_treff(treff_id));
create policy anlegen on dienstplan_kommentare for insert to authenticated
  with check (person_id = meine_person_id() and (ist_koord() or ist_im_treff(treff_id)));
create policy loeschen on dienstplan_kommentare for delete to authenticated
  using (person_id = meine_person_id() or ist_koord() or ist_treffleitung(treff_id));

-- ===== Abwesenheiten =====
create policy lesen on abwesenheiten for select to authenticated
  using (person_id = meine_person_id() or ist_koord() or ist_treffleitung_von_person(person_id));
create policy schreiben on abwesenheiten for all to authenticated
  using (ist_koord() or ist_treffleitung_von_person(person_id))
  with check (ist_koord() or ist_treffleitung_von_person(person_id));

-- ===== Nachweis der Teilzeitkräfte =====
create policy lesen on zeitnachweise for select to authenticated
  using (person_id = meine_person_id() or ist_treffleitung(treff_id) or ist_koord());
create policy anlegen on zeitnachweise for insert to authenticated
  with check (person_id = meine_person_id() and ist_im_treff(treff_id) and status = 'entwurf');
create policy aendern on zeitnachweise for update to authenticated
  using ((person_id = meine_person_id() and status = 'entwurf') or ist_treffleitung(treff_id) or ist_koord())
  with check ((person_id = meine_person_id() and status in ('entwurf','eingereicht'))
              or ist_treffleitung(treff_id) or ist_koord());
create policy loeschen on zeitnachweise for delete to authenticated
  using ((person_id = meine_person_id() and status = 'entwurf') or ist_koord());

create policy lesen on zeitnachweis_zeilen for select to authenticated
  using (nachweis_person(nachweis_id) = meine_person_id()
         or ist_treffleitung(nachweis_treff(nachweis_id)) or ist_koord());
create policy schreiben on zeitnachweis_zeilen for all to authenticated
  using ((nachweis_person(nachweis_id) = meine_person_id() and nachweis_status_von(nachweis_id) = 'entwurf')
         or ist_treffleitung(nachweis_treff(nachweis_id)) or ist_koord())
  with check ((nachweis_person(nachweis_id) = meine_person_id() and nachweis_status_von(nachweis_id) = 'entwurf')
         or ist_treffleitung(nachweis_treff(nachweis_id)) or ist_koord());

-- ===== Inhalte & Lernen =====
create policy lesen on inhalte for select to authenticated
  using ((schluessel in ('teamermappe','formular_beispiele') and ist_aktive_person())
         or (schluessel = 'treffmappe' and darf_treffmappe()));
call pr_koord_alles('inhalte');

create policy eigene on quiz_ergebnisse for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
create policy koord_lesen on quiz_ergebnisse for select to authenticated using (ist_koord());
create policy eigene on formular_entwuerfe for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());

-- ===== Katalog-Zusätze =====
create policy lesen on angebot_bewertungen for select to authenticated using (ist_aktive_person());
create policy anlegen on angebot_bewertungen for insert to authenticated
  with check (person_id = meine_person_id());
create policy aendern on angebot_bewertungen for update to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
create policy loeschen on angebot_bewertungen for delete to authenticated
  using (person_id = meine_person_id() or ist_koord());

create policy lesen on angebot_kommentare for select to authenticated using (ist_aktive_person());
create policy anlegen on angebot_kommentare for insert to authenticated
  with check (person_id = meine_person_id());
create policy loeschen on angebot_kommentare for delete to authenticated
  using (person_id = meine_person_id() or ist_koord());

create policy eigene on angebot_favoriten for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());

create policy lesen on angebot_vorschlaege for select to authenticated
  using (eingereicht_von = meine_person_id() or ist_koord());
create policy einreichen on angebot_vorschlaege for insert to authenticated
  with check (eingereicht_von = meine_person_id() and status = 'offen');
call pr_koord_alles('angebot_vorschlaege');

-- ===== Mitteilungen & Betrieb =====
create policy eigene on push_abos for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
create policy eigene on gelesen_stand for all to authenticated
  using (person_id = meine_person_id()) with check (person_id = meine_person_id());
call pr_koord_alles('import_laeufe');
call pr_koord_alles('import_staende');

drop procedure pr_koord_alles(regclass);
