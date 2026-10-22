-- KiJuB-Kompass · 0040: Ein Ort für mehrere Treffs
--
-- Bisher gehörte ein Ort höchstens einem Treff (unique auf treffs.ort_id). Ein Ort kann aber z. B. für einen
-- Kindertreff und einen Jugendtreff genutzt werden. Die Eindeutigkeit entfällt; ein normaler Index bleibt für die Suche.
-- Löschen eines Ortes, der noch von einem Treff genutzt wird, verhindert weiterhin „on delete restrict“.

do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where n.nspname = 'public' and rel.relname = 'treffs' and con.contype = 'u'
       and con.conkey = array[(select attnum from pg_attribute where attrelid = rel.oid and attname = 'ort_id')]::smallint[]
  loop
    execute format('alter table public.treffs drop constraint %I', c);
  end loop;
end $$;

create index if not exists treffs_ort on treffs (ort_id);
