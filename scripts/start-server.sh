#!/bin/sh
# Start the TokenDashboard server (used by hand; the Cordis host half also
# tries to bootstrap it automatically).
# Optional: set TOKEN_DASHBOARD_HOME to the repo/plugin checkout path.
ROOT="${TOKEN_DASHBOARD_HOME:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
exec node "$ROOT/server.mjs"
