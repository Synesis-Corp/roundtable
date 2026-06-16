import { describe, it, expect } from "vitest";
import { encrypt, decrypt, maskKey } from "../src/index";

process.env.ENCRYPTION_SECRET = "test-secret-32-chars-long-!!!!!!!";
process.env.ENCRYPTION_SALT = "test-salt-16-chars-min";

describe("crypto", () => {
  it("encrypts and decrypts plaintext", () => {
    const original = "hello-world-api-key";
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(":");

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it("masks keys correctly", () => {
    expect(maskKey("sk-abc123def456")).toBe("sk-a...f456");
    expect(maskKey("short")).toBe("****");
  });
});
