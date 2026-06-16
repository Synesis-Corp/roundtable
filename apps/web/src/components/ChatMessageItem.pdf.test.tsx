import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessageItem } from './ChatMessageItem';
import type { ChatMessage } from '../types/chat';
import type { Attachment } from '@chat/sdk';

const base = { userName: 'elias', streaming: false, isLast: false };

function renderItem(msg: Partial<ChatMessage>, opts: Partial<typeof base> = {}) {
  return render(
    <ChatMessageItem
      msg={{ role: 'user', content: 'see attached', ...msg } as ChatMessage}
      {...base}
      {...opts}
    />
  );
}

describe('ChatMessageItem — PDF attachment chip', () => {
  it('renders a PDF chip with name and page count when both are available', () => {
    const pdfAttachment: Attachment = {
      type: 'pdf',
      base64: 'data:application/pdf;base64,JVBERi0K',
      mimeType: 'application/pdf',
      name: 'informe.pdf',
      pageCount: 12,
    };
    renderItem({ attachments: [pdfAttachment] });

    // The filename must be visible.
    expect(screen.getByText('informe.pdf')).toBeInTheDocument();
    // The page count must be visible alongside the filename.
    expect(screen.getByText(/12 páginas/i)).toBeInTheDocument();
  });

  it('renders a PDF chip with just the filename when page count is missing (legacy data)', () => {
    const pdfAttachment: Attachment = {
      type: 'pdf',
      base64: 'data:application/pdf;base64,JVBERi0K',
      mimeType: 'application/pdf',
      name: 'doc.pdf',
      // No pageCount — e.g. extraction failed or older data.
    };
    renderItem({ attachments: [pdfAttachment] });

    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    // No "X páginas" text when pageCount is missing.
    expect(screen.queryByText(/páginas/i)).not.toBeInTheDocument();
  });

  it('renders a generic file chip for non-PDF attachments (regression check)', () => {
    const textAttachment: Attachment = {
      type: 'file',
      base64: 'data:text/plain;base64,aGk=',
      mimeType: 'text/plain',
      name: 'notes.txt',
    };
    renderItem({ attachments: [textAttachment] });

    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    // The PDF-specific "páginas" label is not shown for generic files.
    expect(screen.queryByText(/páginas/i)).not.toBeInTheDocument();
  });
});
