import { Worker } from 'node:worker_threads';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SandboxRunner, SandboxRunOptions, SandboxResult } from './python-sandbox';

/**
 * WASI sandbox adapter (#8 / issue #27). Runs model-generated Python inside a
 * `node:wasi` instance with **no preopens** (no host filesystem) and an empty
 * env; WASI preview1 has no sockets, so there is no network either. Each call
 * runs in a fresh `worker_thread`, which lets us hard-kill runaway code on the
 * timeout (a tight Python loop blocks its thread, so it MUST be off the main
 * event loop) and guarantees no state leaks between executions.
 *
 * The CPython-WASI binary is fetched separately (not committed) — see
 * `scripts/fetch-python-wasm.mjs`. The runner degrades to "unavailable" when
 * the binary is missing, so the `run_python` tool is simply not offered.
 */

// Self-contained worker source (CJS, eval'd) so there is no separate file to
// resolve across vitest/tsc/dist. It runs CPython once and posts back the
// captured stdout/stderr and exit code.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { WASI } = require('node:wasi');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

(async () => {
  const { wasmPath, code } = workerData;
  const dir = fs.mkdtempSync(join(tmpdir(), 'pysbx-'));
  const outPath = join(dir, 'out');
  const errPath = join(dir, 'err');
  const outFd = fs.openSync(outPath, 'w');
  const errFd = fs.openSync(errPath, 'w');
  let exit = 1;
  try {
    const wasi = new WASI({
      version: 'preview1',
      args: ['python', '-c', code],
      env: {},
      preopens: {},
      stdout: outFd,
      stderr: errFd,
    });
    const bytes = fs.readFileSync(wasmPath);
    const mod = await WebAssembly.compile(bytes);
    const instance = await WebAssembly.instantiate(mod, wasi.getImportObject());
    const rc = wasi.start(instance);
    exit = typeof rc === 'number' ? rc : 0;
  } catch (e) {
    try { fs.writeSync(errFd, String((e && e.message) || e)); } catch (_) {}
  } finally {
    try { fs.closeSync(outFd); } catch (_) {}
    try { fs.closeSync(errFd); } catch (_) {}
  }
  let stdout = '';
  let stderr = '';
  try { stdout = fs.readFileSync(outPath, 'utf8'); } catch (_) {}
  try { stderr = fs.readFileSync(errPath, 'utf8'); } catch (_) {}
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  parentPort.postMessage({ stdout, stderr, exit });
})();
`;

export function defaultPythonWasmPath(): string {
  return process.env.PYTHON_WASM_PATH ?? join(__dirname, '..', '..', 'vendor', 'python.wasm');
}

export interface WasiSandboxRunnerOptions {
  /** Path to the CPython-WASI binary. Defaults to the vendored copy. */
  wasmPath?: string;
}

export class WasiSandboxRunner implements SandboxRunner {
  private readonly wasmPath: string;

  constructor(options: WasiSandboxRunnerOptions = {}) {
    this.wasmPath = options.wasmPath ?? defaultPythonWasmPath();
  }

  /** Whether the CPython-WASI binary is present (gates offering `run_python`). */
  static isAvailable(wasmPath: string = defaultPythonWasmPath()): boolean {
    return existsSync(wasmPath);
  }

  run(code: string, options: SandboxRunOptions): Promise<SandboxResult> {
    return new Promise<SandboxResult>((resolve) => {
      const worker = new Worker(WORKER_SOURCE, {
        eval: true,
        workerData: { wasmPath: this.wasmPath, code },
        execArgv: ['--experimental-wasi-unstable-preview1'],
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });

      let settled = false;
      const finish = (result: SandboxResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void worker.terminate();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({
          stdout: '',
          error: `Execution timed out after ${options.timeoutMs}ms`,
          timedOut: true,
        });
      }, options.timeoutMs);

      worker.on('message', (msg: { stdout: string; stderr: string; exit: number }) => {
        if (msg.exit === 0) {
          finish({ stdout: msg.stdout });
        } else {
          finish({
            stdout: msg.stdout,
            error: cleanStderr(msg.stderr) || `Exited with code ${msg.exit}`,
          });
        }
      });

      worker.on('error', (err) => finish({ stdout: '', error: `Sandbox error: ${err.message}` }));

      worker.on('exit', (code) => {
        if (!settled) {
          finish({ stdout: '', error: code === 0 ? 'No output produced' : `Worker exited (${code})` });
        }
      });
    });
  }
}

function cleanStderr(stderr: string): string {
  const trimmed = (stderr || '').trim();
  if (!trimmed) return '';
  // Keep the tail — the exception line is at the bottom of a Python traceback.
  return trimmed.length > 2_000 ? trimmed.slice(-2_000) : trimmed;
}

let cachedRunner: WasiSandboxRunner | undefined;
let resolved = false;

/**
 * Returns the shared WASI runner when the CPython binary is present, or
 * `undefined` otherwise. Callers pass this straight to `buildChatTools` —
 * `undefined` means the `run_python` tool is simply not offered.
 */
export function getDefaultSandboxRunner(): WasiSandboxRunner | undefined {
  if (!resolved) {
    resolved = true;
    cachedRunner = WasiSandboxRunner.isAvailable() ? new WasiSandboxRunner() : undefined;
  }
  return cachedRunner;
}
