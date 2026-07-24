import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { planRefresh, applyPlan } from '../index.js';
test('plans safe and risky fixture changes', () => { const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log'); assert.equal(plan.changes.find(c=>c.file==='fixtures/output.txt')?.status, 'safe-update'); assert.equal(plan.changes.find(c=>c.file==='fixtures/risky.txt')?.status, 'needs-review'); });
test('dry run apply writes only safe updates by default', () => { const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log'); assert.deepEqual(applyPlan(plan, 'safe-only', true), ['fixtures/output.txt']); });
test('plans and writes a fixture whose parent directories do not exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log');
  fs.writeFileSync(log, 'SNAPSHOT fixtures/new/nested.txt\nnew fixture\nEND SNAPSHOT\n');

  const plan = planRefresh(repo, log);
  assert.equal(plan.changes[0]?.status, 'safe-update');
  assert.equal(plan.changes[0]?.file, 'fixtures/new/nested.txt');
  assert.deepEqual(applyPlan(plan, 'safe-only', false), ['fixtures/new/nested.txt']);
  assert.equal(fs.readFileSync(path.join(repo, 'fixtures/new/nested.txt'), 'utf8'), 'new fixture\n');
  fs.rmSync(root, { recursive: true, force: true });
});
test('rejects fixture paths outside the selected repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const outside = path.join(root, 'outside.txt');
  const plan = { repo, log: '', changes: [{ file: '../outside.txt', status: 'safe-update' as const, reason: '', after: 'unsafe\n' }], checklist: [] };
  assert.throws(() => applyPlan(plan, 'safe-only', false), /escapes repository/);
  assert.equal(fs.existsSync(outside), false);
  fs.rmSync(root, { recursive: true, force: true });
});
test('rejects fixture paths that escape through a symlink', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); const outside = path.join(root, 'outside');
  fs.mkdirSync(repo); fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(repo, 'linked'));
  const plan = { repo, log: '', changes: [{ file: 'linked/outside.txt', status: 'safe-update' as const, reason: '', after: 'unsafe\n' }], checklist: [] };
  assert.throws(() => applyPlan(plan, 'safe-only', false), /through a symlink/);
  assert.equal(fs.existsSync(path.join(outside, 'outside.txt')), false);
  fs.rmSync(root, { recursive: true, force: true });
});
