#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
let target = 'all';
let publish = false;
let dryRun = false;

for (const arg of args) {
  if (arg === 'all' || arg === 'python' || arg === 'npm') {
    target = arg;
  } else if (arg === '--publish') {
    publish = true;
  } else if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg === '--help' || arg === '-h') {
    printUsage();
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}`);
    printUsage();
    process.exit(1);
  }
}

if (publish && dryRun) {
  console.error('Pick either --publish or --dry-run, not both.');
  process.exit(1);
}

if (!publish && !dryRun) {
  dryRun = true;
}

function printUsage() {
  console.log(`Usage: node scripts/release.mjs [all|python|npm] [--publish|--dry-run]\n\nRuns the release checks and build steps for the selected package(s).\n\nExamples:\n  node scripts/release.mjs all --dry-run\n  node scripts/release.mjs python --publish\n  node scripts/release.mjs npm --publish`);
}

function quoteWindowsArg(value) {
  if (value === '') return '""';
  const needsQuotes = /[\s&()<>|^]/.test(value) || value.includes('"');
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

function run(cmd, argsList, options = {}) {
  if (process.platform === 'win32') {
    const command = cmd === 'npm' ? 'npm.cmd' : cmd;
    const commandLine = [command, ...argsList].map(quoteWindowsArg).join(' ');
    const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd: options.cwd ?? rootDir,
      stdio: 'inherit',
      env: { ...process.env, ...options.env },
    });

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    return;
  }

  const result = spawnSync(cmd, argsList, {
    cwd: options.cwd ?? rootDir,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function pythonRelease() {
  console.log('=== Python release checks ===');
  run('uv', ['sync', '--locked'], { cwd: path.join(rootDir, 'python') });
  run('uv', ['run', 'ruff', 'check'], { cwd: path.join(rootDir, 'python') });
  run('uv', ['run', 'mypy', 'src', 'tests'], { cwd: path.join(rootDir, 'python') });
  run('uv', ['run', 'pytest'], { cwd: path.join(rootDir, 'python') });
  run('uv', ['build'], { cwd: path.join(rootDir, 'python') });

  if (publish) {
    console.log('=== Publishing Python package ===');
    run('uv', ['publish'], { cwd: path.join(rootDir, 'python') });
  } else {
    console.log('=== Python release dry run complete ===');
  }
}

function npmRelease() {
  console.log('=== JavaScript release checks ===');
  run('npm', ['install'], { cwd: path.join(rootDir, 'js') });
  run('npm', ['test'], { cwd: path.join(rootDir, 'js') });
  run('npm', ['run', 'build'], { cwd: path.join(rootDir, 'js') });

  if (publish) {
    console.log('=== Publishing npm package ===');
    run('npm', ['publish', '--provenance', '--access', 'public'], { cwd: path.join(rootDir, 'js') });
  } else {
    console.log('=== JavaScript release dry run complete ===');
    run('npm', ['pack', '--dry-run'], { cwd: path.join(rootDir, 'js') });
  }
}

try {
  if (target === 'all') {
    pythonRelease();
    npmRelease();
  } else if (target === 'python') {
    pythonRelease();
  } else if (target === 'npm') {
    npmRelease();
  }
} catch (error) {
  console.error('Release failed:');
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
}
