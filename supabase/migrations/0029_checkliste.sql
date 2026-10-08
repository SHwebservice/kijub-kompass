-- KiJuB-Kompass · 0029: Checkliste zur Vorbereitung einer Freizeit
--
-- Die Freizeitenkoordination pflegt eine Standard-Checkliste (checkliste_vorlage). Jeder Punkt ist relativ zu Start oder Ende fällig,
-- kann auf eine Stelle der App verweisen (ziel) und kann automatisch erkannt werden (automatik, z. B. „Wochenplan steht“).
-- Je Freizeit halten checkliste_status (Stand der Standardpunkte) und checkliste_eigene (zusätzliche Punkte der Leitung) fest, was
-- erledigt oder nicht relevant ist. Lesen und ändern dürfen die Leitungen der Freizeit und die Freizeitenkoordination.
-- fn_checkliste liefert die Punkte samt Fälligkeit und automatischer Erkennung; die Erinnerung „heute fällig“ geht einmal je Freizeit
-- und Tag an die Leitungen (über den Zeitplan der Erinnerungen, siehe fn_protokoll_erinnerungen unten).

-- ===== Tabellen =====
create table checkliste_vorlage (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null check (length(trim(titel)) between 1 and 200),
  beschreibung text not null default '' check (length(beschreibung) <= 2000),
  bezug        text not null default 'start' check (bezug in ('start', 'ende')),
  tage         int  not null default 0 check (tage between -365 and 365),          -- negativ = vorher, positiv = nachher
  ziel         text check (ziel in ('team', 'plan', 'hinweise', 'lebensmittel', 'teamermappe', 'quiz', 'formulare')),
  automatik    text check (automatik in ('leitung', 'team', 'bewerbungen', 'wochenplan', 'hinweis', 'hinweise_gesehen', 'lebensmittel')),
  position     int  not null default 0,
  aktiv        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger checkliste_vorlage_touch before update on checkliste_vorlage for each row execute function fn_touch_updated_at();

create table checkliste_status (
  freizeit_id  uuid not null references freizeiten(id) on delete cascade,
  vorlage_id   uuid not null references checkliste_vorlage(id) on delete cascade,
  status       text not null default 'offen' check (status in ('offen', 'erledigt', 'nicht_relevant')),
  notiz        text not null default '' check (length(notiz) <= 1000),
  geaendert_von uuid references personen(id) on delete set null,
  geaendert_am  timestamptz not null default now(),
  primary key (freizeit_id, vorlage_id)
);

create table checkliste_eigene (
  id            uuid primary key default gen_random_uuid(),
  freizeit_id   uuid not null references freizeiten(id) on delete cascade,
  titel         text not null check (length(trim(titel)) between 1 and 200),
  beschreibung  text not null default '' check (length(beschreibung) <= 2000),
  faellig_am    date,
  status        text not null default 'offen' check (status in ('offen', 'erledigt', 'nicht_relevant')),
  notiz         text not null default '' check (length(notiz) <= 1000),
  erstellt_von  uuid references personen(id) on delete set null,
  geaendert_von uuid references personen(id) on delete set null,
  geaendert_am  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index checkliste_eigene_freizeit on checkliste_eigene (freizeit_id);

-- Wer und wann: setzt die Datenbank, nicht die Oberfläche
create function fn_checkliste_vermerken() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.freizeit_id is distinct from old.freizeit_id then
    raise exception 'Ein Punkt lässt sich nicht in eine andere Freizeit verschieben' using errcode = 'check_violation';
  end if;
  new.geaendert_von := coalesce(meine_person_id(), new.geaendert_von);
  new.geaendert_am := now();
  if tg_table_name = 'checkliste_eigene' then
    if tg_op = 'INSERT' then new.erstellt_von := coalesce(meine_person_id(), new.erstellt_von); new.created_at := now();
    else new.erstellt_von := old.erstellt_von; new.created_at := old.created_at; end if;
  end if;
  return new;
end $$;
revoke execute on function fn_checkliste_vermerken() from public, anon;
create trigger checkliste_status_vermerken before insert or update on checkliste_status for each row execute function fn_checkliste_vermerken();
create trigger checkliste_eigene_vermerken before insert or update on checkliste_eigene for each row execute function fn_checkliste_vermerken();

-- ===== Zugriff =====
alter table checkliste_vorlage enable row level security;
alter table checkliste_status  enable row level security;
alter table checkliste_eigene  enable row level security;
revoke all on checkliste_vorlage, checkliste_status, checkliste_eigene from anon;
grant select, insert, update, delete on checkliste_vorlage, checkliste_status, checkliste_eigene to authenticated;

create policy lesen on checkliste_vorlage for select to authenticated using (ist_aktive_person());
create policy pflegen on checkliste_vorlage for all to authenticated using (ist_freizeitkoord()) with check (ist_freizeitkoord());
create policy alles on checkliste_status for all to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id)) with check (ist_freizeitkoord() or ist_leitung(freizeit_id));
create policy alles on checkliste_eigene for all to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id)) with check (ist_freizeitkoord() or ist_leitung(freizeit_id));

