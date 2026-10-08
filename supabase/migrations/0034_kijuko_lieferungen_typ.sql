-- KiJuB-Kompass · 0034: Lieferungen und Freizeit-Typ aus KiJuKo 3, Korrektur der Team-Sicht aus 0033 (docs/IMPORT.md)
--
-- Läuft gefahrlos auch dann, wenn ein früherer Entwurf von 0033 die Lieferungen schon angelegt hat (if not exists / or replace).
--
-- 1) Korrektur: v_team_freizeit aus 0033 prüfte noch ist_koord() statt ist_freizeitkoord() (Stand seit 0018) –
--    dadurch sah auch die Treffkoordination Freizeit-Teams samt Kontaktdaten. Jetzt wieder wie 0018, plus Spalte kueche.
-- 2) Lieferungen (was die Koordination zur Freizeit bringt): freizeit_lieferungen, nur lesbar (Koordination, Leitung, Küchenteam).
--    Lebensmittel-Lieferungen erscheinen zusätzlich als Eingang im Lebensmittel-Bestand am Ort (lebensmittel_eingang.kijuko_id);
--    diese Eingänge ändert und löscht nur der Import, die Leitung trägt nur noch den Verbrauch ein.
-- 3) Freizeit-Typ (0032) aus KiJuKo: Typ 1–4 wie in KiJuKo, Typ 5 (Kooperation ohne eigenes Personal) gibt es im Kompass nicht.
--    Regeln wie bei den übrigen Feldern: leer überschreibt nie; im Kompass anders geändert → Kompass-Wert bleibt, Hinweis in der Vorschau.
-- 4) fn_kijuko_import ruft zusätzlich fn_import_lieferungen und fn_import_typ auf (dieselbe Transaktion, Vorschau rollt zurück).

-- ===== 1) Team-Sicht =====
create or replace view v_team_freizeit as
  select t.freizeit_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.mail            end as mail,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.telefon         end as telefon,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.ernaehrung::text end as ernaehrung,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.notizen         end as notizen,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_leitung(t.freizeit_id) or ist_freizeitkoord() then p.tzk_max_stunden end as tzk_max_stunden,
         t.kueche
    from freizeit_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_team(t.freizeit_id) or ist_freizeitkoord());

-- ===== 2) Lieferungen =====
create table if not exists freizeit_lieferungen (
  id          uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  kijuko_id   text not null unique,
  art         text not null check (art in ('lebensmittel', 'material', 'ausstattung')),
  bezeichnung text not null check (length(trim(bezeichnung)) > 0),
  menge       numeric not null check (menge > 0),
  einheit     text,
  datum       date,
  notiz       text
);
create index if not exists freizeit_lieferungen_freizeit on freizeit_lieferungen (freizeit_id);
alter table freizeit_lieferungen enable row level security;
revoke all on freizeit_lieferungen from anon;
grant select on freizeit_lieferungen to authenticated;
drop policy if exists lesen on freizeit_lieferungen;
create policy lesen on freizeit_lieferungen for select to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id) or ist_kueche(freizeit_id));

-- Lebensmittel-Bestand: Eingänge aus KiJuKo sind gekennzeichnet und nur durch den Import änderbar
alter table lebensmittel_eingang add column if not exists kijuko_id text unique;
drop policy if exists aendern on lebensmittel_eingang;
drop policy if exists loeschen on lebensmittel_eingang;
create policy aendern on lebensmittel_eingang for update to authenticated
  using (kijuko_id is null and (ist_freizeitkoord() or ist_leitung_am_ort(ort_id)))
  with check (kijuko_id is null and (ist_freizeitkoord() or ist_leitung_am_ort(ort_id)));
create policy loeschen on lebensmittel_eingang for delete to authenticated
  using (kijuko_id is null and (ist_freizeitkoord() or ist_leitung_am_ort(ort_id)));
drop policy if exists anlegen on lebensmittel_eingang;
create policy anlegen on lebensmittel_eingang for insert to authenticated
  with check (kijuko_id is null and (ist_freizeitkoord() or ist_leitung_am_ort(ort_id)) and erstellt_von = meine_person_id());

