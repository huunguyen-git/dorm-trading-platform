# Dorm Trading Platform

Five-student OOAD project: campus/dormitory sales and zero-price giveaways. Eight-week target for a working application and OOAD documents.

**Work from this repository folder.** Parent course files are earlier references, not the maintained document set.

## Current state

Documentation and shared skills are ready. The core stack is selected and pinned. Application code, wrappers, dependency lockfiles, database/CI configuration and app tests are not scaffolded yet. No application checks can be claimed as passing.

## Start here

1. [Team onboarding](docs/onboarding/README.md): leader checklist and scaffold acceptance.
2. [Product brief](docs/product/brief.md): 18 requirements and 19 OPEN decisions.
3. [Accepted stack ADR](docs/architecture/ADR-001-stack.md): exact versions and tooling rollout.
4. [Eight-week plan](docs/planning/development-plan.md): backlog, ownership, OOAD and tests.
5. [Contributing](CONTRIBUTING.md) and [AI workflow](docs/onboarding/ai-workflow.md).

Core: Java 21 / Spring Boot 4.0.8, React 19.3.0 / TypeScript 7.0.2 / Vite 8.3.1, PostgreSQL 17.11, Maven 3.9.16 and Node 24.21.0. ADR-001 owns version decisions; manifests/lockfiles will enforce them at scaffold.

## Repository map

```text
AGENTS.md                    Shared agent instructions
CONTRIBUTING.md              Human branch/PR workflow
.github/                    Issue and PR templates
.agents/skills/              Curated and project-specific skills
docs/product/               Requirements and unresolved policy
docs/architecture/          Technical decisions
docs/planning/              Schedule and backlog
docs/onboarding/            Leader/member and AI setup
```

backend/, frontend/ and infra/ will be created by the shared scaffold task. Create future docs/use-cases, docs/uml, docs/api and docs/testing when they have real content.

## Next implementation task

Scaffold one backend/frontend/database slice using ADR-001. Commit wrappers/lockfiles, add a migration and synthetic seed, verify a UI-to-API call and meaningful test, add actual CI, then document tested Windows/CI setup/run/test commands here.

One issue, short branch, human peer review. Technical-stack authorization does not approve OPEN business rules.
