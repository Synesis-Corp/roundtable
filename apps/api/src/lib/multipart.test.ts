import { describe, it, expect } from "vitest";
import { upload } from "./multipart";

describe("upload middleware", () => {
  it("uses a 25MB per-file size limit (matches nginx client_max_body_size envelope)", () => {
    // The exact value matters: too low rejects real PDFs, too high lets
    // pathological uploads waste server memory during PDF extraction.
    expect(upload.limits?.fileSize).toBe(25 * 1024 * 1024);
  });

  it("accepts up to 10 files per request", () => {
    expect(upload.limits?.files).toBe(10);
  });
});
