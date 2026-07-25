/**
 * ⚔️ Blade Build Script
 *
 * Compiles TypeScript source to ESM JavaScript using bun.
 * Preserves source directory structure in dist/.
 * Generates type declarations via tsc.
 *
 * Usage:
 *   bun run build.ts              # Production build
 *   BLADE_DEV=1 bun run build.ts  # Dev build (no minify)
 *
 * Copyright (c) 2026 Blade Contributors
 * Licensed under MIT License
 */

import { build, type BuildConfig } from 'bun';
import { rmSync, existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = process.env.BLADE_DEV === '1';
const SRC = resolve(__dirname, 'src');
const OUT = resolve(__dirname, 'dist');

interface EntryPoint {
  path: string;
  out: string;
}

function findEntryPoints(dir: string): EntryPoint[] {
  // Only compile Blade's own source files, not the Blade reference source
  const bladeDirs = [
    'src/index.ts',
    'src/providers/',
    'src/engine/',
  ];

  const entries: EntryPoint[] = [];

  for (const bladePath of bladeDirs) {
    const full = resolve(__dirname, bladePath);

    if (full.endsWith('.ts')) {
      // Single file
      entries.push({
        path: full,
        out: relative(SRC, full).replace(/\.tsx?$/, '.js'),
      });
    } else {
      // Directory - find all .ts files
      const items = readdirSync(full, { withFileTypes: true, recursive: true });
      for (const item of items) {
        if (!item.isFile()) continue;
        if (!item.name.endsWith('.ts') && !item.name.endsWith('.tsx')) continue;
        if (item.name.endsWith('.test.ts')) continue;

        const filePath = join(item.parentPath, item.name);
        entries.push({
          path: filePath,
          out: relative(SRC, filePath).replace(/\.tsx?$/, '.js'),
        });
      }
    }
  }

  return entries;
}

async function main() {
  const start = performance.now();

  // Clean
  if (existsSync(OUT)) {
    rmSync(OUT, { recursive: true, force: true });
    console.log('  Cleaned dist/');
  }

  // Step 1: tsc for type declarations
  console.log('  Generating type declarations...');
  const tscResult = spawnSync('npx', ['tsc', '--project', 'tsconfig.json', '--emitDeclarationOnly', '--outDir', OUT], {
    cwd: __dirname,
    stdio: isDev ? 'inherit' : 'pipe',
    encoding: 'utf-8',
  });

  if (tscResult.status !== 0) {
    if (!isDev) {
      // Non-fatal: declarations are nice-to-have
      console.log('  (type declarations skipped �?tsc not available)');
    } else {
      console.error('  tsc stderr:', tscResult.stderr);
    }
  } else {
    const dtsCount = countFiles(OUT, f => f.endsWith('.d.ts'));
    console.log(`  ${dtsCount} .d.ts files generated`);
  }

  // Step 2: bun build for JS output
  const entries = findEntryPoints(SRC);
  console.log(`\n  Building ${entries.length} entry points...`);

  const config: BuildConfig = {
    entrypoints: entries.map(e => e.path),
    outdir: OUT,
    target: 'node',
    format: 'esm',
    sourcemap: isDev ? 'external' : 'none',
    minify: false, // disable to avoid class rename inconsistencies
    // Use naming pattern to preserve directory structure
    naming: '[dir]/[name].[ext]',
    root: SRC,
    splitting: false, // single-file output per entry, avoids chunk loading issues
    external: [],
  };

  const result = await build(config);

  if (!result.success) {
    console.error('\n�?Build failed:');
    for (const log of result.logs) {
      // Filter out info-level logs
      if (log.kind === 'buildError' || log.kind === 'resolveError') {
        console.error(`  ${log}`);
      }
    }
    process.exit(1);
  }

  // Log output
  const jsFiles = countFiles(OUT, f => f.endsWith('.js'));
  const totalSize = result.outputs.reduce((sum, o) => sum + o.size, 0);

  console.log(`\n  ${jsFiles} JS files, ${result.outputs.length} output chunks`);
  console.log(`  Total size: ${formatSize(totalSize)}`);
  console.log(`\n �?Build complete in ${((performance.now() - start) / 1000).toFixed(2)}s`);

  if (isDev) {
    console.log('\n  Output files:');
    for (const f of result.outputs.map(o => o.path).sort()) {
      console.log(`    ${relative(OUT, f)}`);
    }
  }
}

function countFiles(dir: string, predicate: (name: string) => boolean): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  try {
    const items = readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const item of items) {
      if (item.isFile() && predicate(item.name)) count++;
    }
  } catch { /* ignore */ }
  return count;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

main().catch(err => {
  console.error('Build error:', err);
  process.exit(1);
});

