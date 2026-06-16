/**
 * Upper bound on agentic tool-call rounds for a single chat turn — the AI SDK
 * v4 `maxSteps` value passed to `streamText`/`generateText`.
 *
 * READ THIS BEFORE "JUST REMOVING IT":
 * In the AI SDK v4 the DEFAULT is `maxSteps: 1`. With 1, the model generates
 * ONCE: if that generation is a `web_search` tool call, the SDK stops and
 * NEVER feeds the tool result back to the model — so the assistant emits a
 * tool call and no final answer (the "se queda "Pensando…" y nunca responde"
 * bug). Omitting `maxSteps` is therefore NOT "no limit" — it is the WORST
 * limit (1). The value is what ENABLES the multi-step agentic loop at all.
 *
 * The loop ends naturally on the first step the model returns WITHOUT a tool
 * call (i.e. it writes the answer). This bound only matters as a safety rail
 * for a model that keeps searching forever (runaway token spend). We set it
 * high enough that it never cuts a healthy conversation short, while still
 * capping a pathological loop. If you want "more room", raise this number —
 * do not delete the field.
 */
export const MAX_TOOL_STEPS = 16;
