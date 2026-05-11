#!/usr/bin/env node
/**
 * Postinstall script to install the ATree binary for fast filesystem scanning.
 *
 * Installation priority:
 * 1. ATREE_BINARY_PATH env var (user manually installed)
 * 2. atree on PATH (system-installed)
 * 3. node_modules/.cache/atree/ (installed by this script)
 * 4. Clone + cargo build from source (if Rust toolchain available)
 *
 * If all methods fail, ATree is unavailable and glob+stat is used as fallback.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const CACHE_DIR = path.join(__dirname, '..', 'node_modules', '.cache', 'atree');
const BINARY_PATH = path.join(CACHE_DIR, 'atree');

function alreadyInstalled() {
  try {
    fs.accessSync(BINARY_PATH, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function checkOnPath() {
  try {
    execSync('which atree', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkEnvVar() {
  return !!process.env.ATREE_BINARY_PATH;
}

async function installFromSource() {
  // Find ATree source - prefer checking for a cloned repo nearby
  // Otherwise clone it
  const atreeSourcePaths = [
    path.join(__dirname, '..', '..', 'ATree'),
    path.join(__dirname, '..', '..', '..', 'ATree'),
    path.join(__dirname, '..', '..', '..', '..', 'ATree'),
  ];

  let atreeDir = null;
  for (const p of atreeSourcePaths) {
    const cargoToml = path.join(p, 'Cargo.toml');
    try {
      fs.accessSync(cargoToml);
      atreeDir = p;
      break;
    } catch {
      continue;
    }
  }

  if (!atreeDir) {
    // Clone ATree
    console.log('[atree] Cloning ATree repository...');
    try {
      execSync('git clone --depth 1 https://github.com/Unity-Lab-AI/ATree.git ATree-tmp', {
        cwd: path.join(__dirname, '..'),
        stdio: 'pipe',
        timeout: 60000,
      });
      atreeDir = path.join(__dirname, '..', 'ATree-tmp');
    } catch (err) {
      console.warn('[atree] Could not clone ATree:', err.message);
      return false;
    }
  }

  console.log('[atree] Building ATree from source (this may take a few minutes)...');
  try {
    execSync('cargo build --release', {
      cwd: atreeDir,
      stdio: 'pipe',
      timeout: 600000, // 10 minutes
    });

    // Move the binary to cache
    const srcBinary = path.join(atreeDir, 'target', 'release', 'atree');
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.copyFileSync(srcBinary, BINARY_PATH);
    fs.chmodSync(BINARY_PATH, '755');

    // Cleanup cloned source unless it was pre-existing
    const isTmpClone = atreeDir.includes('ATree-tmp');
    if (isTmpClone) {
      fs.rmSync(atreeDir, { recursive: true, force: true });
    }

    console.log('[atree] ATree built and installed successfully');
    return true;
  } catch (err) {
    console.warn('[atree] Could not build ATree:', err.message);
    console.warn('[atree] ATree unavailable — filesystem scanning will use glob+stat fallback.');
    // Cleanup tmp clone on failure
    if (atreeDir?.includes('ATree-tmp')) {
      fs.rmSync(atreeDir, { recursive: true, force: true });
    }
    return false;
  }
}

function main() {
  // Skip if already installed via env var or PATH
  if (checkEnvVar() || checkOnPath()) {
    return;
  }

  // Skip if already cached
  if (alreadyInstalled()) {
    return;
  }

  // Try to build from source
  console.log('[atree] ATree not found, attempting to build from source...');

  const hasRust = spawnSync('cargo', ['--version'], { stdio: 'pipe' }).status === 0;
  if (!hasRust) {
    console.warn('[atree] Rust toolchain not found (cargo --version failed).');
    console.warn('[atree] ATree unavailable — filesystem scanning will use glob+stat fallback.');
    console.warn('[atree] To enable ATree, install Rust: https://rustup.rs/');
    return;
  }

  installFromSource();
}

main();