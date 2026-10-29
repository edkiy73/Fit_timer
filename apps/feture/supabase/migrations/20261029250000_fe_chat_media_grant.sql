-- Disappearing clips (owner 29.10.2026): opening only hands out a short grant (`granted_at`); the single view is spent and
-- the timer starts when playback really begins (chat.mediaStarted stamps `opened_at`). A grant that was never started
-- runs out two minutes after it was given (server/commands/chats.mjs GRANT_SEC) and then counts as the view.
alter table feture.message_media_view add column granted_at timestamptz;
