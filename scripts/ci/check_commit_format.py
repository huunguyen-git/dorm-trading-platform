#!/usr/bin/env python3
"""Validate commit messages against conventional commits format with task code.

Expected format:
  type(scope): <TASK-ID> <description>
  or standard Git merge/revert messages.

Examples:
  ci(workflow): P0-04 configure branch protection gate
  docs(agents): P0-05 guide users through review and handoff
  chore: clear repository keeping only .gitignore and LICENSE
"""
from __future__ import annotations

import re
import subprocess
import sys

# Allowed commit types
ALLOWED_TYPES = {
    "feat", "fix", "docs", "style", "refactor",
    "perf", "test", "build", "ci", "chore", "revert"
}

# Regex pattern for conventional commits with optional task code
# Allows:
# 1. type(scope): TASK-ID description
# 2. type(scope): description
# 3. type: description
COMMIT_PATTERN = re.compile(
    r"^(?P<type>[a-z]+)(\((?P<scope>[a-z0-9\-_\/]+)\))?!?: (?P<subject>.+)$"
)

MERGE_REVERT_PATTERN = re.compile(
    r"^(Merge |Revert )"
)


def validate_message(msg: str) -> tuple[bool, str]:
    subject = msg.strip().splitlines()[0] if msg.strip() else ""
    if not subject:
        return False, "Commit message is empty"

    if MERGE_REVERT_PATTERN.match(subject):
        return True, ""

    m = COMMIT_PATTERN.match(subject)
    if not m:
        return False, (
            f"Subject does not follow format 'type(scope): <task> <kết quả>'. Got: '{subject}'"
        )

    commit_type = m.group("type")
    if commit_type not in ALLOWED_TYPES:
        return False, (
            f"Invalid commit type '{commit_type}'. Allowed types: {', '.join(sorted(ALLOWED_TYPES))}"
        )

    return True, ""


def get_commits(revision_range: str | None) -> list[tuple[str, str]]:
    cmd = ["git", "log", "--format=%H %s"]
    if revision_range:
        cmd.append(revision_range)
    else:
        cmd.extend(["-1"])

    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    commits = []
    for line in res.stdout.strip().splitlines():
        if not line.strip():
            continue
        parts = line.split(" ", 1)
        sha = parts[0]
        subject = parts[1] if len(parts) > 1 else ""
        commits.append((sha, subject))
    return commits


def main() -> int:
    rev_range = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        commits = get_commits(rev_range)
    except subprocess.CalledProcessError as e:
        print(f"Error reading git commits for range '{rev_range}': {e.stderr}", file=sys.stderr)
        return 1

    if not commits:
        print("No commits found to validate.")
        return 0

    errors = []
    for sha, subject in commits:
        valid, reason = validate_message(subject)
        if not valid:
            errors.append(f"  - {sha[:8]}: {reason}")

    if errors:
        print("Commit message validation failed:\n" + "\n".join(errors), file=sys.stderr)
        print("\nExpected format: type(scope): <TASK-ID> <kết quả>", file=sys.stderr)
        print("Example: ci(workflow): P0-04 configure branch protection gate", file=sys.stderr)
        return 1

    print(f"Validated {len(commits)} commit(s) successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
