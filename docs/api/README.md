# Shared backend contracts — team starting point

Baseline: requirements **v1.1, 28 September 2026**. This change initializes contracts,
Java DTOs and Flyway storage. It does **not** implement login or marketplace endpoints.
Only system status and actuator health are live. The OpenAPI operation extension
`x-implementation-status` distinguishes them; `x-policy-gates` records remaining decisions.

Requirements v1.2 (5 October 2026), S6/C24/FR-19, adds a weekly giveaway-receipt
limit while preserving no means-testing and no general buyer hold quota. A20 still
needs the cap, week/count definition, counting/check stage, cancellation treatment
and exceptions. Request, acceptance and completion contracts carry an A20 gate for
giveaways pending that decision; the gate does not choose where to consume a slot
or restrict sale holds. No counter, DTO field, schema migration or enforcement exists.
M3/M4 coordinate the design review with M1/M5 and the leader/client before enabling
dependent giveaway behavior. Other foundation contracts remain the v1.1 baseline.

Requirements v1.4/GL-10/S8/C25 confirms invalidation at 10-minute expiry or the fifth
failed attempt, with no automatic code generation. The authenticated buyer may
request a fresh code, delivered only to that buyer; the seller-initiated S7 proposal
is superseded. A fresh code has a new 10-minute lifetime and zero failed attempts;
the old code never becomes valid again. The planned buyer-only endpoint is aligned,
but enforcement is future M4 work with M3/M1 review. Requirements v1.5/S9/C26 closes
the code rate-limit policy: per buyer + trade, 60 seconds between successful issues,
at most 3 successful issues (initial + reissue) and 10 failed checks in the rolling
15 minutes `(now-15m, now]`. Reissue resets only the new code's five-attempt counter;
the shared failure count survives reissue, device/session changes. At 3 issues deny
issuance but allow an otherwise valid code; at 10 failures deny issuance and checking.
Blocked requests add neither an issue nor a failed check. Old events age out individually,
not by code expiry or a fixed 15-minute lock from the last blocked request. No auto-issue
when throttling ends. This is approved policy, not implemented enforcement. Check expiry/attempts
even before any background invalidation job; invalidate and replace in one transaction.
Invalidation does not lock/cancel the trade or move its 24-hour admin-review deadline.

Requirements v1.6/S10/C27 settles listing closure after 30 days unless renewed and
a renewal reminder 7 days before the deadline (day 23 of the initial cycle).
It replaces the old timing of asking after 30 days and waiting another 3 days.
A10 still gates the clock origin, renewal duration/base, active-trade treatment,
notification details and reopening lifecycle. There is no renewal endpoint, deadline
DTO/storage or scheduler in the foundation. M2/M5 coordinate these contracts with
M1/M3/M4 before implementation; never repurpose seller withdrawal as timed closure
or expire a reservation to close a listing.

Requirements v1.7/S11/C28-C40 records client approval relayed by the user on 5 October
2026. Registration OTP is 5 minutes / 5 wrong attempts / 60-second resend; alternative
identity documents and one account per person are approved principles, with actual
document sources and exception verification still A01/A13. Hold reminders are once to
both parties at acceptance +24h, independent from handover +24h admin escalation.
Post-handover cancellation consent is by the other party entering a separate code;
the code's lifecycle and new contract remain A06. Admin responds within 3 working days,
with clock origin/calendar/final resolution still unspecified. Handover photos need
not expose faces and require authorized access; exact viewer matrix/retention remain A12.
Ratings can be edited within the original 15 days before a review decision and must
be reviewed again; only accepted reviews are public, with in-app appeals within 7 days.
Appeal origin and review/point semantics remain A07; edit/appeal routes are not present.
Moderators verify/propose, senior admins decide permanent bans/exceptions, and appeals
use a different reviewer where possible. Actual sanction values still require separate
approval. One incident yields one restriction decision; a new violation during a ban
uses the later end date, with permanent bans taking precedence. Permanently banned
members can view history/appeal; admin-assisted active-trade handling needs a contract.
Annual nonresponse triggers a 7-day follow-up and Needs-update flag, not an automatic ban.
Edited listings hide on submission; public temporary stock shortage counts toward quota,
sold-item shortage archives the related listing; held/sold inventory cannot be edited.
Admin removal of a held listing requires separate trade review. Barter is deferred to
an extension, with atomic two-party holds/two confirmations or admin decision as its
conditional principle. None of these policies has an implementing business service.

