# Contributing

1. Pick a Ready issue: goal, FR/UC IDs, decision dependencies, acceptance, owner and human reviewer.
2. Update main and create feat/<issue>-<topic>, fix/... or docs/... . Keep one bounded task per PR. No permanent member branches.
3. Read AGENTS.md and relevant brief/ADR/use case. Agree shared API/schema changes with affected owners before implementations diverge.
4. Preserve unrelated edits. Add migrations; do not edit a merged migration. Use Conventional Commits such as feat:, fix:, docs:, test:.
5. Run actual README checks once the scaffold exists. Check a negative/boundary case. Update contracts/diagrams when behavior changes.
6. Use the PR template; include actual results, limitations, AI assistance and your own verification. Human peer review is required; AI approval does not replace it.
7. A human integrator squash-merges after approval/checks. Refresh main and close the issue only when acceptance evidence is linked.

PowerShell, from this Git root:

```powershell
git status --short
git switch main
git pull --ff-only
git switch -c feat/12-reservation-acceptance
# Implement, inspect diff, run documented checks.
git diff --check
# Stage only reviewed files; use your actual issue number and file paths.
git add <reviewed-file>
git commit -m 'feat: implement reservation acceptance'
git push -u origin feat/12-reservation-acceptance
```

The angle-bracket path is a placeholder, not a command to paste unchanged. Commit or deliberately stash your own changes before switching; never discard another person's work. Update an open branch with git fetch origin then git merge origin/main if needed; resolve conflicts with the affected owner and rerun checks.

Definition of Done: acceptance met, meaningful checks pass, human review complete, contracts/OOAD artifacts current, limitations visible, author can explain the implementation. For docs-only work, validate links/consistency; do not claim app tests exist.

Changes to AGENTS.md or repository skills are reviewed like code. Do not commit credentials, personal AI profiles, private student records or screenshots of real complaints. The leader coordinates migration numbering and shared configuration; this is responsibility, not exclusive editing ownership.
