-- Couple approvals, stage 3 (docs/notifications.md «Согласования пары и задачи», owner 03.11.2026).
-- Outcomes: approved, rejected (final — «Вернуть на доработку» is gone), cancelled by the author, expired, superseded
-- (a newer proposal of the same kind for the same object), stale (the object changed before the partner agreed).
-- A proposal keeps the object's version at creation (`base_rev`), the couple's name then (`couple_name`), the partner's
-- comment on a refusal (`comment`, was `return_note`) and what closing it left behind (`outcome`, e.g. the event draft
-- an unapproved event went back to).

alter table feture.partner_approval drop constraint if exists partner_approval_state_check;
update feture.partner_approval set state = 'rejected' where state = 'returned';
alter table feture.partner_approval add constraint partner_approval_state_check
  check (state in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'superseded', 'stale'));
alter table feture.partner_approval rename column return_note to comment;
alter table feture.partner_approval
  add column if not exists base_rev text check (char_length(base_rev) <= 200),
  add column if not exists couple_name text check (char_length(couple_name) <= 200),
  add column if not exists superseded_by uuid,
  add column if not exists outcome jsonb check (outcome is null or jsonb_typeof(outcome) = 'object');
drop index if exists feture.partner_approval_returned;
-- Expiry runs as a job (server/jobs.mjs sweepExpiredApprovals); closed ones are read by id and listed as results.
create index if not exists partner_approval_due on feture.partner_approval (expires_at) where state = 'pending';
create index if not exists partner_approval_closed on feture.partner_approval (profile_id, decided_at desc) where state <> 'pending';
update feture.partner_approval a set couple_name = coalesce(nullif(p.name, ''), '@' || p.handle)
from feture.profile p where a.couple_name is null and p.id = a.profile_id;

-- «Восстановить пару» brings back the approval mode each partner had before the pause (owner 03.11.2026, decision 2).
alter table feture.profile_member add column if not exists approves_before_pause boolean;
update feture.profile_member m set approves_before_pause = m.approves_partner
from feture.profile p where p.id = m.profile_id and p.state = 'paused' and m.approves_before_pause is null;

-- A change that used to come back «на доработку» is a refusal now: its author gets the result (with the draft kept —
-- posts stay drafts, the content stays in `change`), not a task. One result row per author, once.
do $$
begin
  if to_regclass('feture.notification') is not null and exists (select 1 from information_schema.columns
       where table_schema = 'feture' and table_name = 'notification' and column_name = 'couple_name') then
    insert into feture.notification (recipient_account_id, addressee_profile_id, type, object_type, object_id, data, source, kind, couple_id, couple_name, created_at)
    select a.requested_by, a.profile_id, 'pair.decided', 'approval', a.id, jsonb_build_object('state', 'rejected', 'kind', a.kind),
      'migrate:approval-rejected:' || a.id, 'result', a.profile_id, a.couple_name, coalesce(a.decided_at, now())
    from feture.partner_approval a
    where a.state = 'rejected'
      and exists (select 1 from feture.profile_member m where m.profile_id = a.profile_id and m.account_id = a.requested_by and m.state = 'active')
      and not exists (select 1 from feture.notification n where n.object_type = 'approval' and n.object_id = a.id and n.recipient_account_id = a.requested_by)
    on conflict (source, recipient_account_id) do nothing;
  end if;
end $$;
