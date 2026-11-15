#!/usr/bin/env bash
# Runs project checks. Exits non-zero if there is any error.
set -euo pipefail

echo "== Whitespace / conflict-marker check =="
# Compare against the empty tree so every tracked file is checked.
git diff --check "$(git hash-object -t tree /dev/null)" HEAD

for dir in . frontend; do
  if [ -f "$dir/package.json" ]; then
    echo "== Node project detected in $dir =="
    (cd "$dir" && npm ci && npm run --if-present lint && npm run --if-present build && npm test --if-present)
  fi
done

if [ -d backend ]; then
  echo "== .NET backend detected =="
  for proj in backend/*/*.csproj; do
    dotnet build "$proj" --nologo -warnaserror
  done
  for proj in backend/*/*.Tests.csproj; do
    if [ -f "$proj" ]; then dotnet test "$proj" --nologo; fi
  done
fi

if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
  echo "== Python project detected =="
  [ -f requirements.txt ] && pip install -r requirements.txt
  if command -v pytest >/dev/null 2>&1; then pytest; fi
fi

echo "All checks passed: 0 errors."
