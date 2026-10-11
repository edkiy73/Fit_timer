# FetUre MVP — GitHub work queue (created 2026-10-12)

**Start:** [all open FetUre tasks](https://github.com/edkiy73/Fit_timer/issues?q=is%3Aissue+is%3Aopen+%22FetUre+Task%22) · [Epics](https://github.com/edkiy73/Fit_timer/issues?q=is%3Aissue+is%3Aopen+%22FetUre+MVP%22) · [Pull requests](https://github.com/edkiy73/Fit_timer/pulls).

**Important:** this is a link index, **not** a duplicate MVP specification. Requirements remain in `../mvp-plan/cards/*.md`, verified status in `../mvp-plan/STATUS.md`. Real-time PR/CI can supersede an old checkbox. GitHub Projects board was not created by this integration; Issues and numbered Epics are working today. Native GitHub Project views/sub-issue/blocked-by relationship may be added via GitHub UI later without changing task semantics.

## Epics & tasks
| Gate | Epic | Working Issues |
|---|---|---|
| UI foundation + product quality | [#833](https://github.com/edkiy73/Fit_timer/issues/833) | [#826](https://github.com/edkiy73/Fit_timer/issues/826) screenshot QA; [#827](https://github.com/edkiy73/Fit_timer/issues/827) catalog polish; [#841](https://github.com/edkiy73/Fit_timer/issues/841) A06 account/profile; [#842](https://github.com/edkiy73/Fit_timer/issues/842) admin UX (respect PR #814) |
| Accounts / privacy / consent | [#834](https://github.com/edkiy73/Fit_timer/issues/834) | [#843](https://github.com/edkiy73/Fit_timer/issues/843) A01 OTP; [#844](https://github.com/edkiy73/Fit_timer/issues/844) A02/A03; [#845](https://github.com/edkiy73/Fit_timer/issues/845) A04/A05; [#846](https://github.com/edkiy73/Fit_timer/issues/846) ACL; [#848](https://github.com/edkiy73/Fit_timer/issues/848) moderation |
| Media / My world | [#835](https://github.com/edkiy73/Fit_timer/issues/835) | [#847](https://github.com/edkiy73/Fit_timer/issues/847) P02 media; [#849](https://github.com/edkiy73/Fit_timer/issues/849) W01/W02; [#850](https://github.com/edkiy73/Fit_timer/issues/850) W03/W04; [#851](https://github.com/edkiy73/Fit_timer/issues/851) W05/W06; [#852](https://github.com/edkiy73/Fit_timer/issues/852) W07 |
| Community | [#836](https://github.com/edkiy73/Fit_timer/issues/836) | [#853](https://github.com/edkiy73/Fit_timer/issues/853) posts; [#854](https://github.com/edkiy73/Fit_timer/issues/854) comments; [#855](https://github.com/edkiy73/Fit_timer/issues/855) groups / inbox |
| Partners | [#837](https://github.com/edkiy73/Fit_timer/issues/837) | [#856](https://github.com/edkiy73/Fit_timer/issues/856) invite; [#857](https://github.com/edkiy73/Fit_timer/issues/857) mutual consent; [#858](https://github.com/edkiy73/Fit_timer/issues/858) compatibility |
| Dating | [#838](https://github.com/edkiy73/Fit_timer/issues/838) | [#859](https://github.com/edkiy73/Fit_timer/issues/859) opt-in; [#860](https://github.com/edkiy73/Fit_timer/issues/860) card; [#861](https://github.com/edkiy73/Fit_timer/issues/861) like/match; [#862](https://github.com/edkiy73/Fit_timer/issues/862) chat; [#863](https://github.com/edkiy73/Fit_timer/issues/863) scenarios |
| Operations | [#839](https://github.com/edkiy73/Fit_timer/issues/839) | [#864](https://github.com/edkiy73/Fit_timer/issues/864) deletion; [#865](https://github.com/edkiy73/Fit_timer/issues/865) staff admin; [#866](https://github.com/edkiy73/Fit_timer/issues/866) telemetry; [#867](https://github.com/edkiy73/Fit_timer/issues/867) recovery; [#829](https://github.com/edkiy73/Fit_timer/issues/829) public API error handling |
| Launch | [#840](https://github.com/edkiy73/Fit_timer/issues/840) | [#868](https://github.com/edkiy73/Fit_timer/issues/868) video decision; [#869](https://github.com/edkiy73/Fit_timer/issues/869) native/device QA; [#870](https://github.com/edkiy73/Fit_timer/issues/870) go/no-go |

## How work is selected
1. Fetch fresh main and open PRs, then read **one** candidate Issue description. Pick ready P0 work first, not a blocked security/provider task. The first useful independent task is **#841 account/profile UX**. #826 supports browser evidence; #842 should reconcile draft PR #814.
2. Check affected files and conflicts. A task title marked `P0` can still be blocked; don't skip prerequisites. **Epics are tracking containers**, not tasks an agent should implement in one go.
3. For material UI use [Claude design reference](../design-reference/README.md), user-facing UX contract, phone/desktop screenshots, independent review. For backend use contract/security acceptance.
4. After merge, Github `Closes #issue` link and update the relevant status line. **Do not close an Epic** until all its original MVP contract + live gates are satisfied.
5. If Claude quota runs out, ChatGPT takes the exact same Issue/PR and reads [HANDOFF](HANDOFF.md), not the chat transcript. No scheduled execution or separately paid AI API.

Dependency relationships are expressed in every ticket and in [ROADMAP](ROADMAP.md). Until GitHub native dependencies are configured, they're **documented prerequisites, not enforced by GitHub**.
