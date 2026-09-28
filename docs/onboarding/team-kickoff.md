# Team kickoff and task distribution

> **Đồng bộ 28/09/2026:** Đọc [đặc tả v1.1](../product/client-requirements.md) trước khi nhận việc. Kho cá nhân liên kết đồ vật với nhiều tin; bỏ hạn mức giữ chỗ người mua, giữ hạn mức công khai tin người bán. FR-14/A16 và UC-12/B16 đã loại; không tự hết hạn giữ chỗ. Bảng phạt báo cáo và đổi đồ chưa duyệt; không hỏi lại các quyết định đã chốt.

## Leader: next steps after the setup branch is published

1. Invite the other four GitHub accounts and confirm names/handles below. The display names come from the earlier team brief; handles are still unknown.
2. Open a PR from chore/repository-setup-backend-init into main. Ask M2 to review the startup instructions and M3 to inspect the database/test setup. Merge only after backend-checks passes and one human approves.
3. Set main protection: require PR, human approval, resolved conversations and backend-checks (select the actual check after its first run). Block force pushes/deletion where your plan allows.
4. Before merge, teammates may clone and inspect the setup branch. After merge, everyone branches from updated main. Avoid starting five feature branches from an unmerged moving foundation.
5. Confirm weekly availability and final lecturer deadline, then turn only current-scope tasks below into GitHub issues with owner/reviewer and milestone. Do not create UC-12/B16 campaign work. Suggested labels are identifiers, not existing issue numbers.
6. Run a 60-minute kickoff: 15 minutes setup, 20 minutes business questions, 15 minutes responsibilities/contracts, 10 minutes next demo. Track unanswered A decisions in client requirements.

## First-week assignments

D1 means the first working day after foundation merge. Each member owns documentation, API, UI and tests for their domain over the project; the first week starts with contracts and backend groundwork. These are assignments proposed for your confirmation, not messages sent to teammates.

| Task | Owner | First deliverable and completion evidence | Depends on / blocked policy | Reviewer | Due |
| --- | --- | --- | --- | --- | --- |
| SET-01 Foundation and onboarding | M1 Hữu Nguyên (leader) | Merge reviewed setup, record five successful local builds, create issues/board | Published branch and CI | M2 | D1-D2 |
| ID-01 Identity specification | M1 | UC-01/02, email OTP plus protected student-card/admin approval, account/role and activation contracts | A01/A13 exceptions/source checks remain open; no invented SSO | M4 | D3 |
| LIST-01 Inventory/listing/category specification | M2 Hoàng Nguyên | UC-03/05, item-to-listing links, whole combos, publication/edit states and snapshots; 5/10 cap below/from 120 | A02/A03/A19 approved; A11/A14 details remain; target-listing edit guard, not shared-item edit ban | M1 | D3 |
| NEG-01 Negotiation/hold specification | M3 Quốc Nguyên | UC-06/07, seller acceptance locks listing and all shared items atomically; agree deterministic locking and all-or-nothing combo tests | A04/A05, M1 eligibility, M2 inventory; no buyer hold quota; reminder schedule open; contracts before tables | M2 + M1 | D3 |
| TRADE-01 Handover/rating specification | M4 Thành Nguyên | UC-08/09, protected handover photo, 10-minute/five-failure code, 24h admin escalation; buyer-only ratings, negative review and exclusive 15-day no-rating +1 | A06/A07 remaining details; admin completion needs evidence, no silence auto-success | M3 + M1 for ledger; M5 admin | D3 |
| MOD-01 Moderation/reporting specification | M5 Việt | UC-04/10, revised-content review, negative-rating/admin handover queues, restrictions, evidence authorization and audit | A08 amounts/authority deferred, including no-show; no repeat-offense premium; A09/A12/A15 details remain; no penalty on report submission or reban from old score | M4 + M1 | D3 |
| UI-01 Shared frontend scaffold | M2 + M4 pair, M2 accountable | React/Vite shell, status API call through proxy, unit/build check; instructions for all members | ADR versions + backend foundation; use fixture UI, not invented login | M3 | D4-D5 |
| ID-02 First identity implementation slice | M1 | Agreed registration/activation slice with authorization/negative tests and migration | ID-01 approved + A01/A13 decisions | M4 | D5 or mark blocked |
| LIST-02 First listing implementation slice | M2 | Listing submission/validation using approved contract, tests and migration | LIST-01 + member interface; combine with UI work only if capacity permits | M1 | Start D5 |
| NEG-02 Persisted conversation slice | M3 | Participant-only conversation/message API with access tests | NEG-01 + agreed identity/listing interfaces | M2 | Start D4 |
| TRADE-02 Completion contract tests/design | M4 | Concrete accepted/rejected/replayed-code scenarios; API fixture for future UI | TRADE-01 + A06; implementation waits for real reservation contract | M3 | D5 |
| MOD-02 Listing review slice | M5 | Approval/rejection service and tests against the shared listing contract | MOD-01 + LIST-01 + agreed permissions; quota decision before publication policy | M2 | Start D4 |

