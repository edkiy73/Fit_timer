-- Interests are always seen by everyone (owner 05.11.2026): no «Кто видит» per interest, and none in the private part.
-- Owner's choice for the ones already hidden («Только я» / «По доступу»): they open to everyone too.
update feture.interest set vis = 'public' where vis <> 'public';
alter table feture.interest alter column vis set default 'public';
