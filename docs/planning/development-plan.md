# Development plan: Campus & Dormitory Trading Platform

> **Đồng bộ 26/09/2026:** [Đặc tả yêu cầu hiện hành](../product/client-requirements.md) là nguồn nghiệp vụ. FR-14/A16 đã loại bỏ; giữ chỗ không tự hết hạn sau 24 giờ; đúng 30 điểm thuộc mức khóa vĩnh viễn. Các phương án ở mục 7 vẫn cần phê duyệt.

Planning baseline: 2026-09-25. **Eight weeks, five students, OOAD documents plus working application**, per team leader. Target window approximately 2026-09-25 to 2026-11-20; exact submission date remains to be confirmed. The leader delegated technical selection; [ADR-001](../architecture/ADR-001-stack.md) defines the accepted stack. Backend foundation is scaffolded; frontend and domain implementation remain pending.

## 1. Delivery strategy and scope control

Use [client requirements](../product/client-requirements.md) as the source-indexed requirement baseline and [onboarding](../onboarding/README.md) for team workflow. First resolve business ambiguity, then design and implement small vertical slices. Deliver an integrated demo every week; each member contributes analysis, code, tests and documentation.

Planning assumption, not a commitment: 8-10 focused hours/member/week = 320-400 gross team hours. Reserve roughly 25% for review, integration, defects and presentation; plan 240-300 hours of feature/document work. Confirm capacity at kickoff. If capacity is lower, agree a reduced assessed scope with the lecturer rather than silently dropping PDF requirements.

Delivery levels:

| Level | Contents | Acceptance |
| --- | --- | --- |
| Walking skeleton, W1 | Reproducible local setup, CI, DB migration, frontend/API connection, synthetic login fixture | All five machines run it; a peer can reproduce the documented setup |
| Core alpha, W4 | Verified/admin-activated member, moderated listing, search, messaging/proposal, atomic reservation | Two members demonstrate the flow with shared database; competing hold test passes |
| Beta, W6 | Handover code, ratings/reputation, reports/sanctions, reservation reminders and listing renewal | Full sale and giveaway, cancelled hold, complaint decision demonstrated |
| Full course candidate, W7 | Annual review, ordinary combo listing behavior under A02/A19, six report families, integrated docs and deployment | All current FRs accounted for with evidence or explicitly accepted limitation; FR-14 recorded as retired |
| Submission, W8 | Stabilized application, diagrams/report, demo fixtures, presentation and contribution evidence | Release checklist and reproducible demo pass |

Do not describe the core alpha as full current-requirements compliance. Annual review and reports remain in scope; clearance campaigns do not. If current requirements cannot fit, record a lecturer-approved deferral and keep them in the analysis models.

Exclude optional infrastructure: microservices, Kubernetes, Terraform, Redis, paid cloud dependencies, multiple overlapping security scanners, recommendation algorithms and real payment gateway. Use a single deployment and local fallback. Do not drop reservation correctness or human review to save time.

## 2. Week-by-week plan with exit gates

Weeks are relative to kickoff; adjust dates when the lecturer confirms submission.

