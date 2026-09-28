# Backend foundation verification

Verified locally on 2026-09-26, Windows, Temurin 21.0.12.1+1, Maven Wrapper 3.9.16, Docker Desktop with PostgreSQL 17.11.

- `backend/mvnw.cmd -f backend/pom.xml --batch-mode --no-transfer-progress verify`: BUILD SUCCESS; 5 tests, 0 failures/errors/skips. Includes Flyway migration/seed/re-run, public status/health, anonymous denial and CSRF rejection.
- Packaged JAR with isolated Compose PostgreSQL: health UP, application status returned, private endpoint HTTP 401. Temporary smoke containers/volume removed afterward; no user database was used.
- Markdown links/fences, POM XML and Compose/workflow/OpenAPI YAML parsed successfully.
- Test reports are generated in backend/target/surefire-reports; CI uploads them as backend-test-results. Inspect the branch Actions run for its current remote result; local results do not prove CI passed.

The host used a legacy Asia/Saigon timezone that PostgreSQL rejected. The application entry point and test JVM now use UTC, matching the data design. The JDK was installed in an ASCII-only cache path because the Windows launcher failed under an accented JDK path. Neither local tooling nor generated artifacts are committed.

Not implemented/tested: login, member verification, listing workflow, reservations, payments/handover, frontend or production deployment. Reference category seed is not a student demo account system.
