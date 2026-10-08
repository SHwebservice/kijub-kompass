-- KiJuB-Kompass · 0033: Küche & Essen aus KiJuKo 3 (docs/IMPORT.md)
--
-- 1) Gerichte je Tag (Speiseplan des Caterers) an den Essenszahlen: freizeit_verpflegung.menue_mischkost/-vegetarisch/dessert.
-- 2) Küchenteam: freizeit_team.kueche (gesetzt vom Import; KiJuKo ist führend).
-- 3) Sonderkost ohne Namen je Freizeit (z. B. „Nüsse: 2“): freizeit_sonderkost.
-- 4) Lesen dürfen Essenszahlen, Gerichte und Sonderkost: Koordination, Leitung und jetzt auch das Küchenteam der Freizeit.
-- 5) fn_kijuko_import ruft nach dem bisherigen Lauf fn_import_kueche auf – in derselben Transaktion,
--    die Vorschau rollt also auch diese Änderungen zurück. Zähler unter „kueche“.

-- ===== 1) Gerichte =====
alter table freizeit_verpflegung
  add column menue_mischkost   text,
  add column menue_vegetarisch text,
  add column dessert           text;

-- ===== 2) Küchenteam =====
alter table freizeit_team add column kueche boolean not null default false;

create function ist_kueche(fid uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from freizeit_team
                  where freizeit_id = fid and person_id = meine_person_id() and kueche)
$$;
revoke execute on function ist_kueche(uuid) from public, anon;
grant execute on function ist_kueche(uuid) to authenticated;

-- Teamliste zeigt, wer zum Küchenteam gehört (Spalte am Ende ergänzt)
create or replace view v_team_freizeit as
  select t.freizeit_id, t.person_id, t.rolle,
         p.vorname, p.nachname, p.kategorie, p.farbe,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.mail            end as mail,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.telefon         end as telefon,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.ernaehrung::text end as ernaehrung,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.notizen         end as notizen,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.tzk_regeltage   end as tzk_regeltage,
         case when ist_leitung(t.freizeit_id) or ist_koord() then p.tzk_max_stunden end as tzk_max_stunden,
         t.kueche
    from freizeit_team t
    join personen p on p.id = t.person_id
   where p.aktiv and (ist_im_team(t.freizeit_id) or ist_koord());

-- ===== 3) Sonderkost =====
create table freizeit_sonderkost (
  id          uuid primary key default gen_random_uuid(),
  freizeit_id uuid not null references freizeiten(id) on delete cascade,
  text        text not null check (length(trim(text)) > 0),
  anzahl      int not null check (anzahl > 0),
  unique (freizeit_id, text)
);
alter table freizeit_sonderkost enable row level security;
revoke all on freizeit_sonderkost from anon;
grant select on freizeit_sonderkost to authenticated;

-- ===== 4) Lesen (Schreiben ausschließlich durch den Import) =====
create policy lesen on freizeit_sonderkost for select to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id) or ist_kueche(freizeit_id));
drop policy lesen on freizeit_verpflegung;
create policy lesen on freizeit_verpflegung for select to authenticated
  using (ist_freizeitkoord() or ist_leitung(freizeit_id) or ist_kueche(freizeit_id));

