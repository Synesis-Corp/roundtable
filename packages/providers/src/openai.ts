import type {
  ProviderPlugin,
  ModelCapability,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  ToolSet,
  StructuredResponse,
} from "@chat/sdk";
import type { ZodType } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, generateObject } from "ai";
import { getModel } from "@chat/router";
import { convertMessages, throwIfErrorPart } from "./utils";
import { buildProviderOptions } from "./effort";
import { MAX_TOOL_STEPS } from "./constants";

export interface OpenAIConfig {
  id?: string;
  name?: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  useResponsesApi?: boolean;
  /**
   * Forwarded to `createOpenAI` as-is. Pass `null` to explicitly omit the
   * `OpenAI-Organization` header (the AI SDK's default sends the literal
   * string "undefined" if not provided, which ChatGPT rejects).
   */
  organization?: string | null;
  /** Same as `organization`, for the `OpenAI-Project` header. */
  project?: string | null;
}

export class OpenAIProvider implements ProviderPlugin {
  id: string;
  name: string;
  private baseURL?: string;
  private headers?: Record<string, string>;
  private fetchFn?: typeof fetch;
  private useResponsesApi: boolean;
  private organization?: string | null;
  private project?: string | null;

  constructor(config?: OpenAIConfig) {
    this.id = config?.id ?? "openai";
    this.name = config?.name ?? "OpenAI";
    this.baseURL = config?.baseURL;
    this.headers = config?.headers;
    this.fetchFn = config?.fetch;
    this.useResponsesApi = config?.useResponsesApi ?? false;
    this.organization = config?.organization;
    this.project = config?.project;
  }

  getCapabilities(): ModelCapability[] {
    return [
      {
        modelId: "gpt-4o",
        provider: this.id,
        modalities: ["text", "image"],
        features: ["tool-use", "vision", "structured-output"],
        contextWindow: 128000,
      },
      {
        modelId: "gpt-4o-mini",
        provider: this.id,
        modalities: ["text", "image"],
        features: ["tool-use", "vision"],
        contextWindow: 128000,
      },
      {
        modelId: "o3-mini",
        provider: this.id,
        modalities: ["text"],
        features: ["reasoning", "tool-use"],
        contextWindow: 200000,
      },
    ];
  }

  private getClient(apiKey: string) {
    return createOpenAI({
      apiKey,
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
      ...(this.headers ? { headers: this.headers } : {}),
      ...(this.fetchFn ? { fetch: this.fetchFn } : {}),
      // Only forward organization/project when the caller set a real string.
      // null and undefined both mean "omit the header" — the AI SDK would
      // otherwise serialize `undefined` as the literal string "undefined".
      ...(typeof this.organization === "string" ? { organization: this.organization } : {}),
      ...(typeof this.project === "string" ? { project: this.project } : {}),
    });
  }

  async chat(
    request: ChatRequest,
    apiKey: string,
    signal?: AbortSignal,
    tools?: ToolSet
  ): Promise<ChatResponse> {
    const client = this.getClient(apiKey);
    const start = Date.now();
    const providerOptions = buildProviderOptions(this.id, "openai", request);
    const model = this.useResponsesApi ? client.responses(request.model) : client(request.model);
    // Resolve the target model's modalities so convertMessages can route PDFs
    // natively when supported, or inline extracted text otherwise.
    const targetModalities = getModel(this.id, request.model)?.modalities ?? ["text"];
    const result = await generateText({
      model,
      messages: convertMessages(request.messages, { targetModalities }),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      ...(signal ? { abortSignal: signal } : {}),
      ...(providerOptions ? { providerOptions } : {}),
      // Forward tools only when supplied; preserves the no-tools path
      // byte-identical to the pre-change implementation.
      ...(tools ? { tools } : {}),
      // Multi-step tool loop: the AI SDK needs to call the model again
      // with each tool's result. Default is 1; 5 is the AI SDK's
      // recommended default for tool-enabled chats.
      maxSteps: MAX_TOOL_STEPS,
    });
    return {
      content: result.text,
      model: request.model,
      provider: this.id,
      tokensUsed: result.usage?.totalTokens,
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
      latencyMs: Date.now() - start,
    };
  }

