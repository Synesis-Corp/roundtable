import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { ChatInputBar } from './ChatInputBar';
import type { ChatInputBarProps } from './ChatInputBar';

/** Builds a default `DataTransfer`-shaped object with the given files. */
function makeDataTransfer(files: File[]) {
  return {
    files,
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    types: ['Files'],
  };
}

/** Minimal default props for ChatInputBar — only the file-related ones matter. */
function defaultProps(overrides: Partial<ChatInputBarProps> = {}): ChatInputBarProps {
  return {
    inputText: '',
    setInputText: vi.fn(),
    streaming: false,
    handleSubmit: vi.fn(),
    stopStream: vi.fn(),
    fileInputRef: { current: null } as React.RefObject<HTMLInputElement>,
    files: [],
    setFiles: vi.fn(),
    selectedLabel: 'Auto',
    selectedProvider: null,
    selectedModel: null,
    setSelectedModel: vi.fn(),
    models: [],
    modelsLoading: false,
    multiMode: false,
    setMultiMode: vi.fn(),
    incognito: false,
    setIncognito: vi.fn(),
    userProviders: [
      {
        id: 'up-1',
        providerId: 'openai',
        apiKey: 'sk-***',
        maskedKey: 'sk-***',
        options: null,
        createdAt: '',
        updatedAt: '',
      } as any,
    ],
    isModelDropdownOpen: false,
    setIsModelDropdownOpen: vi.fn(),
    modelDropdownRef: { current: null } as React.RefObject<HTMLDivElement>,
    modelSearch: '',
    setModelSearch: vi.fn(),
    effortSpec: null,
    effortLoading: false,
    selectedEffort: 'default',
    setSelectedEffort: vi.fn(),
    isEffortDropdownOpen: false,
    setIsEffortDropdownOpen: vi.fn(),
    effortDropdownRef: { current: null } as React.RefObject<HTMLDivElement>,
    effortSearch: '',
    setEffortSearch: vi.fn(),
    textareaRef: { current: null } as React.RefObject<HTMLTextAreaElement>,
    ...overrides,
  };
}

