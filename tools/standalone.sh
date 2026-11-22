#!/bin/sh
# Wraps app/unbroken.html in a full HTML document so it opens in any browser.
# For the version with accounts, set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY first.
# They come from the environment (on GitHub, from encrypted Actions secrets) and are never stored in this repository.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
config=""
if [ -n "$SUPABASE_URL" ] || [ -n "$SUPABASE_PUBLISHABLE_KEY" ]; then
  case "$SUPABASE_URL" in https://*.supabase.co) ;; *) echo "SUPABASE_URL must look like https://xxxx.supabase.co" >&2; exit 1;; esac
  if ! printf '%s' "$SUPABASE_PUBLISHABLE_KEY" | grep -Eq '^[A-Za-z0-9_.-]{20,}$'; then echo "SUPABASE_PUBLISHABLE_KEY is missing or malformed" >&2; exit 1; fi
  config="<script>window.UNBROKEN_CONFIG={supabaseUrl:\"$SUPABASE_URL\",supabaseKey:\"$SUPABASE_PUBLISHABLE_KEY\"};</script>
<script src=\"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js\"></script>"
fi
{
  printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  printf '<meta name="theme-color" content="#0f1a12">\n'
  printf '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}[hidden]{display:none!important}</style>\n'
  [ -n "$config" ] && printf '%s\n' "$config"
  printf '</head><body>\n'
  cat app/unbroken.html
  printf '\n</body></html>\n'
} > dist/index.html
[ -n "$config" ] && echo "Wrote dist/index.html (with accounts)" || echo "Wrote dist/index.html (saves in this browser only)"
