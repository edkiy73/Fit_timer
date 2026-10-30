-- «Обо мне»: the kids answer «пока не знаю» is gone (owner 30.10.2026): nobody is asked to say they do not know. An
-- existing one becomes «not specified».
update feture.profile_details set kids = null where kids = 'unsure';
alter table feture.profile_details drop constraint if exists profile_details_kids_check;
alter table feture.profile_details add constraint profile_details_kids_check check (kids in ('have', 'want', 'dont_want'));
