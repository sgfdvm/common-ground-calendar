# Common Ground calendar feed

An auto-updating iCalendar feed of events from
[Common Ground Meditation Center](https://commongroundmeditation.org/calendar),
which doesn't publish one of its own.

A GitHub Actions job pulls the site's calendar API daily, regenerates
`common-ground.ics`, and commits it only when something changed. Google Calendar
subscribes to the raw file and refreshes on its own schedule.

## Subscribe

Google Calendar → **Other calendars → + → From URL**, and paste:

```
https://sgfdvm.github.io/common-ground-calendar/common-ground.ics
```

Served via GitHub Pages with `Content-Type: text/calendar`. The raw file also works
if Pages is ever unavailable, though it is served as `text/plain`:
`https://raw.githubusercontent.com/sgfdvm/common-ground-calendar/main/common-ground.ics`

Google polls subscribed calendars on its own cadence — usually every 8–24 hours.
There's no way to force a refresh; the tradeoff is that it never needs a manual import.

## What's in each event

Titles carry the format flag, since a subscribed calendar can only be coloured as a
whole:

| Flag | Meaning |
|------|---------|
| 📍 | In person |
| 💻 | Online |
| 📍💻 | Both |

Each event also carries the venue address (or `Online (Zoom)`) in its location
field, and the teacher, program, Zoom link and a link back to the event page in
its description. Everything is marked **free** rather than busy, so a few sits a
day don't make you look booked.

## Running it locally

```sh
./refresh.sh
```

Pulls fresh data and rebuilds. Prints what was added, dropped or retitled since
the last run, and keeps a dated copy under `archive/`. Set `FEED_ONLY=1` to skip
the archive and the split files (this is what CI does).

`build-cancel.js` generates a file that *removes* previously imported events by
UID — only needed if you've manually imported into a calendar and want to undo it.
Subscribed calendars don't need it, since they replace their contents wholesale.

## Notes

- `events.json` is the raw API dump (~7.5MB) and is gitignored.
- GitHub disables scheduled workflows after 60 days of repository inactivity. It
  emails first, and the Actions tab has a one-click re-enable.
