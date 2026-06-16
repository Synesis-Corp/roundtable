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
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, generateText, generateObject } from "ai";
import { getModel } from "@chat/router";
import { convertMessages, throwIfErrorPart } from "./utils";
import { buildProviderOptions } from "./effort";
import { MAX_TOOL_STEPS } from "./constants";

export interface GoogleConfig {
  id?: string;
  name?: string;
  baseURL?: string;
}

export class GoogleProvider implements ProviderPlugin {
  id: string;
  name: string;
  private baseURL?: string;

  constructor(config?: GoogleConfig) {
    this.id = config?.id ?? "google";
    this.name = config?.name ?? "Google";
    this.baseURL = config?.baseURL;
  }

  getCapabilities(): ModelCapability[] {
    return [
      {
        modelId: "gemini-1.5-pro",
        provider: this.id,
        modalities: ["text", "image", "audio", "file"],
        features: ["tool-use", "vision", "structured-output"],
        contextWindow: 2000000,
      },
      {
        modelId: "gemini-1.5-flash",
        provider: this.id,
        modalities: ["text", "image", "audio"],
        features: ["tool-use", "vision"],
        contextWindow: 1000000,
      },
      {
        modelId: "gemini-2.0-flash-exp",
        provider: this.id,
        modalities: ["text", "image", "audio"],
        features: ["tool-use", "vision", "reasoning"],
        contextWindow: 1000000,
      },
    ];
  }

  private getClient(apiKey: string) {
    return createGoogleGenerativeAI({
      apiKey,
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
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
    const providerOptions = buildProviderOptions(this.id, "google", request);
    // Resolve the target model's modalities so convertMessages can route PDFs
    // natively when supported, or inline extracted text otherwise.
    const targetModalities = getModel(this.id, request.model)?.modalities ?? ["text"];
    const result = await generateText({
      model: client(request.model),
      messages: convertMessages(request.messages, { targetModalities }),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      ...(signal ? { abortSignal: signal } : {}),
      ...(providerOptions ? { providerOptions } : {}),
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
    const providerOptions = buildProviderOptions(this.id, "google", request);
    const targetModalities = getModel(this.id, request.model)?.modalities ?? ["text"];
    const result = await generateObject({
      model: client(request.model),
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
    const providerOptions = buildProviderOptions(this.id, "google", request);
    // Resolve the target model's modalities so convertMessages can route PDFs
    // natively when supported, or inline extracted text otherwise.
    const targetModalities = getModel(this.id, request.model)?.modalities ?? ["text"];
    const result = await streamText({
      model: client(request.model),
      messages: convertMessages(request.messages, { targetModalities }),
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      ...(signal ? { abortSignal: signal } : {}),
      ...(providerOptions ? { providerOptions } : {}),
      ...(tools ? { tools } : {}),
      // Multi-step tool loop: the AI SDK needs to call the model again
      // with each tool's result. Default is 1; 5 is the AI SDK's
      // recommended default for tool-enabled chats.
      maxSteps: MAX_TOOL_STEPS,
    });

    for await (const part of result.fullStream) {
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
        yield {
          token: "",
          toolCall: { name: p["toolName"] as string, args: p["args"] },
          model: request.model,
          provider: this.id,
          isFinished: false,
        };
      } else if (p.type === "tool-result") {
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
