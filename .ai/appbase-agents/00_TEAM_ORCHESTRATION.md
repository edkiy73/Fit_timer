# FitTimer → AppBase — agent orchestration

Use this file as the entry point for AppBase preparation work. The goal is to keep FitTimer working while extracting a reusable application core that can later seed unrelated products.

## Team model

Normal tasks use only three roles:

```text
Architect → Extraction Engineer → QA/Regression → Architect
```

Specialists are opt-in:
- UX/UI System — only for reusable UI, shell, navigation, settings, tokens or branding.
- Security & Privacy — auth, sessions, profile/account isolation, sync authorization, Premium, billing, public links, secrets, PII, AI authorization/quota, push-token ownership.
- Release & DevOps — TypeScript/build tooling, bundling, Vercel, env/config generation, Capacitor, Android/iOS, app identity, update/release flow.
- Product Integration — after a meaningful Core milestone, before AppBase fork, and for proof apps.

Do not route every task through every agent.

## Epistemic discipline

Agents must distinguish:
- **Verified fact** — observed in current code, tests, logs, docs, or tool output.
- **Reasoned conclusion** — inferred from verified facts; state the reasoning briefly.
- **Proposal** — a design choice not yet proven.
- **Unknown / risk** — something not verified yet.

Do not call a design "ideal", "definitely correct", "the only right solution", or equivalent unless the claim is actually demonstrated. When reasonable alternatives exist, mention the material alternative and why the chosen option is preferred for the current constraints. Confidence should match evidence.

## Context budget

Each agent receives only:
- its role file;
- the TASK CARD;
- relevant file excerpts/diff;
- required contract/ADR snippets;
- the previous short HANDOFF.

Do not forward full chat history, full repository dumps, other agents' full analyses, or broad docs outside scope.

Repository navigation remains governed by root `AGENTS.md`: check current `main`, read `.ai/project-map.md`, use `npm run ai:context -- "task"`, then targeted routing/index/search.

## TASK CARD

```md
# TASK
## Goal
One sentence describing the postcondition.

## Base
repo: edkiy73/Fit_timer
branch: <branch>
base commit: <sha>

## Scope
Allowed modules/files.

## Out of scope
Explicitly excluded work.

## Invariants
Behavior/data that must not break.

## Desired contract
The boundary/API expected after the change.

## Verification
Required checks.

## Specialist triggers
security: yes/no
ux: yes/no
devops: yes/no
integration: yes/no
```

## HANDOFF

Keep handoffs roughly 150–500 words:

```md
# HANDOFF
STATUS: done | blocked | changes_requested
BASE: <sha>
CHANGED:
- file
CONTRACT:
- what is now guaranteed
BEHAVIOR:
- runtime impact or none
CHECKS:
- command ✅
RISKS:
- none or 1–3 concrete risks
NEXT:
- next role and why
```

## Review routing

Ordinary refactor:
```text
Architect → Engineer → QA → Architect
```

Auth / Sync / Premium:
```text
Architect → Engineer → Security → QA → Architect
```

Reusable UI:
```text
Architect → UX/UI → Engineer → QA → Architect
```

Build / TypeScript / Mobile:
```text
Architect → DevOps → Engineer → QA → Architect
```

Major Core milestone:
```text
Architect → Engineer → required specialist → QA → Product Integration → Architect
```

## Acceptance ownership

The author does not self-approve:
- implementation → QA;
- architecture boundary → Architect;
- security-sensitive work → Security;
- build/release-sensitive work → DevOps;
- reusable UI system → UX/UI;
- AppBase universality → Product Integration + Architect.

## Architecture law

```text
App / Product Domain → Core
Core ✕→ Product Domain
```

Core must not depend on workout, exercise, warm-up, reps, sets, muscles, trainer, trainee, fitness catalog, or workout progression concepts. A temporary compatibility adapter may contain legacy terms only if explicitly marked and scheduled for removal.

## Anti-pattern

Wrong:
```text
8 agents read everything → 8 analyses → everyone reviews everyone
```

Right:
```text
Architect routes → one implementer → one mandatory reviewer → specialist only on trigger
```