| Week | Shared outcome | Member work and dependencies | Exit evidence |
| --- | --- | --- | --- |
| W1, Sep 25-Oct 1 | Requirements baseline + runnable skeleton | M1 kickoff/eligibility/roles; M2 glossary/listing wireframes; M3 hold/negotiation scenarios; M4 completion/rating questions; M5 moderation/report definitions. Pair on scaffold, PR templates and CI. Resolve A01/A03/A04/A07/A13/A17/A18. | Approved or explicitly deferred questions; use-case inventory; initial domain model; each member's onboarding PR; UI calls API and migration runs |
| W2, Oct 2-8 | Analysis/design baseline + identity/listing start | Resolve remaining A IDs. M1 auth/admin activation; M2 listing/images/categories; M3 chat/proposal contracts; M4 challenge/history contracts; M5 review queue/audit. Freeze API conventions and initial schema ownership. | Detailed critical use cases, class/state/sequence diagrams, API contract, initial migrations; authorized user can submit listing |
| W3, Oct 9-15 | Publish, search and negotiate | M1 permissions integration; M2 filters/geo/quota; M3 persisted chat/proposals; M4 appointment/handover UI using agreed contract; M5 approval/rejection and report submission. | Member publishes through moderator; search returns correct published items; participants chat and accept price; unauthorized access tests |
| W4, Oct 16-22 | Reliable reservations: core alpha | M3 acceptance/cancellation/concurrency; M2 publication-state coordination; M4 appointment/agreed-price snapshot integration; M1 buyer quota/restriction checks; M5 notification inbox. | One winner in competing holds; three-item cap across listings; no automatic hold cancellation; integrated demo |
| W5, Oct 23-29 | Complete trade and apply feedback | M4 six-digit code/history/rating; M1 ledger/idempotency; M3 cancellation/completion race; M2 completed listings/giveaways; M5 justified-rating decision and no-show resolution. | Full sale + giveaway; invalid/expired/replayed codes rejected under approved A06 rules; one ledger effect per accepted event; no automatic completion |
| W6, Oct 30-Nov 5 | Moderation and lifecycle beta | M5 sanctions/disputes; M1 restrictions/annual review; M2 listing renewal pending A10; M3 reminder retries; M4 appeal/reversal integration and E2E support. | 30/31/50-point tests and no repeated ban; approved renewal behavior tested with controlled clock; annual review fixture; beta deployed |
| W7, Nov 6-12 | Complete current scope + UAT | M5 reporting endpoints; M2 ordinary combo listing behavior pending A02/A19; M3 search-event aggregation support; M4 UAT/demo script; M1 deployment/backup restore and integration. All reconcile diagrams with implementation. | Six report families verified against known seed counts; UAT findings triaged; scope freeze |
| W8, Nov 13-19; buffer Nov 20 | Stabilization and defense | Fix defects, improve reproducibility/accessibility, rehearse role-based demo and oral explanation; freeze final diagrams and release notes. No unplanned features. | Tagged release, final report, test evidence, presentation, clean-machine demo and backup local demo |

Critical dependency chain: identity/permissions -> approved listing -> accepted hold -> handover confirmation -> ratings/reputation -> sanctions/reports. Contracts allow parallel UI work, but integrated completion depends on the preceding slice. Mock contracts must be replaced by real API calls before the corresponding gate.

## 3. OOAD artifact plan

Confirm the lecturer's exact template at kickoff. The workspace includes an OOAD workbook, but it has not been inspected for this task and is not assumed to define the rubric.

| Artifact | Required content | Owner / review / due |
| --- | --- | --- |
| Vision, scope, stakeholder map, glossary | Problem, actors, boundaries, Vietnamese-English terms, source IDs, assumptions | M1 with all / M2 / W1 |
| Requirements and decision log | Current FRs with FR-14/A16 marked retired, measurable acceptance, A01..19 decisions with evidence; nonfunctional targets | Each domain owner / lead / W1-W2 |
| Use-case diagram and specifications | Member, admin, moderator, clock/scheduler and external email boundary; avoid buyer/seller as separate accounts | Each owner / paired review / W2 |
| Activity diagrams | Submit/review listing; reserve; handover; complaint; renewal, including failure paths | M2/M3/M4/M5 / peers / W2 |
| Domain class model | Concepts, associations, multiplicities, invariants and composition; no framework details in analysis model | M1 consolidates / all / W2 |
| System sequence diagrams | System as black box for reserve, complete, moderate | M3/M4/M5 / M1 / W2 |
| Design sequence diagrams | Boundary/controller/service/repository interactions, authorization, transaction/lock boundaries, failures | Domain owners / adjacent owners / W2 then update |
| Design class/package diagrams | Interfaces, responsibilities, dependency direction, methods supporting use cases | M1 with all / cross-review / W2-W7 |
| State machines | Listing, reservation, completion challenge/trade, report and restrictions | M2/M3/M4/M5 / M1 / W2 |
| ERD and data dictionary | PK/FK, nullable fields, uniqueness, indexes, lifecycle history, enums and migration mapping | M2 coordinates / owners / W2-W7 |
| Component/deployment diagrams | Browser, API, DB, image storage, mail adapter; local and demonstration environment | M1 / M3 / W2 then W7 |
| Traceability + test/UAT report | FR -> UC -> design -> issue/PR -> test -> evidence, including deferred scope | M4 coordinates / all / weekly |
| Final report and presentation | Coherent models, implemented scope, unresolved limits, screenshots, contributions, demo runbook | All; M1 integrates / W8 |

