import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("escapes HTML before applying markdown (no injection)", () => {
    const html = renderMarkdown('<script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders fenced code blocks", () => {
    const html = renderMarkdown("```js\nconst a = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("const a = 1;");
  });

  it("renders inline code", () => {
    expect(renderMarkdown("use `npm`")).toContain("<code");
  });

  it("renders bold and italic", () => {
    const html = renderMarkdown("**bold** and *italic*");
    expect(html).toContain("<strong");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders headings", () => {
    expect(renderMarkdown("# Title")).toContain("<h1");
    expect(renderMarkdown("### Sub")).toContain("<h3");
  });

  it("renders links with safe attributes", () => {
    const html = renderMarkdown("[site](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener"');
  });

  it("blocks javascript: protocol in links", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
  });

  it("blocks data: protocol in links", () => {
    const html = renderMarkdown("[x](data:text/html,<script>alert(1)</script>)");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("data:");
  });

  it("allows mailto: links", () => {
    const html = renderMarkdown("[email](mailto:hello@example.com)");
    expect(html).toContain('href="mailto:hello@example.com"');
  });

  it("allows anchor links", () => {
    const html = renderMarkdown("[top](#top)");
    expect(html).toContain('href="#top"');
  });

  it("wraps output in a paragraph", () => {
    expect(renderMarkdown("hello")).toBe('<p class="my-2">hello</p>');
  });
});
