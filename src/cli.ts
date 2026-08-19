#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { planRefresh, renderMarkdown, applyPlan, validateRefreshPlan } from './index.js';

const usage = 'usage: repo-fixture-refresh plan --log <log> [--repo <path>] [--out <file>] [--json <file>]\n' +
  '       repo-fixture-refresh apply <plan.json> [--repo <path>] [--approve safe-only|all] [--dry-run]';

type Parsed = { positionals: string[]; values: Map<string, string>; flags: Set<string> };

function parse(args: string[], valueOptions: Set<string>, flagOptions: Set<string>): Parsed {
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    if (!token.startsWith('--')) { positionals.push(token); continue; }
    if (!valueOptions.has(token) && !flagOptions.has(token)) throw new Error(`unknown option: ${token}`);
    if (values.has(token) || flags.has(token)) throw new Error(`duplicate option: ${token}`);
    if (flagOptions.has(token)) { flags.add(token); continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${token}`);
    values.set(token, value);
  }
  return { positionals, values, flags };
}

type Output = { file: string; body: string; temporary?: string; backup?: string; committed?: boolean };

function resolvedDestination(file: string): string {
  const absolute = path.resolve(file);
  if (fs.existsSync(absolute)) return fs.realpathSync(absolute);
  const parent = fs.realpathSync(path.dirname(absolute));
  return path.join(parent, path.basename(absolute));
}

function saveOutputs(requested: Array<{ file: string | undefined; body: string }>) {
  const outputs: Output[] = requested.flatMap(({ file, body }) => file ? [{ file: path.resolve(file), body }] : []);
  for (const output of outputs) fs.mkdirSync(path.dirname(output.file), { recursive: true });
  if (outputs.length === 2 && resolvedDestination(outputs[0]!.file) === resolvedDestination(outputs[1]!.file)) {
    throw new Error('--out and --json must resolve to different files');
  }

  try {
    for (const [index, output] of outputs.entries()) {
      if (fs.existsSync(output.file) && !fs.statSync(output.file).isFile()) throw new Error(`output destination is not a file: ${output.file}`);
      output.temporary = path.join(path.dirname(output.file), `.${path.basename(output.file)}.${process.pid}.${index}.tmp`);
      fs.writeFileSync(output.temporary, output.body, { flag: 'wx' });
    }
    for (const [index, output] of outputs.entries()) {
      if (fs.existsSync(output.file)) {
        output.backup = path.join(path.dirname(output.file), `.${path.basename(output.file)}.${process.pid}.${index}.bak`);
        fs.renameSync(output.file, output.backup);
      }
      fs.renameSync(output.temporary!, output.file);
      output.temporary = undefined;
      output.committed = true;
    }
    for (const output of outputs) if (output.backup) fs.rmSync(output.backup, { force: true });
  } catch (error) {
    for (const output of [...outputs].reverse()) {
      if (output.backup) {
        fs.rmSync(output.file, { force: true });
        if (fs.existsSync(output.backup)) fs.renameSync(output.backup, output.file);
      } else if (output.committed) {
        fs.rmSync(output.file, { force: true });
      }
      if (output.temporary) fs.rmSync(output.temporary, { force: true });
    }
    throw error;
  }
}

try {
  const command = process.argv[2];
  if (command === '--help' || command === '-h') {
    console.log(usage);
  } else if (command === 'plan') {
    const parsed = parse(process.argv.slice(3), new Set(['--repo', '--log', '--out', '--json']), new Set());
    if (parsed.positionals.length) throw new Error(`unexpected argument: ${parsed.positionals[0]}`);
    const log = parsed.values.get('--log');
    if (!log) throw new Error('missing required option: --log');
    const plan = planRefresh(parsed.values.get('--repo') ?? '.', log);
    const markdown = renderMarkdown(plan);
    saveOutputs([
      { file: parsed.values.get('--out'), body: markdown },
      { file: parsed.values.get('--json'), body: `${JSON.stringify(plan, null, 2)}\n` },
    ]);
    if (!parsed.values.has('--out') && !parsed.values.has('--json')) console.log(markdown);
  } else if (command === 'apply') {
    const parsed = parse(process.argv.slice(3), new Set(['--repo', '--approve']), new Set(['--dry-run']));
    if (!parsed.positionals.length) throw new Error('missing plan json');
    if (parsed.positionals.length > 1) throw new Error(`unexpected argument: ${parsed.positionals[1]}`);
    const approval = parsed.values.get('--approve') ?? 'safe-only';
    if (approval !== 'safe-only' && approval !== 'all') throw new Error(`invalid --approve value: ${approval}`);
    const plan: unknown = JSON.parse(fs.readFileSync(parsed.positionals[0]!, 'utf8'));
    validateRefreshPlan(plan);
    const repo = parsed.values.get('--repo');
    if (repo) plan.repo = repo;
    const dryRun = parsed.flags.has('--dry-run');
    const written = applyPlan(plan, approval, dryRun);
    console.log(`${dryRun ? 'would write: ' : 'wrote: '}${written.join(', ') || 'none'}`);
  } else {
    throw new Error(command ? `unknown command: ${command}` : 'missing command');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage);
  process.exit(1);
}