create or replace function fn_import_lieferungen(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  z jsonb := '{}'::jsonb;
  r jsonb; ex record; v_fid uuid; v_ort uuid; v_start date; v_ids text[]; v_frei uuid[]; v_n int;
begin
  select coalesce(array_agg(f.id), '{}') into v_frei
    from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) x join freizeiten f on f.kijuko_id = x ->> 'kijuko_id';

  for r in select * from jsonb_array_elements(coalesce(p_plan -> 'lieferungen', '[]'::jsonb)) loop
    select f.id, f.ort_id, f.start_datum into v_fid, v_ort, v_start from freizeiten f where f.kijuko_id = r ->> 'freizeit_kijuko_id';
    continue when v_fid is null;

    -- Liste „Das wird geliefert“
    select * into ex from freizeit_lieferungen l where l.kijuko_id = r ->> 'kijuko_id';
    if not found then
      insert into freizeit_lieferungen (freizeit_id, kijuko_id, art, bezeichnung, menge, einheit, datum, notiz)
      values (v_fid, r ->> 'kijuko_id', r ->> 'art', r ->> 'bezeichnung', (r ->> 'menge')::numeric,
              r ->> 'einheit', nullif(r ->> 'datum', '')::date, r ->> 'notiz');
      z := jsonb_set(z, '{neu}', to_jsonb(coalesce((z ->> 'neu')::int, 0) + 1));
    elsif ex.freizeit_id <> v_fid or ex.art <> r ->> 'art' or ex.bezeichnung <> r ->> 'bezeichnung'
          or ex.menge <> (r ->> 'menge')::numeric or ex.einheit is distinct from r ->> 'einheit'
          or ex.datum is distinct from nullif(r ->> 'datum', '')::date or ex.notiz is distinct from r ->> 'notiz' then
      update freizeit_lieferungen l
         set freizeit_id = v_fid, art = r ->> 'art', bezeichnung = r ->> 'bezeichnung', menge = (r ->> 'menge')::numeric,
             einheit = r ->> 'einheit', datum = nullif(r ->> 'datum', '')::date, notiz = r ->> 'notiz'
       where l.id = ex.id;
      z := jsonb_set(z, '{geaendert}', to_jsonb(coalesce((z ->> 'geaendert')::int, 0) + 1));
    else
      z := jsonb_set(z, '{unveraendert}', to_jsonb(coalesce((z ->> 'unveraendert')::int, 0) + 1));
    end if;

    -- Lebensmittel zusätzlich in den Bestand am Ort (ohne Ort kein Bestand)
    if r ->> 'art' = 'lebensmittel' and v_ort is not null then
      insert into lebensmittel_eingang (ort_id, freizeit_id, name, menge, einheit, datum, erstellt_von, kijuko_id)
      values (v_ort, v_fid, r ->> 'bezeichnung', (r ->> 'menge')::numeric, r ->> 'einheit',
              coalesce(nullif(r ->> 'datum', '')::date, v_start), null, r ->> 'kijuko_id')
      on conflict (kijuko_id) do update
        set ort_id = excluded.ort_id, freizeit_id = excluded.freizeit_id, name = excluded.name, menge = excluded.menge,
            einheit = excluded.einheit, datum = excluded.datum
      where (lebensmittel_eingang.ort_id, lebensmittel_eingang.freizeit_id, lebensmittel_eingang.name, lebensmittel_eingang.menge,
             lebensmittel_eingang.einheit, lebensmittel_eingang.datum)
            is distinct from (excluded.ort_id, excluded.freizeit_id, excluded.name, excluded.menge, excluded.einheit, excluded.datum);
    end if;
  end loop;

  -- In KiJuKo entfallene Lieferungen der Freizeiten aus dem Plan: Kopie, also löschen (auch im Bestand)
  select coalesce(array_agg(x ->> 'kijuko_id'), '{}') into v_ids from jsonb_array_elements(coalesce(p_plan -> 'lieferungen', '[]'::jsonb)) x;
  delete from freizeit_lieferungen l where l.freizeit_id = any (v_frei) and not (l.kijuko_id = any (v_ids));
  get diagnostics v_n = row_count;
  if v_n > 0 then z := jsonb_set(z, '{geloescht}', to_jsonb(v_n)); end if;
  delete from lebensmittel_eingang e
   where e.kijuko_id is not null and e.freizeit_id = any (v_frei)
     and not (e.kijuko_id = any (select x ->> 'kijuko_id' from jsonb_array_elements(coalesce(p_plan -> 'lieferungen', '[]'::jsonb)) x
                                   where x ->> 'art' = 'lebensmittel'));
  return z;
