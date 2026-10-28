-- «Это я на фото — против» guard (owner decision 28.10.2026). Before, any account could hide anyone's photo post for
-- everyone at once. Now: a person marked on the photo still hides it at once; anyone else hides it at once only when
-- trusted (photo verified, account older than 7 days, no false claims) and no mass attack on the author is under way —
-- otherwise the post stays visible and the claim goes to the top of the staff queue. Staff «не подтвердилось» restores
-- the post and gives the claimant a strike (2+ → never instant, 3 → no more claims and a staff review). Limits and
-- thresholds live in `DISPUTE_LIMITS` (contracts/posts.mjs). The claimant is never named to the author.

-- One claim of one account about one post. `trusted`/`suspicious` are what the server saw at claim time.
create table feture.photo_dispute (
  id uuid primary key default feture.uuid_v7(),
  post_id uuid not null references feture.post(id) on delete cascade,
  author_profile_id uuid not null references feture.profile(id) on delete cascade,
  claimant_profile_id uuid references feture.profile(id) on delete set null,   -- the acting profile (person or couple)
  claimant_account uuid references feture.account(id) on delete set null,      -- limits and strikes are per account
  tagged boolean not null,        -- the claimant is marked on the photo
  trusted boolean not null,       -- photo verified, account old enough, no strikes
  suspicious boolean not null,    -- untagged and (account younger than 30 days or not trusted): counts towards an attack
  hid boolean not null,           -- the claim hid the post at once
  attack boolean not null default false,  -- part of a possible mass attack on the author
  state text not null default 'open' check (state in ('open', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((state = 'open') = (decided_at is null))
);
create unique index photo_dispute_one_open on feture.photo_dispute (post_id, claimant_account) where state = 'open';
create index photo_dispute_open on feture.photo_dispute (post_id) where state = 'open';
create index photo_dispute_claimant on feture.photo_dispute (claimant_account, created_at desc);
create index photo_dispute_author on feture.photo_dispute (author_profile_id, created_at desc) where not tagged;

-- The author's short explanation for staff while the post is hidden (cleared by the decision).
alter table feture.post add column dispute_note text check (dispute_note is null or char_length(dispute_note) <= 500);

-- Strikes for claims staff found false; never shown to other people. `dispute_flagged_at`: the account reached the
-- restriction and waits for a staff look (`dispute_reviewed_at` once staff checked it).
alter table feture.account
  add column dispute_strikes integer not null default 0 check (dispute_strikes >= 0),
  add column dispute_flagged_at timestamptz,
  add column dispute_reviewed_at timestamptz;

alter table feture.photo_dispute enable row level security;
alter table feture.photo_dispute force row level security;
revoke all on feture.photo_dispute from public;
do $$ begin
  if to_regrole('anon') is not null then execute 'revoke all on feture.photo_dispute from anon'; end if;
  if to_regrole('authenticated') is not null then execute 'revoke all on feture.photo_dispute from authenticated'; end if;
end $$;
create policy api_all on feture.photo_dispute to feture_api using (true) with check (true);
grant select, insert, update, delete on feture.photo_dispute to feture_api;
