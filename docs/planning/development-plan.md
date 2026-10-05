# Development plan: Campus & Dormitory Trading Platform

> **Bổ sung 05/10/2026 — v1.7:** S11/C28–C40 đã chốt các nguyên tắc OTP đăng ký, nhắc giữ chỗ, đồng ý hủy sau giao, phản hồi admin, sửa/khiếu nại đánh giá, thẩm quyền/khóa chồng, cập nhật hồ sơ và vòng đời tin. Đổi đồ hoãn sang bản mở rộng. Các đoạn baseline v1.1 bên dưới là lịch sử kế hoạch; dùng yêu cầu hiện hành để phân biệt phần đã chốt với chi tiết còn mở. Chưa có endpoint/dịch vụ nghiệp vụ thực thi.

> **Đồng bộ 28/09/2026 — v1.1:** [Đặc tả yêu cầu hiện hành](../product/client-requirements.md) quản lý các quyết định S5/C11–C23. Bỏ giới hạn 3 món của người mua; bảo vệ đồ vật dùng chung giữa các tin. Bảng điểm phạt báo cáo và đổi vật lấy vật vẫn chưa duyệt. FR-14/A16 đã loại bỏ; không tự hết hạn giữ chỗ hoặc tự hoàn tất vì im lặng.

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
| Full course candidate, W7 | Annual review, shared inventory and whole-combo behavior under A02/A19, six report families, integrated docs and deployment | All current FRs accounted for with evidence or explicitly accepted limitation; FR-14 retired and barter still pending |
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
| W4, Oct 16-22 | Reliable reservations: core alpha | M3 acceptance/cancellation/concurrency; M2 shared item/publication coordination; M4 appointment/agreed-price snapshot integration; M1 restriction checks; M5 notification inbox. | One winner across listings sharing an item; whole combo reserved or none; no buyer hold quota or automatic hold cancellation; integrated demo |
| W5, Oct 23-29 | Complete trade and apply feedback | M4 six-digit code/history/rating; M1 ledger/idempotency; M3 cancellation/completion race; M2 completed listings/giveaways; M5 justified-rating decision and no-show resolution. | Full sale + giveaway; invalid/expired/replayed codes rejected under approved A06 rules; one ledger effect per accepted event; no automatic completion |
| W6, Oct 30-Nov 5 | Moderation and lifecycle beta | M5 sanctions/disputes; M1 restrictions/annual review; M2 listing renewal pending A10; M3 reminder retries; M4 appeal/reversal integration and E2E support. | 30/31/50-point tests and no repeated ban; approved renewal behavior tested with controlled clock; annual review fixture; beta deployed |
| W7, Nov 6-12 | Complete current scope + UAT | M5 reporting endpoints; M2 whole-combo/shared-inventory validation under A02/A19; M3 search-event aggregation support; M4 UAT/demo script; M1 deployment/backup restore and integration. All reconcile diagrams with implementation. | Six report families verified against known seed counts; UAT findings triaged; scope freeze |
| W8, Nov 13-19; buffer Nov 20 | Stabilization and defense | Fix defects, improve reproducibility/accessibility, rehearse role-based demo and oral explanation; freeze final diagrams and release notes. No unplanned features. | Tagged release, final report, test evidence, presentation, clean-machine demo and backup local demo |

Critical dependency chain: identity/permissions -> approved listing -> accepted hold -> handover confirmation -> ratings/reputation -> sanctions/reports. Contracts allow parallel UI work, but integrated completion depends on the preceding slice. Mock contracts must be replaced by real API calls before the corresponding gate.

Week labels are the original schedule, not evidence that unresolved policy was approved. Apply v1.1 decisions now: registration needs email OTP plus student-card/admin approval; handover needs photos and admin escalation after 24 hours; all negative ratings need admin review. Re-estimate M2/M3 shared-inventory work and M4/M5 review queues. Report penalty amounts and identity exceptions may block their dependent slices; do not invent values to claim the beta complete. S11/C39 explicitly defers barter to an extension; do not implement it in the current delivery.

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
| UC-09 | Buyer rates seller after completion; admin reviews negative rating; no-rating award at 15 days | 10 | M4 with M5 |
| UC-10 | Report, investigate, decide and apply restriction / member + moderator | 11,12 | M5 |
| UC-11 | Renew/close/expire listing / seller + scheduled job | 13 | M2/M5 |
| UC-13 | View semester/month/category/zone/giveaway reports / admin | 15-18 | M5 |

