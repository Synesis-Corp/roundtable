import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessageItem } from './ChatMessageItem';
import type { ChatMessage } from '../types/chat';

const base = { userName: 'elias', streaming: false, isLast: false };

const mockCouncil = {
  members: [
    { modelId: 'gpt-5', provider: 'openai', displayName: 'GPT-5', color: '#5cb08b' },
    {
      modelId: 'claude-sonnet-4',
      provider: 'anthropic',
      displayName: 'Claude Sonnet 4',
      color: '#cf9a5e',
    },
    { modelId: 'deepseek-v4', provider: 'deepseek', displayName: 'DeepSeek V4', color: '#5b91d6' },
    { modelId: 'gemini-2.5', provider: 'google', displayName: 'Gemini 2.5', color: '#9079ec' },
  ],
  winnerModelId: 'gpt-5',
  tally: { for: 3, total: 4 },
  consensus: true,
  votes: [
    {
      modelId: 'gpt-5',
      provider: 'openai',
      displayName: 'GPT-5',
      approachLabel:
        'Propone índices con cobertura parcial y desnormalizar los contadores de "no leídos". Su solución gana la votación.',
      vote: 'for' as const,
      isWinner: true,
    },
    {
      modelId: 'claude-sonnet-4',
      provider: 'anthropic',
      displayName: 'Claude Sonnet 4',
      approachLabel:
        'Coincide; refuerza con particionado por fecha y un caso límite de borrado en cascada.',
      vote: 'for' as const,
      isWinner: false,
    },
    {
      modelId: 'deepseek-v4',
      provider: 'deepseek',
      displayName: 'DeepSeek V4',
      approachLabel:
        'Defendió un esquema sin índices compuestos; cambió su voto en la ronda 2 tras los benchmarks.',
      vote: 'changed' as const,
      isWinner: false,
    },
    {
      modelId: 'gemini-2.5',
      provider: 'google',
      displayName: 'Gemini 2.5',
      approachLabel:
        'Aporta consideraciones de coste de almacenamiento; vota a favor de la solución de GPT-5.',
      vote: 'for' as const,
      isWinner: false,
    },
  ],
  answer:
    'El consejo recomienda una tabla **messages** particionada por mes, con un índice parcial sobre los no leídos y un contador desnormalizado por conversación.',
  plannedRounds: 3,
  currentRound: 3,
  currentRoundKind: 'synthesis' as const,
  status: 'done' as const,
};

function renderItem(msg: ChatMessage, overrides = {}) {
  return render(<ChatMessageItem msg={msg} {...base} {...overrides} />);
}

