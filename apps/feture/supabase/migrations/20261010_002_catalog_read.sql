-- FetUre public catalog. These are public reference rows ONLY.
-- Six private feture tables remain unreadable by anon/authenticated.
grant select on public.feture_categories, public.feture_interests, public.feture_tests to anon, authenticated;
create policy feture_categories_public_read on public.feture_categories for select to anon, authenticated using (true);
create policy feture_interests_public_read on public.feture_interests for select to anon, authenticated using (true);
create policy feture_tests_public_read on public.feture_tests for select to anon, authenticated using (true);
