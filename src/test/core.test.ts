import test from 'node:test'; import assert from 'node:assert/strict';
import { planRefresh, applyPlan } from '../index.js';
test('plans safe and risky fixture changes', () => { const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log'); assert.equal(plan.changes.find(c=>c.file==='fixtures/output.txt')?.status, 'safe-update'); assert.equal(plan.changes.find(c=>c.file==='fixtures/risky.txt')?.status, 'needs-review'); });
test('dry run apply writes only safe updates by default', () => { const plan = planRefresh('fixtures/sample-repo', 'fixtures/latest-smoke.log'); assert.deepEqual(applyPlan(plan, 'safe-only', true), ['fixtures/output.txt']); });
