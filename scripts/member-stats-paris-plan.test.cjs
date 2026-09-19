const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planParisMigration } = require('./member-stats-paris-plan.cjs');

function audit() {
  return {
    guildId: 'g', skipped: [], boundary: [],
    rows: [
      { guildId: 'g', date: '2026-09-01T00:00:00.000Z', joins: 2, leaves: 1, updatedAt: '2026-09-01T23:10:00Z' },
      { guildId: 'g', date: '2026-09-02T00:00:00.000Z', joins: 1, leaves: 0, updatedAt: '2026-09-02T10:00:00Z' },
    ],
    events: [
      { id: '1', kind: 'joins', at: '2026-09-01T10:00:00Z' },
      { id: '2', kind: 'joins', at: '2026-09-01T22:10:00Z' },
      { id: '3', kind: 'leaves', at: '2026-09-01T23:10:00Z' },
      { id: '4', kind: 'joins', at: '2026-09-02T10:00:00Z' },
    ],
  };
}

test('reassigns arrivals and departures independently, preserving totals', () => {
  const plan = planParisMigration(audit());
  assert.deepEqual(plan.rows, [{ date: '2026-09-01', joins: 1, leaves: 0 }, { date: '2026-09-02', joins: 2, leaves: 1 }]);
  assert.deepEqual(plan.totals, { joins: 3, leaves: 1 });
  assert.equal(plan.moved.length, 2);
});

test('refuses incomplete late-day history and duplicate messages', () => {
  const missing = audit(); missing.events.splice(1, 1);
  assert.throws(() => planParisMigration(missing), /Missing late-day/);
  const duplicate = audit(); duplicate.events.push(duplicate.events[0]);
  assert.throws(() => planParisMigration(duplicate), /Duplicate/);
});

test('preserves missing early events only when the last increment proves their day', () => {
  const input = audit();
  input.rows[1].joins = 4;
  const plan = planParisMigration(input);
  assert.equal(plan.rows[1].joins, 5);
  assert.deepEqual(plan.earlyResiduals, [{ date: '2026-09-02', joins: 3, leaves: 0, lastIncrementAt: '2026-09-02T10:00:00Z' }]);
  input.rows[1].updatedAt = '2026-09-03T10:00:00Z';
  assert.throws(() => planParisMigration(input), /Missing late-day/);
});

test('refuses timestamps whose message delay could change the day', () => {
  const input = audit(); input.events[1].at = '2026-09-01T22:00:20Z';
  assert.throws(() => planParisMigration(input), /too close/);
});

test('creates the following calendar date and handles winter UTC+1', () => {
  const input = { guildId: 'g', rows: [{ guildId: 'g', date: '2026-12-31T00:00:00.000Z', joins: 2, leaves: 0, updatedAt: '2026-12-31T23:30:00Z' }], events: [
    { id: '1', kind: 'joins', at: '2026-12-31T22:30:00Z' },
    { id: '2', kind: 'joins', at: '2026-12-31T23:30:00Z' },
  ] };
  assert.deepEqual(planParisMigration(input).rows, [{ date: '2026-12-31', joins: 1, leaves: 0 }, { date: '2027-01-01', joins: 1, leaves: 0 }]);
});
