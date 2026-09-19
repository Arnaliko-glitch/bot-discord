export const MEMBER_STATS_TIME_ZONE = 'Europe/Paris';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MEMBER_STATS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// DailyMemberStat.date is a calendar-day key encoded at 00:00Z, NOT the
// instant of local midnight. Keep real event timestamps in UTC; only their
// assignment to a calendar day depends on the Paris timezone (including DST).
export function memberStatsDay(instant: Date): Date {
  const parts = dayFormatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
}

export function memberStatsDayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

// Calendar arithmetic on day keys, independent of the host timezone and of
// the 23/25-hour days at the daylight-saving transitions.
export function shiftMemberStatsDay(day: Date, days: number): Date {
  const shifted = new Date(day);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}
