-- KiJuB-Kompass · 0019 Fehlermeldungen
--
-- Wenn in der App etwas Unerwartetes schiefgeht, meldet sie das selbsttätig – ohne Personendaten: keine Person, keine Namen,
-- keine Kennungen in Adresse und Text. Gleiche Fehler (gleiche Version, Seite und Meldung) werden gezählt, nicht vervielfacht.
-- Lesen, abhaken und löschen darf jede Koordination; melden geht nur über die Funktion (mit Begrenzung gegen Überflutung).
-- Meldungen werden nach 90 Tagen ohne Wiederholung gelöscht.

create table fehlermeldungen (
  id        uuid primary key default gen_random_uuid(),
  version   text not null check (length(version) <= 40),
  seite     text not null check (length(seite) <= 200),       -- Adresse ohne Kennungen, z. B. /treffs/:id/protokoll
  meldung   text not null check (length(meldung) <= 400),
  stapel    text check (stapel is null or length(stapel) <= 1500),
  anzahl    int  not null default 1,
  erstmals  timestamptz not null default now(),
  zuletzt   timestamptz not null default now(),
  erledigt  boolean not null default false
);
create unique index fehlermeldungen_gleich on fehlermeldungen (version, seite, meldung);
create index fehlermeldungen_zuletzt on fehlermeldungen (zuletzt desc);

alter table fehlermeldungen enable row level security;
revoke all on fehlermeldungen from anon;
revoke insert on fehlermeldungen from authenticated;
grant select, update, delete on fehlermeldungen to authenticated;
create policy lesen     on fehlermeldungen for select to authenticated using (ist_koord());
create policy aendern   on fehlermeldungen for update to authenticated using (ist_koord()) with check (ist_koord());
create policy loeschen  on fehlermeldungen for delete to authenticated using (ist_koord());

-- Entfernt alles, was nach einer Person oder Kennung aussieht: UUIDs, Mail-Adressen, Telefon- und lange Zahlenfolgen.
create function fn_fehler_bereinigen(t text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(t, ''), '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g'),
             '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[mail]', 'g'),
           '\+?[0-9][0-9 /()-]{6,}[0-9]', '[zahl]', 'g')
$$;

-- Meldet einen Fehler. Nur angemeldete Personen; die Datenbank bereinigt noch einmal, begrenzt die Menge
-- (höchstens 300 Meldungen pro Stunde insgesamt) und räumt alte Einträge auf.
create function fn_fehler_melden(p_version text, p_seite text, p_meldung text, p_stapel text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v text; s text; m text; st text;
begin
  if not ist_aktive_person() then raise exception 'Nicht angemeldet' using errcode = '42501'; end if;
  if (select coalesce(sum(anzahl), 0) from fehlermeldungen where zuletzt > now() - interval '1 hour') >= 300 then return; end if;
  v := left(trim(coalesce(p_version, '')), 40);
  s := left(fn_fehler_bereinigen(p_seite), 200);
  m := trim(left(fn_fehler_bereinigen(p_meldung), 400));
  st := nullif(left(fn_fehler_bereinigen(p_stapel), 1500), '');
  if m = '' then return; end if;
  insert into fehlermeldungen (version, seite, meldung, stapel) values (coalesce(nullif(v, ''), 'unbekannt'), coalesce(nullif(s, ''), '/'), m, st)
  on conflict (version, seite, meldung)
  do update set anzahl = fehlermeldungen.anzahl + 1, zuletzt = now(), erledigt = false, stapel = coalesce(fehlermeldungen.stapel, excluded.stapel);
  delete from fehlermeldungen where zuletzt < now() - interval '90 days';
end $$;

revoke execute on function fn_fehler_bereinigen(text), fn_fehler_melden(text, text, text, text) from public, anon;
grant execute on function fn_fehler_melden(text, text, text, text) to authenticated;
revoke execute on function fn_fehler_bereinigen(text) from authenticated;
