-- KiJuB-Kompass · 0028: Vorlagen für das Tagesprotokoll je Wochentag
--
-- Je Treff und Wochentag ein Text, mit dem das Feld „Was war los?“ eines neuen Protokolls vorbelegt wird (z. B. feste Gliederung oder
-- der übliche Programmpunkt des Tages). Zahlen und Vorkommnisse werden nie vorbelegt. Lesen darf das Team des Treffs und die
-- Treffkoordination; pflegen dürfen Treffleitung und Treffkoordination. Ein leerer Text bedeutet: keine Vorlage (Zeile wird gelöscht).

create table treff_protokoll_vorlagen (
  treff_id        uuid not null references treffs(id) on delete cascade,
  wochentag       smallint not null check (wochentag between 1 and 7),
  text            text not null check (length(trim(text)) between 1 and 2000),
  bearbeitet_von  uuid references personen(id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (treff_id, wochentag)
);

create function fn_protokoll_vorlage_pruefen() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.treff_id is distinct from old.treff_id or new.wochentag is distinct from old.wochentag) then
    raise exception 'Treff und Wochentag einer Vorlage lassen sich nicht ändern' using errcode = 'check_violation';
  end if;
  new.bearbeitet_von := coalesce(meine_person_id(), new.bearbeitet_von);
  new.updated_at := now();
  return new;
end $$;
revoke execute on function fn_protokoll_vorlage_pruefen() from public, anon;
create trigger treff_protokoll_vorlagen_pruefen before insert or update on treff_protokoll_vorlagen
  for each row execute function fn_protokoll_vorlage_pruefen();

alter table treff_protokoll_vorlagen enable row level security;
revoke all on treff_protokoll_vorlagen from anon;
grant select, insert, update, delete on treff_protokoll_vorlagen to authenticated;
create policy lesen on treff_protokoll_vorlagen for select to authenticated using (ist_treffkoord() or ist_im_treff(treff_id));
create policy schreiben on treff_protokoll_vorlagen for all to authenticated
  using (ist_treffkoord() or ist_treffleitung(treff_id)) with check (ist_treffkoord() or ist_treffleitung(treff_id));