UC-12 is retired with FR-14/A16; do not reuse its ID. Whole combos and personal inventory remain within UC-03/07 under approved A02/A19. [Analysis diagrams](../uml/marketplace-lifecycle.md) illustrate the current decisions; detailed UC specifications are still future work.

For each detailed UC include goal, trigger, actors, preconditions, main numbered flow, alternatives, exceptions, postconditions, referenced rules, data, authorization and acceptance cases. UC-07 must reserve the listing and all its physical items atomically after seller acceptance. Competing requests on the same listing or different listings sharing an item cannot both win; an unrelated fourth buyer hold is allowed. Preserve agreed-price/item/content snapshots. Agree deterministic locking with M1/M2/M3/M4/M5 before implementation; the former buyer quota guard is obsolete. Hidden listing -> reject; retry -> same result or documented conflict, never duplicate hold.

## 4. Implementable backlog and traceability

Effort uses S = about half a day, M = 1-2 focused days, L = split into smaller issues. Estimates are preliminary, not calendar promises. Every issue must have a single owner, reviewer, dependency, FR/UC references and acceptance evidence. Split L work before assigning AI implementation.

| Issue seed | FR / UC | Owner | Dependencies | Size | Demonstrable acceptance |
| --- | --- | --- | --- | --- | --- |
| B01 Repository conventions and CI skeleton | All | M1 + peers | None | M | Fresh clone builds; one reviewed PR/member |
| B02 Requirements decisions and diagrams | All | All | None | L | A register reviewed; critical UC exceptions modeled |
| B03 Identity and admin activation | 01,03 / 01 | M1 | B01,A01,A13 | L | Unverified/inactive cannot trade; approved member can |
| B04 Personal inventory/listing/category/images | 04 / 03 | M2 | B01,A02,A19,A14 | L | One physical item per inventory record; own-item links; whole combos; edits moderated and target-listing hold guard; image boundaries 0/1/5/6 |
| B05 Moderation queue and publication quota | 05 / 04 | M5+M2 | B03,B04,A03,A14 | M | Hidden/pending absent from results; quota checked atomically |
| B06 Search and geographic filters | 06 / 05 | M2 | B05,A11 | M | Price/course/zone/radius boundary fixtures correct |
| B07 Persisted chat and price proposals | 07 / 06 | M3 | B03,B04,A04 | L | Only participants read/write; effect of price acceptance follows approved A04 |
| B08 Atomic holds and meeting | 08,09 / 07 | M3 + M2 inventory | B04,B05,B07,A05 | L | One winner across shared items; combo all-or-nothing; unlimited buyer holds on available items; price/item snapshots retained |
| B09 Reservation reminders and notification inbox | 08 / 07 | M3; M5 infrastructure | B08,A05 | M | C32 reminder once to both parties at acceptance +24h, deduplicated across retries; no time-based cancellation |
| B10 Handover evidence/challenge/admin resolution | 09 / 08 | M4 + M5 review | B08,A06 | L | Seller photo required; buyer code or authorized admin completes once; 24h escalation; invalid/replayed/action-mismatched code fails |
| B11 Ratings and reputation ledger | 10 / 09 | M4+M1, M5 review | B10,A07 | L | Buyer-only after completion; +2/0/-1/-3/-5; negative effects only after admin approval; 15-day +1 mutually exclusive with submitted rating |
| B12 Reports/evidence/moderator decision | 11 / 10 | M5 | B03,A08,A12 | L | Unsold listing report supported; evidence restricted; audit stored |
| B13 Restrictions and penalty orchestration | 12 / 10 | M5+M1 | B11,B12,A09 | M | Threshold precedence and duration; duplicate decision no double penalty |
| B14 Listing renewal and expiry | 13 / 11 | M2; M5 job support | B05,B09,A10 | M | S10/C27: close after 30 days unless renewed, remind 7 days before deadline; A10 clock origin, renewal cycle and active-trade handling remain gates; never expires a reservation |
| B15 Annual review | 02 / 02 | M1 | B03,B09,A13 | M | C37 annual notice, +7-day follow-up and Needs-update flag without automatic ban; recognized alternative-document sources remain A13 |
| B17 Search events and report queries | 15-18 / 13 | M5; M3 event support | B06,B10,B12,A15 | L | Known fixtures produce exact counts for all six families |
| B18 Integrated UAT, deployment and final report | Current FRs | All; M4 coordinates | B03-B15,B17 | L | Release gate, traceability and reproducible role-based demo |

