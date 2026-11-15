#!/usr/bin/env node
// Stress test for the pt-hub Edge Function: simulates a gym full of phones on one network.
//
// It never writes real rows. Every shot names a random player id, so the function validates it, charges the
// rate budgets, and rejects it as "Unknown player or drill" without touching pt_shots. What it measures is the
// thing that broke in practice: whether a full roster tapping at once gets 429s, and how fast replies come back.
//
//   node tools/stress-pt-hub.mjs                       # 16 phones, 10 taps a minute each, 90 seconds
//   node tools/stress-pt-hub.mjs --phones 24 --taps 20 --seconds 120
//   node tools/stress-pt-hub.mjs --legacy              # phones without a device id (old cached pages)
//   node tools/stress-pt-hub.mjs --burst 100           # every phone starts with a 100-shot offline backlog
//   node tools/stress-pt-hub.mjs --flood               # one abuser rotating device ids as fast as it can
//
// Set PT_HUB_ORIGIN to the deployed site origin if it is not the default below.

import { randomUUID, randomBytes } from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : []).filter(Boolean));
const ENDPOINT = process.env.PT_HUB_ENDPOINT || 'https://jbznaeunhtqgagnqweqw.supabase.co/functions/v1/pt-hub';
const ORIGIN = process.env.PT_HUB_ORIGIN || 'https://pt-hoops-analytics.vercel.app';
const PHONES = Number(args.phones || 16), TAPS_PER_MIN = Number(args.taps || 10), SECONDS = Number(args.seconds || 90);
const BURST = Number(args.burst || 0), LEGACY = !!args.legacy, FLOOD = !!args.flood;
const DRILL = process.env.PT_HUB_DRILL_ID || randomUUID();

const stats = { sent: 0, ok: 0, limited: 0, rejected: 0, other: 0, errors: 0, latencies: [], byPhone: new Map() };
const device = () => randomBytes(16).toString('hex');
const shot = () => ({ id: randomUUID(), player_id: randomUUID(), drill_id: DRILL, made: Math.random() < 0.45, practice_date: new Date().toISOString().slice(0, 10), recorded_at: new Date().toISOString(), owner_token: randomBytes(24).toString('hex') });

async function send(deviceId, body, action = 'shots') {
  const started = performance.now();
  stats.sent++;
  try {
    const res = await fetch(`${ENDPOINT}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(deviceId ? { 'X-PT-Device': deviceId } : {}) }, body: JSON.stringify(body) });
    const ms = performance.now() - started; stats.latencies.push(ms);
    const per = stats.byPhone.get(deviceId || 'legacy') || { ok: 0, limited: 0 }; stats.byPhone.set(deviceId || 'legacy', per);
    if (res.status === 429) { stats.limited++; per.limited++; return; }
    const json = await res.json().catch(() => ({}));
    if (res.ok) { stats.ok++; per.ok++; stats.rejected += Array.isArray(json.rejected) ? json.rejected.length : 0; return; }
    stats.other++; if (stats.other <= 5) console.error('unexpected', res.status, json.error);
  } catch (e) { stats.errors++; if (stats.errors <= 5) console.error('network', e.message); }
}

async function phone(index) {
  const id = LEGACY ? '' : device();
  let queue = Array.from({ length: BURST }, shot);
  const gap = 60000 / TAPS_PER_MIN;
  const until = Date.now() + SECONDS * 1000;
  let nextTap = Date.now() + Math.random() * gap;
  while (Date.now() < until) {
    if (Date.now() >= nextTap) { queue.push(shot()); nextTap += gap; }
    if (queue.length) { const batch = queue.splice(0, 100); if (LEGACY) for (const s of batch) await send(id, s, 'shot'); else await send(id, { shots: batch }); }
    await new Promise(r => setTimeout(r, 100));
  }
}

async function flood() {
  const until = Date.now() + SECONDS * 1000;
  const workers = Array.from({ length: 8 }, async () => { while (Date.now() < until) await send(device(), { shots: Array.from({ length: 100 }, shot) }); });
  await Promise.all(workers);
}

console.log(`${FLOOD ? 'FLOOD: 8 workers rotating device ids' : `${PHONES} phones, ${TAPS_PER_MIN} taps/min each${BURST ? `, ${BURST}-shot backlog` : ''}${LEGACY ? ', legacy (no device id)' : ''}`} for ${SECONDS}s against ${ENDPOINT}`);
const t0 = Date.now();
await (FLOOD ? flood() : Promise.all(Array.from({ length: PHONES }, (_, i) => phone(i))));
const elapsed = (Date.now() - t0) / 1000;
const sorted = stats.latencies.sort((a, b) => a - b), pct = p => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0);
const starved = [...stats.byPhone.values()].filter(p => p.limited > 0).length;
console.log(JSON.stringify({ seconds: Math.round(elapsed), requests: stats.sent, accepted: stats.ok, rate_limited: stats.limited, per_record_rejections: stats.rejected, unexpected_status: stats.other, network_errors: stats.errors, phones_that_saw_429: starved, latency_ms: { p50: pct(0.5), p95: pct(0.95), max: Math.round(sorted.at(-1) || 0) } }, null, 2));
process.exit(FLOOD ? 0 : (stats.limited || stats.other || stats.errors) ? 1 : 0);
