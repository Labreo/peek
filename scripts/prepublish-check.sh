#!/usr/bin/env bash
# Run before making the repo public or publishing the DEV post.
#   bash scripts/prepublish-check.sh        full check (also typecheck + tests)
#   bash scripts/prepublish-check.sh --ci   CI mode (no .env, no network, no tests: CI runs them)
# Exits 1 on a blocker. Warnings are things to finish before submitting.
set -uo pipefail
cd "$(dirname "$0")/.."
CI_MODE=0; [[ "${1:-}" == "--ci" ]] && CI_MODE=1
fail=0; warn=0
block() { echo "  BLOCKER: $*"; fail=1; }
note()  { echo "  warning: $*"; warn=1; }
ok()    { echo "  ok: $*"; }

echo "Secrets"
if git ls-files --error-unmatch .env >/dev/null 2>&1; then block ".env is tracked by git"; else ok ".env not tracked"; fi
if [[ -f .env && $CI_MODE == 0 ]]; then
  key=$(grep -E '^PRESAGE_API_KEY=' .env | cut -d= -f2- | tr -d '"'"'"' ')
  if [[ -n "$key" ]]; then
    hit=0
    for c in $(git rev-list --all); do git grep -qF "$key" "$c" -- 2>/dev/null && { hit=1; break; }; done
    git grep -qF "$key" -- . 2>/dev/null && hit=1
    [[ $hit == 1 ]] && block "your Presage key appears in the repo or its history" || ok "Presage key not in tree or history"
  fi
fi
pat='(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]+|-----BEGIN [A-Z ]*PRIVATE KEY)'
if git grep -nE "$pat" -- . ':!package-lock.json' >/dev/null 2>&1; then block "something that looks like a secret is tracked:"; git grep -nE "$pat" -- . ':!package-lock.json' | cut -c1-120; else ok "no common secret patterns"; fi

echo "Required files"
for f in README.md LICENSE CREDITS.md SECURITY.md .env.example replays/sample-run.jsonl; do [[ -f $f ]] && ok "$f" || block "missing $f"; done
grep -qE '^PRESAGE_API_KEY=$' .env.example && ok ".env.example has no value" || block ".env.example must be PRESAGE_API_KEY= with no value"

echo "Claims and style (user-facing text)"
facing=(README.md CREDITS.md docs/dev-post.md docs/demo-video.md src/renderer/index.html src/renderer/screens)
words='diagnos|medical|clinical|blood pressure|apnea|anxiety|stress disorder|health score|heart condition|treatment'
if grep -rniE "$words" "${facing[@]}" >/dev/null 2>&1; then block "health-claim words found:"; grep -rniE "$words" "${facing[@]}" | cut -c1-140; else ok "no health-claim words"; fi
if grep -rn $'\xe2\x80\x94' "${facing[@]}" >/dev/null 2>&1; then block "em dashes found:"; grep -rn $'\xe2\x80\x94' "${facing[@]}" | cut -c1-120; else ok "no em dashes"; fi

echo "Submission readiness"
if [[ -f docs/dev-post.md ]]; then
todo=$(grep -c "TODO" docs/dev-post.md 2>/dev/null || echo 0)
[[ "$todo" -gt 0 ]] && note "docs/dev-post.md still has $todo TODOs" || ok "post draft has no TODOs"
grep -q '"source":"synthetic"' replays/sample-run.jsonl && note "replays/sample-run.jsonl is the synthetic bot run; replace it with a real recording" || ok "sample run is a real recording"
heads=("## What I Built" "## Demo" "## Code" "## How It Responds to Human Signals" "## Prize Categories" "## Consent and Data Handling" "## Agent Session")
prev=0; for h in "${heads[@]}"; do n=$(grep -nF "$h" docs/dev-post.md | head -1 | cut -d: -f1); if [[ -z "$n" || "$n" -le "$prev" ]]; then block "post heading missing or out of order: $h"; else prev=$n; fi; done
[[ $prev -gt 0 ]] && ok "post headings present and in template order"
grep -q "presagechallenge" docs/dev-post.md && grep -q "devchallenge" docs/dev-post.md && ok "post tags" || block "post needs #presagechallenge and #devchallenge tags"
else ok "post draft is kept outside the repo"; fi
big=$(git ls-files | xargs -I{} sh -c 'test -f "{}" && [ $(wc -c < "{}") -gt 5000000 ] && echo "{}"' 2>/dev/null)
[[ -n "$big" ]] && note "large tracked files: $big" || ok "no tracked file over 5 MB"

if [[ $CI_MODE == 0 ]]; then
  echo "Build and tests"
  npm run -s typecheck >/dev/null 2>&1 && ok "typecheck" || block "typecheck fails"
  npx vitest run >/dev/null 2>&1 && ok "tests" || block "tests fail"
  if command -v gh >/dev/null && gh repo view --json visibility -q .visibility >/dev/null 2>&1; then
    vis=$(gh repo view --json visibility -q .visibility)
    [[ "$vis" == "PUBLIC" ]] && ok "repo is public" || note "repo is $vis; make it public before submitting"
  fi
fi

echo
if [[ $fail == 1 ]]; then echo "RESULT: blockers found"; exit 1; fi
[[ $warn == 1 ]] && echo "RESULT: no blockers; finish the warnings before submitting" || echo "RESULT: ready"
exit 0
