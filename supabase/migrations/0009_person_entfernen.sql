-- KiJuB-Kompass · 0009 Personen entfernen
-- Schutz der letzten Koordination und Übersicht der Daten, die beim Löschen einer Person mitgehen.

-- Die letzte aktive Koordination darf weder gelöscht noch deaktiviert noch herabgestuft werden –
-- sonst könnte niemand mehr Zugänge verwalten. Der Schutz gilt für JEDEN Weg (App, Dashboard, SQL).
create function fn_letzte_koordination_schuetzen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.ist_koordination and old.aktiv
     and (tg_op = 'DELETE' or not new.ist_koordination or not new.aktiv) then
    if not exists (select 1 from personen p where p.id <> old.id and p.ist_koordination and p.aktiv) then
      raise exception 'Die letzte aktive Koordination kann nicht gelöscht, deaktiviert oder herabgestuft werden'
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger letzte_koordination_schuetzen
  before update of ist_koordination, aktiv or delete on personen
  for each row execute function fn_letzte_koordination_schuetzen();

-- Was hängt an einer Person? Wird vor dem endgültigen Löschen angezeigt.
-- Beim Löschen verschwinden: Zuordnungen, Bewerbungen, Dienste/Wünsche, Abwesenheiten, Nachweise,
-- Bewertungen, Kommentare, Favoriten, Push-Abos. Verfasste Hinweise/Absprachen bleiben ohne Namen erhalten.
create function fn_person_datenuebersicht(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p personen;
begin
  if not ist_koord() then
    raise exception 'Nur die Koordination darf das sehen' using errcode = '42501';
  end if;
  select * into p from personen where id = p_id;
  if p.id is null then raise exception 'Person nicht gefunden'; end if;
  return jsonb_build_object(
    'hat_zugang',         p.auth_user_id is not null,
    'ist_koordination',   p.ist_koordination,
    'aktiv',              p.aktiv,
    'freizeiten',         (select count(*) from freizeit_team where person_id = p_id),
    'leitung_freizeiten', (select count(*) from freizeit_team where person_id = p_id and rolle = 'leitung'),
    'treffs',             (select count(*) from treff_team where person_id = p_id),
    'bewerbungen',        (select count(*) from bewerbungen where person_id = p_id),
    'dienste',            (select count(*) from dienst_zuteilungen where person_id = p_id),
    'abwesenheiten',      (select count(*) from abwesenheiten where person_id = p_id),
    'nachweise',          (select count(*) from zeitnachweise where person_id = p_id),
    'vorschlaege',        (select count(*) from angebot_vorschlaege where eingereicht_von = p_id),
    'notizen_verfasst',   (select count(*) from notizen where erstellt_von = p_id)
  );
end $$;

revoke execute on function fn_person_datenuebersicht(uuid) from public, anon;
grant  execute on function fn_person_datenuebersicht(uuid) to authenticated;
