# Dorm Trading Platform

Five-student OOAD project: campus/dormitory sales and zero-price giveaways. Eight-week target for a working application and OOAD documents.

**Work from this repository folder.** Parent course files are earlier references, not the maintained document set.

## Current state

The backend foundation includes Spring Boot, Maven Wrapper, PostgreSQL/Flyway, reference category seed, health/status endpoints, default-deny security and database integration tests. Frontend, login and marketplace features are not implemented yet. Business questions in the brief remain OPEN.

## Start here

1. [Team onboarding](docs/onboarding/README.md): leader checklist and scaffold acceptance.
2. [Product brief](docs/product/brief.md): 18 requirements and 19 OPEN decisions.
3. [Accepted stack ADR](docs/architecture/ADR-001-stack.md): exact versions and tooling rollout.
4. [Eight-week plan](docs/planning/development-plan.md): backlog, ownership, OOAD and tests.
5. [Contributing](CONTRIBUTING.md) and [AI workflow](docs/onboarding/ai-workflow.md).

Core: Java 21 / Spring Boot 4.0.8, React 19.3.0 / TypeScript 7.0.2 / Vite 8.3.1, PostgreSQL 17.11, Maven 3.9.16 and Node 24.21.0. ADR-001 owns version decisions; the backend POM/wrapper enforce backend pins; frontend manifests remain a future task.

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

backend/ contains the Java application; infra/ contains local PostgreSQL Compose. frontend/ is a separate upcoming task. Create future docs/use-cases, docs/uml, docs/api and docs/testing when they have real content.

## Run the backend (Windows PowerShell)

Prerequisites: JDK 21 (Temurin version in ADR-001), Docker Desktop running Linux containers, Git. Maven is downloaded by the committed wrapper. Set JAVA_HOME to your JDK installation; use an ASCII-only JDK path on Windows (a JDK extracted under an accented folder can fail to load java.dll). Node is not needed for this backend task.

Run from this repository root:

```powershell
java -version
docker info
Copy-Item .env.example .env
# Edit .env: replace DB_PASSWORD with your own local development password.
# Do not overwrite an existing .env or commit it.
docker compose --env-file .env -f infra/compose.yaml up -d --wait
# Load only the local DB settings into this terminal; .env is not automatically read by Java.
$env:DB_PASSWORD = (Get-Content .env | Where-Object { $_ -match '^DB_PASSWORD=' }) -replace '^DB_PASSWORD=', ''
$dbPort = (Get-Content .env | Where-Object { $_ -match '^DB_PORT=' }) -replace '^DB_PORT=', ''
if (-not $dbPort) { $dbPort = '5432' }
$env:DB_URL = "jdbc:postgresql://localhost:${dbPort}/dorm_trading"
$env:SESSION_COOKIE_SECURE = 'false' # Local HTTP only; keep true when hosted with HTTPS.
.\backend\mvnw.cmd -f backend/pom.xml spring-boot:run
```

In a second terminal:

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/system/status
Invoke-RestMethod http://localhost:8080/actuator/health
```

Expected: application=dorm-trading-platform / apiVersion=v1, and health status UP.
Only status and health GET endpoints are public. Other requests require authentication;
unsafe requests require CSRF. Login is not implemented and no default account is seeded.
The three category rows are reference data, not user records. API contract: [OpenAPI](docs/api/openapi.yaml).

Stop Java with Ctrl+C. Stop the local database with:

```powershell
docker compose --env-file .env -f infra/compose.yaml down
```

This preserves its volume. Changing .env's password does not change an already initialized
database password: use the original credential or explicitly migrate it. Never delete a
volume to fix a password without understanding that it contains your local data.

## Test and package

Docker must be running. Tests start their own isolated PostgreSQL 17.11 container; no .env
or manually started development database is required. First run downloads dependencies/images.

```powershell
.\backend\mvnw.cmd -f backend/pom.xml --batch-mode --no-transfer-progress verify
```

Linux/CI equivalent, from the root:

```sh
./backend/mvnw -f backend/pom.xml --batch-mode --no-transfer-progress verify
```

Tests cover public status/health, private endpoint denial, CSRF, migrated category seed and
safe migration reruns. Docker failures are test failures, not silently skipped tests.
Reports: backend/target/surefire-reports/. Runnable jar: backend/target/backend-0.0.1-SNAPSHOT.jar.
`java -jar` needs the same DB environment variables as above. GitHub workflow: backend-checks.

## Team next steps

Read [task distribution and ready-to-send announcement](docs/onboarding/team-kickoff.md).
Review/merge the setup PR before branching from main. Everyone reproduces the build; then
implement the approved domain contracts and create the frontend scaffold. One issue, short
branch and human peer review; technical choices do not settle OPEN business rules.
