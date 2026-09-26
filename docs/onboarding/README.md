# Team onboarding

Working directory: the dorm-trading-platform Git root. Read [README](../../README.md) first. Technical stack selection is complete in [ADR-001](../architecture/ADR-001-stack.md); business questions remain in [the brief](../product/brief.md). Backend/CI scaffolding is present. Follow the root README to run checks, then the team-kickoff table for assignments.

## Leader: do these in order

1. Invite four individual GitHub accounts; confirm handles, availability, exact deadline and lecturer rubric. Use personal credentials, never a shared leader token.
2. Review/publish the documentation foundation through a PR. Populate CODEOWNERS once actual handles are known; do not invent usernames. Use the domain/reviewer assignments in the brief.
3. Protect main: require a PR, one human approval, resolution of comments, and no force pushes/deletion; apply to administrators where supported. Use squash merge and short task branches. Add required check names only after real CI runs exist. Protection availability depends on plan/visibility; record any manual-enforcement limitation. [GitHub guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
4. Create a board with Backlog, Ready, In progress, In review, Blocked, Done. Seed and split B01-B18 from [the plan](../planning/development-plan.md). Every Ready issue has FR/UC references, acceptance, owner, reviewer and dependencies.
5. Resolve A01/A03/A06/A07/A09/A13/A17 with the client/lecturer first. Stack selection does not settle quota, consent, penalties or eligibility.
6. Have two teammates pair on one shared scaffold using ADR-001; everyone else develops specifications/contracts. Do not generate five apps.
7. Require all five to reproduce setup and complete a reviewed onboarding PR. Weekly integrated demo; two short coordination meetings per week. Each owner handles analysis, API, UI and tests.

CODEOWNERS is not access control. Require human review through GitHub settings, and request both relevant owners on cross-domain work. Workflows should use minimal permissions; add hosting secrets only when deployment is implemented. No remote settings have been applied by the local documentation work.

## Every member

- Clone the repository, open this folder as your editor/AI project and pull current main before a new branch.
- Read [CONTRIBUTING](../../CONTRIBUTING.md) and [AI workflow](ai-workflow.md).
- Install the ADR-selected JDK and Node/npm; use Docker with Compose support. Maven Wrapper is committed; a separate system Maven installation is unnecessary.
- Current prerequisite checks: java -version, node --version, npm --version, docker version, docker compose version. These inspect your machine, not proof that the app runs.
- Follow actual README commands for environment, DB migrations, seed, run and test. Report missing steps; do not rely on undocumented help.
- Submit one small PR and review another. Explain the changed rule and one failure test without quoting the AI response.

## First scaffold acceptance

One Spring Boot backend and React frontend using pinned versions; committed wrappers/lockfiles; PostgreSQL Compose service; Flyway migration; .env.example without secrets; synthetic seed; frontend-to-API call; a meaningful test; passing actual CI; Windows/CI commands in README. No placeholder green checks. No real school accounts or private evidence in fixtures.

## Where future artifacts belong

Use cases: docs/use-cases/. Diagrams: docs/uml/. API contract: docs/api/openapi.yaml. Data model: docs/data/. Test evidence: docs/testing/. Demo runbook: docs/demo/. Create these folders when they have real content, not empty placeholder documents.

## Document cleanup record

The reviewed brief and plan were moved under docs/product and docs/planning. The superseded AI brief was removed from this repository; its earlier workspace copy remains outside it. repository_setup.md and the old docs/team guides were replaced by CONTRIBUTING, these onboarding pages, the stack ADR and actual GitHub templates. No source requirement or OPEN decision was removed. Maintain only the documents inside this repository from now on.
