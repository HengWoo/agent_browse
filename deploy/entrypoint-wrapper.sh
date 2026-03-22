#!/bin/sh
# Patch Steel's default extensions to include agent-browse
# The defaultExtensions array is hardcoded in cdp.service.js
sed -i 's/\["recorder"\]/["recorder","agent-browse"]/' /app/api/build/services/cdp/cdp.service.js
exec /app/api/entrypoint.sh "$@"
