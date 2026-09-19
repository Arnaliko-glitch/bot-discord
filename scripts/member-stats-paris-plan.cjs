// Pure planning step for the one-time UTC -> Europe/Paris migration.
// Input is an audited export of the original daily counters and human-only
// Discord welcome/goodbye messages. No database or network writes here.
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
});

function parisKey(date) {
  const parts = formatter.formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-');
}

function planParisMigration(audit) {
  if (!audit.guildId || !audit.rows?.length || !Array.isArray(audit.events)) throw new Error('Incomplete audit');
  if (audit.skipped?.length || audit.boundary?.length) throw new Error('Unresolved messages or boundary timestamps');
  const before = new Map();
  const observed = new Map();
  const after = new Map();
  const earlyResiduals = [];
  const moved = [];
  const eventIds = new Set();
  for (const row of audit.rows) {
    const date = new Date(row.date);
    const key = date.toISOString().slice(0, 10);
    if (row.guildId !== audit.guildId || date.toISOString() !== `${key}T00:00:00.000Z` || before.has(key)) {
      throw new Error('Invalid or duplicate daily row');
    }
    for (const kind of ['joins', 'leaves']) {
      if (!Number.isSafeInteger(row[kind]) || row[kind] < 0) throw new Error('Invalid counter');
    }
    before.set(key, row);
    observed.set(key, { joins: 0, leaves: 0 });
    after.set(key, { date: key, joins: 0, leaves: 0 });
  }
  for (const event of audit.events) {
    if (!event.id || eventIds.has(event.id) || !['joins', 'leaves'].includes(event.kind)) {
      throw new Error('Duplicate or invalid event');
    }
    eventIds.add(event.id);
    const instant = new Date(event.at);
    const utc = instant.toISOString().slice(0, 10);
    const paris = parisKey(instant);
    if (!observed.has(utc)) throw new Error(`Event outside original history: ${utc}`);
    // Message timestamps lag the gateway event. Refuse ambiguous timestamps
    // within a minute of either grouping boundary for manual inspection.
    for (const delta of [-60_000, 60_000]) {
      const nearby = new Date(+instant + delta);
      if (parisKey(nearby) !== paris || nearby.toISOString().slice(0, 10) !== utc) {
        throw new Error(`Message too close to midnight: ${event.id}`);
      }
    }
    observed.get(utc)[event.kind]++;
    if (!after.has(paris)) after.set(paris, { date: paris, joins: 0, leaves: 0 });
    after.get(paris)[event.kind]++;
    if (utc !== paris) moved.push({ id: event.id, kind: event.kind, from: utc, to: paris });
  }
  for (const [key, row] of before) {
    const residual = { joins: row.joins - observed.get(key).joins, leaves: row.leaves - observed.get(key).leaves };
    if (residual.joins < 0 || residual.leaves < 0) throw new Error(`Messages exceed counters: ${key}`);
    if (!residual.joins && !residual.leaves) continue;
    const lastEvent = new Date(row.updatedAt);
    // The old bot updates updatedAt on EVERY increment. Missing messages can
    // remain on this day only if its last increment is demonstrably earlier
    // than the Paris day boundary. Never estimate how to split late events.
    if (lastEvent.toISOString().slice(0, 10) !== key || parisKey(lastEvent) !== key) {
      throw new Error(`Missing late-day events: ${key}`);
    }
    if (audit.events.some(e => new Date(e.at).toISOString().slice(0, 10) === key && parisKey(new Date(e.at)) !== key)) {
      throw new Error(`Inconsistent last-update evidence: ${key}`);
    }
    after.get(key).joins += residual.joins;
    after.get(key).leaves += residual.leaves;
    earlyResiduals.push({ date: key, ...residual, lastIncrementAt: row.updatedAt });
  }
  const rows = [...after.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totals = { joins: 0, leaves: 0 };
  for (const kind of ['joins', 'leaves']) {
    totals[kind] = audit.rows.reduce((sum, r) => sum + r[kind], 0);
    if (rows.reduce((sum, r) => sum + r[kind], 0) !== totals[kind]) throw new Error('Totals changed');
  }
  const changes = rows.filter(r => !before.has(r.date) || before.get(r.date).joins !== r.joins || before.get(r.date).leaves !== r.leaves)
    .map(r => ({ date: r.date, before: before.has(r.date) ? { joins: before.get(r.date).joins, leaves: before.get(r.date).leaves } : { joins: 0, leaves: 0 }, after: { joins: r.joins, leaves: r.leaves } }));
  return { guildId: audit.guildId, timeZone: 'Europe/Paris', rows, totals, changes, moved, earlyResiduals };
}

module.exports = { planParisMigration };