-- ===== 5) Import =====
create function fn_import_kueche(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  z jsonb := '{}'::jsonb;
  rec record; r jsonb; v_n int; v_neu int; v_upd int;
begin
  -- Nur Freizeiten aus dem Plan, die es im Kompass gibt
  for rec in select f.id as fid, x as fz
               from jsonb_array_elements(coalesce(p_plan -> 'freizeiten', '[]'::jsonb)) x
               join freizeiten f on f.kijuko_id = x ->> 'kijuko_id' loop

    -- Küchenteam: kueche = true genau für die Personen aus dem Plan
    update freizeit_team t set kueche = k.soll
      from (select t2.person_id,
                   exists (select 1 from jsonb_array_elements(coalesce(p_plan -> 'kueche', '[]'::jsonb)) y
                             join personen p on p.kijuko_id = y ->> 'person_kijuko_id'
                            where y ->> 'freizeit_kijuko_id' = rec.fz ->> 'kijuko_id' and p.id = t2.person_id) as soll
              from freizeit_team t2 where t2.freizeit_id = rec.fid) k
     where t.freizeit_id = rec.fid and t.person_id = k.person_id and t.kueche <> k.soll;
    get diagnostics v_n = row_count;
    if v_n > 0 then z := jsonb_set(z, '{geaendert}', to_jsonb(coalesce((z ->> 'geaendert')::int, 0) + v_n)); end if;

    -- Sonderkost: Kopie der KiJuKo-Werte
    delete from freizeit_sonderkost s
     where s.freizeit_id = rec.fid
       and not exists (select 1 from jsonb_array_elements(coalesce(p_plan -> 'sonderkost', '[]'::jsonb)) y
                        where y ->> 'freizeit_kijuko_id' = rec.fz ->> 'kijuko_id' and y ->> 'text' = s.text);
    get diagnostics v_n = row_count;
    if v_n > 0 then z := jsonb_set(z, '{geloescht}', to_jsonb(coalesce((z ->> 'geloescht')::int, 0) + v_n)); end if;

    update freizeit_sonderkost s set anzahl = (y ->> 'anzahl')::int
      from jsonb_array_elements(coalesce(p_plan -> 'sonderkost', '[]'::jsonb)) y
     where s.freizeit_id = rec.fid and y ->> 'freizeit_kijuko_id' = rec.fz ->> 'kijuko_id'
       and y ->> 'text' = s.text and s.anzahl <> (y ->> 'anzahl')::int;
    get diagnostics v_upd = row_count;

    insert into freizeit_sonderkost (freizeit_id, text, anzahl)
    select rec.fid, y ->> 'text', (y ->> 'anzahl')::int
      from jsonb_array_elements(coalesce(p_plan -> 'sonderkost', '[]'::jsonb)) y
     where y ->> 'freizeit_kijuko_id' = rec.fz ->> 'kijuko_id'
       and not exists (select 1 from freizeit_sonderkost s where s.freizeit_id = rec.fid and s.text = y ->> 'text');
    get diagnostics v_neu = row_count;

    -- Gerichte an den Tageszeilen (die Zeilen selbst legt der bisherige Lauf an)
    update freizeit_verpflegung v
       set menue_mischkost = nullif(y ->> 'menue_mischkost', ''), menue_vegetarisch = nullif(y ->> 'menue_vegetarisch', ''),
           dessert = nullif(y ->> 'dessert', '')
      from jsonb_array_elements(coalesce(p_plan -> 'verpflegung', '[]'::jsonb)) y
     where v.freizeit_id = rec.fid and y ->> 'freizeit_kijuko_id' = rec.fz ->> 'kijuko_id'
       and nullif(y ->> 'datum', '')::date is not distinct from v.datum
       and (v.menue_mischkost is distinct from nullif(y ->> 'menue_mischkost', '')
            or v.menue_vegetarisch is distinct from nullif(y ->> 'menue_vegetarisch', '')
            or v.dessert is distinct from nullif(y ->> 'dessert', ''));
    get diagnostics v_n = row_count;
    v_upd := v_upd + v_n;

    if v_neu > 0 then z := jsonb_set(z, '{neu}', to_jsonb(coalesce((z ->> 'neu')::int, 0) + v_neu)); end if;
    if v_upd > 0 then z := jsonb_set(z, '{geaendert}', to_jsonb(coalesce((z ->> 'geaendert')::int, 0) + v_upd)); end if;
  end loop;
  return z;
end $$;
revoke execute on function fn_import_kueche(jsonb) from public, anon, authenticated;

-- Wie 0010 (mit der Freizeitenkoordination aus 0018), zusätzlich Küche & Essen
create or replace function fn_kijuko_import(
  p_plan jsonb, p_anwenden boolean default false, p_entscheidungen jsonb default '{}'::jsonb, p_datei jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_entsch jsonb := coalesce(p_entscheidungen, '{}'::jsonb);
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
