-- Premium gifts to a couple: a gift to a couple's nickname goes to both active partners (S1 §15, prototype: price x2).
-- `recipient_profile_id` is the profile the giver chose (a person or a couple); the partners are resolved when the
-- payment is confirmed. `recipient_account_id` stays set (the first partner for a couple) for the older rules.
alter table feture.purchase add column recipient_profile_id uuid references feture.profile(id) on delete set null;
