#!/bin/sh
# Wraps app/unbroken.html in a full HTML document so it opens in any browser.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
{
  printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  printf '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}[hidden]{display:none!important}</style>\n'
  printf '</head><body>\n'
  cat app/unbroken.html
  printf '\n</body></html>\n'
} > dist/index.html
echo "Wrote dist/index.html"