-- ===== Automatisch erkannte Punkte =====
-- Nur intern (ohne eigene Rechteprüfung): wird von fn_checkliste und der Erinnerung benutzt.
create function checkliste_automatik(p_freizeit uuid, p_art text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare f freizeiten;
begin
  select * into f from freizeiten where id = p_freizeit;
  if f.id is null or p_art is null then return false; end if;
  return case p_art
    when 'leitung' then exists (select 1 from freizeit_team where freizeit_id = f.id and rolle = 'leitung')
    when 'team' then exists (select 1 from freizeit_team where freizeit_id = f.id and rolle = 'teamer')
    when 'bewerbungen' then not exists (select 1 from bewerbungen where freizeit_id = f.id and status = 'offen')
    when 'wochenplan' then (select count(distinct datum) from plan_eintraege where freizeit_id = f.id and datum between f.start_datum and f.ende_datum)
                           = (f.ende_datum - f.start_datum + 1)
    when 'hinweis' then exists (select 1 from notizen where freizeit_id = f.id and art = 'hinweis')
    when 'hinweise_gesehen' then exists (select 1 from notizen where freizeit_id = f.id and art = 'hinweis')
      and not exists (select 1 from notizen n join freizeit_team t on t.freizeit_id = f.id and t.rolle = 'teamer'
                       where n.freizeit_id = f.id and n.art = 'hinweis'
                         and not exists (select 1 from notiz_bestaetigungen b where b.notiz_id = n.id and b.person_id = t.person_id))
    when 'lebensmittel' then f.ort_id is not null
      and exists (select 1 from lebensmittel_eingang e where e.ort_id = f.ort_id and (e.freizeit_id = f.id or e.datum >= f.start_datum - 60))
    else false
  end;
end $$;
revoke execute on function checkliste_automatik(uuid, text) from public, anon, authenticated;

-- Alle Punkte einer Freizeit: Standardpunkte (aktiv) und eigene, mit Fälligkeit und Stand. Nur intern.
create function checkliste_punkte(p_freizeit uuid)
returns table (art text, id uuid, titel text, beschreibung text, faellig date, ziel text, automatik text, auto_erfuellt boolean,
               status text, notiz text, geaendert_von uuid, geaendert_am timestamptz, reihenfolge int)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'vorlage', v.id, v.titel, v.beschreibung,
         (case when v.bezug = 'start' then f.start_datum else f.ende_datum end) + v.tage,
         v.ziel, v.automatik, checkliste_automatik(f.id, v.automatik),
         coalesce(s.status, 'offen'), coalesce(s.notiz, ''), s.geaendert_von, s.geaendert_am, v.position
    from freizeiten f
    join checkliste_vorlage v on v.aktiv
    left join checkliste_status s on s.freizeit_id = f.id and s.vorlage_id = v.id
   where f.id = p_freizeit
  union all
  select 'eigen', e.id, e.titel, e.beschreibung, e.faellig_am, null, null, false, e.status, e.notiz, e.geaendert_von, e.geaendert_am, 100000
    from checkliste_eigene e where e.freizeit_id = p_freizeit
$$;
revoke execute on function checkliste_punkte(uuid) from public, anon, authenticated;

-- Für die Oberfläche: die Punkte der angefragten Freizeiten, soweit die Person sie sehen darf (Leitung der Freizeit, Freizeitenkoordination).
-- Erfüllt ist ein Punkt, wenn er erledigt ist oder – solange niemand „nicht relevant“ gesetzt hat – automatisch erkannt wird.
create function fn_checkliste(p_freizeiten uuid[]) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'freizeit_id', f.id, 'art', p.art, 'id', p.id, 'titel', p.titel, 'beschreibung', p.beschreibung, 'faellig', p.faellig,
           'ziel', p.ziel, 'automatik', p.automatik, 'auto_erfuellt', p.auto_erfuellt, 'status', p.status, 'notiz', p.notiz,
           'geaendert_von', p.geaendert_von, 'geaendert_am', p.geaendert_am)
         order by f.start_datum, f.id, p.faellig nulls last, p.reihenfolge, p.titel), '[]'::jsonb)
    from freizeiten f, lateral checkliste_punkte(f.id) p
   where f.id = any(p_freizeiten) and (ist_freizeitkoord() or ist_leitung(f.id))