B16 is retired with FR-14/A16; do not create an issue or reuse the ID. Combo/shared-inventory validation belongs to B04/B08 under approved A02/A19. Report classification may proceed, but numeric report sanctions in B13 await A08; the former -20 no-show penalty is removed.

Example traceability row (template, not evidence of implementation): FR-08 -> UC-07 -> reservation state/acceptance sequence -> B08 -> PR TBD -> T03/T04/T05 -> test report TBD. Replace placeholders with actual links as work lands. An unimplemented requirement remains visible as not delivered.

## 5. Architecture and contracts

Accepted technical choices and exact versions are in [ADR-001](../architecture/ADR-001-stack.md). Use them in the single shared scaffold, wrappers/manifests and lockfiles; do not generate five independent applications.

Structure: backend domains expose services and DTOs; frontend uses feature folders corresponding to ownership; controllers delegate to application services; persistence stays behind module interfaces. Within the single database transaction, the reservation/completion coordinator may call explicit services of adjacent modules. Avoid asynchronous events for inventory or score consistency; use persisted notifications after commit (an outbox is an optional implementation if retries require it).

Proposed contracts to agree in W2:

| Boundary | Inputs / outputs | Provider -> consumers |
| --- | --- | --- |
| Eligibility | member ID + action -> permission/restriction reason | M1 -> M2/M3/M4/M5 |
| Listing and item availability | listing ID/version -> approved/visible/state, physical item IDs/availability and price/content snapshot; separate target-listing edit guard | M2 -> M3/M4/M5 |
| Hold acceptance | reservation request + authenticated seller -> accepted hold or conflict; no hold expiry timestamp | M3 -> M2/M4 |
| Trade completion / cancellation | trade ID + authorized actor + action-specific code or admin decision/evidence -> one terminal outcome or conflict | M4 + M5 -> M2/M3/M1 |
| Rating deadline | completed trade + submitted rating or 15-day deadline -> reviewed rating effect OR no-rating +1, never both | M4 + M5 -> M1 |
| Reputation ledger | validated event ID/type/subject/delta/reference -> exactly-once ledger effect | M1 -> M4/M5 |
| Moderation decision | case ID/version/verdict -> audit + approved sanction command | M5 -> M1/M2 |
| Notifications | recipient/event key/template payload -> durable inbox item | Shared adapter -> all |

OpenAPI should specify request/response examples, validation, authentication, pagination, timestamps, monetary representation and error codes. Candidate `/api/v1` resource groups: auth/members, listings/categories/search, conversations/proposals, reservations, trades/ratings, reports/moderation, notifications/analytics. Freeze concrete endpoints before parallel implementation; these names are not an existing API. Review mobile client requirements and session/CSRF feasibility before freezing authentication contracts; a Bearer-token scheme would require a separate ADR and threat review.

Use integer VND amounts or an agreed exact-decimal representation, never binary floating-point currency. Giveaway amount is zero. Store immutable agreed price/category/zone snapshots needed for historical reporting. Use ISO-8601 timestamps; server clock decides challenge and listing deadlines, never an automatic reservation deadline. Choose UUID or another single ID convention once. Errors distinguish 401 unauthenticated, 403 unauthorized, 404 unavailable resource, 409 state/quota conflict and documented validation errors. Avoid leaking another user's private resource existence through errors.

