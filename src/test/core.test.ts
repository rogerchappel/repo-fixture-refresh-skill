import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
import { planRefresh, applyPlan, parseSnapshots, RefreshConflictError, validateRefreshPlan } from '../index.js';
const cli = (...args: string[]) => spawnSync(process.execPath, ['dist/cli.js', ...args], { encoding: 'utf8' });
test('plans safe and risky fixture changes', () => { const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log'); assert.equal(plan.changes.find(c=>c.file==='fixtures/output.txt')?.status, 'safe-update'); assert.equal(plan.changes.find(c=>c.file==='fixtures/risky.txt')?.status, 'needs-review'); });
test('dry run apply writes only safe updates by default', () => { const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log'); assert.deepEqual(applyPlan(plan, 'safe-only', true), ['fixtures/output.txt']); });
test('validates a generated plan after a JSON round trip', () => {
  const plan: unknown = JSON.parse(JSON.stringify(planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log')));
  validateRefreshPlan(plan);
  assert.deepEqual(applyPlan(plan, 'safe-only', true), ['fixtures/output.txt']);
});
test('generated plans retain their repository across working-directory changes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-path-'));
  const planningDirectory = path.join(root, 'planning');
  const repo = path.join(planningDirectory, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const log = path.join(root, 'latest.log');
  fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const previous = process.cwd();
  try {
    process.chdir(planningDirectory);
    const plan = planRefresh('repo', log);
    process.chdir(root);
    assert.deepEqual(applyPlan(plan, 'safe-only', true), ['fixture.txt']);
    assert.equal(plan.repo, fs.realpathSync(repo));
  } finally {
    process.chdir(previous);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('rejects malformed saved-plan roots and collection fields', () => {
  const cases: Array<[unknown, RegExp]> = [
    [null, /plan must be an object/],
    [[], /plan must be an object/],
    [{ repo: 1, log: '', changes: [], checklist: [] }, /plan\.repo must be a string/],
    [{ repo: '.', log: 1, changes: [], checklist: [] }, /plan\.log must be a string/],
    [{ repo: '.', log: '', changes: {}, checklist: [] }, /plan\.changes must be an array/],
    [{ repo: '.', log: '', changes: [], checklist: 'review' }, /plan\.checklist must be an array/],
    [{ repo: '.', log: '', changes: [], checklist: ['review', 2] }, /plan\.checklist\[1\] must be a string/],
  ];
  for (const [value, message] of cases) assert.throws(() => validateRefreshPlan(value), message);
});
test('rejects malformed saved-plan change fields and statuses', () => {
  const base = { repo: '.', log: '', checklist: [] };
  const cases: Array<[unknown, RegExp]> = [
    [{ ...base, changes: [null] }, /plan\.changes\[0\] must be an object/],
    [{ ...base, changes: [{ file: 1, status: 'safe-update', reason: '' }] }, /plan\.changes\[0\]\.file must be a string/],
    [{ ...base, changes: [{ file: 'x', status: 1, reason: '' }] }, /plan\.changes\[0\]\.status must be a string/],
    [{ ...base, changes: [{ file: 'x', status: 'unsafe', reason: '' }] }, /plan\.changes\[0\]\.status must be unchanged, safe-update, or needs-review/],
    [{ ...base, changes: [{ file: 'x', status: 'safe-update', reason: 1 }] }, /plan\.changes\[0\]\.reason must be a string/],
    [{ ...base, changes: [{ file: 'x', status: 'safe-update', reason: '', before: null }] }, /plan\.changes\[0\]\.before must be a string/],
    [{ ...base, changes: [{ file: 'x', status: 'safe-update', reason: '', after: 1 }] }, /plan\.changes\[0\]\.after must be a string/],
  ];
  for (const [value, message] of cases) assert.throws(() => validateRefreshPlan(value), message);
});
test('rejects actionable changes without after and duplicate targets before repository access', () => {
  const missingRepo = '/path/that/does/not/exist';
  const base = { repo: missingRepo, log: '', checklist: [] };
  assert.throws(
    () => applyPlan({ ...base, changes: [{ file: 'missing.txt', status: 'safe-update', reason: '' }] } as never, 'safe-only', false),
    /plan\.changes\[0\]\.after must be a string for safe-update/,
  );
  assert.throws(
    () => applyPlan({ ...base, changes: [
      { file: 'duplicate.txt', status: 'safe-update', reason: '', after: 'first\n' },
      { file: 'duplicate.txt', status: 'needs-review', reason: '', after: 'second\n' },
    ] } as never, 'all', false),
    /plan\.changes\[1\]\.file duplicates an earlier change target: duplicate\.txt/,
  );
});
test('CLI rejects missing-after and duplicate-target plans without partial writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const target = path.join(repo, 'duplicate.txt'); fs.writeFileSync(target, 'original\n');
  const planFile = path.join(root, 'plan.json');
  const plans = [
    { changes: [{ file: 'missing.txt', status: 'safe-update', reason: '' }], message: /after must be a string for safe-update/ },
    { changes: [
      { file: 'duplicate.txt', status: 'safe-update', reason: '', before: 'original\n', after: 'first\n' },
      { file: 'duplicate.txt', status: 'safe-update', reason: '', before: 'original\n', after: 'second\n' },
    ], message: /duplicates an earlier change target/ },
  ];
  for (const example of plans) {
    fs.writeFileSync(planFile, JSON.stringify({ repo, log: '', checklist: [], changes: example.changes }));
    const result = cli('apply', planFile, '--approve', 'safe-only', '--repo', repo);
    assert.equal(result.status, 1);
    assert.match(result.stderr, example.message);
    assert.equal(result.stdout, '');
    assert.equal(fs.readFileSync(target, 'utf8'), 'original\n');
    assert.equal(fs.existsSync(path.join(repo, 'missing.txt')), false);
  }
  fs.rmSync(root, { recursive: true, force: true });
});
test('library rejects malformed plans before accessing the repository', () => {
  const malformed = { repo: '/path/that/does/not/exist', log: '', changes: {}, checklist: [] };
  assert.throws(() => applyPlan(malformed as never, 'safe-only', false), /plan\.changes must be an array/);
});
test('CLI rejects malformed plans without writing fixtures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const target = path.join(repo, 'fixture.txt'); fs.writeFileSync(target, 'original\n');
  const planFile = path.join(root, 'plan.json');
  fs.writeFileSync(planFile, JSON.stringify({ repo, log: '', checklist: [], changes: [{ file: 'fixture.txt', status: 'invalid', reason: '', before: 'original\n', after: 'changed\n' }] }));
  const result = cli('apply', planFile, '--repo', repo);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /plan\.changes\[0\]\.status must be unchanged, safe-update, or needs-review/);
  assert.equal(result.stdout, '');
  assert.equal(fs.readFileSync(target, 'utf8'), 'original\n');
  fs.rmSync(root, { recursive: true, force: true });
});
test('parses multiple snapshots and preserves their body newlines', () => {
  assert.deepEqual(parseSnapshots('prefix\r\nSNAPSHOT first.txt\r\nfirst\r\nEND SNAPSHOT\r\nSNAPSHOT nested/second.txt\nsecond\n\nEND SNAPSHOT\n'), {
    'first.txt': 'first\r\n',
    'nested/second.txt': 'second\n\n',
  });
});
test('rejects malformed snapshot framing with actionable errors', () => {
  const cases: Array<{ input: string; message: RegExp }> = [
    { input: 'ordinary command output\n', message: /snapshot log contains no snapshots/ },
    { input: 'END SNAPSHOT\n', message: /line 1: unexpected END SNAPSHOT/ },
    { input: 'SNAPSHOT fixture.txt\nunterminated\n', message: /line 1: snapshot "fixture\.txt" is missing END SNAPSHOT/ },
    { input: 'SNAPSHOT first.txt\nfirst\nSNAPSHOT second.txt\nsecond\nEND SNAPSHOT\n', message: /line 3: started snapshot "second\.txt" before ending "first\.txt"/ },
  ];
  for (const example of cases) assert.throws(() => parseSnapshots(example.input), example.message);
});
test('rejects empty, invalid, and duplicate snapshot paths', () => {
  const cases: Array<{ input: string; message: RegExp }> = [
    { input: 'SNAPSHOT   \nbody\nEND SNAPSHOT\n', message: /line 1: snapshot path is empty/ },
    { input: 'SNAPSHOT ../outside.txt\nbody\nEND SNAPSHOT\n', message: /line 1: invalid snapshot path: \.\.\/outside\.txt/ },
    { input: 'SNAPSHOT /tmp/outside.txt\nbody\nEND SNAPSHOT\n', message: /line 1: invalid snapshot path: \/tmp\/outside\.txt/ },
    { input: 'SNAPSHOT fixture.txt\nfirst\nEND SNAPSHOT\nSNAPSHOT fixture.txt\nsecond\nEND SNAPSHOT\n', message: /line 4: duplicate snapshot path: fixture\.txt/ },
  ];
  for (const example of cases) assert.throws(() => parseSnapshots(example.input), example.message);
});
test('CLI rejects invalid logs without creating either plan output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'invalid.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nunterminated\n');
  const markdown = path.join(root, 'plan.md'); const json = path.join(root, 'plan.json');

  const result = cli('plan', '--repo', repo, '--log', log, '--out', markdown, '--json', json);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /snapshot "fixture\.txt" is missing END SNAPSHOT/);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(markdown), false);
  assert.equal(fs.existsSync(json), false);
  fs.rmSync(root, { recursive: true, force: true });
});
test('CLI rejects colliding plan outputs without creating a file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const output = path.join(root, 'plan');

  const result = cli('plan', '--repo', repo, '--log', log, '--out', output, '--json', output);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--out and --json must resolve to different files/);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(output), false);
  fs.rmSync(root, { recursive: true, force: true });
});
test('CLI rejects colliding plan outputs without creating their missing parent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const parent = path.join(root, 'new-parent');
  const output = path.join(parent, 'plan');

  const result = cli('plan', '--repo', repo, '--log', log, '--out', output, '--json', output);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--out and --json must resolve to different files/);
  assert.equal(result.stdout, '');
  assert.equal(fs.existsSync(parent), false);
  fs.rmSync(root, { recursive: true, force: true });
});
test('CLI creates missing output parents after validating both destinations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const markdown = path.join(root, 'reports', 'markdown', 'plan.md');
  const json = path.join(root, 'reports', 'json', 'plan.json');

  const result = cli('plan', '--repo', repo, '--log', log, '--out', markdown, '--json', json);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(markdown), true);
  assert.equal(fs.existsSync(json), true);
  fs.rmSync(root, { recursive: true, force: true });
});
test('CLI preserves both final outputs when the second destination is invalid', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const markdown = path.join(root, 'plan.md'); fs.writeFileSync(markdown, 'existing markdown\n');
  const jsonDirectory = path.join(root, 'json-directory'); fs.mkdirSync(jsonDirectory);

  const result = cli('plan', '--repo', repo, '--log', log, '--out', markdown, '--json', jsonDirectory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /output destination is not a file/);
  assert.equal(result.stdout, '');
  assert.equal(fs.readFileSync(markdown, 'utf8'), 'existing markdown\n');
  assert.deepEqual(fs.readdirSync(jsonDirectory), []);
  fs.rmSync(root, { recursive: true, force: true });
});
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
    if (!(error instanceof RefreshConflictError)) return false;
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
      if (!(error instanceof RefreshConflictError)) return false;
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
test('CLI plan and apply accept the documented argument forms', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const planFile = path.join(root, 'plan.json');

  const planned = cli('plan', '--repo', repo, '--log', log, '--json', planFile);
  assert.equal(planned.status, 0, planned.stderr);
  assert.equal(planned.stdout, '');
  assert.equal(fs.existsSync(planFile), true);
  const applied = cli('apply', planFile, '--approve', 'safe-only', '--repo', repo, '--dry-run');
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(applied.stdout, 'would write: fixture.txt\n');
  assert.equal(fs.existsSync(path.join(repo, 'fixture.txt')), false);
  fs.rmSync(root, { recursive: true, force: true });
});
test('CLI applies a saved relative-repository plan from another directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-path-'));
  const planningDirectory = path.join(root, 'planning');
  const repo = path.join(planningDirectory, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  const log = path.join(root, 'latest.log');
  fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const planFile = path.join(planningDirectory, 'plan.json');

  const planned = spawnSync(process.execPath, [path.resolve('dist/cli.js'), 'plan', '--repo', 'repo', '--log', log, '--json', planFile], { cwd: planningDirectory, encoding: 'utf8' });
  assert.equal(planned.status, 0, planned.stderr);
  const saved = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  assert.equal(saved.repo, fs.realpathSync(repo));
  const applied = spawnSync(process.execPath, [path.resolve('dist/cli.js'), 'apply', planFile, '--dry-run'], { cwd: root, encoding: 'utf8' });
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(applied.stdout, 'would write: fixture.txt\n');
  fs.rmSync(root, { recursive: true, force: true });
});
test('CLI rejects invalid arguments before creating output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-fixture-refresh-cli-'));
  const repo = path.join(root, 'repo'); fs.mkdirSync(repo);
  const log = path.join(root, 'latest.log'); fs.writeFileSync(log, 'SNAPSHOT fixture.txt\nplanned\nEND SNAPSHOT\n');
  const output = path.join(root, 'plan.json');
  const cases: Array<{ args: string[]; message: RegExp }> = [
    { args: ['plan', '--log', log, '--bogus'], message: /unknown option: --bogus/ },
    { args: ['plan', '--log', log, '--log', log], message: /duplicate option: --log/ },
    { args: ['plan', '--log'], message: /missing value for --log/ },
    { args: ['plan', '--log', log, 'extra'], message: /unexpected argument: extra/ },
    { args: ['apply', output, '--approve', 'sometimes'], message: /invalid --approve value: sometimes/ },
    { args: ['apply', output, 'extra'], message: /unexpected argument: extra/ },
    { args: ['apply', output, '--dry-run', '--dry-run'], message: /duplicate option: --dry-run/ },
  ];
  for (const example of cases) {
    const result = cli(...example.args);
    assert.equal(result.status, 1, example.args.join(' '));
    assert.match(result.stderr, example.message);
    assert.match(result.stderr, /usage: repo-fixture-refresh/);
    assert.equal(result.stdout, '');
    assert.equal(fs.existsSync(output), false);
  }
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
