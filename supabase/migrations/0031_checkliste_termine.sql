-- KiJuB-Kompass · 0031: Checkliste überarbeitet – Termine, Themen, Fälligkeit ab Ferienbeginn
--
-- Nach Durchsicht mit der Fachseite:
-- * Entfernt: „Leitung steht fest“, „Team ist zusammengestellt“, „Offene Bewerbungen sind entschieden“, „Infos für das Team
--   veröffentlicht“, „Alle haben die Hinweise gesehen“, „Lebensmittel-Verbrauch vollständig gebucht“.
-- * „Team kennt Teamermappe und Quiz“ und „Ernährung und Allergien im Team geprüft“ sind jetzt Themen des Vortreffens.
-- * Neu: „Vorgespräch mit der Freizeitenkoordination“, fällig 4 Wochen vor Beginn der Ferien (nicht der Freizeit).
-- * „Vortreffen mit dem Team“ ist 10 Tage vor Beginn der Freizeit fällig.
--
-- Technisch:
-- * bezug 'ferien': Fälligkeit relativ zum Ferienbeginn = Montag der Ferienwoche 1 (aus Ferienwoche und Start der Freizeit
--   berechnet; ohne Ferienwoche gilt der Start der Freizeit).
-- * termin_art ('hinweis' | 'absprache'): Der Punkt bekommt einen Termin. fn_checkliste_termin trägt ihn ein und legt dazu einen
--   Hinweis für das Team bzw. eine Absprache mit der Freizeitenkoordination an (ein geänderter Termin ersetzt sie).
-- * automatik 'termin': erledigt, sobald der eingetragene Termin vorbei ist.
-- * themen: Unterpunkte, die bei diesem Punkt besprochen werden; abgehakt wird je Freizeit (checkliste_status.themen_erledigt).

-- ===== Spalten =====
alter table checkliste_vorlage drop constraint checkliste_vorlage_bezug_check;
alter table checkliste_vorlage add constraint checkliste_vorlage_bezug_check check (bezug in ('start', 'ende', 'ferien'));
alter table checkliste_vorlage drop constraint checkliste_vorlage_automatik_check;
alter table checkliste_vorlage add constraint checkliste_vorlage_automatik_check
  check (automatik in ('leitung', 'team', 'bewerbungen', 'wochenplan', 'hinweis', 'hinweise_gesehen', 'lebensmittel', 'termin'));
alter table checkliste_vorlage add column termin_art text check (termin_art in ('hinweis', 'absprache'));
alter table checkliste_vorlage add column themen text[] not null default '{}'
  check (cardinality(themen) <= 20 and array_position(themen, '') is null);
alter table checkliste_vorlage add constraint checkliste_vorlage_termin_check check (automatik is distinct from 'termin' or termin_art is not null);

alter table checkliste_status add column termin timestamptz;
alter table checkliste_status add column termin_notiz_id uuid references notizen(id) on delete set null;
alter table checkliste_status add column themen_erledigt smallint[] not null default '{}';

-- ===== Ferienbeginn einer Freizeit =====
create function ferienbeginn(f freizeiten) returns date
language sql immutable set search_path = public, pg_temp as $$
  select case when f.ferienwoche is null then f.start_datum
              else (f.start_datum - (extract(isodow from f.start_datum)::int - 1)) - (f.ferienwoche - 1) * 7 end
$$;
revoke execute on function ferienbeginn(freizeiten) from public, anon;

-- ===== Punkte neu (mehr Spalten) =====
drop function fn_checkliste(uuid[]);
drop function checkliste_punkte(uuid);

create function checkliste_punkte(p_freizeit uuid)
returns table (art text, id uuid, titel text, beschreibung text, faellig date, ziel text, automatik text, auto_erfuellt boolean,
               status text, notiz text, geaendert_von uuid, geaendert_am timestamptz, reihenfolge int,
               termin_art text, termin timestamptz, themen text[], themen_erledigt smallint[])
language sql stable security definer set search_path = public, pg_temp as $$
  select 'vorlage', v.id, v.titel, v.beschreibung,
         (case v.bezug when 'start' then f.start_datum when 'ende' then f.ende_datum else ferienbeginn(f) end) + v.tage,
         v.ziel, v.automatik,
         case when v.automatik = 'termin' then coalesce(s.termin < now(), false) else checkliste_automatik(f.id, v.automatik) end,
         coalesce(s.status, 'offen'), coalesce(s.notiz, ''), s.geaendert_von, s.geaendert_am, v.position,
         v.termin_art, s.termin, v.themen, coalesce(s.themen_erledigt, '{}')
    from freizeiten f
    join checkliste_vorlage v on v.aktiv
    left join checkliste_status s on s.freizeit_id = f.id and s.vorlage_id = v.id
   where f.id = p_freizeit
  union all
  select 'eigen', e.id, e.titel, e.beschreibung, e.faellig_am, null, null, false, e.status, e.notiz, e.geaendert_von, e.geaendert_am, 100000,
         null, null, '{}', '{}'
    from checkliste_eigene e where e.freizeit_id = p_freizeit
$$;
revoke execute on function checkliste_punkte(uuid) from public, anon, authenticated;