Store editable Mermaid/PlantUML sources and exported diagrams. Use composition, polymorphism and interfaces only where justified by domain behavior; do not add patterns or inheritance for decoration. Distinguish an analysis domain class diagram from an implementation class diagram. Keep diagram status and associated commit visible.

Use-case inventory:

| UC | Use case / primary actor | FR | Owner |
| --- | --- | --- | --- |
| UC-01 | Register, verify and activate / member + admin | 01,03 | M1 |
| UC-02 | Annual review/profile update / member + scheduled job | 02 | M1 |
| UC-03 | Create/edit/submit listing / seller | 04,05 | M2 |
| UC-04 | Review listing / moderator | 05 | M5 |
| UC-05 | Browse/search / member; guest access to be decided | 06 | M2 |
| UC-06 | Chat/negotiate price / buyer + seller | 07 | M3 |
| UC-07 | Request/accept/cancel hold, send reminder and agree meeting / buyer + seller | 08,09 | M3 |
| UC-08 | Confirm handover with code / seller + buyer | 09 | M4 |
| UC-09 | Rate completed transaction / participants | 10 | M4 |
| UC-10 | Report, investigate, decide and apply restriction / member + moderator | 11,12 | M5 |
| UC-11 | Renew/close/expire listing / seller + scheduled job | 13 | M2/M5 |
| UC-13 | View semester/month/category/zone/giveaway reports / admin | 15-18 | M5 |

UC-12 is retired with FR-14/A16; do not reuse its ID. Ordinary combos remain within UC-03 and need A02/A19 decisions.

For each detailed UC include goal, trigger, actors, preconditions, main numbered flow, alternatives, exceptions, postconditions, referenced rules, data, authorization and acceptance cases. Example UC-07: seller accepts a pending request; server verifies both accounts and listing eligibility, locks the buyer row then the listing row, checks accepted-hold count and availability, creates an accepted hold with agreed-price snapshot, updates listing and commits. Competing acceptance -> conflict with no partial state; fourth hold -> quota error; hidden listing -> reject; retry -> same accepted result or documented conflict, never duplicate hold. Pending requests counting toward the cap remains A05, not an assumed rule.

## 4. Implementable backlog and traceability

Effort uses S = about half a day, M = 1-2 focused days, L = split into smaller issues. Estimates are preliminary, not calendar promises. Every issue must have a single owner, reviewer, dependency, FR/UC references and acceptance evidence. Split L work before assigning AI implementation.

| Issue seed | FR / UC | Owner | Dependencies | Size | Demonstrable acceptance |
| --- | --- | --- | --- | --- | --- |
| B01 Repository conventions and CI skeleton | All | M1 + peers | None | M | Fresh clone builds; one reviewed PR/member |
| B02 Requirements decisions and diagrams | All | All | None | L | A register reviewed; critical UC exceptions modeled |
| B03 Identity and admin activation | 01,03 / 01 | M1 | B01,A01,A13 | L | Unverified/inactive cannot trade; approved member can |
| B04 Listing/category/image management | 04 / 03 | M2 | B01,A02 | L | Required data validated; image boundaries 0/1/5/6 tested |
| B05 Moderation queue and publication quota | 05 / 04 | M5+M2 | B03,B04,A03,A14 | M | Hidden/pending absent from results; quota checked atomically |
| B06 Search and geographic filters | 06 / 05 | M2 | B05,A11 | M | Price/course/zone/radius boundary fixtures correct |
| B07 Persisted chat and price proposals | 07 / 06 | M3 | B03,B04,A04 | L | Only participants read/write; effect of price acceptance follows approved A04 |
| B08 Atomic holds and meeting | 08,09 / 07 | M3 | B05,B07,A05 | L | One winner; buyer cap across listings; price snapshot retained |
| B09 Reservation reminders and notification inbox | 08 / 07 | M3; M5 infrastructure | B08,A05 | M | Approved reminders sent once across retries; no job cancels a hold for elapsed time |
| B10 Handover challenge and history | 09 / 08 | M4 | B08,A06 | L | Authenticated buyer completes once; invalid/replayed code fails |
| B11 Ratings and reputation ledger | 10 / 09 | M4+M1 | B10,A07 | L | Only participants/completed trades; justified -5; duplicate safe |
| B12 Reports/evidence/moderator decision | 11 / 10 | M5 | B03,A08,A12 | L | Unsold listing report supported; evidence restricted; audit stored |
| B13 Restrictions and penalty orchestration | 12 / 10 | M5+M1 | B11,B12,A09 | M | Threshold precedence and duration; duplicate decision no double penalty |
| B14 Listing renewal and expiry | 13 / 11 | M2; M5 job support | B05,B09,A10 | M | Listing-only renewal/archival follows approved A10 deadline; never expires a reservation |
| B15 Annual review | 02 / 02 | M1 | B03,B09,A13 | M | Due cohort notified once; campus/graduation response stored |
| B17 Search events and report queries | 15-18 / 13 | M5; M3 event support | B06,B10,B12,A15 | L | Known fixtures produce exact counts for all six families |
| B18 Integrated UAT, deployment and final report | Current FRs | All; M4 coordinates | B03-B15,B17 | L | Release gate, traceability and reproducible role-based demo |

