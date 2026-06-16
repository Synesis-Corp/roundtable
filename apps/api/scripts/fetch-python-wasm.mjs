#!/usr/bin/env node
/**
 * Fetches the CPython-WASI binary used by WasiSandboxRunner (#8 / issue #27).
 *
 * Pinned to a specific VMware Labs wasm-language-runtimes release + SHA-256 so
 * the download is reproducible and tamper-evident. The binary is NOT committed
 * (see apps/api/.gitignore + DECISIONS.md → Seguridad); this script runs in the
 * Docker build and can be run manually for local dev:
 *
 *   pnpm --filter @chat/api fetch:python-wasm
 *
 * A checksum mismatch ABORTS (no `|| true`): a corrupted/swapped runtime must
 * never silently power the sandbox.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PYTHON_VERSION = '3.12.0';
const RELEASE_TAG = 'python/3.12.0+20231211-040d5a6';
const URL = `https://github.com/vmware-labs/webassembly-language-runtimes/releases/download/${encodeURIComponent(
  RELEASE_TAG
)}/python-${PYTHON_VERSION}.wasm`;
const EXPECTED_SHA256 = 'e5dc5a398b07b54ea8fdb503bf68fb583d533f10ec3f930963e02b9505f7a763';

const here = dirname(fileURLToPath(import.meta.url));
const DEST = join(here, '..', 'vendor', 'python.wasm');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function alreadyValid() {
  try {
    await stat(DEST);
    const buf = await readFile(DEST);
    return sha256(buf) === EXPECTED_SHA256;
  } catch {
    return false;
  }
}

async function main() {
  if (await alreadyValid()) {
    console.log(`[fetch-python-wasm] up to date: ${DEST}`);
    return;
  }

  console.log(`[fetch-python-wasm] downloading CPython ${PYTHON_VERSION} (WASI) ...`);
  const res = await fetch(URL, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} for ${URL}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const actual = sha256(buf);
  if (actual !== EXPECTED_SHA256) {
    throw new Error(
      `[fetch-python-wasm] SHA-256 mismatch — refusing to install.\n  expected: ${EXPECTED_SHA256}\n  actual:   ${actual}`
    );
  }

  await mkdir(dirname(DEST), { recursive: true });
  await writeFile(DEST, buf);
  console.log(`[fetch-python-wasm] OK (${buf.length} bytes, sha256 verified) → ${DEST}`);
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