## 6. Data integrity, jobs and security design

Candidate tables: members, roles/member_roles, verifications, account_restrictions, reputation_entries, categories, zones, inventory_items, listings, listing_items, listing_revisions, listing_images, study_material_details, conversations, messages, price_proposals, reservations, reservation_items, appointments, trades, handover_evidence, transaction_challenges, ratings, reports, report_evidence, moderation_decisions, notifications, search_events, academic_review_cycles. This is not a final schema; contract owners must agree snapshots, revision ownership and constraints before migrations. Campaign tables are out of scope; barter tables are not authorized by this plan.

Key protections:

- Unique normalized institutional identity under the approved eligibility model; banned identity cannot simply re-register. Restrict access to IDs, addresses and phone numbers.
- One live accepted hold per listing AND per physical inventory item, backed by database constraints; no sold-item reuse. Acceptance reserves all items of a combo atomically or none. M1/M2/M3/M4/M5 must agree one deterministic lock order for relevant account/listing/item guards across acceptance, edits, cancellation, completion and moderation. Recheck the listing revision/item set under that protection. Distinct listings sharing an item must serialize on that item; unrelated listings can be accepted for the same buyer without a quota check. No SELECT-then-INSERT without guards and no wall-clock reservation expiry.
- Approval checks open/held listing quota under the seller guard: <120 -> 5, >=120 -> 10. Preserve existing excess after a score drop but deny added publication. Edit/withdraw checks only the target listing's hold and actor permissions; a hold on another listing's shared item does not alone forbid that edit. Published revisions require moderation, and editing must not mutate another trade's snapshot or release its items. C38 hides on edited submission, counts public temporary shortage, archives sold-item shortage, forbids held/sold inventory edits and separates admin removal from trade review; A14 retains detailed lifecycle mapping.
- Unique trade per reservation (`trades.reservation_id`), unique buyer rating per trade and unique reputation source keys. Buyer confirmation and admin resolution share one atomic/idempotent terminal transition. Five-star +2 is a rating effect, never a completion bonus; the separate no-rating +1 is due only after 15 days without submission. Serialize rating submission with that deadline job so pending/rejected ratings exclude +1. Negative rating effects require admin approval. Enforce nonnegative prices and reject buyer=seller.
- Completion code: cryptographically generated, bound to trade, authenticated buyer and action, stored as a keyed hash/protected verifier and excluded from logs. Approved lifetime 10 minutes, five failed attempts per code, single use and invalidation at expiry/fifth failure or reissue; no automatic replacement. Requirements v1.5/S9/C26 fixes limits per buyer + trade: 60 seconds between successful issues, at most 3 successful issues and 10 failed checks in rolling 15 minutes. Shared failure history survives reissue; blocked requests do not add events. M4/M3/M1 implement durable counting and concurrent/boundary checks; current schema/DTO tests do not cover this behavior. Handover requires protected evidence. Escalate to admin at 24 hours from the evidence-backed handover report; reissue cannot reset that timestamp. Expired codes/throttling do not cancel reservations or complete trades. Cancellation codes are separate, and post-handover cancellation requires mutual confirmation or an authorized admin decision.
- Restrictions originate from a unique verified violation/decision event. Store the event ID, `punished_at`, `expires_at` (null for permanent) and active state; one event cannot generate a second restriction. Expiry deactivates a temporary restriction after 14 days without recalculating punishment from the unchanged score. A new verified violation may trigger a new decision under A09; an active permanent restriction still wins.
- Jobs use persistent due timestamps and server checks for reminders, listing renewal and temporary-ban release, not in-memory timers alone. Re-running overdue jobs after restart must not duplicate alerts, penalties or renewals. Inject a clock into time-dependent code so tests can advance time.
- Persist proof and moderator reasoning; never penalize solely because a report was filed. Rating and report effects may coexist for one incident, but duplicate reports do not multiply the report penalty or count as new offenses. Report penalty amounts (including the former -20 no-show amount) are not approved; no special repeat-offense escalation. Prevent self-review of one's own complaint where practical; log admin overrides. Temporary restrictions permit existing held-trade duties, not new publication/holds; C36 settles later-end overlap and permanent-ban history/appeal with admin assistance; incident coordination and detailed assistance workflow remain A09.
- Validate uploaded type/content/size. Store listing photos under `public/listings` and report evidence under `restricted/evidences` with server-generated random UUID names; never use client paths or sequential IDs as file names. Resolve and validate storage paths under their configured roots. Serve evidence through an endpoint that checks case assignment and moderator/admin authority for each request; a direct static URL or guessable ID must not bypass authorization. Proposed limit: 5 MB/image, configurable and explicitly a technical target, not PDF policy. Use synthetic demo identities and evidence. A12 still needs decisions about formats, retention and any additional viewer roles.
- Secure password hashing, access checks for every resource, CSRF for cookie sessions, HTTPS for hosted demo, rate limits for auth/code endpoints and least-privilege DB credentials. Keep secrets in environment/hosting secret store; no real student data in Git or prompts.
- Proposed data-retention and deletion periods require client/lecturer agreement; do not invent legal compliance guarantees.

