import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CouncilBlock } from './CouncilBlock';
import type { CouncilInfo } from '../types/chat';

const mockCouncil: CouncilInfo = {
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
      approachLabel: 'Propone índices con cobertura parcial.',
      vote: 'for',
      isWinner: true,
      proposalText: '# Tesis\nÍndices parciales.',
    },
    {
      modelId: 'claude-sonnet-4',
      provider: 'anthropic',
      displayName: 'Claude Sonnet 4',
      approachLabel: 'Coincide; refuerza con particionado.',
      vote: 'for',
      isWinner: false,
      debateText: 'Claude evalúa las propuestas.',
    },
    {
      modelId: 'deepseek-v4',
      provider: 'deepseek',
      displayName: 'DeepSeek V4',
      approachLabel: 'Defendió un esquema sin índices.',
      vote: 'changed',
      isWinner: false,
      voteReason: 'La propuesta de GPT-5 es más sólida.',
      voteImprovement: 'Agregar un caso límite de borrado.',
    },
    {
      modelId: 'gemini-2.5',
      provider: 'google',
      displayName: 'Gemini 2.5',
      approachLabel: 'Aporta consideraciones de coste.',
      vote: 'for',
      isWinner: false,
    },
  ],
  answer: 'El consejo recomienda una tabla **messages** particionada por mes.',
  plannedRounds: 3,
  currentRound: 3,
  currentRoundKind: 'synthesis',
  status: 'done',
};

function renderCouncil(council: CouncilInfo = mockCouncil) {
  return render(<CouncilBlock council={council} />);
}

const explorerToggle = () => screen.getByRole('button', { name: /deliberó el consejo/i });

describe('CouncilBlock', () => {
  it('renders the badge with model count', () => {
    renderCouncil();
    expect(screen.getByText('Consejo · 4 modelos')).toBeInTheDocument();
  });

  it('renders the consensus meta', () => {
    renderCouncil();
    expect(screen.getByText(/Elegida por consenso/i)).toBeInTheDocument();
    expect(screen.getByText(/3 de 4 votos/i)).toBeInTheDocument();
  });

  it('renders majority meta when not consensus', () => {
    renderCouncil({ ...mockCouncil, consensus: false });
    expect(screen.getByText(/Elegida por mayoría/i)).toBeInTheDocument();
  });

  it('renders the winner answer with markdown', () => {
    const { container } = renderCouncil();
    expect(screen.getByText(/El consejo recomienda una tabla/)).toBeInTheDocument();
    expect(container.querySelector('strong')).not.toBeNull();
  });

  it('renders avatar stack with member titles', () => {
    renderCouncil();
    expect(screen.getAllByTitle('GPT-5 · openai').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Claude Sonnet 4 · anthropic').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('DeepSeek V4 · deepseek').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Gemini 2.5 · google').length).toBeGreaterThan(0);
  });

  /* ── Deliberation explorer ── */

  it('keeps the deliberation explorer collapsed by default', () => {
    renderCouncil();
    // Steps and vote chips are hidden until the user opens the explorer.
    expect(screen.queryByRole('tab', { name: /Propuestas/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Propuesta ganadora')).not.toBeInTheDocument();
  });

  it('reveals the step tabs when the explorer is opened', async () => {
    renderCouncil();
    await userEvent.click(explorerToggle());
    expect(screen.getByRole('tab', { name: /Propuestas/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Debate/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Voto/i })).toBeInTheDocument();
  });

  it("defaults to the vote step and shows each model's vote", async () => {
    renderCouncil();
    await userEvent.click(explorerToggle());
    expect(screen.getByText('Propuesta ganadora')).toBeInTheDocument();
    expect(screen.getAllByText('Vota a favor')).toHaveLength(2);
    expect(screen.getByText('Cambió su voto')).toBeInTheDocument();
  });

  it('shows the vote reason and requested improvement in the vote step', async () => {
    renderCouncil();
    await userEvent.click(explorerToggle());
    expect(screen.getByText(/La propuesta de GPT-5 es más sólida/i)).toBeInTheDocument();
    expect(screen.getByText(/Agregar un caso límite de borrado/i)).toBeInTheDocument();
  });

  it('switches to the proposals step and shows approach summaries', async () => {
    renderCouncil();
    await userEvent.click(explorerToggle());
    await userEvent.click(screen.getByRole('tab', { name: /Propuestas/i }));
    expect(screen.getByText(/Propone índices con cobertura parcial/i)).toBeInTheDocument();
    expect(screen.getByText(/Aporta consideraciones de coste/i)).toBeInTheDocument();
  });

  it('expands a proposal to reveal its full text', async () => {
    renderCouncil();
    await userEvent.click(explorerToggle());
    await userEvent.click(screen.getByRole('tab', { name: /Propuestas/i }));
    // The GPT-5 card is expandable (has proposalText); expanding reveals the body.
    await userEvent.click(screen.getByRole('button', { name: /GPT-5/i }));
    expect(screen.getByText(/Índices parciales/i)).toBeInTheDocument();
  });

  it("locks steps that haven't started while the council is running", () => {
    // While running, the explorer is open by default. Future rounds can't be
    // inspected until they begin.
    renderCouncil({
      ...mockCouncil,
      status: 'running',
      currentRoundKind: 'proposals',
      currentRound: 1,
      answer: '',
      votes: [],
      tally: { for: 0, total: 0 },
    });
    expect(screen.getByRole('tab', { name: /Propuestas/i })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: /Debate/i })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /Voto/i })).toBeDisabled();
  });

  it('collapses the explorer again on toggle', async () => {
    renderCouncil();
    await userEvent.click(explorerToggle());
    expect(screen.getByRole('tab', { name: /Voto/i })).toBeInTheDocument();
    await userEvent.click(explorerToggle());
    expect(screen.queryByRole('tab', { name: /Voto/i })).not.toBeInTheDocument();
  });
});
