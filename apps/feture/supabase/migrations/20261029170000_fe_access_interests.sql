-- Private part scopes (owner, 29.10.2026): «Интересы» is a part of its own. info = the description (and the profile
-- details shown «по доступу»), photos, video, interests = the interests marked «По доступу». Before this, info opened
-- the description and those interests together, so every request and grant with info keeps them: it gets interests.
alter table feture.access_request drop constraint access_request_scopes_check;
alter table feture.access_grant drop constraint access_grant_scopes_check;
update feture.access_request set scopes = scopes || array['interests'] where 'info' = any(scopes) and not 'interests' = any(scopes);
update feture.access_grant set scopes = scopes || array['interests'] where 'info' = any(scopes) and not 'interests' = any(scopes);
alter table feture.access_request add constraint access_request_scopes_check
  check (cardinality(scopes) between 1 and 4 and scopes <@ array['info', 'photos', 'video', 'interests']::text[]);
alter table feture.access_grant add constraint access_grant_scopes_check
  check (cardinality(scopes) between 1 and 4 and scopes <@ array['info', 'photos', 'video', 'interests']::text[]);
