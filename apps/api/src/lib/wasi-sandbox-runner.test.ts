import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WasiSandboxRunner } from './wasi-sandbox-runner';

const WASM_PATH = join(__dirname, '..', '..', 'vendor', 'python.wasm');
const hasWasm = existsSync(WASM_PATH);

// Integration tests need the vendored CPython-WASI binary. They are skipped
// when it has not been fetched (`pnpm --filter @chat/api fetch:python-wasm`),
// so CI/dev without the binary stays green while local runs exercise the real
// sandbox.
describe.skipIf(!hasWasm)('WasiSandboxRunner (integration — real python.wasm)', () => {
  const runner = new WasiSandboxRunner({ wasmPath: WASM_PATH });
  const opts = { timeoutMs: 15_000, maxOutputChars: 50_000 };

  it('runs arithmetic and captures stdout', async () => {
    const res = await runner.run('print(2 + 2)', opts);
    expect(res.error).toBeUndefined();
    expect(res.stdout.trim()).toBe('4');
  });

  it('runs stdlib (statistics) code', async () => {
    const res = await runner.run('import statistics\nprint(statistics.mean([1, 2, 3, 4]))', opts);
    expect(res.error).toBeUndefined();
    expect(res.stdout.trim()).toBe('2.5');
  });

  it('has no filesystem access (no preopens)', async () => {
    const res = await runner.run('open("/etc/passwd").read()', opts);
    expect(res.error).toBeTruthy();
    expect(res.error).toMatch(/FileNotFoundError|No such file/i);
    expect(res.stdout).toBe('');
  });

  it('kills runaway code on the timeout', async () => {
    const res = await runner.run('while True:\n    pass', {
      timeoutMs: 2_000,
      maxOutputChars: 50_000,
    });
    expect(res.timedOut).toBe(true);
    expect(res.error).toMatch(/timed out/i);
  }, 10_000);

  it('surfaces a Python traceback as a soft error', async () => {
    const res = await runner.run('raise ValueError("boom")', opts);
    expect(res.error).toMatch(/ValueError: boom/);
  });
});

describe('WasiSandboxRunner.isAvailable', () => {
  it('reflects whether the binary exists at the given path', () => {
    expect(WasiSandboxRunner.isAvailable(WASM_PATH)).toBe(hasWasm);
    expect(WasiSandboxRunner.isAvailable('/does/not/exist.wasm')).toBe(false);
  });
});