One person should normally have one active implementation issue. If UI-01 consumes M2's capacity, defer LIST-02 rather than pretending both are completed. API fixtures are not delivered end-to-end features; replace them before milestone acceptance. M1 coordinates migration numbers to prevent duplicate versions.

The [shared backend contract handoff](../api/README.md) now provides planned OpenAPI routes,
Java DTOs, the V2 schema, owner-specific starting slices and remaining policy gates.
All five owners should review this baseline together before creating overlapping migrations.
Business endpoints are still unimplemented; use the handoff's database/service distinction
when interpreting the passing foundation tests.

## Continuing ownership

| Owner | Main domain | Scheduled work | Must coordinate with |
| --- | --- | --- | --- |
| M1 | Identity, permissions, reputation ledger; integration lead | Annual account review | M4 ratings, M5 sanctions |
| M2 | Personal inventory/shared items, listings, category tree, images, search and whole combos | Listing renewal | M3 holds, M5 moderation/evidence |
| M3 | Chat, price proposals, reservations and appointments | Reservation reminders, never automatic hold expiry | M1 eligibility, M2 item availability, M4 completion |
| M4 | Handover confirmation/admin resolution, history, buyer ratings; test evidence | Code expiry, 24h escalation and 15-day no-rating award | M3 races, M1 ledger, M5 admin review |
| M5 | Moderation, complaints and reports | Notification/job coordination, not every domain job | M1 restrictions, M2 publication |

Do not assign all frontend to one person or all background jobs to M5. Follow the eight-week milestones in ../planning/development-plan.md. Required core flow: activated member -> moderated listing -> proposal -> accepted hold -> confirmed handover -> rating; reports/sanctions and lifecycle tasks build on that.

## Message to send to the team (Vietnamese)

Copy/edit this after the branch is available. This message has not been sent automatically.

> Chào mọi người, mình đã chuẩn bị repository chung và backend nền tảng cho đồ án.
> Repository: https://github.com/huunguyen-git/dorm-trading-platform
> Nhánh setup: chore/repository-setup-backend-init. Hiện backend có kết nối PostgreSQL, migration dữ liệu danh mục, API kiểm tra và test; chưa có đăng nhập hay nghiệp vụ mua bán.
>
> Mọi người đọc README trước, cài JDK 21 và Docker Desktop, rồi chạy theo hướng dẫn. Trước khi nhánh setup được review/merge thì chỉ kiểm tra setup; sau khi merge, tạo nhánh công việc riêng từ main mới nhất.
>
> Tài liệu yêu cầu ở docs/product/client-requirements.md, công nghệ ở docs/architecture/ADR-001-stack.md, phân công ở docs/onboarding/team-kickoff.md. Các câu hỏi nghiệp vụ đang OPEN không được để AI tự quyết định.
>
> Khi dùng AI, mở đúng thư mục repository và yêu cầu đọc AGENTS.md. Mỗi task cần mã yêu cầu/use case, phạm vi rõ, test và một bạn khác review. Không đưa mật khẩu hoặc dữ liệu sinh viên thật lên Git/AI.
>
> Mỗi bạn phản hồi GitHub username, thời gian rảnh trong tuần và kết quả chạy setup (thành công hoặc lỗi cụ thể). Buổi kickoff sẽ chốt phân công, API dùng chung và các câu hỏi gửi giảng viên. Mục tiêu đầu tiên là cả 5 máy chạy được cùng một backend, rồi mới chia phần code.