  async chatStructured<T>(
    request: ChatRequest,
    schema: ZodType<T>,
    apiKey: string,
    signal?: AbortSignal
  ): Promise<StructuredResponse<T>> {
    const client = this.getClient(apiKey);
    const start = Date.now();
    const providerOptions = buildProviderOptions(this.id, "openai", request);
    const model = this.useResponsesApi ? client.responses(request.model) : client(request.model);
    const targetModalities = getModel(this.id, request.model)?.modalities ?? ["text"];
    const result = await generateObject({
      model,
      schema,
      messages: convertMessages(request.messages, { targetModalities }),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      ...(signal ? { abortSignal: signal } : {}),
      ...(providerOptions ? { providerOptions } : {}),
    });
    return {
      object: result.object,
      model: request.model,
      provider: this.id,
      tokensUsed: result.usage?.totalTokens,
      inputTokens: result.usage?.promptTokens,
      outputTokens: result.usage?.completionTokens,
      latencyMs: Date.now() - start,
    };
  }

  async *streamChat(
    request: ChatRequest,
    apiKey: string,
    signal?: AbortSignal,
    tools?: ToolSet
  ): AsyncIterable<ChatChunk> {
    const client = this.getClient(apiKey);
    const providerOptions = buildProviderOptions(this.id, "openai", request);
    const model = this.useResponsesApi ? client.responses(request.model) : client(request.model);
    // Resolve the target model's modalities so convertMessages can route PDFs
    // natively when supported, or inline extracted text otherwise.
    const targetModalities = getModel(this.id, request.model)?.modalities ?? ["text"];
    const result = await streamText({
      model,
      messages: convertMessages(request.messages, { targetModalities }),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      ...(signal ? { abortSignal: signal } : {}),
      ...(providerOptions ? { providerOptions } : {}),
      // Forward tools only when the caller supplied them. The spread keeps
      // the no-tools path byte-identical to the pre-change implementation.
      ...(tools ? { tools } : {}),
      // Multi-step tool loop: when the model invokes a tool, the AI SDK
      // needs to loop back to the model with the tool's result and continue
      // generating. Default is maxSteps=1 which closes the loop after the
      // tool result and the user sees "no answer" after a search. 5 is the
      // AI SDK's recommended default for tool-enabled chats.
      maxSteps: MAX_TOOL_STEPS,
    });

    for await (const part of result.fullStream) {
      // The AI SDK's discriminated union narrows to `never` for tool parts
      // when ToolSet is untyped (our case — the SDK accepts the generic).
      // We do a single structural cast up front and then use a string
      // compare on `type` so this stays a normal control-flow branch.
      const p = part as unknown as { type: string; [k: string]: unknown };
      throwIfErrorPart(p);
      if (p.type === "text-delta") {
        yield {
          token: p["textDelta"] as string,
          model: request.model,
          provider: this.id,
          isFinished: false,
        };
      } else if (p.type === "reasoning") {
        yield {
          token: "",
          reasoning: p["textDelta"] as string,
          model: request.model,
          provider: this.id,
          isFinished: false,
        };
      } else if (p.type === "tool-call") {
        // The model decided to invoke a tool. Surface it as a chunk so the
        // route can publish a `tool.call` SSE event for the UI. The AI SDK
        // v4 names the input field `args` and the identifier `toolCallId`.
        yield {
          token: "",
          toolCall: { name: p["toolName"] as string, args: p["args"] },
          model: request.model,
          provider: this.id,
          isFinished: false,
        };
      } else if (p.type === "tool-result") {
        // The tool's execute function returned. Surface the result so the
        // route can publish a `tool.result` event before the model continues.
        yield {
          token: "",
          toolResult: { name: p["toolName"] as string, result: p["result"] },
          model: request.model,
          provider: this.id,
          isFinished: false,
        };
      }
    }

    const usage = await result.usage;

    yield {
      token: "",
      model: request.model,
      provider: this.id,
      isFinished: true,
      usage: usage
        ? {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          }
        : undefined,
    };
  }
}
