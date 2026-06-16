import { tool } from 'ai';
import { z } from 'zod';
import { webSearch, type WebSearchResponse } from './web-search';
import { runPython, MAX_CODE_LENGTH, type SandboxRunner, type SandboxResult } from './python-sandbox';
import { logger } from './logger';

export interface ChatToolsOptions {
  /** Called after every successful web_search execution so callers can keep a shared ledger. */
  onSearch?: (query: string, result: WebSearchResponse) => void;
  /**
   * Sandbox backend for the `run_python` tool. The tool is only offered to the
   * model when a runner is injected — no runner means no Python execution, so
   * the model never calls a capability that cannot run.
   */
  sandboxRunner?: SandboxRunner;
}

/**
 * Builds the set of tools offered to chat models. Currently a single tool,
 * `web_search`, which queries the configured SearXNG instance and returns
 * the results. The model is free to invoke it (or not) on every turn — there
 * is no UI toggle; the call is purely a function of the model's reasoning.
 *
 * The AI SDK v4 contract is `tool({ description, parameters, execute })` —
 * `parameters` is the Zod schema, `execute` runs the tool. We cast the
 * return to a structural `Record<string, unknown>` so the SDK's exported
 * `ToolSet` accepts it without the union narrowing in the provider
 * signature cascading into `streamText`'s strict overloads.
 */
export function buildChatTools(options: ChatToolsOptions = {}): Record<string, unknown> {
  const tools: Record<string, unknown> = {
    web_search: tool({
      // Description kept deliberately short and purely descriptive. Earlier
      // versions used "Use this whenever the user asks about ..." which
      // conditioned the model to think explicitly about WHEN to search, and it
      // would then announce that decision in its reply ("sin necesidad de
      // búsqueda, ya que..."). Just describing what the tool does lets the
      // model decide silently. (Tuned 2026-06-11 for a more fluid
      // conversation flow — see openspec/changes/2026-06-11-chat-prompt-tune/.)
      description:
        'Search the public web. Returns up to 8 results with a title, URL, and snippet for each.',
      parameters: z.object({
        query: z
          .string()
          .min(1, 'Query must not be empty')
          .max(200, 'Query is too long')
          .describe('The search query in natural language'),
      }),
      execute: async ({ query }): Promise<WebSearchResponse> => {
        const start = Date.now();
        try {
          const response = await webSearch(query);
          logger.info(
            {
              tool: 'web_search',
              query,
              took_ms: Date.now() - start,
              count: response.results.length,
              error: response.error,
            },
            'web_search: tool execution complete'
          );
          if (options.onSearch) {
            try {
              options.onSearch(query, response);
            } catch (cbErr) {
              logger.warn(
                { tool: 'web_search', query, err: String(cbErr) },
                'web_search: onSearch callback failed'
              );
            }
          }
          return response;
        } catch (err) {
          // The webSearch client already soft-fails, but the AI SDK tool
          // contract is "throw to surface to the model". We swallow here
          // and return a structured result so the model gets a clean
          // "I couldn't search" answer instead of a 500.
          logger.error(
            { tool: 'web_search', query, err: String(err) },
            'web_search: tool execute threw'
          );
          return {
            query,
            results: [],
            took_ms: Date.now() - start,
            error: 'Search temporarily unavailable',
          };
        }
      },
    }),
  };

  // run_python is feature-flagged by injection: only offered when a sandbox
  // runner is configured, so the model never calls Python execution that has
  // no backend to run it.
  if (options.sandboxRunner) {
    const runner = options.sandboxRunner;
    tools.run_python = tool({
      description: `Execute a Python 3 script in a secure sandbox and return its stdout. Standard library only — no network, no filesystem, no third-party packages. Keep scripts under ${MAX_CODE_LENGTH} characters.`,
      parameters: z.object({
        // No hard `.max()` here on purpose: a schema violation is rejected by
        // the SDK *before* execute runs, surfacing an ugly validation error to
        // the UI. Instead we let `runPython` enforce the length and soft-fail
        // with a clean, recoverable message the model can act on.
        code: z
          .string()
          .min(1, 'Code must not be empty')
          .describe(
            `The Python 3 source to execute. Print results to stdout. Keep it under ${MAX_CODE_LENGTH} characters.`
          ),
      }),
      execute: async ({ code }): Promise<SandboxResult> => {
        const start = Date.now();
        const result = await runPython(code, runner);
        logger.info(
          {
            tool: 'run_python',
            took_ms: Date.now() - start,
            bytes: code.length,
            truncated: result.truncated,
            timedOut: result.timedOut,
            error: result.error,
          },
          'run_python: tool execution complete'
        );
        return result;
      },
    });
  }

  return tools;
}
