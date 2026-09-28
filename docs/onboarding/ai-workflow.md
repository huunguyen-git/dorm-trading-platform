# Shared AI workflow

## Instructions

Root [AGENTS.md](../../AGENTS.md) adapts the [official instruction pattern](https://learn.chatgpt.com/docs/agent-configuration/agents-md) to our project. Generic public-project rules cannot describe our requirements or current commands. Keep one root file; add nested instructions only for real directory differences. Requirements live in [client requirements](../product/client-requirements.md); versions in the ADR.

Open this repository as the AI/editor project. Codex combines global and project guidance; overrides can supersede earlier instructions. Verify discovery on the next turn and reopen/restart if needed. Other assistants may need files loaded explicitly. [Official skill discovery guidance](https://learn.chatgpt.com/docs/build-skills).

Ask: “List the instruction files and repository skills you actually loaded, selected stack, implementation status and relevant unresolved decisions. Do not edit files.” Expected today: backend foundation with documented Maven verification; frontend and business features are pending.

## Required briefing at the start of a task

Root [AGENTS.md](../../AGENTS.md#task-start-problem-briefing) requires the agent to inspect
the task's sources and raise relevant existing problems **before implementation edits**.
This is proactive behavior for every new assignment, even when the member does not ask
about risks. An initial “I will inspect the repository” message is not the problem briefing.

The agent checks current requirements/decision IDs, the assigned issue or user task,
the [owner/dependency guide](../api/README.md), affected OpenAPI `x-policy-gates` and actual
implementation, plus schema/transaction guidance where relevant. Its first substantive
update should explain:

- Which open decision, contradiction, missing implementation dependency or setup problem
  affects this task, with the ID and source.
- What part of the requested behavior is affected, what can proceed now, and what must wait.
- A safe workaround or narrower starting slice, and the documented decision owner/reviewer.

For example, a listing-edit task should surface A14's unresolved old-revision visibility
before choosing what users will see. It should also preserve the already approved rule:
a hold on a different listing sharing the item does not itself prohibit this edit.
The agent can work on independent revision storage/validation while the display decision
remains open. It must not ask whether to reapprove the settled rule or list every unrelated
question in the project.

When no relevant blocker is found, the agent says so for the sources it checked and
states its scope/checks. New findings are raised as soon as discovered, not saved for
the final answer. A briefing does not require stopping all work or requesting blanket
permission; only a genuinely blocking missing decision needs a focused question.
Follow-up messages on the same task do not require repeating unchanged warnings.

Members should check this behavior on their first real task. If their assistant has not
loaded the repository guidance, explicitly include `Read AGENTS.md` in the prompt. These
shared instructions establish expected behavior; they are not a technical guarantee that
every AI/editor configuration will load or follow them.

## Available-first skill selection

The curated OpenAI catalog was inspected first. One existing skill fits our generic CI workflow; one OOAD-specific gap needs a custom skill. Both live in .agents/skills so teammates receive them with the repository.

| Skill | Origin | Use | Prerequisites |
| --- | --- | --- | --- |
| gh-fix-ci | Unmodified OpenAI curated skill | Investigate failing GitHub Actions PR checks | Individual GitHub CLI authentication, Python helper, real PR/checks |
| ooad-use-case | Custom project skill | Draft/review UC specifications against FR/A IDs | Current client requirements, UC inventory and relevant approved decisions |

Upstream pin: [openai/skills revision 49f948faa9258a0c61caceaf225e179651397431](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-fix-ci). License and bundled resources are retained. Updates require a reviewed PR against a named revision. The upstream CI skill includes a plan/approval checkpoint before fixes; explicitly authorize the intended implementation scope when invoking it. Existing user authorization takes precedence over skill defaults.

Custom OOAD rationale: no inspected curated workflow supports our FR/UC numbering, OPEN-policy handling and analysis/design distinctions. The Notion specification skill depends on another service/workflow. This small instruction-only skill fills that gap; it has no connectors or publishing action.

Not installed: curated Playwright focuses on interactive CLI browser automation, with a Bash/user-path wrapper, rather than this project's test suite. Use normal Playwright test code for E2E. ASP.NET skills do not match Spring; no custom plugin or collection of generic role skills is needed.

## Usage

- “Use $ooad-use-case to draft UC-07 from FR-08; keep OPEN questions unresolved and show their impact.”
- “Use $ooad-use-case to review UC-08 against client requirements; report contradictions without editing.”
- Once CI exists: “Use $gh-fix-ci to investigate PR 12 and propose a fix.” Add explicit fix scope when implementation is intended.

Skills should be available on the next turn with this repository as the working project; each member verifies discovery. Repository skills do not distribute private credentials or installed personal plugins. Keep personal configuration outside Git. Different assistants must read the same shared docs even if their instruction-loading mechanism differs.

## Bounded feature prompt

```text
Read AGENTS.md and the relevant client requirements, approved decision, UC and API contract.
Task: issue #..., FR-..., UC-.... Scope: ... Acceptance: ... Dependencies: ...
Before implementation edits, inspect existing code and give me the task-start problem
briefing required by AGENTS.md. Include relevant decision IDs/sources, impact, work that
can proceed, blocked steps and safe workarounds. If none are found, say so for the sources
checked. Continue independent work; do not invent policy or reopen approved decisions.
Implement the bounded change using the ADR stack; preserve unrelated edits. Raise newly
discovered relevant problems immediately. Run actual documented checks.
Report behavior, files, commands/results, limitations and affected OOAD artifacts.
Explain authorization/state/transaction choices. Do not merge or publish.
```

Human authors inspect and understand the diff; human peers review behavior and evidence. Skills guide work; tests, database constraints and GitHub rules enforce correctness. AI output does not settle client policy or prove a check passed.