Read [OpenAPI](openapi.yaml), [schema/transaction guide](../architecture/shared-domain-schema.md)
and [requirements](../product/client-requirements.md) together. The user request is the
scope for this local foundation change; no GitHub issue was assigned or created.
OpenAPI and DTOs are implementation contracts for owner review, not new client approvals.

## Start work by owner

| Owner / reviewers | Ready work | Gate before enabling dependent behavior |
| --- | --- | --- |
| M1 identity and integration / M4 + M5 | Map members/roles, eligibility, common errors; design C28 OTP 5m/5 failures/60s and one-account rule; C37 annual follow-up | Session/CSRF login contract; A01/A13 document sources/exception routes and OTP lifecycle; new storage/contracts before enforcement |
| M2 inventory/listings / M1 + M3 + M5 | Map inventory/revisions; design C38 submission hiding, shortage quota/archival and held/sold stock protection; S10/C27 30-day closure and 7-day advance reminder | A10 clock/renewal/active-trade details; A14 private history/rejected-edit/archival/admin-review mapping; A11 GPS precision/search |
| M3 negotiation/reservations / M2 + M1 + M5 | Participant-only conversations, atomic acceptance; C32 one +24h hold reminder to both; C33 cancellation consent design | Real eligibility/publication dependencies; reminder delivery details and cancellation-code lifecycle/new contract |
| M4 trades/ratings / M3 + M1 + M5 | Trade/challenge/atomic completion design; C34 rating edit/review and in-app appeal design | Implement S9/C26 enforcement; A06 working-day clock/cancellation code, A07 appeal clock/point semantics and A12 exact evidence viewers; new edit/appeal routes |
| M5 moderation / M2 + M4 + M1 | C35 role authority, C36 restriction overlap/history/appeal; review queue, evidence and notifications | A08 actual numeric sanctions/role mapping, A09 incident coordination/admin assistance, A12 viewer matrix/retention, A15 reports |

Review this shared contract with **all five owners** before their feature branches diverge.
Suggested first integrated slice: identity activation -> own item + draft -> moderator
publication -> conversation. Build reservation acceptance together with M2/M3; its SQL
constraint tests already provide fixtures. Each owner adds entities/repositories and
application services inside their domain, then controllers mapping these records.
No persistence entity crosses a controller or another domain's service boundary.
Do not implement cross-domain writes in five independent controllers.

## Wire conventions

- Prefix `/api/v1`; UUID strings for new domain IDs. Existing category IDs stay int64.
- Integer VND (`Long`) between 0 and 9,007,199,254,740,991: a transport safety limit
  for JavaScript, not a client price policy. GIVEAWAY is exactly zero; no invented
  positive minimum for SALE. Timestamps use UTC ISO-8601 (`Instant`).
- Records live in `com.campus.<domain>.api.<Domain>Dtos`. OpenAPI `x-java-type` points
  to each compiled record/enum. These are ordinary source files, not build-generated code.
  Update Java and OpenAPI together; `ContractTests` checks field/type/requiredness/enum
  alignment and references. Lists are copied so caller mutation cannot alter a DTO.
- Optional JSON properties are **omitted**, not null. Records use `NON_NULL`.
  Call `@Valid` at controller boundaries. Structural validation does not establish
  ownership, eligibility, moderation approval or inventory availability.
- Responses expose dedicated views. Student ID, phone, private address, password hashes,
  storage keys and challenge verifiers never belong in public listing or trade views.
  Study-field requiredness is still a form decision; nullable fields are not permission
  to silently declare that requirement resolved.
- Pagination is zero-based `page=0`, `size=20`, maximum 100; response is
  `items/page/size/totalElements`. Default order `createdAt DESC, id DESC`, except chat
  `createdAt ASC, id ASC`. Offset pages are not a stable snapshot during concurrent inserts.
- All planned business routes require a server session. Unsafe methods require
  `X-CSRF-TOKEN`; do not disable CSRF to make initial UI work. Identity bootstrap/login
  is intentionally not frozen until the ADR native-client scope check. Guest browsing
  is not assumed approved.
- Mutations derive actor from session; request bodies cannot select a seller/buyer role.
  `expectedVersion` rejects stale commands with 409. Lock then compare then increment;
  the field alone offers no concurrency protection. Appointment commands use reservation
  version. Revision moderation commands use listing version.
- `Idempotency-Key` is a UUID scoped to actor + operation. Hash canonical validated input
  **and path IDs**. Claim/check `command_receipts` and commit it with domain writes.
  Concurrent same-key calls serialize; a different payload returns 409. Replay returns
  the original resource's **current** representation, not a historical response body.
  Do not return another actor's result. Challenge issuance uses versioning/rate limits
  instead: never persist plaintext codes in a receipt. A lost response requires a new
  rate-limited reissue that invalidates the prior code.
