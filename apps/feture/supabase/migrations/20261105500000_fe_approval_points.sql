-- «Что подтверждает партнёр»: the private part is a point like the others and visibility is split into
-- «discover», «reach» and «seen» (owner 05.11.2026). Couples that exist keep what they had: everything waited for the
-- partner before, so every new point is added to each member's list.
update feture.profile_member
set approves_scope = (select array_agg(distinct x) from unnest(approves_scope || array['private', 'discover', 'reach', 'seen']) x),
    approves_partner = true
where profile_kind = 'couple';
update feture.profile_member
set approves_scope_before_pause = (select array_agg(distinct x) from unnest(approves_scope_before_pause || array['private', 'discover', 'reach', 'seen']) x)
where profile_kind = 'couple' and approves_scope_before_pause is not null;