$$;
revoke execute on function fn_checkliste(uuid[]) from public, anon;
grant execute on function fn_checkliste(uuid[]) to authenticated;

-- ===== Erinnerung „heute fällig“ =====
-- Einmal je Freizeit und Tag an die aktiven Leitungen: alle offenen, nicht automatisch erfüllten Punkte, die heute fällig sind.
create function fn_checkliste_erinnerungen() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  heute date := (now() at time zone 'Europe/Berlin')::date;
  f record; punkte text[]; empf uuid[]; ergebnis jsonb := '[]'::jsonb;
begin
  for f in select id, name from freizeiten
            where status = 'geplant' and heute between start_datum - 366 and ende_datum + 366
              and not exists (select 1 from mitteilungen_log l where l.art = 'checkliste_erinnerung' and l.ref = freizeiten.id and l.schluessel = heute::text)
  loop
    punkte := array(select p.titel from checkliste_punkte(f.id) p
                     where p.faellig = heute and p.status = 'offen' and not p.auto_erfuellt order by p.reihenfolge, p.titel);
    continue when coalesce(array_length(punkte, 1), 0) = 0;
    empf := array(select p.id from freizeit_team t join personen p on p.id = t.person_id where t.freizeit_id = f.id and t.rolle = 'leitung' and p.aktiv);
    insert into mitteilungen_log (art, ref, schluessel, von_person, empfaenger)
    values ('checkliste_erinnerung', f.id, heute::text, null, coalesce(array_length(empf, 1), 0));
    if coalesce(array_length(empf, 1), 0) > 0 then
      ergebnis := ergebnis || jsonb_build_object('freizeit', f.id, 'empfaenger', to_jsonb(empf),
        'titel', 'Vorbereitung · ' || f.name,
        'text', case when array_length(punkte, 1) = 1 then 'Heute fällig: ' || punkte[1] else array_length(punkte, 1) || ' Punkte sind heute fällig.' end,
        'url', '/freizeiten/' || f.id || '/vorbereitung');
    end if;
  end loop;
  return ergebnis;
end $$;
revoke execute on function fn_checkliste_erinnerungen() from public, anon, authenticated;
grant execute on function fn_checkliste_erinnerungen() to service_role;

