#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const allowed = new Set(['dist', '.test-dist']);
const targets = process.argv.slice(2);
if (targets.length === 0) targets.push('dist');

for (const target of targets) {
  if (!allowed.has(target)) {
    console.error(`Refusing to clean unsupported build directory: ${target}`);
    process.exitCode = 1;
    continue;
  }
  await rm(resolve(target), { recursive: true, force: true });
}
