import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Components } from "react-markdown";

const SAFE_PROTOCOLS = /^(https?:|mailto:|#)/i;

function safeHref(raw: string): string {
  return SAFE_PROTOCOLS.test(raw) ? raw : "#";
}

interface CodeBlockProps {
  language: string;
  children: string;
}

function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail if clipboard is unavailable
    }
  }, [children]);

  return (
    <div className="group border border-gray-700/30 rounded-lg overflow-hidden my-3">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/80 border-b border-gray-700/30">
        <span className="text-xs text-gray-400 font-mono">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-all duration-200"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language === "text" ? "text" : language}
        style={vscDarkPlus}
        customStyle={{ margin: 0, borderRadius: 0, padding: "1rem", fontSize: "0.875rem" }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const components: Components = {
    h1({ children }) {
      return <h1 className="text-[24px] font-semibold mt-3 mb-3" style={{ color: "var(--text-1)", lineHeight: 1.2 }}>{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="text-[20px] font-semibold mt-4 mb-2" style={{ color: "var(--text-1)", lineHeight: 1.3 }}>{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="text-[17px] font-semibold mt-3 mb-1.5" style={{ color: "var(--text-1)", lineHeight: 1.35 }}>{children}</h3>;
    },
    h4({ children }) {
      return <h4 className="text-[15px] font-semibold mt-2 mb-1.5" style={{ color: "var(--text-1)" }}>{children}</h4>;
    },
    p({ children }) {
      return <p className="mb-2" style={{ color: "var(--text-1)", lineHeight: 1.5 }}>{children}</p>;
    },
    ul({ children }) {
      return <ul className="mb-3 pl-5 space-y-1 list-disc" style={{ color: "var(--text-1)" }}>{children}</ul>;
    },
    ol({ children }) {
      return <ol className="mb-3 pl-5 space-y-1 list-decimal" style={{ color: "var(--text-1)" }}>{children}</ol>;
    },
    li({ children }) {
      return <li style={{ lineHeight: 1.5 }}>{children}</li>;
    },
    strong({ children }) {
      return <strong style={{ color: "var(--text-1)", fontWeight: 600 }}>{children}</strong>;
    },
    hr() {
      return <hr className="my-4" style={{ borderColor: "var(--border)" }} />;
    },
    blockquote({ children }) {
      return (
        <blockquote
          className="my-3 pl-3"
          style={{
            borderLeft: "3px solid var(--accent-line)",
            color: "var(--text-2)",
          }}
        >
          {children}
        </blockquote>
      );
    },
    table({ children }) {
      return (
        <div className="my-4 overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
          <table className="min-w-full text-sm" style={{ borderCollapse: "collapse" }}>{children}</table>
        </div>
      );
    },
    thead({ children }) {
      return <thead style={{ backgroundColor: "var(--bg-elevated)" }}>{children}</thead>;
    },
    th({ children }) {
      return <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-1)", borderBottom: "1px solid var(--border)" }}>{children}</th>;
    },
    td({ children }) {
      return <td className="px-3 py-2 align-top" style={{ color: "var(--text-2)", borderTop: "1px solid var(--border)" }}>{children}</td>;
    },
    a({ href, children, ...props }) {
      const safeUrl = href ? safeHref(href) : "#";
      return (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
          {...props}
        >
          {children}
        </a>
      );
    },
    code({ className, children, ...props }: React.ComponentProps<"code"> & { inline?: boolean }) {
      const match = /language-(\w+)/.exec(className || "");
      const isInline = !match;

      if (isInline) {
        return (
          <code className="px-1.5 py-0.5 rounded text-sm" style={{ backgroundColor: "var(--bg-elevated)", color: "#9BF6C3" }} {...props}>
            {children}
          </code>
        );
      }

      const language = match ? match[1] : "text";
      const codeString = String(children).replace(/\n$/, "");

      return <CodeBlock language={language}>{codeString}</CodeBlock>;
    },
    pre({ children }) {
      // react-markdown wraps block code in <pre><code>; we render the code block
      // inside the custom code component, so we avoid double <pre> wrapping here.
      return <>{children}</>;
    },
  };

  return (
    <div className="chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
