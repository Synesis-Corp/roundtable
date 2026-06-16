import { describe, expect, it } from "vitest";
import type { Modality } from "@chat/sdk";
import { transportModalities } from "./openai-compatible";

// Regression: uploading a PDF to an openai-compatible model (Kimi, Minimax, …)
// crashed the turn with `UnsupportedFunctionalityError: 'File content parts in
// user messages' functionality not supported`. The @ai-sdk/openai-compatible
// transport cannot carry `file` content parts — regardless of what the model
// supports upstream — so we strip pdf/file from the target modalities and let
// convertMessages inline the PDF's extracted text instead of emitting a file part.
describe("transportModalities (openai-compatible transport limits)", () => {
  it("strips pdf and file — this transport cannot carry file content parts", () => {
    const result = transportModalities(["text", "image", "pdf", "file"] as Modality[]);
    expect(result).not.toContain("pdf");
    expect(result).not.toContain("file");
  });

  it("keeps text and image, which the transport does support", () => {
    expect(transportModalities(["text", "image", "pdf"] as Modality[])).toEqual([
      "text",
      "image",
    ]);
  });

  it("is a no-op for text-only models", () => {
    expect(transportModalities(["text"] as Modality[])).toEqual(["text"]);
  });
});
