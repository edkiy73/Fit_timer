-- Security audit 06.11.2026: the inviter's reward waits seven days after the newcomer's (so a throwaway account that is gone or
-- banned next day brings nothing) and is voided when the two share a device. `inviter_due_at` is when it may be paid, `inviter_state`
-- what happened to it.
alter table feture.referral_use
  add column inviter_due_at timestamptz,
  add column inviter_state text check (inviter_state in ('paid', 'void'));
create index referral_use_due on feture.referral_use (inviter_due_at) where inviter_state is null and inviter_due_at is not null;
