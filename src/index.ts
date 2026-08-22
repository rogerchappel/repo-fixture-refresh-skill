import fs from 'node:fs'; import path from 'node:path';
export interface RefreshChange { file: string; status: 'unchanged' | 'safe-update' | 'needs-review'; reason: string; before?: string; after?: string; }
export interface RefreshPlan { repo: string; log: string; changes: RefreshChange[]; checklist: string[]; }
export interface RefreshConflict { file: string; reason: string; }
export class RefreshConflictError extends Error {
  constructor(public readonly conflicts: RefreshConflict[]) {
    super(`fixture refresh conflicts:\n${conflicts.map(conflict => `- ${conflict.file}: ${conflict.reason}`).join('\n')}`);
    this.name = 'RefreshConflictError';
  }
}
function planObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${field} must be an object`);
}
function planString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
}
export function validateRefreshPlan(value: unknown): asserts value is RefreshPlan {
  planObject(value, 'plan');
  planString(value.repo, 'plan.repo');
  planString(value.log, 'plan.log');
  if (!Array.isArray(value.checklist)) throw new Error('plan.checklist must be an array');
  value.checklist.forEach((item, index) => planString(item, `plan.checklist[${index}]`));
  if (!Array.isArray(value.changes)) throw new Error('plan.changes must be an array');
  const files = new Set<string>();
  value.changes.forEach((change, index) => {
    const field = `plan.changes[${index}]`;
    planObject(change, field);
    planString(change.file, `${field}.file`);
    if (files.has(change.file)) throw new Error(`${field}.file duplicates an earlier change target: ${change.file}`);
    files.add(change.file);
    planString(change.status, `${field}.status`);
    if (!['unchanged', 'safe-update', 'needs-review'].includes(change.status)) throw new Error(`${field}.status must be unchanged, safe-update, or needs-review`);
    planString(change.reason, `${field}.reason`);
    if (change.before !== undefined) planString(change.before, `${field}.before`);
    if (change.after !== undefined) planString(change.after, `${field}.after`);
    if ((change.status === 'safe-update' || change.status === 'needs-review') && typeof change.after !== 'string') {
      throw new Error(`${field}.after must be a string for ${change.status}`);
    }
  });
}
function validateSnapshotPath(file: string, line: number): void {
  const segments = file.split(/[\\/]/);
  if (
    file.includes('\0') ||
    path.posix.isAbsolute(file) ||
    path.win32.isAbsolute(file) ||
    file === '.' ||
    segments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) throw new Error(`line ${line}: invalid snapshot path: ${file}`);
}
export function parseSnapshots(text: string): Record<string,string> {
  const snapshots: Record<string,string> = {};
  let active: { file: string; line: number; bodyStart: number } | undefined;
  let offset = 0;
  let lineNumber = 1;

  while (offset < text.length) {
    const lineStart = offset;
    while (offset < text.length && text[offset] !== '\n' && text[offset] !== '\r') offset++;
    const line = text.slice(lineStart, offset);
    if (text[offset] === '\r' && text[offset + 1] === '\n') offset += 2;
    else if (offset < text.length) offset++;
    const nextLineStart = offset;
    const start = /^SNAPSHOT(?:[ \t]+(.*))?$/.exec(line);

    if (active) {
      if (start) {
        const nextFile = (start[1] ?? '').trim();
        throw new Error(`line ${lineNumber}: started snapshot "${nextFile}" before ending "${active.file}"`);
      }
      if (line === 'END SNAPSHOT') {
        snapshots[active.file] = text.slice(active.bodyStart, lineStart);
        active = undefined;
      }
    } else if (start) {
      const file = (start[1] ?? '').trim();
      if (!file) throw new Error(`line ${lineNumber}: snapshot path is empty`);
      validateSnapshotPath(file, lineNumber);
      if (Object.hasOwn(snapshots, file)) throw new Error(`line ${lineNumber}: duplicate snapshot path: ${file}`);
      active = { file, line: lineNumber, bodyStart: nextLineStart };
    } else if (line === 'END SNAPSHOT') {
      throw new Error(`line ${lineNumber}: unexpected END SNAPSHOT`);
    }
    lineNumber++;
  }

  if (active) throw new Error(`line ${active.line}: snapshot "${active.file}" is missing END SNAPSHOT`);
  if (Object.keys(snapshots).length === 0) throw new Error('snapshot log contains no snapshots');
  return snapshots;
}
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
  for (const [rel, after] of Object.entries(snapshots)) { const abs = fixturePath(repo, rel); const before = fs.existsSync(abs) ? fs.readFileSync(abs,'utf8') : undefined; if (before === after) changes.push({file:rel,status:'unchanged',reason:'recorded output already matches latest log'}); else if (risky(after)) changes.push({file:rel,status:'needs-review',reason:'latest output contains secret-like or credential-like text',before,after}); else changes.push({file:rel,status:'safe-update',reason:'fixture differs and latest output has no risky marker',before,after}); }
  return { repo, log, changes, checklist:['Review needs-review files manually.','Apply only safe-update changes with explicit approval.','Run smoke checks after refreshing fixtures.'] };
}
export function renderMarkdown(plan: RefreshPlan): string { return ['# Repo Fixture Refresh Plan','',`Repo: ${plan.repo}`,`Log: ${plan.log}`,'','## Changes',...plan.changes.map(c=>`- ${c.file}: ${c.status} - ${c.reason}`),'','## Checklist',...plan.checklist.map(i=>`- ${i}`),''].join('\n'); }
export function applyPlan(plan: RefreshPlan, approve: 'safe-only' | 'all', dryRun = true): string[] {
  validateRefreshPlan(plan);
  const approved = plan.changes.filter(change => change.status === 'safe-update' || (approve === 'all' && change.status === 'needs-review'));
  const targets = approved.map(change => ({ change, target: fixturePath(plan.repo, change.file) }));
  const conflicts: RefreshConflict[] = [];

  for (const { change, target } of targets) {
    if (change.before === undefined) {
      if (fs.existsSync(target)) conflicts.push({ file: change.file, reason: 'target was created after this plan was generated' });
    } else if (!fs.existsSync(target)) {
      conflicts.push({ file: change.file, reason: 'target was deleted after this plan was generated' });
    } else if (fs.readFileSync(target, 'utf8') !== change.before) {
      conflicts.push({ file: change.file, reason: 'target was modified after this plan was generated' });
    }
  }

  if (conflicts.length > 0) throw new RefreshConflictError(conflicts);
  if (!dryRun) {
    for (const { change, target } of targets) {
      if (change.after === undefined) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, change.after);
    }
  }
  return targets.map(({ change }) => change.file);
}
