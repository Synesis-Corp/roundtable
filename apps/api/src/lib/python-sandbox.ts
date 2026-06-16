/**
 * Runtime-agnostic core for executing model-generated Python (#8).
 *
 * The actual isolation boundary lives in a `SandboxRunner` adapter (WASI via
 * `node:wasi` for v1, gVisor later) — see issue #27. This module owns the parts
 * that are independent of the runtime: input validation, a defence-in-depth
 * stdlib import allowlist, output capping, and the `runPython` orchestrator.
 *
 * The import allowlist is NOT the security boundary (the sandbox is); it is a
 * cheap pre-flight that rejects obviously-unsafe code before paying the cost of
 * a sandbox round-trip, and keeps v1 honest about being stdlib-only.
 */

export interface SandboxRunOptions {
  /** Hard wall-clock limit; the runner must kill execution past this. */
  timeoutMs: number;
  /** Maximum characters of stdout returned to the model. */
  maxOutputChars: number;
}

export interface SandboxResult {
  stdout: string;
  /** Optional repr of the last expression's value, when the runner provides it. */
  result?: string;
  /** Soft error: set instead of throwing so the model gets a clean answer. */
  error?: string;
  /** True when stdout was capped by `maxOutputChars`. */
  truncated?: boolean;
  /** True when the runner aborted execution on the timeout. */
  timedOut?: boolean;
}

/**
 * The pluggable execution backend. Implementations MUST enforce the real
 * isolation (no host, no secrets, no network, no filesystem) and honour the
 * timeout. `run` should resolve with a soft error rather than throw.
 */
export interface SandboxRunner {
  run(code: string, options: SandboxRunOptions): Promise<SandboxResult>;
}

export const DEFAULT_SANDBOX_OPTIONS: SandboxRunOptions = {
  timeoutMs: 10_000,
  maxOutputChars: 50_000,
};

// Generous cap: model-generated algorithms (Monte Carlo, simulations, etc.)
// routinely exceed 10 KB. Oversized code soft-fails in `runPython` with a clean
// message the model can recover from — never a hard schema crash.
export const MAX_CODE_LENGTH = 50_000;

/**
 * Safe, pure-Python stdlib modules permitted in v1. Anything not listed is
 * blocked (deny-by-default), mirroring the WASI capability model.
 */
export const PYTHON_IMPORT_ALLOWLIST: ReadonlySet<string> = new Set([
  'math',
  'cmath',
  'statistics',
  'random',
  'decimal',
  'fractions',
  'json',
  're',
  'datetime',
  'time',
  'itertools',
  'functools',
  'operator',
  'collections',
  'heapq',
  'bisect',
  'string',
  'textwrap',
  'unicodedata',
  'array',
  'enum',
  'typing',
  'dataclasses',
  'numbers',
]);

export interface ImportCheck {
  ok: boolean;
  blocked: string[];
}

/**
 * Extracts the root module of every `import`/`from ... import` statement and
 * checks it against the allowlist. Line-based and intentionally simple: it is a
 * pre-flight, not the boundary.
 */
export function checkImports(code: string): ImportCheck {
  const blocked = new Set<string>();
  const lines = code.split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    let module: string | undefined;

    const fromMatch = /^from\s+([A-Za-z_][\w.]*)\s+import\b/.exec(line);
    if (fromMatch) {
      module = fromMatch[1];
    } else {
      const importMatch = /^import\s+(.+)$/.exec(line);
      if (importMatch) {
        // `import a, b.c as d` -> take the first module before a comma.
        module = importMatch[1].split(',')[0].trim();
      }
    }

    if (!module) continue;

    // Strip `as alias` and dotted submodules down to the root package.
    const root = module
      .split(/\s+as\s+/)[0]
      .trim()
      .split('.')[0];
    if (root && !PYTHON_IMPORT_ALLOWLIST.has(root)) {
      blocked.add(root);
    }
  }

  return { ok: blocked.size === 0, blocked: [...blocked] };
}

export function capOutput(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

/**
 * A no-op runner for tests and local dev where the real WASI sandbox is not
 * wired. Echoes a preset result and records the last code it was handed.
 */
export class MockSandboxRunner implements SandboxRunner {
  lastCode: string | null = null;
  constructor(private readonly preset: SandboxResult = { stdout: '' }) {}
  async run(code: string, _options: SandboxRunOptions): Promise<SandboxResult> {
    this.lastCode = code;
    return { ...this.preset };
  }
}

/**
 * Validates, pre-flights and runs Python code through a `SandboxRunner`.
 * Never throws — every failure path returns a soft `SandboxResult` so the
 * calling tool can hand the model a clean answer.
 */
export async function runPython(
  code: string,
  runner: SandboxRunner,
  options: SandboxRunOptions = DEFAULT_SANDBOX_OPTIONS
): Promise<SandboxResult> {
  if (code.trim().length === 0) {
    return { stdout: '', error: 'Code must not be empty' };
  }
  if (code.length > MAX_CODE_LENGTH) {
    return { stdout: '', error: `Code is too long (max ${MAX_CODE_LENGTH} chars)` };
  }

  const imports = checkImports(code);
  if (!imports.ok) {
    return {
      stdout: '',
      error: `Blocked imports (only stdlib is allowed in this sandbox): ${imports.blocked.join(', ')}`,
    };
  }

  let raw: SandboxResult;
  try {
    raw = await runner.run(code, options);
  } catch {
    return { stdout: '', error: 'Sandbox execution failed' };
  }

  const capped = capOutput(raw.stdout ?? '', options.maxOutputChars);
  return {
    ...raw,
    stdout: capped.text,
    truncated: raw.truncated || capped.truncated || undefined,
  };
}
