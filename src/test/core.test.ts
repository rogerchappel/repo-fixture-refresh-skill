import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { planRefresh, applyPlan, RefreshConflictError } from '../index.js';
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
test('rejects a plan when an existing target was modified', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const target = path.join(repo, 'fixture.txt'); fs.writeFileSync(target, 'old\n');
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const plan = planRefresh(repo, log);

  fs.writeFileSync(target, 'newer user change\n');
  assert.throws(() => applyPlan(plan, 'safe-only', false), (error: unknown) => {
    assert.ok(error instanceof RefreshConflictError);
    assert.deepEqual(error.conflicts, [{ file: 'fixture.txt', reason: 'target was modified after this plan was generated' }]);
    return true;
  });
  assert.equal(fs.readFileSync(target, 'utf8'), 'newer user change\n');
  fs.rmSync(root, { recursive: true, force: true });
});
test('rejects a plan when an absent target was created', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const plan = planRefresh(repo, log);
  assert.equal(plan.changes[0]?.before, undefined);

  const target = path.join(repo, 'fixture.txt'); fs.writeFileSync(target, 'new user file\n');
  assert.throws(() => applyPlan(plan, 'safe-only', false), /target was created after this plan was generated/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'new user file\n');
  fs.rmSync(root, { recursive: true, force: true });
});
test('writes unchanged safe updates', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const target = path.join(repo, 'fixture.txt'); fs.writeFileSync(target, 'old\n');
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const plan = planRefresh(repo, log);

  assert.deepEqual(applyPlan(plan, 'safe-only', false), ['fixture.txt']);
  assert.equal(fs.readFileSync(target, 'utf8'), 'planned\n');
  fs.rmSync(root, { recursive: true, force: true });
});
test('reports every conflict without partially applying a multi-change plan, including dry runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'first.txt'), 'first old\n');
  fs.writeFileSync(path.join(repo, 'second.txt'), 'second old\n');
  const log = path.join(root, 'latest.log');
  fs.writeFileSync(log, 'SNAPSHOT first.txt\nfirst planned\nEND SNAPSHOT\nSNAPSHOT second.txt\nsecond planned\nEND SNAPSHOT\nSNAPSHOT third.txt\nthird planned\nEND SNAPSHOT\n');
  const plan = planRefresh(repo, log);
  fs.writeFileSync(path.join(repo, 'second.txt'), 'second changed\n');
  fs.writeFileSync(path.join(repo, 'third.txt'), 'third created\n');

  for (const dryRun of [true, false]) {
    assert.throws(() => applyPlan(plan, 'safe-only', dryRun), (error: unknown) => {
      assert.ok(error instanceof RefreshConflictError);
      assert.deepEqual(error.conflicts.map(conflict => conflict.file), ['second.txt', 'third.txt']);
      return true;
    });
  }
  assert.equal(fs.readFileSync(path.join(repo, 'first.txt'), 'utf8'), 'first old\n');
  assert.equal(fs.readFileSync(path.join(repo, 'second.txt'), 'utf8'), 'second changed\n');
  assert.equal(fs.readFileSync(path.join(repo, 'third.txt'), 'utf8'), 'third created\n');
  fs.rmSync(root, { recursive: true, force: true });
});
test('CLI reports stale-plan conflicts and exits unsuccessfully', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const target = path.join(repo, 'fixture.txt'); fs.writeFileSync(target, 'old\n');
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const planFile = path.join(root, 'plan.json');
  fs.writeFileSync(planFile, `${JSON.stringify(planRefresh(repo, log))}\n`);
  fs.writeFileSync(target, 'newer user change\n');

  const result = spawnSync(process.execPath, ['dist/cli.js', 'apply', planFile, '--approve', 'safe-only', '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture refresh conflicts:\n- fixture\.txt: target was modified after this plan was generated/);
  assert.equal(result.stdout, '');
  assert.equal(fs.readFileSync(target, 'utf8'), 'newer user change\n');
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
