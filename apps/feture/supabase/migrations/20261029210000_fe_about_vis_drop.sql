-- «Обо мне» facts are always visible to everyone (owner 29.10.2026): the per-fact audience goes.
-- Apply after the deploy (the code no longer reads or writes it).
alter table feture.profile_details drop column if exists about_vis;
