import fs from 'node:fs'; import path from 'node:path';
export interface RefreshChange { file: string; status: 'unchanged' | 'safe-update' | 'needs-review'; reason: string; before?: string; after?: string; }
export interface RefreshPlan { repo: string; log: string; changes: RefreshChange[]; checklist: string[]; }
export function parseSnapshots(text: string): Record<string,string> { const out: Record<string,string> = {}; const re = /SNAPSHOT\s+([^\n]+)\n([\s\S]*?)\nEND SNAPSHOT/g; let m: RegExpExecArray | null; while ((m = re.exec(text))) out[m[1].trim()] = m[2] + '\n'; return out; }
function risky(text: string): boolean { return /(token=|secret|password|credential)/i.test(text); }
function fixturePath(repo: string, file: string): string {
  if (!file || file.includes('\0') || path.isAbsolute(file)) throw new Error(`invalid fixture path: ${file}`);
  const root = fs.realpathSync(repo);
  const target = path.resolve(root, file);
  const relative = path.relative(root, target);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error(`fixture path escapes repository: ${file}`);

  let existing = target;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error(`fixture path has no existing repository ancestor: ${file}`);
    existing = parent;
  }
  const realExisting = fs.realpathSync(existing);
  const realRelative = path.relative(root, realExisting);
  if (realRelative.startsWith(`..${path.sep}`) || realRelative === '..' || path.isAbsolute(realRelative)) throw new Error(`fixture path escapes repository through a symlink: ${file}`);
  return target;
}
export function planRefresh(repo: string, log: string): RefreshPlan {
  const text = fs.readFileSync(log,'utf8'); const snapshots = parseSnapshots(text); const changes: RefreshChange[] = [];
  for (const [rel, after] of Object.entries(snapshots)) { const abs = fixturePath(repo, rel); const before = fs.existsSync(abs) ? fs.readFileSync(abs,'utf8') : ''; if (before === after) changes.push({file:rel,status:'unchanged',reason:'recorded output already matches latest log'}); else if (risky(after)) changes.push({file:rel,status:'needs-review',reason:'latest output contains secret-like or credential-like text',before,after}); else changes.push({file:rel,status:'safe-update',reason:'fixture differs and latest output has no risky marker',before,after}); }
  return { repo, log, changes, checklist:['Review needs-review files manually.','Apply only safe-update changes with explicit approval.','Run smoke checks after refreshing fixtures.'] };
}
export function renderMarkdown(plan: RefreshPlan): string { return ['# Repo Fixture Refresh Plan','',`Repo: ${plan.repo}`,`Log: ${plan.log}`,'','## Changes',...plan.changes.map(c=>`- ${c.file}: ${c.status} - ${c.reason}`),'','## Checklist',...plan.checklist.map(i=>`- ${i}`),''].join('\n'); }
export function applyPlan(plan: RefreshPlan, approve: 'safe-only' | 'all', dryRun = true): string[] { const written: string[] = []; for (const change of plan.changes) { if (change.status === 'safe-update' || (approve === 'all' && change.status === 'needs-review')) { const target = fixturePath(plan.repo, change.file); written.push(change.file); if (!dryRun && change.after !== undefined) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, change.after); } } } return written; }