-- Der Zeitplan der Erinnerungen (GitHub, push-senden mit CRON_SECRET) ruft fn_protokoll_erinnerungen auf. Damit die Edge Function
-- nicht neu bereitgestellt werden muss, liefert sie ab jetzt beide Arten: „Tagesprotokoll fehlt“ und „Checkliste heute fällig“.
alter function fn_protokoll_erinnerungen() rename to fn_protokoll_erinnerungen_treffs;
create function fn_protokoll_erinnerungen() returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select fn_protokoll_erinnerungen_treffs() || fn_checkliste_erinnerungen()
$$;
revoke execute on function fn_protokoll_erinnerungen() from public, anon, authenticated;
grant execute on function fn_protokoll_erinnerungen() to service_role;

-- ===== Vorschlag für die Standard-Checkliste (die Freizeitenkoordination passt sie in der App an) =====
insert into checkliste_vorlage (position, titel, beschreibung, bezug, tage, ziel, automatik) values
  (10,  'Leitung steht fest', 'Die Freizeitenkoordination hat die Leitung (ggf. zwei) zugeordnet.', 'start', -84, 'team', 'leitung'),
  (20,  'Team ist zusammengestellt', 'Alle TeamerInnen sind zugeordnet. Fehlt noch jemand, sprich die Freizeitenkoordination an.', 'start', -42, 'team', 'team'),
  (30,  'Offene Bewerbungen sind entschieden', 'Bewerbungen entscheidet die Freizeitenkoordination – frag nach, wenn noch welche offen sind.', 'start', -42, null, 'bewerbungen'),
  (40,  'Vortreffen mit dem Team geplant', 'Termin und Ort festlegen und als Hinweis für das Team eintragen.', 'start', -35, 'hinweise', null),
  (50,  'Team kennt Teamermappe und Quiz', 'Weise das Team auf die Teamermappe (Qualitätsstandards, Notfall) und das Quiz hin.', 'start', -28, 'teamermappe', null),
  (60,  'Ernährung und Allergien im Team geprüft', 'Im Reiter Team stehen die Ernährungsangaben; Besonderheiten mit Einkauf und Küche klären.', 'start', -21, 'team', null),
  (70,  'Wochenplan steht', 'Für jeden Tag der Freizeit ist mindestens ein Programmpunkt eingetragen.', 'start', -14, 'plan', 'wochenplan'),
  (80,  'Infos für das Team veröffentlicht', 'Treffpunkt, Abfahrt, Packliste usw. als Hinweis eintragen – das Team bestätigt mit „gesehen“.', 'start', -14, 'hinweise', 'hinweis'),
  (90,  'Lebensmittel-Bestand am Ort geprüft', 'Was ist noch da, was wird geliefert? Eingänge im Reiter Lebensmittel erfassen.', 'start', -7, 'lebensmittel', 'lebensmittel'),
  (100, 'Formulare vorbereitet', 'Anwesenheitsliste und weitere Vordrucke ausfüllen bzw. ausdrucken.', 'start', -7, 'formulare', null),
  (110, 'Alle haben die Hinweise gesehen', 'Jede TeamerIn hat alle Hinweise bestätigt.', 'start', -3, 'hinweise', 'hinweise_gesehen'),
  (120, 'Notfallnummern und Erste-Hilfe-Material geprüft', 'Notfall-Box in der Teamermappe ansehen, Erste-Hilfe-Kasten auf Vollständigkeit prüfen.', 'start', -3, 'teamermappe', null),
  (130, 'Lebensmittel-Verbrauch vollständig gebucht', 'Damit der Bestand am Ort für die nächste Freizeit stimmt.', 'ende', 3, 'lebensmittel', null),
  (140, 'Nachbesprechung mit dem Team', 'Was lief gut, was nehmen wir mit? Ergebnisse ggf. an die Freizeitenkoordination.', 'ende', 14, null, null);