B16 is retired with FR-14/A16; do not create an issue or reuse the ID. Combo listing validation belongs to B04 and awaits A02/A19.

Example traceability row (template, not evidence of implementation): FR-08 -> UC-07 -> reservation state/acceptance sequence -> B08 -> PR TBD -> T03/T04/T05 -> test report TBD. Replace placeholders with actual links as work lands. An unimplemented requirement remains visible as not delivered.

## 5. Architecture and contracts

Accepted technical choices and exact versions are in [ADR-001](../architecture/ADR-001-stack.md). Use them in the single shared scaffold, wrappers/manifests and lockfiles; do not generate five independent applications.

Structure: backend domains expose services and DTOs; frontend uses feature folders corresponding to ownership; controllers delegate to application services; persistence stays behind module interfaces. Within the single database transaction, the reservation/completion coordinator may call explicit services of adjacent modules. Avoid asynchronous events for inventory or score consistency; use persisted notifications after commit (an outbox is an optional implementation if retries require it).

Proposed contracts to agree in W2:

| Boundary | Inputs / outputs | Provider -> consumers |
| --- | --- | --- |
| Eligibility | member ID + action -> permission/restriction reason | M1 -> M2/M3/M4/M5 |
| Listing availability | listing ID/version -> approved/visible/state/price snapshot | M2 -> M3/M4 |
| Hold acceptance | reservation request + authenticated seller -> accepted hold or conflict; no hold expiry timestamp | M3 -> M2/M4 |
| Trade completion | trade ID + authenticated buyer + code -> completed trade or error | M4 -> M2/M3/M1 |
| Reputation ledger | validated event ID/type/subject/delta/reference -> exactly-once ledger effect | M1 -> M4/M5 |
| Moderation decision | case ID/version/verdict -> audit + approved sanction command | M5 -> M1/M2 |
| Notifications | recipient/event key/template payload -> durable inbox item | Shared adapter -> all |

OpenAPI should specify request/response examples, validation, authentication, pagination, timestamps, monetary representation and error codes. Candidate `/api/v1` resource groups: auth/members, listings/categories/search, conversations/proposals, reservations, trades/ratings, reports/moderation, notifications/analytics. Freeze concrete endpoints before parallel implementation; these names are not an existing API. Review mobile client requirements and session/CSRF feasibility before freezing authentication contracts; a Bearer-token scheme would require a separate ADR and threat review.

Use integer VND amounts or an agreed exact-decimal representation, never binary floating-point currency. Giveaway amount is zero. Store immutable agreed price/category/zone snapshots needed for historical reporting. Use ISO-8601 timestamps; server clock decides challenge and listing deadlines, never an automatic reservation deadline. Choose UUID or another single ID convention once. Errors distinguish 401 unauthenticated, 403 unauthorized, 404 unavailable resource, 409 state/quota conflict and documented validation errors. Avoid leaking another user's private resource existence through errors.

## 6. Data integrity, jobs and security design

Candidate tables: members, roles/member_roles, verifications, account_restrictions, reputation_entries, categories, zones, listings, listing_images, study_material_details, conversations, messages, price_proposals, reservations, appointments, trades, completion_challenges, ratings, reports, report_evidence, moderation_decisions, notifications, search_events, academic_review_cycles. Merge unnecessary one-to-one tables only after reviewing domain needs; this is not a final schema. Campaign tables are out of scope.