## 7. Measurable acceptance and test plan

Test behavior, especially boundaries and concurrent requests. Suggested initial tool budget: backend unit tests plus PostgreSQL integration tests, frontend unit/component tests and a few Playwright end-to-end journeys. Testcontainers is useful if Docker works on all machines/CI; otherwise provide an equivalent isolated PostgreSQL test service. Do not substitute an in-memory DB for locking tests.

| Test | Scenario / expected result | FR |
| --- | --- | --- |
| T01 | C28 OTP 5m/5 wrong attempts/60s resend, email proof AND admin identity approval; one-account rule and alternative-document path with settled sources; suffix spoofing rejected, local part is not automatically MSSV; no real service yet | 01,03 |
| T02 | Submit 0 or 6 images fails; 1 and 5 succeed; required study fields validated; pending/hidden never public | 04,05 |
| T03 | Two competing acceptances of pending requests for one listing yield exactly one accepted hold; no partial reservation or listing state | 08 |
| T04 | Two listings sharing a physical item receive simultaneous acceptance: exactly one succeeds; whole-combo acceptance leaves no partial holds. A buyer's fourth hold on unrelated available items succeeds | 04,08 |
| T05 | Elapsed time never cancels holds; C32 acceptance +24h reminder once to both parties across restart/retry; distinguish handover +24h admin escalation; cancellation/acceptance/completion have one coherent outcome | 08,09 |
| T06 | Seller photo required; only relevant buyer uses completion code; enforce 10 minutes/5 failures and single use. 24h escalation happens once despite code reissue/restart. Authorized admin may complete with evidence; admin/buyer/cancel races produce one terminal result; no silence auto-success | 09 |
| T07 | Only buyer of a completed trade rates seller; 5 stars +2, 4 stars 0; admin-approved 3/2/1 stars -1/-3/-5 once. No submitted rating at 15 days awards +1 once and closes submission; pending/rejected ratings exclude +1; deadline/submission race cannot apply both | 10 |
| T08 | No-show is a report, with no hard-coded -20; no score change on filing. Test 51/50/31/30/29 with explicit score fixtures, not invented sanction amounts. Unlock at 14 days without rebanning from old score; new verified event may cause a new restriction, permanent ban takes precedence; old held-trade actions allowed during temporary ban, new holds denied | 08-12 |
| T09 | Prohibited unsold listing report supported under A12; evidence access limited to authorized case handlers; guessed IDs and traversal paths rejected; complaint alone applies no penalty | 11 |
| T10 | S10/C27: 30-day closure unless renewed and reminder 7 days before deadline (day 23 of initial cycle); test before/at/after settled deadlines with a controlled clock, deduplicate job retries. Implement after A10 clock origin, renewal cycle and active-trade treatment are settled; do not cancel reservations/release stock | 13 |
| T11 | Zone/radius center, units and boundary fixtures; max-price inclusive; no private member address exposed | 06 |
| T12 | C37 annual reminder, +7-day follow-up and Needs-update flag without automatic lock; update recorded using approved sources; ordinary combos follow A02/A19 | 02,04 |
| T13 | Known fixtures verify top searches versus trades separately; low-score list, monthly disputes, category/zone counts and giveaways | 15-18 |
| T14 | Complete sale and zero-price giveaway across member/moderator sessions; notification and history accurate | 01-12,18 |
| T15 | Hidden held listing never reopens through cancellation without publication checks; cancellation versus completion commits a single coherent outcome | 05,08,09 |
| T16 | Publication at 119/120/121 points permits 5/10/10 open+held listings; concurrent approvals respect cap. Drop from 8 active listings to 119 points preserves 8, denies additions until below 5; violation-based hiding remains possible | 05 |
| T17 | Held listing cannot be edited/withdrawn; unheld B sharing held item A can have a revised listing, but cannot edit held/sold inventory or trade snapshots. C38 hides on submission, public temporary shortage counts, sold shortage archives; admin removal requires separate trade review. Concurrent edit/accept has one coherent outcome | 04,05,08 |
| T18 | Approved negative rating and separately verified report can have distinct effects for one incident; duplicate report/decision retries do not repeat a penalty; reversal restores only the corresponding effect. Numeric report-penalty acceptance cases remain blocked on A08 | 10-12 |
| T19 | S9/C26 code limits per buyer + trade: reject reissue before 60s, allow at 60s if other limits pass; initial issuance counts toward 3/15m, blocked attempts do not count. A valid code can confirm at 3 issues; 10 failures across codes block issue/check. At exactly 15m old events age out, not by code expiry or a fixed lock delay; reissue/device/session changes do not reset shared counts. Concurrent commands cannot exceed caps; throttling never cancels/releases stock or changes the 24h deadline | 09 |
| T20 | C33 cancellation consent only by the other party with a separate action-bound code; completion code cannot cancel and cancellation code cannot complete. Admin response within 3 working days under a settled A06 clock/calendar; no auto-resolution on timeout. Photo need not expose faces; unauthorized access denied | 08,09 |
| T21 | C34 edit only within original 15 days before a review decision, re-review without a second rating or no-rating award; only accepted reviews public. In-app appeal within 7 days after the still-pending A07 origin is settled; point/review transitions and concurrent decisions tested | 10 |
| T22 | C35 moderator verification/proposal versus senior-admin permanent-ban/exception authority; different appeal reviewer where possible. C36 one restriction decision per incident, later end date for new violation during ban, permanent ban wins; history/appeal allowed and admin assists unfinished trades under approved permissions | 11,12 |

