-- Stage 5, the notification center (docs/notifications.md): a link result names the link it is about (it opens that
-- link in «Мои связи»), and reading by object — opening a chat reads its match and request rows, a decided task reads
-- its own row — has an index.
alter table feture.notification drop constraint if exists notification_object_type_check;
alter table feture.notification add constraint notification_object_type_check
  check (object_type in ('profile', 'post', 'reply', 'community', 'event', 'conversation', 'approval', 'invite', 'request', 'link'));
create index if not exists notification_unread_object on feture.notification (recipient_account_id, object_type, object_id) where read_at is null;
