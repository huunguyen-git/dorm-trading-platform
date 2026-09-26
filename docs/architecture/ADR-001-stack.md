# ADR-001: Core stack and delivery tooling

Status: **Accepted technical decision**, 2026-09-25, under the team leader's explicit delegation to select stack/versions. This does not approve OPEN business policies. Versions were checked against publisher registries/release metadata. Backend pins are now represented in the generated POM and Maven Wrapper; see README for backend verification. Frontend pins still await implementation.

## Architecture

One modular monolith: Java/Spring Boot REST API, React single-page frontend, PostgreSQL. One Maven project organized by domain, not microservices or multi-module Maven initially. Plain CSS/CSS modules; no mandatory UI framework or state-management library. Use React state and fetch initially; add dependencies only for a demonstrated need.

Why: Java supports the OOAD course directly; the monolith allows atomic cross-domain holds and completion; React matches the team's testing choices. A relational database enforces constraints and transactions. Avoid five independent application skeletons.

## Pinned scaffold baseline

| Component | Selected version | Version ownership |
| --- | --- | --- |
| Java | Eclipse Temurin 21.0.12.1+1-LTS; compile release 21 | JDK on developer machines and CI |
| Spring Boot | 4.0.8 | Maven parent/BOM; use Boot 4-specific documentation |
| Maven | 3.9.16 | Maven Wrapper distribution; no Maven 4 prerelease |
| PostgreSQL | 17.11 | Same server version in Compose and integration tests |
| Node.js | 24.21.0 LTS | .node-version; Windows installer/version manager and CI |
| npm | 11.19.0 | Node distribution; packageManager field at scaffold |
| React + React DOM | 19.3.0 | Exact direct dependencies + package-lock.json |
| TypeScript | 7.0.2 | Exact development dependency |
| Vite | 8.3.1 | Exact development dependency |
| Vite React plugin | 6.1.1 | Exact development dependency; Vite 8 peer requirement |
| Vitest | 5.0.2 | Exact development dependency; supports selected Node/Vite lines |
| React Testing Library | 16.3.3 | Exact development dependency; supports React 19 |
| Playwright test | 1.63.0 | Exact test dependency and matching downloaded browsers |
| Flyway | 11.14.1 | Inherit Spring Boot 4.0.8 BOM; include PostgreSQL database module |
| Testcontainers | 2.0.5 | Inherit Boot BOM; use v2 module coordinates |
| JUnit Jupiter | 6.0.3 | Inherit Boot BOM, replacing old brief's JUnit 5 assumption |

Spring Security, Spring Data JPA, Hibernate, PostgreSQL JDBC driver and Mockito follow the Boot BOM. Do not independently override their versions. Exact auxiliary npm peers/types/lint packages go in the scaffold's package-lock.json after resolution; they are not separately hand-pinned here. REST Assured is deferred to the first API-test task; Spring's HTTP test support is sufficient for the skeleton. JaCoCo is added with the coverage task using a release compatible with Java 21. Backend verification covers the database/security foundation; frontend integration is still unverified.

The first scaffold must create and commit the Maven Wrapper and frontend lockfile, resolve peers, build both applications and exercise PostgreSQL. On an incompatibility, document a minimal version adjustment here and in manifests together; do not silently switch the architecture. Review security patch updates during the project; avoid unneeded major upgrades in the eight-week window. Never use floating latest tags for application dependencies or deployed images.

## Application choices

- Authentication: Spring Security server-side sessions; same-origin deployment, CSRF protection, secure cookies with HTTPS. Development Vite proxy routes /api to backend. No custom JWT framework or university SSO integration without an actual interface.
- Persistence: Spring Data JPA plus explicit transactional application services and PostgreSQL constraints/locks; Flyway migrations. Use DTOs, Bean Validation and Java records where appropriate. No Lombok initially, to keep behavior visible to students.
- Reservations: database locks/constraints protect both the listing and buyer quota, with one lock order. No Redis.
- Images: local persistent volume with randomized names and metadata in DB; private evidence served only after authorization. Separate storage interface permits later replacement. No arbitrary URL fetching.
- Notifications: persistent in-app inbox; SMTP adapter with a development-only fake/local sink for verification emails. No real school verification claim for seeded users.
- Chat: persisted messages with polling initially. No WebSocket infrastructure until a concrete requirement warrants it.
- Search: category/course/price/zone filters, then tested Haversine radius calculation for course-scale data. No PostGIS initially; it can be introduced by a new ADR if measured need arises.
- API: /api/v1, OpenAPI 3.1 contract, consistent errors/pagination, integer VND, ISO-8601/UTC timestamps. Do not expose JPA entities directly.
- Documentation: Markdown + Mermaid sources for UML-like class/sequence/state/activity diagrams and C4-style context/container views. Follow lecturer requirements if stricter UML tooling is mandated.
- Deployment target: one Linux host, Docker Compose and Nginx; local Compose fallback. Hosting purchase/account creation is not authorized by this choice. CI uses GitHub Actions; GHCR when building deployable images.

Docker Desktop/Engine and Compose are host prerequisites, not app runtime dependencies; use a maintained stable host release with Compose v2 support. Pin container image digests and deployment tool releases in the deployment task when images exist; do not invent digests now.

## Tool rollout

Day one: Maven/JUnit, frontend typecheck/lint/unit/build, GitHub Actions when scaffold exists. Database work: Testcontainers. First user journey: Playwright. Add JaCoCo and selected REST Assured API cases as those tests land. Dependabot after manifests; CodeQL when supported by repo plan; Trivy when images exist. Before release: targeted ZAP and k6 checks against the team's environment.

Defer Kubernetes, Terraform, PIT, Semgrep alongside CodeQL, Sonar services and AWS-specific architecture. These are optional learning extensions, not prerequisites for this course delivery.

## Verification sources

Checked 2026-09-25:

- [Temurin JDK 21 metadata](https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows)
- [Spring Boot releases and requirements](https://docs.spring.io/spring-boot/system-requirements.html), [selected BOM](https://repo.maven.apache.org/maven2/org/springframework/boot/spring-boot-dependencies/4.0.8/spring-boot-dependencies-4.0.8.pom)
- [Maven release metadata](https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml)
- [PostgreSQL supported releases](https://www.postgresql.org/support/versioning/)
- [Node release metadata](https://nodejs.org/dist/index.json)
- npm publisher metadata: [React](https://registry.npmjs.org/react/19.3.0), [TypeScript](https://registry.npmjs.org/typescript/7.0.2), [Vite](https://registry.npmjs.org/vite/8.3.1), [React plugin](https://registry.npmjs.org/@vitejs/plugin-react/6.1.1), [Vitest](https://registry.npmjs.org/vitest/5.0.2), [Testing Library](https://registry.npmjs.org/@testing-library/react/16.3.3), [Playwright](https://registry.npmjs.org/@playwright/test/1.63.0).