T20–T22 là tiêu chí dự kiến cho các lát triển khai tiếp theo, chưa phải kiểm thử tự động đã viết/chạy. Không cố định mốc thời gian hoặc quyền chi tiết còn mở để làm kiểm thử đạt.

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
| Unresolved business policy blocks implementation | A01/A13 source/exception details, A08 numeric sanctions, A06/A07 clocks and contract semantics, A09/A14 workflow details remain open; S11 settled the listed principles and deferred barter | Lead records explicit deferral/decision; no invented penalty amounts or implied barter approval; dependent feature not claimed complete |
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
2. Review requirements v1.7 and S11/C28-C40; do not reopen approvals. Assign owners for remaining document sources, numeric sanctions, clocks and lifecycle details. Barter is deferred to an extension, not an unresolved current-scope gate.
3. Follow docs/onboarding/README.md: invitations, foundation docs PR, safeguards, one shared scaffold and working CI.
4. Create current backlog entries as scoped issues, excluding retired B16; split L items and assign next-week tasks only, with reviewers and dependencies.
5. Each member clones and submits one small reviewed onboarding PR; then implement one integrated identity-to-listing slice before expanding.

Technical references checked 2026-09-25: [Spring Boot requirements](https://docs.spring.io/spring-boot/system-requirements.html), [Vite setup/runtime requirements](https://vite.dev/guide/). Use these to validate the agreed stack, not to upgrade blindly to latest.
