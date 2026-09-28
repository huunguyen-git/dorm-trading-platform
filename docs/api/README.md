# Shared backend contracts — team starting point

Baseline: requirements **v1.1, 28 September 2026**. This change initializes contracts,
Java DTOs and Flyway storage. It does **not** implement login or marketplace endpoints.
Only system status and actuator health are live. The OpenAPI operation extension
`x-implementation-status` distinguishes them; `x-policy-gates` records remaining decisions.

Read [OpenAPI](openapi.yaml), [schema/transaction guide](../architecture/shared-domain-schema.md)
and [requirements](../product/client-requirements.md) together. The user request is the
scope for this local foundation change; no GitHub issue was assigned or created.
OpenAPI and DTOs are implementation contracts for owner review, not new client approvals.

## Start work by owner

| Owner / reviewers | Ready work | Gate before enabling dependent behavior |
| --- | --- | --- |
| M1 identity and integration / M4 | Map members/roles, implement eligibility service and common errors; activation atomically grants 100 once | Session/CSRF login contract after ADR mobile scope check; A01/A13 exception routes and registration OTP parameters; do not reject unresolved user groups |
| M2 inventory/listings / M1 + M3 | Map inventory and revision tables, draft creation, DTO validation, listing photo adapter | A14 old revision display, unavailable listing quota classification and inventory editing; A11 GPS precision/search |
| M3 negotiation/reservations / M2 + M1 | Participant-only conversations, messages and price proposals; acceptance service against shared allocation constraints | Eligibility and publication services must be real before acceptance is enabled; A05 reminder frequency and A06 cancellation after handover remain open |
| M4 trades/ratings / M3 + M1 + M5 | Trade mapping, challenge verifier component, atomic completion design, buyer rating/deadline services | A06 rate limits and A12 evidence handling before handover/code endpoints; admin action authority before resolution endpoints |
| M5 moderation / M2 + M4 | Revision review queue, evidence metadata, report intake design, audit mapping, notification inbox | A08 numeric report sanctions/authority, A09 overlapping restrictions, A12 evidence permissions/retention and A15 reports |

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
| Editing changes an accepted deal | New listing revision; separate immutable accepted price/content/item snapshots | A14 display of old revision and editing shared inventory |
| Hidden/unavailable listing reopened or counted incorrectly | Separate publication, review and derived availability; explicit publication check on reopening | A14 unavailable-listing quota/display and held-listing removal |
| Permanent client rules accidentally invented | No barter/campaign tables, report penalty values, reservation expiry, cancellation-code roles or automatic renewal job | A05/A06/A08/A09/A10/A17 as applicable |
| Private evidence exposed through generic images | Purpose + owner composite FKs and separate storage roots; endpoint stays protected | A06/A12 supported evidence/access/retention |
| Registration exceptions silently excluded | Nullable student identifier and profile details in storage; no automatic activation | A01/A13 exception verification and registration OTP settings |
| Buyer silence treated as payment/success | 24h admin-review deadline distinct from 10-minute code; held items remain held | Admin authority/evidence procedure under A06/A08 |
| Pending/rejected rating receives +1 | One `rating_outcomes` row per trade chooses submission OR no-rating; unique ledger effect | A07 appeals/editing/display; negative effects require reviewed decision |

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
