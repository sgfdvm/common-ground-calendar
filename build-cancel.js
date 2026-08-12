// Builds cancellation .ics files that remove previously-imported Common Ground
// events from a Google Calendar. Google matches on UID and applies
// STATUS:CANCELLED, which removes the event. Nothing else on the calendar is
// touched, because only these exact UIDs appear in the file.
const fs = require('fs');

const DIR = __dirname;
const events = JSON.parse(fs.readFileSync(DIR + '/events.json', 'utf8')).flatMap((g) => g.events);

// Same 5 events on 2026-08-11 used for the dry run, so the result is easy to verify.
const TEST_UIDS = [
  '3H02UXUnWlNp1iQej4bQNt',
  'tOaQq1MN8hBFHNJM7ELo4v',
  '3H02UXUnWlNp1iQeilsw4w',
  '8E8yGfrHiDo4Xg4tYuycG6',
  '3H02UXUnWlNp1iQejHLpDU',
];

const esc = (s) =>
  String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function fold(line) {
  const b = Buffer.from(line, 'utf8');
  if (b.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 75;
  while (start < b.length) {
    let end = Math.min(start + limit, b.length);
    while (end > start && end < b.length && (b[end] & 0xc0) === 0x80) end--;
    out.push((start === 0 ? '' : ' ') + b.slice(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return out.join('\r\n');
}

const dt = (d, t) => `${d.replace(/-/g, '')}T${t.replace(':', '')}00`;
const stamp = new Date(fs.statSync(DIR + '/events.json').mtime)
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d{3}/, '');

const HEADER = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Common Ground Cleanup//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VTIMEZONE',
  'TZID:America/Chicago',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0500',
  'TZNAME:CDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0600',
  'TZNAME:CST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function veventCancel(e) {
  const title = (e.title || e.eventTemplate?.title || 'Common Ground Event').trim();
  return [
    'BEGIN:VEVENT',
    `UID:${e._id}@commongroundmeditation.org`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Chicago:${dt(e.startDate, e.startTime)}`,
    `DTEND;TZID=America/Chicago:${dt(e.endDate, e.endTime)}`,
    `SUMMARY:${esc(title)}`,
    'SEQUENCE:2', // must exceed the imported events' SEQUENCE for the update to win
    'STATUS:CANCELLED',
    'END:VEVENT',
  ];
}

function write(file, list) {
  const all = [...HEADER, ...list.flatMap(veventCancel), 'END:VCALENDAR'];
  fs.writeFileSync(file, all.map(fold).join('\r\n') + '\r\n', 'utf8');
  console.log(
    `${file.split('/').pop().padEnd(22)} ${String(list.length).padStart(4)} events  ${(fs.statSync(file).size / 1024).toFixed(0)}KB`
  );
}

const testSet = TEST_UIDS.map((u) => events.find((e) => e._id === u));
if (testSet.some((e) => !e)) throw new Error('test UID not found in events.json');

write(DIR + '/cancel-test.ics', testSet);
write(DIR + '/cancel-all.ics', events);
write(DIR + '/cancel-rest.ics', events.filter((e) => !TEST_UIDS.includes(e._id)));
