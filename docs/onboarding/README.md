# Team onboarding

Working directory: the dorm-trading-platform Git root. Read [README](../../README.md) first. Technical stack selection is in [ADR-001](../architecture/ADR-001-stack.md); current business rules and open questions are in [client requirements](../product/client-requirements.md). Backend/CI scaffolding and shared API/DTO/schema groundwork are present. Follow the setup walkthrough below, then the [owner starting slices](../api/README.md#start-work-by-owner) and [team assignments](team-kickoff.md).

## Leader: do these in order

1. Invite four individual GitHub accounts; confirm handles, availability, exact deadline and lecturer rubric. Use personal credentials, never a shared leader token.
2. Review/publish the documentation foundation through a PR. Populate CODEOWNERS once actual handles are known; do not invent usernames. Use the domain/reviewer assignments in the current plan and kickoff table.
3. Protect main: require a PR, one human approval, resolution of comments, and no force pushes/deletion; apply to administrators where supported. Use squash merge and short task branches. Add required check names only after real CI runs exist. Protection availability depends on plan/visibility; record any manual-enforcement limitation. [GitHub guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
4. Create a board with Backlog, Ready, In progress, In review, Blocked, Done. Seed and split current backlog entries from [the plan](../planning/development-plan.md); B16/UC-12 are retired. Every Ready issue has FR/UC references, acceptance, owner, reviewer and dependencies.
5. Read the v1.1 confirmed decisions before asking policy questions again. Track remaining identity exceptions (A01/A13), report penalty amounts/authority (A08), lifecycle details (A05-A07/A09/A14) and the unapproved barter option (A17). Stack selection does not settle those questions.
6. Review and distribute the existing backend/API/DTO/V2 foundation through the shared repository before parallel implementation. Pair the frontend scaffold owners using ADR-001; do not regenerate the backend or create five apps. Local uncommitted changes are not available to teammates through clone/pull.
7. Require all five to reproduce setup and complete a reviewed onboarding PR. Weekly integrated demo; two short coordination meetings per week. Each owner handles analysis, API, UI and tests.

CODEOWNERS is not access control. Require human review through GitHub settings, and request both relevant owners on cross-domain work. Workflows should use minimal permissions; add hosting secrets only when deployment is implemented. No remote settings have been applied by the local documentation work.

## Every member

All five members have starting work, but each slice has its own dependencies. Start from
the same reviewed foundation; do not interpret the task list as approval to implement
OPEN policy or assume other domains' endpoints already work.

### First-time setup walkthrough (Windows PowerShell)

1. Obtain repository access from the leader. Wait for the shared foundation to be
   published/reviewed and merged before branching for feature implementation. A published
   review branch can be inspected or built early, but the leader must identify it; do not
   assume an unpublished local branch is available on GitHub.
2. Install Git, the ADR-selected **JDK 21**, and Docker Desktop with Linux containers.
   Start Docker. Set `JAVA_HOME` to the installed JDK directory, preferably an ASCII-only
   path, and ensure your terminal uses that JDK. Maven Wrapper downloads Maven for you.
   **Node/npm are only needed when doing frontend work**; use the ADR versions then.
3. Clone into your chosen parent directory and open the Git root as the editor/AI project:

   ```powershell
   git clone https://github.com/huunguyen-git/dorm-trading-platform.git
   Set-Location dorm-trading-platform
   git status
   java -version
   docker info
   docker compose version
   ```

   If you already cloned, inspect `git status` and preserve your work before following
   [CONTRIBUTING](../../CONTRIBUTING.md) to update main; do not clone again or discard changes.
   Check that `docs/api/README.md`, the domain `api/*Dtos.java` files and
   `backend/src/main/resources/db/migration/V2__shared_domain_foundation.sql` exist in
   your checkout. If missing, resolve the shared branch/baseline with the leader rather
   than generating replacements.
4. Run the [README test command](../../README.md#test-and-package) from the root:

   ```powershell
   .\backend\mvnw.cmd -f backend/pom.xml --batch-mode --no-transfer-progress verify
   ```

   Tests create an isolated PostgreSQL container; this step needs Docker but no `.env`
   or manually created database. First-run downloads can take time. Require `BUILD SUCCESS`
   and record the actual result; the current foundation has 18 tests, but the count will
   grow. If it fails, report the relevant error without credentials; never skip tests
   or use an in-memory database just to make onboarding appear successful.
5. Follow [Run the backend](../../README.md#run-the-backend-windows-powershell) exactly:
   create your local `.env` without overwriting an existing one, choose a local DB
   password, start Compose, load the documented environment variables, and run Spring
   Boot. Flyway applies the migrations automatically; do not manually run the SQL files.
   Check status and health from the second terminal using the README commands. Login
   and marketplace routes are still unimplemented, so their absence is not a setup failure.
6. Read [CONTRIBUTING](../../CONTRIBUTING.md), [AI workflow](ai-workflow.md), your
   [owner starting slice](../api/README.md#start-work-by-owner), and the related requirements.
   Pick one assigned issue with acceptance criteria and a reviewer; create its task branch
   from updated main. Coordinate shared contracts and migration numbers with the affected
   owners. Do not create duplicate domain tables or edit a merged migration.
7. Start the agent with the bounded prompt in the AI workflow. It must brief you on
   task-relevant existing problems **before implementation edits**, including what can
   proceed and what needs a decision. Verify it actually read root `AGENTS.md`; assistants
   that do not discover it automatically must be explicitly told to read it.
8. Submit one small PR and review another. Include actual checks and unresolved limitations;
   explain the changed rule and one failure test yourself. Use synthetic data only.

## First scaffold acceptance

One Spring Boot backend and React frontend using pinned versions; committed wrappers/lockfiles; PostgreSQL Compose service; Flyway migration; .env.example without secrets; synthetic seed; frontend-to-API call; a meaningful test; passing actual CI; Windows/CI commands in README. No placeholder green checks. No real school accounts or private evidence in fixtures.

## Where future artifacts belong

Use cases: docs/use-cases/. Diagrams: docs/uml/. API contract: docs/api/openapi.yaml.
Current data model and lock protocol: [shared-domain-schema.md](../architecture/shared-domain-schema.md).
Test evidence: docs/testing/. Demo runbook: docs/demo/. Create future folders when they
have real content, not empty placeholder documents.

## Document cleanup record

The reviewed brief and plan were moved under docs/product and docs/planning. The superseded AI brief was removed from this repository; its earlier workspace copy remains outside it. repository_setup.md and the old docs/team guides were replaced by CONTRIBUTING, these onboarding pages, the stack ADR and actual GitHub templates. No source requirement or OPEN decision was removed. Maintain only the documents inside this repository from now on.