- Planned errors use `application/problem+json` and `ApiProblem`, including stable `code`
  plus field violations without rejected values. 400 validation, 401 no session, 403
  forbidden/CSRF, 404 missing/concealed resource, 409 conflict, 429 rate limit. The common
  handler is future implementation; current security filters may send empty errors.
  Map only known constraint violations to 409; do not expose SQL/server details.
- Media upload is multipart; return opaque IDs and reference them in commands. Validate
  content on the server. Restricted downloads require per-case/trade/verification checks
  and `Cache-Control: no-store`; owner IDs or known UUIDs are not sufficient authority.
  Public listing photos must never reuse STUDENT_CARD/HANDOVER/REPORT assets.

## Dangerous decisions and practical workarounds

| Risk | Workaround now | Decision still needed |
| --- | --- | --- |
| Shared-item double sale | One physical item row; composite ownership FKs; unique live/sold allocation; all combo items in one transaction | Review locking protocol with M1/M2/M3/M4/M5 |
| Editing changes an accepted deal | New immutable revision/snapshots; C38 hides on submission and forbids held/sold inventory edits | A14 historical display, rejected edits and admin trade-review workflow |
| Hidden/unavailable listing reopened or counted incorrectly | C38 public temporary shortage counts, sold shortage archives; reopening checks publication/permissions/quota | A14 exact archival/transaction mapping and A10 renewal details |
| Approved policy confused with implemented behavior | No barter/campaign implementation, invented sanction values, reservation expiry or invented cancellation-code limits | Actual services/contracts plus remaining A01/A06/A07/A08/A09/A10/A12/A13/A14 details |
| Private evidence exposed through generic images | Purpose + owner composite FKs and separate storage roots; endpoint stays protected | A06/A12 supported evidence/access/retention |
| Registration exceptions silently excluded | C28/C37 admin-reviewed alternative documents, one account per person; no automatic activation | A01/A13 approved sources/exception verification; registration OTP storage/lifecycle |
| Buyer silence treated as payment/success | 24h admin-review deadline distinct from 10-minute code; held items remain held | Admin authority/evidence procedure under A06/A08 |
| Pending/rejected rating receives +1 | One outcome per trade; C34 edits preserve original deadline, public display only after acceptance | A07 appeal origin and revised-rating point semantics; versioned edit/appeal contracts |

Deferred **contracts/tables**, to add with their owning slice: registration OTP and
student verification cases, account restrictions/appeals/canonical violation events,
post-handover mutual/admin cancellation, report sanctions, search events/report
aggregates, annual cycles and renewal scheduling. In particular, M5 must not repurpose
`moderation_decisions.decision` as arbitrary executable penalty instructions. It stores
audit text only; no report-penalty ledger kind is enabled. A future sanction slice needs
one canonical incident event, unique effect/restriction keys and explicit authority.

## Verification and next migration

Run the root README command with JDK 21 and Docker:

```powershell
.\backend\mvnw.cmd -f backend/pom.xml --batch-mode --no-transfer-progress verify
```

It runs DTO/wire contract checks, the existing security checks and PostgreSQL constraint
tests, including V1 -> V2 upgrade, migration rerun, competing holds, combo rollback,
four unrelated holds for one buyer, sold-item reuse, cross-owner links, evidence purpose,
snapshot protection, unique trades/rating effects and challenge constraints.
These are **foundation tests**, not proof of service-level authorization, quota locking,
deadlines, rating approval, code verification or completion/cancellation races. Add those
with each implementation. No business endpoint is claimed working by these tests.

V1 is unchanged. V2 is the new shared baseline; reserve later migration numbers through
M1 and add new migrations after merge. Avoid separately creating overlapping tables in
five feature branches. No real users/evidence or working credentials are seeded.

Verified locally on 28 September 2026 with Temurin 21.0.12.1 and Testcontainers PostgreSQL
17.11: the README `verify` command passed **18 tests, 0 failures/errors/skips** (5 existing
foundation/security, 4 DTO/contract, 9 schema tests). The complete 35-operation,
51-schema document also passed `openapi-spec-validator` 0.7.2, installed only under ignored
`backend/target` for this check; Python is not a backend build prerequisite. `git diff
--check` passed. These results do not cover any unimplemented business endpoint.

Technical references: [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0.html),
[PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html).
The schema guide explicitly separates database guarantees from application obligations.