Key protections:

- Unique normalized institutional identity under the approved eligibility model; banned identity cannot simply re-register. Restrict access to IDs, addresses and phone numbers.
- One live accepted hold per listing, enforced by a database constraint consistent with the final state model. For acceptance, lock the buyer's User/member row first, then the Listing row in one transaction; recheck both the accepted-hold count and listing state under those locks before writing. Every path that needs both locks (acceptance, cancellation, completion, moderation or cleanup) uses the same order and a bounded deadlock retry policy. Requests for one listing serialize on its row; concurrent acceptances on different listings for one buyer serialize on the buyer row. No SELECT-then-INSERT without these guards and no wall-clock reservation expiry. A05 decides whether pending requests count toward the cap.
- Approval checks visible-listing quota under the seller lock. Concurrency tests include simultaneous approvals. Resolve reopening at quota through A03/A14.
- Unique trade per reservation (`trades.reservation_id`), unique rating per trade/author and unique reputation source-event key. Completion is one atomic, idempotent trade transition under a row lock or guarded update. The +2 reputation effect belongs to a subsequent five-star rating (FR-10), applied once for that rating event, never for completion alone. Enforce nonnegative prices and reject buyer=seller.
- Completion code: cryptographically generated, bound to trade and authenticated buyer, stored as a keyed hash/protected verifier and excluded from logs. Enforce endpoint rate limits, per-code failed-attempt limits, single use and invalidation on reissue. A06 proposes 10 minutes and five failed attempts; these numbers require approval before implementation. Code expiry never expires the reservation or completes the trade. It is not bank verification.
- Restrictions originate from a unique verified violation/decision event. Store the event ID, `punished_at`, `expires_at` (null for permanent) and active state; one event cannot generate a second restriction. Expiry deactivates a temporary restriction after 14 days without recalculating punishment from the unchanged score. A new verified violation may trigger a new decision under A09; an active permanent restriction still wins.
- Jobs use persistent due timestamps and server checks for reminders, listing renewal and temporary-ban release, not in-memory timers alone. Re-running overdue jobs after restart must not duplicate alerts, penalties or renewals. Inject a clock into time-dependent code so tests can advance time.
- Persist proof and moderator reasoning; never penalize solely because a report was filed. Prevent self-review of one's own complaint where practical; log admin overrides.
- Validate uploaded type/content/size. Store listing photos under `public/listings` and report evidence under `restricted/evidences` with server-generated random UUID names; never use client paths or sequential IDs as file names. Resolve and validate storage paths under their configured roots. Serve evidence through an endpoint that checks case assignment and moderator/admin authority for each request; a direct static URL or guessable ID must not bypass authorization. Proposed limit: 5 MB/image, configurable and explicitly a technical target, not PDF policy. Use synthetic demo identities and evidence. A12 still needs decisions about formats, retention and any additional viewer roles.
- Secure password hashing, access checks for every resource, CSRF for cookie sessions, HTTPS for hosted demo, rate limits for auth/code endpoints and least-privilege DB credentials. Keep secrets in environment/hosting secret store; no real student data in Git or prompts.
- Proposed data-retention and deletion periods require client/lecturer agreement; do not invent legal compliance guarantees.

## 7. Measurable acceptance and test plan

Test behavior, especially boundaries and concurrent requests. Suggested initial tool budget: backend unit tests plus PostgreSQL integration tests, frontend unit/component tests and a few Playwright end-to-end journeys. Testcontainers is useful if Docker works on all machines/CI; otherwise provide an equivalent isolated PostgreSQL test service. Do not substitute an in-memory DB for locking tests.

