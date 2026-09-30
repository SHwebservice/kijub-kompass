-- KiJuB-Kompass · 0005 Hilfsfunktionen für Rechte
-- Alle Funktionen laufen mit Rechten des Besitzers (security definer), damit Policies
-- keine Rekursion über die RLS der Team-Tabellen auslösen. Sie lesen nur die Identität
-- der aufrufenden Person (auth.uid()) und liefern Wahrheitswerte/IDs.

create function meine_person_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from personen where auth_user_id = auth.uid() and aktiv
$$;

create function ist_koord() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select ist_koordination from personen where auth_user_id = auth.uid() and aktiv), false)
$$;

create function ist_aktive_person() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select meine_person_id() is not null
$$;

create function meine_kategorie() returns kategorie
language sql stable security definer set search_path = public, pg_temp as $$
  select kategorie from personen where auth_user_id = auth.uid() and aktiv
$$;

-- Bewerbende: aktive Person, die keine Hauptamtliche*r ist
create function ist_bewerbend() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(meine_kategorie() <> 'Hauptamtliche*r', false)
$$;

-- ===== Freizeiten =====
create function ist_im_team(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team where freizeit_id = fid and person_id = meine_person_id())
$$;

create function ist_leitung(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team
                  where freizeit_id = fid and person_id = meine_person_id() and rolle = 'leitung')
$$;

create function ist_teamer(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team
                  where freizeit_id = fid and person_id = meine_person_id() and rolle = 'teamer')
$$;

create function ist_leitung_am_ort(oid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team t join freizeiten f on f.id = t.freizeit_id
                  where f.ort_id = oid and t.person_id = meine_person_id() and t.rolle = 'leitung')
$$;

-- ===== Treffs =====
create function ist_im_treff(tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_team where treff_id = tid and person_id = meine_person_id())
$$;

create function ist_treffleitung(tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_team
                  where treff_id = tid and person_id = meine_person_id() and rolle = 'treffleitung')
$$;

create function treff_von_dienst(did uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select treff_id from dienste where id = did
$$;

-- Treffleitung einer Person: gemeinsamer Treff, in dem die aufrufende Person Treffleitung ist
create function ist_treffleitung_von_person(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from treff_team a join treff_team b on a.treff_id = b.treff_id
                  where a.person_id = pid and b.person_id = meine_person_id() and b.rolle = 'treffleitung')
$$;

create function teilt_team_mit(pid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team a join freizeit_team b on a.freizeit_id = b.freizeit_id
                  where a.person_id = pid and b.person_id = meine_person_id())
      or exists (select 1 from treff_team a join treff_team b on a.treff_id = b.treff_id
                  where a.person_id = pid and b.person_id = meine_person_id())
$$;

-- Treffmappe: Koordination, Treffleitung, BetreuerIn nur der Kategorie TZK
create function darf_treffmappe() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select ist_koord() or exists (
    select 1 from treff_team where person_id = meine_person_id()
       and (rolle = 'treffleitung' or meine_kategorie() = 'TZK'))
$$;

-- ===== Hinweise/Absprachen =====
-- Sichtbarkeit anhand der Zeilenwerte (nicht per Nachschlagen in der Tabelle):
-- Nur so greift die Regel auch bei INSERT ... RETURNING, wo die neue Zeile noch nicht lesbar ist.
create function notiz_sichtbar(fid uuid, tid uuid, a notiz_art) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select ist_koord()
      or (fid is not null and a = 'hinweis'   and ist_im_team(fid))
      or (fid is not null and a = 'absprache' and ist_leitung(fid))
      or (tid is not null and ist_im_treff(tid))
$$;

-- Für Kind-Tabellen (Bestätigungen, Kommentare): Sichtbarkeit der zugehörigen Notiz
create function darf_notiz_sehen(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and notiz_sichtbar(n.freizeit_id, n.treff_id, n.art))
$$;

create function darf_notiz_schreiben(fid uuid, tid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select ist_koord()
      or (fid is not null and ist_leitung(fid))
      or (tid is not null and ist_treffleitung(tid))
$$;

-- Hinweise bestätigen nur TeamerInnen; Absprachen Leitung/Koordination; Treff-Absprachen das Treff-Team
create function darf_notiz_bestaetigen(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and (
       (n.freizeit_id is not null and n.art = 'hinweis'   and ist_teamer(n.freizeit_id))
    or (n.freizeit_id is not null and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_koord()))
    or (n.treff_id    is not null and (ist_im_treff(n.treff_id) or ist_koord()))))
$$;

create function darf_notiz_kommentieren(nid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from notizen n where n.id = nid and n.freizeit_id is not null
                    and n.art = 'absprache' and (ist_leitung(n.freizeit_id) or ist_koord()))
$$;

-- ===== Nachweis =====
create function nachweis_treff(nid uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select treff_id from zeitnachweise where id = nid
$$;

create function nachweis_person(nid uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select person_id from zeitnachweise where id = nid
$$;

create function nachweis_status_von(nid uuid) returns nachweis_status
language sql stable security definer set search_path = public, pg_temp as $$
  select status from zeitnachweise where id = nid
$$;

-- ===== Schutz der Personendaten =====
-- Wer nicht Koordination ist, darf nur Telefon, Ernährung und Notizen der EIGENEN Zeile ändern.
-- Ohne JWT (Migrationen, Import-Funktionen mit Service-Rolle) greift der Schutz nicht.
create function fn_personen_schutz() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or ist_koord() then
    return new;
  end if;
  if new.id is distinct from meine_person_id() then
    raise exception 'Nur die Koordination darf fremde Personendaten ändern' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'telefon' - 'ernaehrung' - 'notizen' - 'updated_at')
     is distinct from (to_jsonb(old) - 'telefon' - 'ernaehrung' - 'notizen' - 'updated_at') then
    raise exception 'Nur Telefon, Ernährung und Notizen dürfen selbst geändert werden' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger personen_schutz before update on personen
  for each row execute function fn_personen_schutz();

-- Status-Übergänge beim Nachweis: Freigabe nur Treffleitung/Koordination
create function fn_nachweis_status_pruefen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null then
    if (new.status = 'freigegeben' or old.status = 'freigegeben')
       and not (ist_treffleitung(new.treff_id) or ist_koord()) then
      raise exception 'Nur Treffleitung oder Koordination dürfen freigeben' using errcode = '42501';
    end if;
  end if;
  if new.status = 'freigegeben' and old.status <> 'freigegeben' then
    new.freigegeben_von = meine_person_id();
  elsif new.status <> 'freigegeben' then
    new.freigegeben_von = null;
  end if;
  return new;
end $$;
create trigger nachweis_status_pruefen before update on zeitnachweise
  for each row execute function fn_nachweis_status_pruefen();