describe('ChatMessageItem', () => {
  it('renders a user message as a right-aligned bubble', () => {
    renderItem({ id: '1', role: 'user', content: 'hello there' });
    expect(screen.getByText('hello there')).toBeInTheDocument();
    // ChatGPT-style: no per-message avatar/initial anymore
    expect(screen.queryByText('E')).not.toBeInTheDocument();
  });

  it('renders an assistant message as markdown HTML without a model chip', () => {
    const { container } = renderItem({
      id: '2',
      role: 'assistant',
      content: '**bold**',
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(container.querySelector('strong')).not.toBeNull();
    // Pure-ChatGPT layout: the per-message model chip is gone (model lives in the topbar)
    expect(screen.queryByText(/openai-gpt-4o/i)).not.toBeInTheDocument();
  });

  it('shows an error message', () => {
    renderItem({ id: '3', role: 'assistant', content: 'Error: boom', isError: true });
    expect(screen.getByText('Error: boom')).toBeInTheDocument();
  });

  it('shows the thinking indicator on the streaming placeholder', () => {
    renderItem({ id: '4', role: 'assistant', content: '' }, { streaming: true, isLast: true });
    expect(screen.getByText('Pensando…')).toBeInTheDocument();
  });

  it("does not duplicate 'Pensando…' when the reasoning block is active", () => {
    renderItem(
      { id: '4b', role: 'assistant', content: '', reasoning: 'analizando…' },
      { streaming: true, isLast: true }
    );
    // Only the reasoning block header shows it — not the standalone indicator too.
    expect(screen.getAllByText('Pensando…')).toHaveLength(1);
  });

  it('renders a multi-provider answer as a clean assistant message', () => {
    renderItem({
      id: '5',
      role: 'assistant',
      content: 'synthesis',
      provider: 'multi',
      model: 'multi',
    });
    expect(screen.getByText('synthesis')).toBeInTheDocument();
  });

  /* ── Attachments & reasoning ── */

  it('renders an image attachment on a user message', () => {
    const { container } = renderItem({
      id: 'img1',
      role: 'user',
      content: 'Analyze this:',
      attachments: [{ type: 'image', base64: 'data:image/png;base64,iVBOR', name: 'shot.png' }],
    });
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toContain('data:image/png;base64');
    // The "Analyze this:" placeholder is hidden when only an image is sent
    expect(screen.queryByText('Analyze this:')).not.toBeInTheDocument();
  });

  it('shows a collapsible reasoning block when the message has reasoning', async () => {
    renderItem({
      id: 'r1',
      role: 'assistant',
      content: 'final answer',
      reasoning: 'step one then step two',
      provider: 'openai',
      model: 'gpt-4',
    });
    const toggle = screen.getByRole('button', { name: /razonamiento/i });
    expect(toggle).toBeInTheDocument();
    // Collapsed by default (not actively thinking)
    expect(screen.queryByText('step one then step two')).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByText(/step one then step two/)).toBeInTheDocument();
  });

  /* ── Action toolbar ── */

  it('shows Copy and Feedback buttons on assistant messages', () => {
    renderItem({
      id: '6',
      role: 'assistant',
      content: 'assistant reply',
      provider: 'openai',
      model: 'gpt-4',
    });
    expect(screen.getByRole('button', { name: /copiar mensaje/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marcar como útil/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marcar como no útil/i })).toBeInTheDocument();
  });

  it('does not show action buttons on user messages', () => {
    renderItem({ id: '7', role: 'user', content: 'user msg' });
    expect(screen.queryByRole('button', { name: /copiar mensaje/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar como útil/i })).not.toBeInTheDocument();
  });

  it('does not show action buttons on error messages', () => {
    renderItem({ id: '8', role: 'assistant', content: 'Error: fail', isError: true });
    expect(screen.queryByRole('button', { name: /copiar mensaje/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /marcar como útil/i })).not.toBeInTheDocument();
  });

  it('shows Regenerate button when not streaming', () => {
    renderItem({ id: '9', role: 'assistant', content: 'done', provider: 'openai', model: 'gpt-4' });
    expect(screen.getByRole('button', { name: /regenerar respuesta/i })).toBeInTheDocument();
  });

  it('hides Regenerate button while streaming the last message', () => {
    renderItem(
      { id: '10', role: 'assistant', content: 'partial', provider: 'openai', model: 'gpt-4' },
      { streaming: true, isLast: true }
    );
    expect(screen.queryByRole('button', { name: /regenerar respuesta/i })).not.toBeInTheDocument();
  });

  it('toggles feedback buttons mutually exclusively', async () => {
    renderItem({
      id: '11',
      role: 'assistant',
      content: 'reply',
      provider: 'openai',
      model: 'gpt-4',
    });
    const helpful = screen.getByRole('button', { name: /marcar como útil/i });
    const unhelpful = screen.getByRole('button', { name: /marcar como no útil/i });

    await userEvent.click(helpful);
    // Feedback active states are now applied via inline styles, not Tailwind classes
    expect(helpful).toHaveStyle({ color: 'var(--m-green)' });
    expect(unhelpful).not.toHaveStyle({ color: 'var(--m-rose)' });

    await userEvent.click(unhelpful);
    expect(helpful).not.toHaveStyle({ color: 'var(--m-green)' });
    expect(unhelpful).toHaveStyle({ color: 'var(--m-rose)' });

    await userEvent.click(unhelpful);
    expect(unhelpful).not.toHaveStyle({ color: 'var(--m-rose)' });
  });

  /* ── Council mode ── */

  it("renders CouncilBlock when provider is 'council'", () => {
    renderItem({
      id: '12',
      role: 'assistant',
      content: 'council answer',
      provider: 'council',
      councilInfo: mockCouncil,
    });
    expect(screen.getByText('Consejo · 4 modelos')).toBeInTheDocument();
    expect(screen.getByText(/El consejo recomienda una tabla/)).toBeInTheDocument();
  });

  it("renders CouncilBlock when provider is 'consensus'", () => {
    renderItem({
      id: '13',
      role: 'assistant',
      content: 'consensus answer',
      provider: 'consensus',
      councilInfo: mockCouncil,
    });
    expect(screen.getByText('Consejo · 4 modelos')).toBeInTheDocument();
  });

  it('opens and closes the council deliberation explorer', async () => {
    renderItem({
      id: '14',
      role: 'assistant',
      content: 'council',
      provider: 'council',
      councilInfo: mockCouncil,
    });
    const toggle = screen.getByRole('button', { name: /deliberó el consejo/i });

    // Collapsed by default — answer-first
    expect(screen.queryByText('Propuesta ganadora')).not.toBeInTheDocument();

    // Open → vote step shows each model's stance
    await userEvent.click(toggle);
    expect(screen.getByText('Propuesta ganadora')).toBeInTheDocument();
    expect(screen.getAllByText('Vota a favor')).toHaveLength(2);
    expect(screen.getByText('Cambió su voto')).toBeInTheDocument();

    // Close again
    await userEvent.click(toggle);
    expect(screen.queryByText('Propuesta ganadora')).not.toBeInTheDocument();
  });

  it('shows a real loading placeholder instead of mock council data', () => {
    renderItem(
      { id: '15', role: 'assistant', content: '', provider: 'council' },
      { streaming: true, isLast: true }
    );
    expect(screen.getByText(/Iniciando consejo real/i)).toBeInTheDocument();
    expect(screen.queryByText(/El consejo recomienda una tabla/i)).not.toBeInTheDocument();
  });

  it('renders the web-search chip and reveals deduped sources on click', async () => {
    renderItem({
      id: '16',
      role: 'assistant',
      content: 'Hoy en Ecuador…',
      toolCalls: [
        {
          name: 'web_search',
          args: { query: 'noticias ecuador' },
          result: {
            query: 'noticias ecuador',
            results: [
              { title: 'El Universo — portada', url: 'https://www.eluniverso.com/x', snippet: '' },
              { title: 'Primicias', url: 'https://primicias.ec/y', snippet: '' },
            ],
          },
        },
        {
          name: 'web_search',
          args: { query: 'ecuador hoy' },
          // Duplicate URL must be deduped.
          result: {
            query: 'ecuador hoy',
            results: [
              { title: 'El Universo — portada', url: 'https://www.eluniverso.com/x', snippet: '' },
            ],
          },
        },
      ],
    });

    // Two tool calls → "(2 consultas)"; two unique URLs → "2 fuentes".
    const toggle = screen.getByRole('button', { name: /Busqué en la web.*2 fuentes/i });
    expect(toggle).toBeInTheDocument();

    // Sources hidden until expanded.
    expect(screen.queryByText('eluniverso.com')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByText('eluniverso.com')).toBeInTheDocument();
    expect(screen.getByText('primicias.ec')).toBeInTheDocument();
    // Deduped: the repeated El Universo link appears once.
    expect(screen.getAllByText('El Universo — portada')).toHaveLength(1);
  });

  it('renders the run_python chip and reveals code + output on click', async () => {
    renderItem({
      id: '17',
      role: 'assistant',
      content: 'El resultado es 4.',
      toolCalls: [
        {
          name: 'run_python',
          args: { code: 'print(2 + 2)' },
          result: { stdout: '4\n' },
        },
      ],
    });

    const toggle = screen.getByRole('button', { name: /Ejecuté Python/i });
    expect(toggle).toBeInTheDocument();
    // Code/output hidden until expanded.
    expect(screen.queryByText('print(2 + 2)')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByText('print(2 + 2)')).toBeInTheDocument();
    expect(screen.getByText(/^4$/)).toBeInTheDocument();
  });

  it('does NOT show the web-search chip for a python-only message', () => {
    renderItem({
      id: '18',
      role: 'assistant',
      content: 'Listo.',
      toolCalls: [{ name: 'run_python', args: { code: 'print(1)' }, result: { stdout: '1\n' } }],
    });
    expect(screen.queryByRole('button', { name: /Busqué en la web/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ejecuté Python/i })).toBeInTheDocument();
  });

  it('surfaces a python execution error in the run_python block', async () => {
    renderItem({
      id: '19',
      role: 'assistant',
      content: 'Hubo un error.',
      toolCalls: [
        {
          name: 'run_python',
          args: { code: "raise ValueError('boom')" },
          result: { stdout: '', error: 'ValueError: boom' },
        },
      ],
    });

    await userEvent.click(screen.getByRole('button', { name: /Ejecuté Python/i }));
    expect(screen.getByText(/ValueError: boom/)).toBeInTheDocument();
  });
});
