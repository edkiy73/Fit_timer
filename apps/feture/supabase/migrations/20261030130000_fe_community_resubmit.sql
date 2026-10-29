-- Rejected community, sent again (owner 30.10.2026): `community.resubmit` puts it back in the staff queue, but only
-- after the author changed something since the rejection, at most 3 times, at most once a day. After that only an
-- appeal. Additive only.
alter table feture.community add column rejected_rev integer;            -- `rev` when staff rejected it; a resubmit needs a higher one
alter table feture.community add column resubmits integer not null default 0 check (resubmits between 0 and 3);
alter table feture.community add column resubmitted_at timestamptz;      -- last resubmit, for the once-a-day rule
alter table feture.community add column prev_reject_reason text;         -- the reason before the last resubmit, shown to staff
