const fs = require('fs');

const SRC = __dirname + '/events.json';
const OUT = __dirname + '/common-ground.ics';
const SITE = 'https://commongroundmeditation.org';

const VENUE = {
  cityCenter: 'Common Ground Meditation Center, 2700 E 26th St, Minneapolis, MN 55406',
  retreatCenter: 'Common Ground Retreat Center, near Prairie Farm, WI',
};

// --- helpers ---------------------------------------------------------------

// RFC 5545 text escaping: backslash, semicolon, comma, newline.
const esc = (s) =>
  String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

// Fold to 75 octets per line, continuation lines start with a single space.
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // don't split a multi-byte UTF-8 sequence
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((start === 0 ? '' : ' ') + bytes.slice(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join('\r\n');
}

// Flatten Sanity portable text to plain text.
function portableToText(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b) => b && b._type === 'block')
    .map((b) => (b.children || []).map((c) => c.text || '').join(''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const dt = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;

// Source data carries stray padding on names/titles, so trim before deduping.
const uniq = (a) => [...new Set(a.filter(Boolean).map((s) => String(s).trim()).filter(Boolean))];

// --- build -----------------------------------------------------------------

const days = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const events = days.flatMap((g) => g.events);

const stamp =
  new Date(fs.statSync(SRC).mtime).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const HEADER = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Common Ground Meditation Center//Calendar Export//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:Common Ground',
  'X-WR-CALDESC:Events from commongroundmeditation.org',
  'X-WR-TIMEZONE:America/Chicago',
  // VTIMEZONE so DST is resolved correctly by every client.
  'BEGIN:VTIMEZONE',
  'TZID:America/Chicago',
  'X-LIC-LOCATION:America/Chicago',
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

const stats = { total: 0, inPerson: 0, online: 0, both: 0, cancelled: 0, withZoom: 0 };
const vevents = []; // { startDate, lines }

for (const e of events) {
  const lines = [];
  const tpl = e.eventTemplate || {};
  const realm = e.realm || [];
  const isIn = realm.includes('in-person');
  const isOn = realm.includes('online');

  const flag = isIn && isOn ? '📍💻' : isIn ? '📍' : isOn ? '💻' : '';
  const formatLabel =
    isIn && isOn ? 'In person + Online' : isIn ? 'In person' : isOn ? 'Online' : 'Unspecified';

  if (isIn && isOn) stats.both++;
  else if (isIn) stats.inPerson++;
  else if (isOn) stats.online++;

  const rawTitle = (e.title || tpl.title || 'Common Ground Event').trim();
  const cancelled = Boolean(e.cancelled);
  if (cancelled) stats.cancelled++;

  const summary = `${flag ? flag + ' ' : ''}${cancelled ? 'CANCELLED — ' : ''}${rawTitle}`;

  // Venues can live on the instance or the template.
  const venues = uniq([...(e.venues || []), ...(tpl.venues || [])]);
  const venueNames = venues.map((v) => VENUE[v]).filter(Boolean);
  const location = venueNames.length ? venueNames.join(' / ') : isOn ? 'Online (Zoom)' : '';

  const teachers = uniq([
    ...(e.teachers || []).map((t) => t && t.name),
    ...(tpl.teachers || []).map((t) => t && t.name),
    ...(e.practiceLeaders || []).map((t) => t && t.name),
    ...(tpl.practiceLeaders || []).map((t) => t && t.name),
  ]);

  const programs = uniq((tpl.programs || []).map((p) => p && p.title));

  // Retreat-center events live under a different URL prefix.
  const slug = tpl.slug && tpl.slug.current;
  const prefix = venues.includes('retreatCenter') ? '/retreat-center/calendar/event/' : '/calendar/event/';
  const url = slug ? SITE + prefix + encodeURI(`${slug}-${e._id}`) : SITE + '/calendar';

  const body = portableToText(e.body);
  if (e.zoomLink) stats.withZoom++;

  const desc = [
    `Format: ${formatLabel}`,
    teachers.length ? `${teachers.length > 1 ? 'Teachers' : 'Teacher'}: ${teachers.join(', ')}` : null,
    programs.length ? `Program: ${programs.join(', ')}` : null,
    body ? `\n${body}` : null,
    e.zoomLink ? `\nZoom: ${e.zoomLink}` : null,
    `\nDetails: ${url}`,
  ]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n');

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${e._id}@commongroundmeditation.org`);
  lines.push(`DTSTAMP:${stamp}`);
  lines.push(`DTSTART;TZID=America/Chicago:${dt(e.startDate, e.startTime)}`);
  lines.push(`DTEND;TZID=America/Chicago:${dt(e.endDate, e.endTime)}`);
  lines.push(`SUMMARY:${esc(summary)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  lines.push(`DESCRIPTION:${esc(desc)}`);
  lines.push(`URL:${url}`);
  lines.push(`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('TRANSP:TRANSPARENT'); // don't block free/busy
  lines.push('END:VEVENT');

  vevents.push({ startDate: e.startDate, uid: `${e._id}@commongroundmeditation.org`, summary, lines });
  stats.total++;
}

// --- emit ------------------------------------------------------------------

// Read the previous pull's UIDs before overwriting, so we can report what moved.
function readUids(file) {
  if (!fs.existsSync(file)) return null;
  const unfolded = fs.readFileSync(file, 'utf8').replace(/\r\n[ \t]/g, '');
  const map = new Map();
  let uid = null;
  for (const l of unfolded.split('\r\n')) {
    if (l.startsWith('UID:')) uid = l.slice(4);
    else if (l.startsWith('SUMMARY:') && uid) map.set(uid, l.slice(8));
  }
  return map;
}

const previous = readUids(OUT);
const previousRaw = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + 'KB';

function write(file, chunk) {
  const all = [...HEADER, ...chunk.flatMap((v) => v.lines), 'END:VCALENDAR'];
  fs.writeFileSync(file, all.map(fold).join('\r\n') + '\r\n', 'utf8');
  return { file, events: chunk.length, size: kb(file) };
}

// In CI the repo only carries the feed itself; git history is the archive.
const FEED_ONLY = process.env.FEED_ONLY === '1';

// Full file for clients with no import ceiling (Apple Calendar, Thunderbird).
const full = write(OUT, vevents);

// DTSTAMP tracks when we pulled, not when anything changed, so a re-run with
// identical events still produces different bytes. Restore the previous file in
// that case, otherwise CI commits an 861KB no-op diff every single day.
const withoutStamps = (s) => s.replace(/^DTSTAMP:.*$/gm, '');
if (previousRaw && withoutStamps(previousRaw) === withoutStamps(fs.readFileSync(OUT, 'utf8'))) {
  fs.writeFileSync(OUT, previousRaw, 'utf8');
  full.unchanged = true;
}

// Google Calendar caps manual imports at 1MB, so also emit halves with margin.
const mid = Math.ceil(vevents.length / 2);
const parts = FEED_ONLY
  ? []
  : [
      write(OUT.replace('.ics', '-part1.ics'), vevents.slice(0, mid)),
      write(OUT.replace('.ics', '-part2.ics'), vevents.slice(mid)),
    ];

// Keep a dated copy so pulls stay distinguishable; common-ground.ics is always newest.
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const tag = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
if (!FEED_ONLY) {
  fs.mkdirSync(__dirname + '/archive', { recursive: true });
  fs.copyFileSync(OUT, `${__dirname}/archive/common-ground-${tag}.ics`);
}

console.log(JSON.stringify(stats, null, 1));
for (const r of [full, ...parts]) {
  const c = r === full ? vevents : r.file.endsWith('part1.ics') ? vevents.slice(0, mid) : vevents.slice(mid);
  console.log(
    `${r.file.split('/').pop().padEnd(26)} ${String(r.events).padStart(4)} events  ${r.size.padStart(6)}  ${c[0].startDate} -> ${c[c.length - 1].startDate}`
  );
}
if (!FEED_ONLY) console.log(`archived as              archive/common-ground-${tag}.ics`);

// --- what changed since the last pull ---------------------------------------

// The workflow reads this to build its commit message.
const noteChange = (msg) => fs.writeFileSync(__dirname + '/.build-summary', msg + '\n', 'utf8');

if (!previous) {
  console.log('\nNo earlier pull to compare against — this is the baseline.');
  noteChange(`Baseline: ${vevents.length} events`);
} else {
  // Values read back off disk are still RFC-escaped, so escape ours to match.
  const now = new Map(vevents.map((v) => [v.uid, esc(v.summary)]));
  const added = [...now].filter(([u]) => !previous.has(u));
  const removed = [...previous].filter(([u]) => !now.has(u));
  const retitled = [...now].filter(([u, s]) => previous.has(u) && previous.get(u) !== s);

  console.log(
    `\nSince last pull:  +${added.length} added   -${removed.length} dropped   ~${retitled.length} retitled`
  );
  noteChange(
    `Update calendar: +${added.length} added, -${removed.length} dropped, ~${retitled.length} retitled (${vevents.length} total)`
  );
  const show = (label, list) => {
    if (!list.length) return;
    console.log(`\n  ${label}`);
    for (const [, s] of list.slice(0, 10)) console.log(`    ${s}`);
    if (list.length > 10) console.log(`    …and ${list.length - 10} more`);
  };
  show('ADDED', added);
  show('DROPPED (cancelled or past)', removed);
  show('RETITLED', retitled);
  console.log('\nRe-import common-ground.ics to apply: matching UIDs update in place.');
  if (removed.length) {
    console.log('Dropped events are NOT removed by re-importing — use build-cancel.js for those.');
  }
}
