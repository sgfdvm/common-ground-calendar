#!/usr/bin/env bash
# Re-pull Common Ground events and rebuild the .ics files.
# The site's calendar changes, so re-run this whenever you want a fresh snapshot.
#
# common-ground.ics is always the newest pull. A dated copy also lands in
# archive/, and the run prints what was added, dropped, or retitled since
# the previous pull.
set -euo pipefail
cd "$(dirname "$0")"

curl -fsS -H 'User-Agent: Mozilla/5.0' \
  'https://commongroundmeditation.org/api/calendar/events?timezone=America%2FChicago&limit=5000&offset=0' \
  -o events.json

node build-ics.js
