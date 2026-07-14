#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path';
import { planRefresh, renderMarkdown, applyPlan } from './index.js';
function arg(name: string, fallback?: string): string | undefined { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i+1] : fallback; }
function flag(name: string): boolean { return process.argv.includes(name); }
function save(file: string | undefined, body: string) { if (!file) return; fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, body); }
const cmd = process.argv[2];
try {
  if (cmd === 'plan') { const repo = arg('--repo','.')!; const log = arg('--log'); if (!log) throw new Error('missing --log'); const plan = planRefresh(repo, log); save(arg('--out'), renderMarkdown(plan)); save(arg('--json'), JSON.stringify(plan,null,2)+'\n'); if (!arg('--out') && !arg('--json')) console.log(renderMarkdown(plan)); }
  else if (cmd === 'apply') { const file = process.argv[3]; if (!file) throw new Error('missing plan json'); const plan = JSON.parse(fs.readFileSync(file,'utf8')); if (arg('--repo')) plan.repo = arg('--repo'); const written = applyPlan(plan, arg('--approve','safe-only') as 'safe-only' | 'all', flag('--dry-run')); console.log((flag('--dry-run') ? 'would write: ' : 'wrote: ') + (written.join(', ') || 'none')); }
  else { console.error('usage: repo-fixture-refresh plan --repo <path> --log <log> | apply <plan.json>'); process.exit(1); }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
