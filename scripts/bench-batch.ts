import fs from 'node:fs';
import { randomInt } from 'node:crypto';

function getArgValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function generateIps(count: number): string[] {
  const ips: string[] = [];
  for (let i = 0; i < count; i++) {
    ips.push(
      `${randomInt(1, 224)}.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(0, 256)}`,
    );
  }
  return ips;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function main() {
  const args = process.argv.slice(2);
  const url = getArgValue(args, '--url') ?? 'https://edge-geo.y8955.workers.dev/';
  const runs = parsePositiveInt(getArgValue(args, '--runs'), 5);
  const timeoutMs = parsePositiveInt(getArgValue(args, '--timeout-ms'), 30000);
  const file = getArgValue(args, '--file');
  const n = parsePositiveInt(getArgValue(args, '--n'), 500);
  const warmup = parsePositiveInt(getArgValue(args, '--warmup'), 1);
  const showBody = hasFlag(args, '--show-body');

  let ips: string[];
  if (file) {
    ips = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(ips)) throw new Error(`File is not a JSON array: ${file}`);
    ips = ips.map(String);
  } else {
    ips = generateIps(n);
  }

  const timingsMs: number[] = [];
  let lastStatus = 0;
  let lastBytes = 0;
  let lastError: string | null = null;

  const totalRuns = warmup + runs;
  for (let i = 0; i < totalRuns; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);

    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(ips),
        signal: ac.signal,
      });
      const text = await res.text();
      const elapsed = performance.now() - start;

      lastStatus = res.status;
      lastBytes = Buffer.byteLength(text);
      lastError = null;

      if (i >= warmup) timingsMs.push(elapsed);

      if (showBody) {
        process.stdout.write(text);
        process.stdout.write('\n');
      }
    } catch (e: any) {
      const elapsed = performance.now() - start;
      lastStatus = 0;
      lastBytes = 0;
      lastError = e?.message ? String(e.message) : String(e);
      if (i >= warmup) timingsMs.push(elapsed);
    } finally {
      clearTimeout(t);
    }

    process.stdout.write(
      `run ${i + 1}/${totalRuns} status=${lastStatus} bytes=${lastBytes} ms=${timingsMs.length ? timingsMs[timingsMs.length - 1].toFixed(0) : 'warmup'}${lastError ? ` error=${lastError}` : ''}\n`,
    );
  }

  const sorted = [...timingsMs].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / (sorted.length || 1);
  const p50 = percentile(sorted, 50);
  const p90 = percentile(sorted, 90);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  process.stdout.write('\n');
  process.stdout.write(`url=${url}\n`);
  process.stdout.write(`ips=${ips.length}\n`);
  process.stdout.write(`runs=${runs} warmup=${warmup} timeout_ms=${timeoutMs}\n`);
  process.stdout.write(
    `ms min=${sorted[0]?.toFixed(0) ?? '0'} avg=${avg.toFixed(0)} p50=${p50.toFixed(0)} p90=${p90.toFixed(0)} p95=${p95.toFixed(0)} p99=${p99.toFixed(0)} max=${sorted[sorted.length - 1]?.toFixed(0) ?? '0'}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e));
  process.stderr.write('\n');
  process.exitCode = 1;
});

