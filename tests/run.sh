#!/bin/sh
# Runs Motif's tests. Logic and screen tests always run; server tests run only when Supabase settings are in the environment.
# Needs Node 22+ and Playwright with Chromium (npm i -g playwright && npx playwright install chromium).
cd "$(dirname "$0")/.." || exit 1
export NODE_PATH="${NODE_PATH:-$(npm root -g)}" NODE_USE_ENV_PROXY=1
node --test --test-concurrency=1 tests/unit.test.cjs tests/ui.test.cjs tests/server.test.cjs
