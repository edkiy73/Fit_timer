-- Video is made on the device before upload (owner, 28.10.2026: «Зачем грузить огромные файлы ради кусочка?»): the
-- uploaded file is already the chosen part (≤ 60 s), cut to the chosen frame, downscaled and compressed
-- (kit/video-edit.ts). The non-destructive trim / crop of 20261028231000_fe_video_edit is gone: nothing reads or
-- writes these columns any more. Pre-launch: no data to keep.
alter table feture.media_asset
  drop constraint if exists media_asset_trim,
  drop constraint if exists media_asset_frame,
  drop column if exists trim_start_ms,
  drop column if exists trim_end_ms,
  drop column if exists frame;