describe('ChatInputBar — drag and drop', () => {
  it('appends allowed files (PDFs and images) to the existing files list when dropped', () => {
    const setFiles = vi.fn();
    const onRejectedFiles = vi.fn();
    const existingFile = new File([new Uint8Array(0)], 'existing.pdf', { type: 'application/pdf' });
    const droppedPdf = new File([new Uint8Array(0)], 'informe.pdf', { type: 'application/pdf' });
    const droppedPng = new File([new Uint8Array(0)], 'foto.png', { type: 'image/png' });

    const { container } = render(
      <ChatInputBar {...defaultProps({ files: [existingFile], setFiles, onRejectedFiles })} />
    );
    const form = container.querySelector('form')!;

    fireEvent.drop(form, {
      dataTransfer: makeDataTransfer([droppedPdf, droppedPng]),
    });

    expect(setFiles).toHaveBeenCalledTimes(1);
    // setFiles is called with a function (prev => [...prev, ...allowed]) — invoke it.
    const updater = setFiles.mock.calls[0][0] as (prev: File[]) => File[];
    expect(updater([existingFile])).toEqual([existingFile, droppedPdf, droppedPng]);
    expect(onRejectedFiles).not.toHaveBeenCalled();
  });

  it('calls onRejectedFiles with the names of files that are not PDFs or images', () => {
    const setFiles = vi.fn();
    const onRejectedFiles = vi.fn();
    const xlsx = new File([new Uint8Array(0)], 'hoja.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const txt = new File([new Uint8Array(0)], 'notes.txt', { type: 'text/plain' });
    const pdf = new File([new Uint8Array(0)], 'doc.pdf', { type: 'application/pdf' });

    const { container } = render(<ChatInputBar {...defaultProps({ setFiles, onRejectedFiles })} />);
    const form = container.querySelector('form')!;

    fireEvent.drop(form, {
      dataTransfer: makeDataTransfer([xlsx, txt, pdf]),
    });

    // The PDF is accepted; the .xlsx and .txt are rejected.
    const updater = setFiles.mock.calls[0][0] as (prev: File[]) => File[];
    expect(updater([])).toEqual([pdf]);
    expect(onRejectedFiles).toHaveBeenCalledWith([xlsx, txt]);
  });

  it('does NOT accept drops while streaming', () => {
    const setFiles = vi.fn();
    const onRejectedFiles = vi.fn();
    const pdf = new File([new Uint8Array(0)], 'doc.pdf', { type: 'application/pdf' });

    const { container } = render(
      <ChatInputBar {...defaultProps({ streaming: true, setFiles, onRejectedFiles })} />
    );
    const form = container.querySelector('form')!;

    fireEvent.drop(form, { dataTransfer: makeDataTransfer([pdf]) });

    // Even a valid PDF is ignored while the model is generating.
    expect(setFiles).not.toHaveBeenCalled();
    expect(onRejectedFiles).not.toHaveBeenCalled();
  });

  it('toggles a visual cue (data-dragging attribute) when files are dragged over and out', () => {
    const { container } = render(<ChatInputBar {...defaultProps()} />);
    const form = container.querySelector('form')!;

    expect(form.getAttribute('data-dragging')).toBe('false');

    fireEvent.dragEnter(form, { dataTransfer: makeDataTransfer([]) });
    expect(form.getAttribute('data-dragging')).toBe('true');

    fireEvent.dragLeave(form, { dataTransfer: makeDataTransfer([]) });
    expect(form.getAttribute('data-dragging')).toBe('false');
  });
});

describe('ChatInputBar — incognito mode', () => {
  it('exposes a clear switch and enables ephemeral mode', () => {
    const setIncognito = vi.fn();
    render(<ChatInputBar {...defaultProps({ setIncognito })} />);

    const toggle = screen.getByRole('switch', { name: /incognito/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(setIncognito).toHaveBeenCalledWith(true);
  });

  it('shows a visible ephemeral-state indicator while incognito is active', () => {
    render(<ChatInputBar {...defaultProps({ incognito: true })} />);

    expect(screen.getByRole('switch', { name: /incognito/i })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByText(/not saved\. only usage metrics are recorded/i)).toBeInTheDocument();
  });

  it('exposes a "More info" link that opens the explainer modal', () => {
    render(<ChatInputBar {...defaultProps({ incognito: true })} />);
    const moreInfo = screen.getByRole('button', { name: /more info/i });
    expect(moreInfo).toBeInTheDocument();
    // Clicking opens the dialog
    fireEvent.click(moreInfo);
    expect(screen.getByText(/about incognito mode/i)).toBeInTheDocument();
  });
});

describe('ChatInputBar — Mixin mode', () => {
  it('places Mixin between Single and Council in the mode selector', () => {
    render(<ChatInputBar {...defaultProps()} />);

    const modeButtons = Array.from(
      screen.getByRole('group', { name: /chat mode/i }).querySelectorAll('button')
    ).map((button) => button.textContent?.trim());

    expect(modeButtons).toEqual(['Single', 'Mixin', 'Council']);
  });

  it('shows the capped personalized notice and exposes the third mode', () => {
    render(<ChatInputBar {...defaultProps({ mixinMode: true, mixinModelCount: 11 })} />);

    expect(screen.getByRole('button', { name: 'Mixin' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Mixin mode: 8 of your 11 models will be used to generate the best possible answer.'
      )
    ).toBeInTheDocument();
  });

  it('switches to Mixin and clears Council mode', () => {
    const setMultiMode = vi.fn();
    const setMixinMode = vi.fn();
    render(<ChatInputBar {...defaultProps({ setMultiMode, setMixinMode })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mixin' }));

    expect(setMultiMode).toHaveBeenCalledWith(false);
    expect(setMixinMode).toHaveBeenCalledWith(true);
  });
});

// ─── Composer border — incognito/drag/normal 3-way ternary (Capability 8) ──

describe('ChatInputBar — composer border (Capability 8)', () => {
  it('incognito=true, not dragging: border is dashed amber 0.45', () => {
    const { container } = render(<ChatInputBar {...defaultProps({ incognito: true })} />);
    // The outer container is the first inner div of the form.
    const form = container.querySelector('form')!;
    const inner = form.querySelector('div')! as HTMLDivElement;
    // Browser normalises rgba spacing: accept the spaced form.
    expect(inner.style.border).toBe('1px dashed rgba(245, 158, 11, 0.45)');
  });

  it('incognito=false, not dragging: border is solid var(--border)', () => {
    const { container } = render(<ChatInputBar {...defaultProps({ incognito: false })} />);
    const form = container.querySelector('form')!;
    const inner = form.querySelector('div')! as HTMLDivElement;
    expect(inner.style.border).toBe('1px solid var(--border)');
  });

  it('drag overrides incognito (incognito=true + dragging): border is dashed accent', () => {
    const { container } = render(<ChatInputBar {...defaultProps({ incognito: true })} />);
    const form = container.querySelector('form')!;
    fireEvent.dragEnter(form, { dataTransfer: makeDataTransfer([]) });
    const inner = form.querySelector('div')! as HTMLDivElement;
    expect(inner.style.border).toBe('1px dashed var(--accent)');
  });

  it('background, padding, border-radius are identical in incognito vs normal', () => {
    const { container: cNormal } = render(<ChatInputBar {...defaultProps({ incognito: false })} />);
    const { container: cIncog } = render(<ChatInputBar {...defaultProps({ incognito: true })} />);
    const normal = cNormal.querySelector('form > div')! as HTMLDivElement;
    const incog = cIncog.querySelector('form > div')! as HTMLDivElement;
    expect(normal.style.backgroundColor).toBe(incog.style.backgroundColor);
    expect(normal.style.padding).toBe(incog.style.padding);
    expect(normal.style.borderRadius).toBe(incog.style.borderRadius);
  });
});

// ─── Onboarding UX gate (2026-06-14): send button disabled without providers ──

describe('ChatInputBar — send button gate (no providers)', () => {
  it('send button is disabled when userProviders.length === 0 (single mode)', () => {
    render(
      <ChatInputBar
        {...defaultProps({
          userProviders: [],
          inputText: 'asd',
          models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: '' }],
        })}
      />
    );
    const send = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.title).toMatch(/connect a provider to start/i);
  });

  it('send button is enabled when user has at least one provider (single)', () => {
    render(
      <ChatInputBar
        {...defaultProps({
          inputText: 'hola',
          models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: '' }],
        })}
      />
    );
    const send = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    expect(send.title).toBe('Send message');
  });

  it('send button is disabled in Council mode with only 1 provider', () => {
    render(
      <ChatInputBar
        {...defaultProps({
          multiMode: true,
          inputText: 'hola',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: '' },
            { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', description: '' },
          ],
        })}
      />
    );
    const send = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.title).toMatch(/council needs at least 2 providers/i);
  });

  it('send button is enabled in Council mode with 2+ providers', () => {
    render(
      <ChatInputBar
        {...defaultProps({
          multiMode: true,
          userProviders: [
            {
              id: 'up-1',
              providerId: 'openai',
              apiKey: 'x',
              maskedKey: 'x',
              options: null,
              createdAt: '',
              updatedAt: '',
            } as any,
            {
              id: 'up-2',
              providerId: 'deepseek',
              apiKey: 'x',
              maskedKey: 'x',
              options: null,
              createdAt: '',
              updatedAt: '',
            } as any,
          ],
          inputText: 'hola',
          models: [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: '' },
            { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', description: '' },
          ],
        })}
      />
    );
    const send = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
  });

  it('send button is disabled while modelsLoading (even with providers)', () => {
    render(
      <ChatInputBar
        {...defaultProps({
          modelsLoading: true,
          models: [],
          inputText: 'hola',
        })}
      />
    );
    const send = screen.getByRole('button', { name: /send message/i }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.title).toMatch(/loading models/i);
  });
});