create function fn_checkliste(p_freizeiten uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'freizeit_id', f.id, 'art', p.art, 'id', p.id, 'titel', p.titel, 'beschreibung', p.beschreibung, 'faellig', p.faellig,
           'ziel', p.ziel, 'automatik', p.automatik, 'auto_erfuellt', p.auto_erfuellt, 'status', p.status, 'notiz', p.notiz,
           'geaendert_von', p.geaendert_von, 'geaendert_am', p.geaendert_am,
           'termin_art', p.termin_art, 'termin', p.termin, 'themen', to_jsonb(p.themen), 'themen_erledigt', to_jsonb(p.themen_erledigt))
         order by f.start_datum, f.id, p.faellig nulls last, p.reihenfolge, p.titel), '[]'::jsonb)
    from freizeiten f, lateral checkliste_punkte(f.id) p
   where f.id = any(p_freizeiten) and (ist_freizeitkoord() or ist_leitung(f.id))
$$;
revoke execute on function fn_checkliste(uuid[]) from public, anon;
grant execute on function fn_checkliste(uuid[]) to authenticated;

-- ===== Termin eintragen =====
-- Trägt den Termin eines Punktes ein (oder löscht ihn mit p_termin = null) und legt dazu einen Hinweis für das Team bzw. eine Absprache
-- mit der Freizeitenkoordination an; ein früher angelegter Eintrag dieses Punktes wird ersetzt. Ergebnis: ID des neuen Eintrags
-- (für die Mitteilung), null beim Löschen.
create function fn_checkliste_termin(p_freizeit uuid, p_vorlage uuid, p_termin timestamptz, p_text text default '') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v checkliste_vorlage; s checkliste_status; n_id uuid; lokal timestamp; txt text;
  tage text[] := array['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
begin
  if not (ist_freizeitkoord() or ist_leitung(p_freizeit)) then
    raise exception 'Nur die Leitung der Freizeit und die Freizeitenkoordination dürfen Termine eintragen' using errcode = '42501';
  end if;
  select * into v from checkliste_vorlage where id = p_vorlage;
  if v.id is null or v.termin_art is null then raise exception 'Für diesen Punkt gibt es keinen Termin' using errcode = 'check_violation'; end if;
  if length(coalesce(p_text, '')) > 1000 then raise exception 'Der Text ist zu lang (höchstens 1000 Zeichen)' using errcode = 'check_violation'; end if;

  select * into s from checkliste_status where freizeit_id = p_freizeit and vorlage_id = p_vorlage;
  if s.termin_notiz_id is not null then delete from notizen where id = s.termin_notiz_id; end if;

  if p_termin is not null then
    lokal := p_termin at time zone 'Europe/Berlin';
    txt := v.titel || ': ' || tage[extract(isodow from lokal)::int] || ', ' || to_char(lokal, 'DD.MM.YYYY') || ', ' || to_char(lokal, 'HH24:MI') || ' Uhr'
           || case when trim(coalesce(p_text, '')) <> '' then E'\n' || trim(p_text) else '' end
           || case when cardinality(v.themen) > 0 then E'\nThemen: ' || array_to_string(v.themen, ', ') else '' end;
    insert into notizen (freizeit_id, art, geltung, datum, text, erstellt_von)
    values (p_freizeit, v.termin_art::notiz_art, 'tag', lokal::date, txt, meine_person_id())
    returning id into n_id;
  end if;

  insert into checkliste_status (freizeit_id, vorlage_id, termin, termin_notiz_id)
  values (p_freizeit, p_vorlage, p_termin, n_id)
  on conflict (freizeit_id, vorlage_id) do update set termin = excluded.termin, termin_notiz_id = excluded.termin_notiz_id;
  return n_id;
end $$;
revoke execute on function fn_checkliste_termin(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function fn_checkliste_termin(uuid, uuid, timestamptz, text) to authenticated;

-- ===== Inhalt der Standard-Checkliste =====
delete from checkliste_vorlage where titel in (
  'Leitung steht fest', 'Team ist zusammengestellt', 'Offene Bewerbungen sind entschieden', 'Infos für das Team veröffentlicht',
  'Alle haben die Hinweise gesehen', 'Lebensmittel-Verbrauch vollständig gebucht',
  'Team kennt Teamermappe und Quiz', 'Ernährung und Allergien im Team geprüft');

update checkliste_vorlage
   set titel = 'Vortreffen mit dem Team',
       beschreibung = 'Termin für das Treffen mit allen Teammitgliedern festlegen. Beim Eintragen bekommt das Team einen Hinweis mit Termin und Themen; erledigt, sobald das Treffen stattgefunden hat.',
       bezug = 'start', tage = -10, ziel = 'hinweise', automatik = 'termin', termin_art = 'hinweis', position = 20,
       themen = array['Teamermappe und Quiz (Qualitätsstandards, Notfall)', 'Ernährung und Allergien im Team']
 where titel = 'Vortreffen mit dem Team geplant';

insert into checkliste_vorlage (position, titel, beschreibung, bezug, tage, ziel, automatik, termin_art) values
  (10, 'Vorgespräch mit der Freizeitenkoordination',
   'Gemeinsam einen Termin vereinbaren – spätestens 4 Wochen vor Beginn der Ferien. Beim Eintragen entsteht eine Absprache, die die Freizeitenkoordination sieht und bestätigt; erledigt, sobald das Gespräch stattgefunden hat.',
   'ferien', -28, null, 'termin', 'absprache');
