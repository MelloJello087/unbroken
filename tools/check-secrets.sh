#!/bin/sh
# Blocks passwords, keys, tokens and codes from being committed or pushed.
# Usage: tools/check-secrets.sh            scan every tracked file (used on GitHub)
#        tools/check-secrets.sh --staged   scan what is about to be committed (used by the pre-commit hook)
cd "$(dirname "$0")/.." || exit 2
SELF="tools/check-secrets.sh"
BAD_NAMES='(^|/)(\.env(\..*)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|id_rsa.*|id_ed25519.*|.*secret.*\.json|credentials.*|service-account.*\.json)$'
PATTERNS='-----BEGIN [A-Z ]*PRIVATE KEY-----
eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}
sb_secret_[A-Za-z0-9_-]{10,}
service_role
(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}
github_pat_[A-Za-z0-9_]{20,}
(sk|rk)_(live|test)_[A-Za-z0-9]{10,}
AKIA[0-9A-Z]{16}
AIza[0-9A-Za-z_-]{35}
xox[abprs]-[A-Za-z0-9-]{10,}
[a-z]+://[^/:@[:space:]]+:[^@/[:space:]]{3,}@
(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|otp|verification[_-]?code)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'[:space:]]{4,}["'"'"']'
if [ "$1" = "--staged" ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACMR)
  show() { git show ":$1" 2>/dev/null; }
else
  FILES=$(git ls-files)
  show() { cat "$1" 2>/dev/null; }
fi
found=0
for f in $FILES; do
  [ "$f" = "$SELF" ] && continue
  if echo "$f" | grep -Eiq "$BAD_NAMES"; then
    echo "BLOCKED: $f looks like a secrets file. Secrets never go in this repository."; found=1; continue
  fi
  hits=$(show "$f" | grep -EnI -i -e "$PATTERNS" | cut -c1-12)
  if [ -n "$hits" ]; then
    for line in $(echo "$hits" | cut -d: -f1); do echo "BLOCKED: $f line $line looks like a password, key, token or code."; done
    found=1
  fi
done
if [ $found -ne 0 ]; then
  echo
  echo "Nothing was committed. Remove the secret and keep it in a private place instead"
  echo "(an environment variable or the service's own secret settings). See CLAUDE.md."
  exit 1
fi
echo "Secret check passed."
