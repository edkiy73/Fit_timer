-- Notification defaults (owner 29.10.2026): every category is on for push and email (email stays a daily digest).
-- An account without a settings row already follows the new defaults (contracts/me.mjs NOTIFICATION_DEFAULTS).
-- A row is also written when the app only marks the push offer as shown or turns push on for a device, so a stored
-- category set that is exactly the old default was never chosen by the person: it moves to the new one. A set the
-- person changed in any way stays as it is.
update feture.notification_settings
   set settings = jsonb_set(settings, '{categories}', '{
     "match": {"push": true, "email": true}, "likes": {"push": true, "email": true}, "req": {"push": true, "email": true},
     "events": {"push": true, "email": true}, "replies": {"push": true, "email": true}, "follows": {"push": true, "email": true},
     "groups": {"push": true, "email": true}, "news": {"push": true, "email": true}}'::jsonb),
       updated_at = now()
 where settings -> 'categories' = '{
     "match": {"push": true, "email": true}, "likes": {"push": true, "email": false}, "req": {"push": true, "email": true},
     "events": {"push": true, "email": true}, "replies": {"push": true, "email": false}, "follows": {"push": true, "email": false},
     "groups": {"push": false, "email": false}, "news": {"push": false, "email": true}}'::jsonb;
