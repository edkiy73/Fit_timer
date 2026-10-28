-- Video trim and crop (owner, 28.10.2026): no transcoding — the clip is stored as picked and every player honours the
-- author's choice. `trim_start_ms` / `trim_end_ms`: the part that plays (≥ 1 s, ≤ 60 s, inside the clip's length,
-- checked by media.uploadIntent and clamped to the scanned length when shown). `frame`: the crop as the crop sheet
-- returns it — {aspect: '4:5' | '1:1' | '16:9', x, y (shift, −0.5…0.5), z (zoom 1…3)}. The poster the device cuts is
-- already the cropped frame at the trim start, so lists and grids need nothing else.
alter table feture.media_asset
  add column trim_start_ms integer,
  add column trim_end_ms integer,
  add column frame jsonb,
  add constraint media_asset_trim check (
    (trim_start_ms is null) = (trim_end_ms is null)
    and (trim_start_ms is null or (kind = 'video' and trim_start_ms >= 0 and trim_end_ms - trim_start_ms between 1000 and 60000))),
  add constraint media_asset_frame check (
    frame is null or (kind = 'video' and jsonb_typeof(frame) = 'object'
      and frame->>'aspect' in ('4:5', '1:1', '16:9')
      and jsonb_typeof(frame->'x') = 'number' and abs((frame->>'x')::numeric) <= 0.5
      and jsonb_typeof(frame->'y') = 'number' and abs((frame->>'y')::numeric) <= 0.5
      and jsonb_typeof(frame->'z') = 'number' and (frame->>'z')::numeric between 1 and 3));