| Test | Scenario / expected result | FR |
| --- | --- | --- |
| T01 | Verified email alone does not bypass admin activation; student/moderator/admin permissions differ | 01,03 |
| T02 | Submit 0 or 6 images fails; 1 and 5 succeed; required study fields validated; pending/hidden never public | 04,05 |
| T03 | Two competing acceptances of pending requests for one listing yield exactly one accepted hold; no partial reservation or listing state | 08 |
| T04 | Buyer with two active holds receives two simultaneous acceptances on different listings: exactly one succeeds, total three | 08 |
| T05 | Elapsed time never cancels an accepted hold; approved reminder is delivered once across restart/retry; cancellation versus acceptance/completion has one coherent outcome | 08,09 |
| T06 | Only seller initiates handover; only relevant buyer confirms; wrong/expired/replayed code rejected, rate and attempt limits enforced under approved A06; concurrent/repeated completion creates one trade and no duplicate history; no silence auto-success | 09 |
| T07 | Rating before completion/outsider rejected; five-star rating adds +2 once even after repeated completion requests; justified 1 and 2 stars each deduct -5 once; other effects match A07 decision | 10 |
| T08 | Confirmed first no-show -20 once; 51/50/31/30/29 boundaries; one event creates one restriction, temporary restriction ends after 14 days without rebanning at unchanged score, new verified event may trigger a new decision; permanent ban overrides temporary restriction | 12 |
| T09 | Prohibited unsold listing report supported under A12; evidence access limited to authorized case handlers; guessed IDs and traversal paths rejected; complaint alone applies no penalty | 11 |
| T10 | Listing-only renewal eligibility, notice and archival follow the approved A10 rule; test before/at/after deadlines with a controlled clock | 13 |
| T11 | Zone/radius center, units and boundary fixtures; max-price inclusive; no private member address exposed | 06 |
| T12 | Annual reminder once per cycle; update recorded; ordinary combo listing follows approved A02/A19 stock policy | 02,04 |
| T13 | Known fixtures verify top searches versus trades separately; low-score list, monthly disputes, category/zone counts and giveaways | 15-18 |
| T14 | Complete sale and zero-price giveaway across member/moderator sessions; notification and history accurate | 01-12,18 |
| T15 | Hidden held listing never reopens through cancellation without publication checks; cancellation versus completion commits a single coherent outcome | 05,08,09 |
| T16 | Simultaneous publication cannot exceed approved quota; reputation exactly 120 versus 121 follows A03 | 05 |

Proposed nonfunctional course targets, to approve in W1: reproducible startup within 15 minutes on the documented machine prerequisites; typical list/search p95 <= 1 second with 20 concurrent users and 1,000 seeded listings on a named demo machine; mobile layout usable at 360 px; keyboard-accessible main flows and labelled forms; no known critical authorization/data-loss defect at release. Record test environment and results; these are targets, not measured claims. 24/7 production availability needs operations funding outside a classroom demo.

Quality gate: all relevant tests/builds pass, no unexplained skipped critical case, API/schema/docs updated, one human review and author explanation. Coverage may be reported; do not inflate it with trivial tests or impose arbitrary >80% across generated code. Security/concurrency/time boundaries matter more.

## 8. Reporting specification and data collection

Search rankings cannot be derived from completed trades alone. Record normalized search term/course code, timestamp and a privacy-conscious actor/session key for agreed deduplication; avoid storing free-text personal data unnecessarily. Decide A15 before aggregation.

| Report | Source data | Proposed definition requiring confirmation |
| --- | --- | --- |
| Popular search/exchange | search_events + completed trades | Separate search frequency from completed trade count; explicit semester [start,end) |
| Low reputation/blocked | members + active restrictions | score <50 OR active ban/restriction; show reason/status |
| Monthly disputes | reports + decisions | cases created in selected month; include outcome and related transaction when present |
| Listings by category | listings/category snapshot | distinguish submitted/published/current counts; choose and label the displayed metric |
| Trades by zone | completed trade location snapshot | count completed trades by agreed handover zone and completion period |
| Giveaways | completed trades with agreed amount=0 + giveaway flag | count completed offers; count individual goods only if bundle quantity is modeled |

Store report fixtures with expected totals. Access limited to approved admin role; do not display private complaint evidence in aggregate views.

## 9. Collaboration, change control and AI use

Short branches from main; one issue/vertical slice per PR. No permanent member branches or separate unintegrated applications. One human owns each issue; a second reviews. Hold two short integration meetings weekly and demonstrate working behavior weekly. Keep one active implementation task per member when possible.

