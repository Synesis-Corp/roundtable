import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProviderRow, type ProviderRowProps } from './ProviderRow';

const provider = {
  id: 'openai',
  name: 'OpenAI',
  npm: '@ai-sdk/openai',
  doc: 'https://docs',
  env: ['OPENAI_API_KEY'],
  modelCount: 12,
};

function makeProps(overrides: Partial<ProviderRowProps> = {}): ProviderRowProps {
  return {
    provider,
    isConnected: false,
    maskedKey: '',
    apiKey: '',
    showKey: false,
    onToggleShowKey: vi.fn(),
    onApiKeyChange: vi.fn(),
    onConnect: vi.fn(),
    onTestConnection: vi.fn(),
    onRequestDisconnect: vi.fn(),
    onCodexConnect: vi.fn(),
    saving: false,
    testing: false,
    codexConnecting: false,
    message: null,
    advancedOpen: false,
    onToggleAdvanced: vi.fn(),
    options: {},
    onOptionsChange: vi.fn(),
    ...overrides,
  };
}

describe('ProviderRow', () => {
  it('shows the connect form when not connected', () => {
    render(<ProviderRow {...makeProps()} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Paste your OPENAI_API_KEY...')).toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
  });

  it('calls onConnect when the API key is present', () => {
    const onConnect = vi.fn();
    render(<ProviderRow {...makeProps({ apiKey: 'sk-test', onConnect })} />);
    fireEvent.click(screen.getByText('Connect'));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('shows the masked credential and Disconnect when connected', () => {
    render(<ProviderRow {...makeProps({ isConnected: true, maskedKey: 'sk-...abcd' })} />);
    expect(screen.getByText('sk-...abcd')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
    expect(screen.queryByText('Connect')).not.toBeInTheDocument();
  });

  it('calls onRequestDisconnect when the Disconnect button is clicked', () => {
    const onRequestDisconnect = vi.fn();
    render(
      <ProviderRow
        {...makeProps({ isConnected: true, maskedKey: 'sk-...abcd', onRequestDisconnect })}
      />
    );
    fireEvent.click(screen.getByText('Disconnect'));
    expect(onRequestDisconnect).toHaveBeenCalledOnce();
  });

  it('offers ChatGPT OAuth for the openai provider', () => {
    render(<ProviderRow {...makeProps()} />);
    expect(screen.getByText('Sign in with OpenAI')).toBeInTheDocument();
  });

  it('shows a healthy dot when the connected provider is operational', () => {
    render(
      <ProviderRow
        {...makeProps({
          isConnected: true,
          maskedKey: 'sk-...x',
          health: { ok: true, checkedAt: 1 },
        })}
      />
    );
    expect(screen.getByLabelText('Provider operational')).toBeInTheDocument();
  });

  it('shows the error in the dot tooltip when the provider probe failed', () => {
    render(
      <ProviderRow
        {...makeProps({
          isConnected: true,
          maskedKey: 'sk-...x',
          health: { ok: false, error: 'API key invalid', checkedAt: 1 },
        })}
      />
    );
    expect(screen.getByLabelText('Provider unavailable: API key invalid')).toBeInTheDocument();
  });

  it('shows a checking dot while health is still loading', () => {
    render(
      <ProviderRow
        {...makeProps({ isConnected: true, maskedKey: 'sk-...x', healthLoading: true })}
      />
    );
    expect(screen.getByLabelText('Checking provider status')).toBeInTheDocument();
  });

  it('renders no health dot when disconnected', () => {
    render(<ProviderRow {...makeProps({ isConnected: false })} />);
    expect(screen.queryByLabelText('Provider operational')).not.toBeInTheDocument();
  });
});
