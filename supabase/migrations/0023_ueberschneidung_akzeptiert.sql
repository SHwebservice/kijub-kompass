-- KiJuB-Kompass · 0023: Überschneidungen von Freizeiten bewusst akzeptieren
--
-- Eine Person kann auf dem Papier in zwei Freizeiten zur selben Zeit eingeteilt sein, und in der Praxis geht das trotzdem (zum Beispiel,
-- weil sie nur an einzelnen Tagen dabei ist). Die Freizeitenkoordination kann so eine Überschneidung akzeptieren; die Warnung verschwindet dann.
-- Gespeichert wird das Paar aus Person und zwei Freizeiten (die kleinere Kennung steht immer in freizeit_a), mit Notiz, wer es wann akzeptiert hat.
-- Verlässt die Person eine der beiden Freizeiten, entfällt die Akzeptanz: Wird sie später wieder eingeteilt, wird erneut gewarnt.

create table freizeit_ueberschneidungen_ok (
  person_id      uuid not null references personen(id) on delete cascade,
  freizeit_a     uuid not null references freizeiten(id) on delete cascade,
  freizeit_b     uuid not null references freizeiten(id) on delete cascade,
  notiz          text check (notiz is null or length(notiz) <= 500),
  akzeptiert_von uuid references personen(id) on delete set null,
  akzeptiert_am  timestamptz not null default now(),
  primary key (person_id, freizeit_a, freizeit_b),
  check (freizeit_a < freizeit_b)
);
create index freizeit_ueberschneidungen_ok_b on freizeit_ueberschneidungen_ok (freizeit_b);

alter table freizeit_ueberschneidungen_ok enable row level security;
create policy koordination on freizeit_ueberschneidungen_ok for all to authenticated
  using (ist_freizeitkoord()) with check (ist_freizeitkoord());
revoke all on freizeit_ueberschneidungen_ok from anon;
grant select, insert, update, delete on freizeit_ueberschneidungen_ok to authenticated;

-- Wer akzeptiert hat und wann, setzt die Datenbank selbst (nicht der Browser)
create function fn_ueberschneidung_stempel() returns trigger
language plpgsql as $$
begin
  new.akzeptiert_von := meine_person_id();
  new.akzeptiert_am := now();
  return new;
end $$;
create trigger ueberschneidung_stempel before insert or update on freizeit_ueberschneidungen_ok
  for each row execute function fn_ueberschneidung_stempel();

-- Verlässt die Person eine Freizeit, entfallen ihre Akzeptanzen für diese Freizeit
create function fn_ueberschneidung_aufraeumen() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from freizeit_ueberschneidungen_ok
   where person_id = old.person_id and (freizeit_a = old.freizeit_id or freizeit_b = old.freizeit_id);
  return old;
end $$;
create trigger ueberschneidung_aufraeumen after delete on freizeit_team
  for each row execute function fn_ueberschneidung_aufraeumen();

revoke execute on function fn_ueberschneidung_stempel(), fn_ueberschneidung_aufraeumen() from public, anon, authenticated;
