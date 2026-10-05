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

CI uses Adoptium's normalized SemVer `21.0.12+101.0.LTS` for the vendor version `21.0.12.1+1`; setup-java rejects the four-component display version. The Linux runner is pinned to ubuntu-24.04 and action revisions are pinned.

Spring Security, Spring Data JPA, Hibernate, PostgreSQL JDBC driver and Mockito follow the Boot BOM. Do not independently override their versions. Exact auxiliary npm peers/types/lint packages go in the scaffold's package-lock.json after resolution; they are not separately hand-pinned here. REST Assured is deferred to the first API-test task; Spring's HTTP test support is sufficient for the skeleton. JaCoCo is added with the coverage task using a release compatible with Java 21. Backend verification covers the database/security foundation; frontend integration is still unverified.

The first scaffold must create and commit the Maven Wrapper and frontend lockfile, resolve peers, build both applications and exercise PostgreSQL. On an incompatibility, document a minimal version adjustment here and in manifests together; do not silently switch the architecture. Review security patch updates during the project; avoid unneeded major upgrades in the eight-week window. Never use floating latest tags for application dependencies or deployed images.

## Application choices

Business-dependent constraints below were synchronized on 2026-09-28 to requirements v1.1 (S5/C11-C23). Stack versions are unchanged. This supersedes the former buyer-first locking rationale based on a three-hold quota; detailed transaction contracts still require the affected owners' design review.

- Authentication: Spring Security server-side sessions; same-origin deployment, CSRF protection, secure cookies with HTTPS. Development Vite proxy routes /api to backend. Browser auth is the accepted current design. Before freezing the login API, document whether a native mobile client is in the assessed scope and verify session-cookie/CSRF handling in a small mobile proof of concept. If the client must use Bearer credentials, record a separate ADR covering issuance, storage, rotation/revocation and authorization tests; do not silently add a second auth path. No custom JWT framework or university SSO integration without an actual interface.
- Persistence: Spring Data JPA plus explicit transactional application services and PostgreSQL constraints/locks; Flyway migrations. Use DTOs, Bean Validation and Java records where appropriate. No Lombok initially, to keep behavior visible to students.
- Reservations: a listing references one or more physical items in its seller's inventory; the same item may appear in multiple listings. One transaction must reserve all referenced items and the listing or none. Enforce one live hold per listing AND per physical item, and no reuse of sold items. Buyers have no hold quota. Before implementation, agree a deterministic lock order across listing/item/account guards for acceptance, editing, cancellation, completion and moderation; version/recheck the listing's item set to prevent concurrent edits bypassing availability. Do not lock only a listing or use a buyer counter as a substitute for item exclusivity. No time-based reservation expiry and no Redis.
- Publication/editing: <120 reputation allows 5 open/held listings; >=120 allows 10. A score drop preserves existing listings but prevents additional publication above the new cap. Check quota atomically under the seller guard. Edit/withdraw permission checks the target listing's hold, not whether another listing holds a shared item. All content edits require moderation before publication; preserve existing trade snapshots and item holds. S11/C38 hides edited listings on submission, counts public temporary shortage and archives sold-item shortage; held/sold inventory cannot be edited. A14 retains private history/rejected-edit/admin trade-review details.
- Completion: require protected seller handover evidence. Store a keyed verifier for the six-digit buyer challenge: approved lifetime 10 minutes and five failed attempts, single use, invalidation at expiry/fifth failure or reissue, no automatic replacement. Requirements v1.5/S9/C26 (5 October 2026) fixes limits per buyer + trade: 60 seconds between successful issues, at most 3 successful issues and 10 failed checks in a rolling 15-minute window; shared counts survive reissue/device/session changes. At 3 issues block only issuance, at 10 failures block issuance/checking. These are policy updates, not stack changes or implemented enforcement; see FR-09/A06 for counting boundaries. Challenge expiry/throttling never cancels a reservation. At 24 hours from the evidence-backed handover report, escalate unconfirmed trades to admin; reissue does not reset this deadline. Buyer confirmation and an authorized, evidence-backed admin completion must use the same atomic/idempotent transition. Cancellation challenges are action-bound and cannot complete trades; post-handover cancellation needs mutual confirmation or an admin decision. S11/C33 settles consent by the other party entering a separate cancellation code, admin response within 3 working days and handover photos without mandatory faces. Cancellation-code lifecycle and response clock/calendar remain A06; exact viewers/retention remain A12.
- Reputation: only the buyer rates the seller on a completed trade, within 15 days. Five stars +2, four 0, and admin-approved three/two/one stars -1/-3/-5. At the deadline, no submitted rating earns the seller +1 once and closes rating submission; pending/rejected ratings exclude that award. Serialize submission with the deadline job and use unique source keys for rating/no-rating effects. A verified report can have a separate effect, but duplicate reports of the same act cannot repeat a penalty. Fixed report penalties (including the former -20 no-show rule) are deferred; do not invent values. S11/C39 defers barter to an extension; its conditional atomic two-party hold and two-confirmation/admin-completion principle does not authorize current implementation. S11/C34 approves rating edits within the original 15-day period before a review decision, re-review, accepted-only public display and 7-day in-app appeals; appeal origin/point semantics remain A07.
- Restrictions: persist a unique verified violation/decision event with punishment and expiry times. End a temporary restriction after 14 days without reapplying it solely because the score remains 31–50; preserve permanent restrictions at 30 or below and the appeal route. Permit actions on previously accepted holds during a temporary ban, but deny new publication/holds. A new verified violation can trigger another restriction at the same thresholds (including 50); no separate repeat-offense escalation is approved. S11/C36 permits permanent-ban history/appeal and admin assistance, restricts one decision per incident and uses the later end date for a new violation during a ban; permanent restrictions take precedence. A09 retains incident coordination/admin-workflow details.
- Images: local persistent volume with UUID storage names and metadata in DB. Separate `public/listings` from restricted report, handover and student-card evidence; serve restricted files only through an endpoint authorizing access to the relevant case/trade/verification, never static file hosting. Canonicalize/validate paths under storage roots and reject client-supplied file paths. Separate storage interface permits later replacement. No arbitrary URL fetching. A01/A06/A12 still govern unresolved access/retention policy.
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