end $$;
revoke execute on function fn_import_lieferungen(jsonb) from public, anon, authenticated;

-- ===== 3) Freizeit-Typ =====
create or replace function fn_import_typ(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  z jsonb := '{}'::jsonb; h jsonb := '[]'::jsonb;
  rec record; v_stand jsonb; v_hat boolean; v_art text;
begin
  for rec in select f.id, f.name, f.typ, (x ->> 'typ')::smallint as neu
               from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) x
               join freizeiten f on f.kijuko_id = x ->> 'kijuko_id'
              where coalesce(x ->> 'typ', '') <> '' loop          -- leere KiJuKo-Werte überschreiben nie
    select s.wert into v_stand from import_staende s where s.tabelle = 'freizeiten' and s.datensatz_id = rec.id and s.feld = 'typ';
    v_hat := found;
    if rec.typ is not distinct from rec.neu or (v_hat and v_stand = to_jsonb(rec.neu)) then
      v_art := 'unveraendert';                                   -- gleich, oder KiJuKo unverändert (Kompass-Wert bleibt)
    elsif rec.typ is null or (v_hat and v_stand = to_jsonb(rec.typ)) then
      update freizeiten set typ = rec.neu where id = rec.id;     -- im Kompass leer oder nicht angefasst
      v_art := 'geaendert';
    else
      h := h || to_jsonb(format('%s: Freizeit-Typ im Kompass (%s) weicht von KiJuKo (%s) ab – der Kompass-Wert bleibt.', rec.name, rec.typ, rec.neu));
      v_art := 'unveraendert';
    end if;
    perform fn_import_stand('freizeiten', rec.id, 'typ', to_jsonb(rec.neu));
    z := jsonb_set(z, array[v_art], to_jsonb(coalesce((z ->> v_art)::int, 0) + 1));
  end loop;
  return jsonb_build_object('zaehler', z, 'hinweise', h);
end $$;
revoke execute on function fn_import_typ(jsonb) from public, anon, authenticated;

-- ===== 4) Import =====
-- Wie 0033, zusätzlich Lieferungen und Freizeit-Typ
create or replace function fn_kijuko_import(
  p_plan jsonb, p_anwenden boolean default false, p_entscheidungen jsonb default '{}'::jsonb, p_datei jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_typ jsonb; v_entsch jsonb := coalesce(p_entscheidungen, '{}'::jsonb);
begin
  if not ist_freizeitkoord() then
    raise exception 'Nur die Koordination darf importieren' using errcode = '42501';
  end if;
  if jsonb_typeof(p_plan) <> 'object' or (p_plan ->> 'version') is distinct from '1' then
    raise exception 'Ungültiger Importplan' using errcode = '22023';
  end if;

  begin
    v_result := fn_import_lauf(p_plan, v_entsch);
    v_result := jsonb_set(v_result, '{zaehler,kueche}', fn_import_kueche(p_plan));
    v_result := jsonb_set(v_result, '{zaehler,lieferungen}', fn_import_lieferungen(p_plan));
    v_typ := fn_import_typ(p_plan);
    v_result := jsonb_set(v_result, '{zaehler,typ}', v_typ -> 'zaehler');
    v_result := jsonb_set(v_result, '{hinweise}', coalesce(v_result -> 'hinweise', '[]'::jsonb) || (v_typ -> 'hinweise'));
    if not p_anwenden then
      raise exception 'Vorschau' using errcode = 'P0901';   -- macht den Probelauf rückgängig
    end if;
  exception when sqlstate 'P0901' then
    null;                                                   -- v_result bleibt erhalten, alle Änderungen sind zurückgerollt
  end;

  if p_anwenden then
    insert into import_laeufe (gestartet_von, datei_name, datei_sha256, backup_datum, ergebnis, angewendet)
    values (meine_person_id(), p_datei ->> 'name', p_datei ->> 'sha256', nullif(p_datei ->> 'backup_datum', '')::date,
            jsonb_build_object(
              'zaehler', v_result -> 'zaehler',
              'offene_konflikte', jsonb_array_length(v_result -> 'konflikte'),
              'entfallen', jsonb_array_length(v_result -> 'entfallen'),
              'uebersprungen', jsonb_array_length(v_result -> 'uebersprungen'),
              'hinweise', jsonb_array_length(v_result -> 'hinweise')),
            true);
  end if;
  return v_result || jsonb_build_object('angewendet', p_anwenden);
end $$;