Before using AI: read AGENTS.md, current client requirements, approved decision/UC, API contract and neighboring code; request a bounded plan and state allowed files. Ask it to identify conflicts rather than invent requirements. After generation: inspect diff, run checks, test a negative case, explain the change aloud, add FR/UC/decision links and record AI assistance in PR. Another AI review does not replace the human peer. Do not use the weaker-model archive as current context.

Shared contracts/migrations: announce interface changes in an issue; affected owners review the contract before implementations diverge. Never edit a merged migration: add a new one. Lead coordinates migration IDs and shared build-file edits. Unexpected changes outside task scope require review, not automatic deletion. AI must not merge its own work or bypass checks.

Policy change: create issue with source, impacted A/FR/UC, alternative choices, implementation/test impact and decision owner; record approval then update client requirements/contracts/models and code together. The lead can approve technical simplification, but cannot silently rewrite client business rules.

## 10. Risks and response

| Risk | Trigger | Response / owner |
| --- | --- | --- |
| Unresolved business policy blocks implementation | A03/A06/A07/A09 open at W2 gate | Lead brings concrete options to lecturer/client; demo limitation recorded, dependent feature not claimed complete |
| M1/M5 overloaded | Reviews/jobs/reports accumulate | Delegate domain jobs to M1/M2/M3; M4 coordinates testing; pair for reporting; lead tracks work in progress |
| Stack choice changes late | Core-stack choice changes after scaffold | ADR-001 is accepted; verify compatibility in B01 and record justified adjustments; avoid mid-project framework migration |
| AI invents APIs/rules | PR contradicts contract/source | Require FR/UC references, actual tests and peer explanation; reject unsupported changes |
| Integration delayed | UI uses mocks after gate | Prioritize one working vertical slice; pair adjacent owners; reduce optional UI polish |
| Scheduler/concurrency defects | Duplicate holds/points or reopened hidden item | Real DB race tests, injected clock, unique event keys and transactional boundaries |
| Deployment/identity provider unavailable | Demo cannot start/send real email | Local Compose fallback and clearly labelled test-mail/admin flow; never claim real institutional integration |
| Capacity below estimate | Weekly gate slips materially | Renegotiate scope with lecturer, preserve core correctness and OOAD traceability; use W8 for stabilization |

## 11. Deployment and submission checklist

Demo architecture: frontend + backend + PostgreSQL + persistent image storage; in-app notification inbox and mail adapter as needed. Local Compose required; hosted single-instance demo optional if course allows. No paid infrastructure purchase assumed. Record environment variables in .env.example with placeholders, seed instructions and runtime versions.

Before release:

- [ ] Fresh clone follows README successfully; migrations create schema; deterministic synthetic seed produces documented accounts/counts.
- [ ] No secrets or real personal data committed; evidence storage authorization checked.
- [ ] Each current FR maps to implementation/test evidence or explicit lecturer-approved deferral; FR-14/A16 remain marked retired and all OPEN decisions are visibly documented.
- [ ] Unit, database integration and critical E2E tests pass on release commit; failure logs/results retained.
- [ ] Database and image backup restore rehearsed; deployment smoke test passes; rollback uses previous app version with a compatible schema or a rehearsed restore.
- [ ] Final diagrams correspond to delivered code; PDF/report generated per lecturer template; five members can explain responsibilities and cross-domain flow.
- [ ] Demo script: admin activation -> submit/approve -> search/propose -> reserve -> code completion -> rating; alternate hold cancellation/reminder, violation/sanction, listing renewal, annual review and reports.
- [ ] Version tag, release notes, known limitations, presentation and local fallback archived.

## 12. First 48 hours

1. Confirm exact deadline, weekly capacity, GitHub handles, lecturer rubric and the selected stack.
2. Review the current client requirements together; assign decision owners and send A01/A03/A06/A07/A09/A13/A17 to the lecturer/client proxy first.
3. Follow docs/onboarding/README.md: invitations, foundation docs PR, safeguards, one shared scaffold and working CI.
4. Create current backlog entries as scoped issues, excluding retired B16; split L items and assign next-week tasks only, with reviewers and dependencies.
5. Each member clones and submits one small reviewed onboarding PR; then implement one integrated identity-to-listing slice before expanding.

Technical references checked 2026-09-25: [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html), [Vite setup/runtime requirements](https://vite.dev/guide/). Use these to validate the agreed stack, not to upgrade blindly to latest.
