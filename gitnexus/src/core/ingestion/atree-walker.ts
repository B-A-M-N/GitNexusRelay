import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { shouldIgnorePath } from '../../config/ignore-service.js';
import { loadIgnoreRules } from '../../config/ignore-service.js';
import { DEFAULT_MAX_FILE_SIZE_BYTES, getMaxFileSizeBytes } from './utils/max-file-size.js';
import { isVerboseIngestionEnabled } from './utils/verbose.js';

interface ScannedFile {
  path: string;
  size: number;
}

interface ATreeNodeMeta {
  is_dir: boolean;
  is_symlink: boolean;
  is_hidden: boolean;
  is_exec: boolean;
  mode: number;
  size: number;
  name: string;
}

interface ATreeOutput {
  schema_version: number;
  version: string;
  root: string;
  root_name: string;
  elapsed_ms: number;
  threads: number;
  options: {
    max_depth: number;
    max_nodes: number;
    include_files: boolean;
    tree_mode: boolean;
  };
  stats: {
    total_nodes: number;
    folders: number;
    files: number;
    symlinks: number;
    executables: number;
    hidden: number;
    total_size_bytes: number;
  };
  truncated: boolean;
  depths: Record<string, number>;
  nodes: Record<string, ATreeNodeMeta>;
  edges: Record<string, string[]>;
}

let _cachedPath: string | null | undefined = undefined;

export async function resolveATreePath(): Promise<string | null> {
  if (_cachedPath !== undefined) return _cachedPath;

  // 1. Env var override
  if (process.env.ATREE_BINARY_PATH) {
    try {
      await fs.promises.access(process.env.ATREE_BINARY_PATH);
      _cachedPath = process.env.ATREE_BINARY_PATH;
      return _cachedPath;
    } catch {
      // fall through
    }
  }

  // 2. Check PATH
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, 'atree');
    try {
      await fs.promises.access(candidate);
      _cachedPath = candidate;
      return _cachedPath;
    } catch {
      continue;
    }
  }

  // 3. Bundled cache
  const cached = path.join(process.cwd(), 'node_modules', '.cache', 'atree', 'atree');
  try {
    await fs.promises.access(cached);
    _cachedPath = cached;
    return _cachedPath;
  } catch {
    // fall through
  }

  _cachedPath = null;
  return null;
}

export function clearATreePathCache(): void {
  _cachedPath = undefined;
}

/**
 * Run ATree scan. Returns filtered ScannedFile[] on success, null on failure/unavailable.
 */
export async function tryATreeWalker(
  repoPath: string,
  onProgress?: (current: number, total: number, filePath: string) => void,
): Promise<{ files: ScannedFile[]; atreeMs: number } | null> {
  const atreePath = await resolveATreePath();
  if (!atreePath) return null;

  const maxFileSizeBytes = getMaxFileSizeBytes();
  const ignoreRules = await loadIgnoreRules(repoPath);

  return new Promise((resolve) => {
    const child = execFile(
      atreePath,
      ['--json', '--files', '--no-limit', '--root', repoPath],
      { maxBuffer: 100 * 1024 * 1024 }, // 100MB stdout buffer
      (err, stdout, stderr) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }

        let parsed: ATreeOutput;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          resolve(null);
          return;
        }

        const root = parsed.root;
        const scannedFiles: ScannedFile[] = [];
        let skippedLarge = 0;
        const skippedLargePaths: string[] = [];

        for (const [nodeId, meta] of Object.entries(parsed.nodes)) {
          // Skip directories
          if (meta.is_dir) continue;

          // nodeId is the relative path from root
          const rel = nodeId.replace(/\\/g, '/');
          if (!rel || rel.startsWith('..')) continue;

          // Apply hardcoded ignore list
          if (shouldIgnorePath(rel)) continue;

          // Apply .gitignore / .gitnexusignore rules
          if (ignoreRules && ignoreRules.ignores(rel)) continue;

          // Apply size filter
          const size = meta.size ?? 0;
          if (size > maxFileSizeBytes) {
            skippedLarge++;
            skippedLargePaths.push(rel);
            continue;
          }

          scannedFiles.push({ path: rel, size });
        }

        if (skippedLarge > 0) {
          const isDefault = maxFileSizeBytes === DEFAULT_MAX_FILE_SIZE_BYTES;
          const suffix = isDefault ? ', likely generated/vendored' : '';
          console.warn(
            `  Skipped ${skippedLarge} large files (>${maxFileSizeBytes / 1024}KB${suffix})`,
          );
          if (isVerboseIngestionEnabled()) {
            for (const p of skippedLargePaths.slice(0, 50)) {
              console.warn(`  - ${p}`);
            }
          }
        }

        // Progress: ATree is single-shot, report completion at 100%
        onProgress?.(scannedFiles.length, scannedFiles.length, '');

        resolve({ files: scannedFiles, atreeMs: parsed.elapsed_ms });
      },
    );

    // Timeout: kill after 3 minutes
    setTimeout(() => {
      child.kill();
      resolve(null);
    }, 180_000);
  });
}
