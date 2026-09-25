---
name: ooad-use-case
description: Draft or review detailed OOAD use cases for the dorm trading project, tracing FR and A decision IDs to actor flows, state changes and acceptance cases. Use for use-case specifications or consistency reviews, not generic coding or unrelated documents.
---

# OOAD use-case workflow

Locate the Git root. Read the requested FR rows and relevant A rows in docs/product/brief.md,
the UC inventory in docs/planning/development-plan.md, and any recorded decisions affecting
this use case. Read only related existing diagrams/API contracts, if present.

Keep the planning document's UC identifiers. If a new use case is needed, explain why and
update the inventory instead of silently renumbering existing work.

For drafting, write docs/use-cases/UC-NN-short-name.md unless the user specifies another
location. Include purpose, actors, trigger, preconditions, numbered actor/system main flow,
alternatives tied to main-flow steps, failure guarantees, success postconditions, FR/A
references and observable acceptance cases. Label the result draft when policy is unresolved.

Treat buyer and seller as roles of Member. Distinguish analysis concepts from implementation
classes. In analysis flows, describe system behavior rather than controllers/repositories.
If a design sequence is requested, identify transaction boundaries and participating services
separately. Use Mermaid by default; state guards must agree with the written flow.

An OPEN A-row is not permission to invent a policy. Preserve the undecided branch, identify
its impact and show options only when useful. Do not supply unapproved quota tiers,
rating deltas, eligibility rules or automatic completion fallbacks. Independent approved
flows can still be specified.

Check role permissions, before/after state, rollback on failure and repeat-request behavior.
For reservation/completion use cases, also consider competing requests, per-buyer quota,
effective expiry and hidden listings. Read current rules rather than duplicating constants
inside this skill.

For a review request, report actionable inconsistencies with file/section references and
the violated FR/A decision; do not rewrite files unless requested. Explicitly distinguish
an actual contradiction from a missing client decision.

Finish with the artifact/change summary, traceability, unresolved decisions and what was
checked. Never claim client approval, executed application tests or diagram rendering that
did not occur.
