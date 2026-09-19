// Run from the deployed bot's /app directory (its dependencies are installed).
// node /app/apply-member-stats-paris.cjs /tmp/audit.json [--apply]
// Dry-run by default. Always take a complete pg_dump before --apply.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { planParisMigration } = require('./member-stats-paris-plan.cjs');
const botRequire = createRequire(path.join(process.cwd(), 'package.json'));
const { prisma } = botRequire('@discord-bot-dashboard/database');

function snapshot(rows) {
  return JSON.stringify(rows.map(r => ({ ...r, date: new Date(r.date).toISOString(), createdAt: new Date(r.createdAt).toISOString(), updatedAt: new Date(r.updatedAt).toISOString() })).sort((a, b) => a.date.localeCompare(b.date)));
}

async function main() {
  const audit = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const plan = planParisMigration(audit);
  const summary = { ...plan, rows: undefined, moved: plan.moved.length };
  console.log(JSON.stringify(summary, null, 2));
  if (!process.argv.includes('--apply')) return;
  await prisma.$transaction(async tx => {
    // Hold increments briefly, then compare the full snapshot so an event
    // arriving during the Discord scan can never be overwritten silently.
    await tx.$executeRawUnsafe('LOCK TABLE "DailyMemberStat" IN SHARE ROW EXCLUSIVE MODE');
    const current = await tx.dailyMemberStat.findMany({ where: { guildId: audit.guildId }, orderBy: { date: 'asc' } });
    const alreadyApplied = current.length === plan.rows.length && current.every((r, i) => r.date.toISOString().slice(0, 10) === plan.rows[i].date && r.joins === plan.rows[i].joins && r.leaves === plan.rows[i].leaves);
    if (alreadyApplied) {
      console.log('ALREADY_APPLIED');
      return;
    }
    if (snapshot(current) !== snapshot(audit.rows)) throw new Error('Counters changed since audit; rescan before applying');
    const now = new Date();
    for (const change of plan.changes) {
      const date = new Date(`${change.date}T00:00:00.000Z`);
      await tx.dailyMemberStat.upsert({
        where: { guildId_date: { guildId: audit.guildId, date } },
        create: { id: randomUUID(), guildId: audit.guildId, date, ...change.after, updatedAt: now },
        update: { ...change.after, updatedAt: now },
      });
    }
    const result = await tx.dailyMemberStat.findMany({ where: { guildId: audit.guildId }, orderBy: { date: 'asc' } });
    if (result.length !== plan.rows.length || result.some((r, i) => r.date.toISOString().slice(0, 10) !== plan.rows[i].date || r.joins !== plan.rows[i].joins || r.leaves !== plan.rows[i].leaves)) {
      throw new Error('Post-migration verification failed');
    }
    console.log('VERIFIED_IN_TRANSACTION');
  }, { timeout: 30_000, maxWait: 10_000 });
  console.log('COMMITTED');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
