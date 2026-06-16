/**
 * Minimal, dependency-free Markdown → HTML renderer for chat messages.
 *
 * Escapes HTML first (so model output can't inject markup), then applies a
 * fixed set of Markdown rules. Link hrefs are sanitized to block javascript:,
 * data:, vbscript:, and other dangerous protocols. Pure and synchronous so it
 * can be unit-tested and reused outside React.
 */

/** Protocols allowed in Markdown links. Everything else is replaced with "#". */
const SAFE_PROTOCOLS = /^(https?:|mailto:|#)/i;

function safeHref(raw: string): string {
  return SAFE_PROTOCOLS.test(raw) ? raw : "#";
}

export function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) =>
    `<pre class="bg-gray-800 rounded-lg p-4 my-3 overflow-x-auto"><code class="text-sm text-gray-200">${code.trim()}</code></pre>`
  );
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-green-300 px-1.5 py-0.5 rounded text-sm">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^#### (.+)$/gm, '<h4 class="text-base font-semibold mt-4 mb-1">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-4 mb-3">$1</h1>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-gray-600 pl-4 my-2 text-gray-400">$1</blockquote>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="my-2">$1</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
    `<a href="${safeHref(url)}" target="_blank" rel="noopener" class="text-blue-400 hover:underline">${text}</a>`
  );
  html = html.replace(/^---$/gm, '<hr class="my-4 border-gray-700">');
  html = html.replace(/\n\n+/g, '</p><p class="my-2">');

  return `<p class="my-2">${html}</p>`;
}
