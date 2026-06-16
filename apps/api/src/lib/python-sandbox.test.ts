import { describe, expect, it, vi } from 'vitest';
import {
  checkImports,
  capOutput,
  runPython,
  MockSandboxRunner,
  PYTHON_IMPORT_ALLOWLIST,
  MAX_CODE_LENGTH,
  DEFAULT_SANDBOX_OPTIONS,
  type SandboxRunner,
  type SandboxResult,
} from './python-sandbox';

describe('checkImports — stdlib allowlist (deny-by-default)', () => {
  it('allows whitelisted stdlib modules', () => {
    expect(checkImports('import math').ok).toBe(true);
    expect(checkImports('from statistics import mean, median').ok).toBe(true);
    expect(checkImports('import json\nimport re').ok).toBe(true);
    expect(checkImports('print(2 + 2)').ok).toBe(true); // no imports at all
  });

  it('blocks modules that are not on the allowlist', () => {
    expect(checkImports('import os').ok).toBe(false);
    expect(checkImports('import socket').ok).toBe(false);
    expect(checkImports('from urllib import request').ok).toBe(false);
    expect(checkImports('import subprocess').ok).toBe(false);
  });

  it('reports which modules were blocked', () => {
    const r = checkImports('import math\nimport os\nfrom socket import socket');
    expect(r.ok).toBe(false);
    expect(r.blocked).toEqual(expect.arrayContaining(['os', 'socket']));
    expect(r.blocked).not.toContain('math');
  });

  it('matches submodule roots against the allowlist (os.path -> os blocked)', () => {
    expect(checkImports('import os.path').ok).toBe(false);
  });

  it('exposes a non-empty allowlist that includes the documented safe modules', () => {
    for (const m of ['math', 'statistics', 'json', 're', 'datetime', 'itertools', 'collections', 'random']) {
      expect(PYTHON_IMPORT_ALLOWLIST.has(m)).toBe(true);
    }
    expect(PYTHON_IMPORT_ALLOWLIST.has('os')).toBe(false);
  });
});

describe('capOutput', () => {
  it('leaves short output untouched', () => {
    expect(capOutput('hello', 100)).toEqual({ text: 'hello', truncated: false });
  });

  it('truncates output beyond the cap and flags it', () => {
    const r = capOutput('a'.repeat(50), 10);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBe(10);
  });
});

describe('MockSandboxRunner', () => {
  it('returns the preset result and records the code it received', async () => {
    const runner = new MockSandboxRunner({ stdout: '42\n', result: '42' });
    const res = await runner.run('print(42)', DEFAULT_SANDBOX_OPTIONS);
    expect(res).toEqual({ stdout: '42\n', result: '42' });
    expect(runner.lastCode).toBe('print(42)');
  });
});

describe('runPython — orchestrator', () => {
  const okRunner = (): SandboxRunner => new MockSandboxRunner({ stdout: 'ok\n' });

  it('rejects empty code without calling the runner', async () => {
    const runner = okRunner();
    const spy = vi.spyOn(runner, 'run');
    const res = await runPython('   ', runner);
    expect(res.error).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('allows scripts well over the old 10k cap (real generated algorithms are large)', async () => {
    const runner = new MockSandboxRunner({ stdout: 'ok\n' });
    const spy = vi.spyOn(runner, 'run');
    // ~18 KB — would have been rejected under the old 10000 limit.
    const res = await runPython('x = 1\n' + 'y = 2\n'.repeat(3_000), runner);
    expect(res.error).toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it('rejects code longer than MAX_CODE_LENGTH without calling the runner', async () => {
    const runner = okRunner();
    const spy = vi.spyOn(runner, 'run');
    const res = await runPython('x = 1\n' + 'a'.repeat(MAX_CODE_LENGTH + 1), runner);
    expect(res.error).toMatch(/too long|largo/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects blocked imports without calling the runner', async () => {
    const runner = okRunner();
    const spy = vi.spyOn(runner, 'run');
    const res = await runPython('import os\nos.system("rm -rf /")', runner);
    expect(res.error).toMatch(/import/i);
    expect(res.error).toMatch(/os/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('runs allowed code through the runner and returns its result', async () => {
    const runner = new MockSandboxRunner({ stdout: '4\n', result: '4' });
    const res = await runPython('import math\nprint(2 + 2)', runner);
    expect(res.stdout).toBe('4\n');
    expect(res.result).toBe('4');
  });

  it('caps oversized runner stdout', async () => {
    const runner = new MockSandboxRunner({ stdout: 'a'.repeat(100) });
    const res = await runPython('print("a" * 100)', runner, {
      timeoutMs: 1_000,
      maxOutputChars: 10,
    });
    expect(res.truncated).toBe(true);
    expect(res.stdout.length).toBe(10);
  });

  it('never throws — a runner failure becomes a soft error result', async () => {
    const runner: SandboxRunner = {
      run: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const res: SandboxResult = await runPython('print(1)', runner);
    expect(res.error).toBeTruthy();
    expect(res.stdout).toBe('');
  });
});
