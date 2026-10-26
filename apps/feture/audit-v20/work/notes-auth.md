# Auth / Settings auditor — notes

Scripts: scratchpad `pw/auth/` (u.mjs helpers, chain.mjs = register through UI, sN.mjs scenario scripts,
fbN.py finding batches → `python3 build.py` writes `work/findings-auth.json`).

## Done
- A01 welcome: slides (bars, swipe mouse+touch, no autoplay under reduced motion), RU/EN, terms sheet, 320/375/390/430/768/1024/1440.
- A02: validation, limit@, mode switch, lang switch, Enter, Apple/Google sheets in both modes.
- A03: empty, 000000 ×6 (counter bug), 999999, paste, letters, backspace, resend timer 30 s, change email.
- A04: nick live check (stale/contradicting), taken list, formats, DOB edge cases, terms row tap, U18 → A04X, back/home.
- A05: step 1 picks, chip «Все» sheet, partner yes/no, skip; step 2 topics → communities, join/request, card tap leak (pre-session C03/C06/P01).
- Full chain → first screen (feed filtered by onboarding topics; partner yes → Q01).

## Next
- AUTH: onboarding interests not saved to profile; Q01 «Пара видна в знакомствах»; new-user empty states.
- A07 age check, V01 photo verification, K01 + all rows (SET-001 ageFromMe), K05/K06/K07, P12, S01, logout.
- B01 Premium, paywall, limit, gift, premium on/off. MAINT, offline, long/nosp/xss. EN pass, dark pass.
