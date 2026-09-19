const { test } = require('node:test');
const assert = require('node:assert/strict');
const { memberStatsDay, memberStatsDayKey, shiftMemberStatsDay } = require('../dist/memberStatsDate.js');

const day = (iso) => memberStatsDayKey(memberStatsDay(new Date(iso)));

test('Paris summer midnight assigns late UTC events to the following day', () => {
  assert.equal(day('2026-09-17T21:59:59.999Z'), '2026-09-17');
  assert.equal(day('2026-09-17T22:00:00.000Z'), '2026-09-18');
  assert.equal(day('2026-09-17T23:59:59.999Z'), '2026-09-18');
});

test('winter uses UTC+1, including the year boundary', () => {
  assert.equal(day('2026-01-15T22:59:59.999Z'), '2026-01-15');
  assert.equal(day('2026-01-15T23:00:00.000Z'), '2026-01-16');
  assert.equal(day('2026-12-31T23:00:00.000Z'), '2027-01-01');
});

test('spring and autumn DST transitions preserve the local calendar day', () => {
  for (const instant of ['2026-03-28T23:00:00Z', '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-03-29T21:59:59Z']) {
    assert.equal(day(instant), '2026-03-29');
  }
  assert.equal(day('2026-03-29T22:00:00Z'), '2026-03-30');
  for (const instant of ['2026-10-24T22:00:00Z', '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-10-25T22:59:59Z']) {
    assert.equal(day(instant), '2026-10-25');
  }
  assert.equal(day('2026-10-25T23:00:00Z'), '2026-10-26');
});

test('range and retention arithmetic operate on calendar keys without mutation', () => {
  const today = memberStatsDay(new Date('2026-03-29T22:30:00Z'));
  assert.equal(shiftMemberStatsDay(today, -1).toISOString(), '2026-03-29T00:00:00.000Z');
  assert.equal(memberStatsDayKey(shiftMemberStatsDay(today, -29)), '2026-03-01');
  assert.equal(memberStatsDayKey(shiftMemberStatsDay(today, -365)), '2025-03-30');
  assert.equal(today.toISOString(), '2026-03-30T00:00:00.000Z');
});

test('joins and leaves are grouped independently on opposite sides of midnight', () => {
  const events = [
    { at: '2026-09-17T21:59:59Z', kind: 'joins' },
    { at: '2026-09-17T22:00:00Z', kind: 'leaves' },
    { at: '2026-09-17T23:00:00Z', kind: 'joins' },
    { at: '2026-09-18T00:30:00Z', kind: 'joins' },
  ];
  const totals = {};
  for (const event of events) {
    const key = day(event.at);
    totals[key] ??= { joins: 0, leaves: 0 };
    totals[key][event.kind]++;
  }
  assert.deepEqual(totals, {
    '2026-09-17': { joins: 1, leaves: 0 },
    '2026-09-18': { joins: 2, leaves: 1 },
  });
});
