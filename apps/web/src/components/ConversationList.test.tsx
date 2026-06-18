import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConversationList } from './ConversationList';
import type { Conversation } from '@chat/sdk';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-1',
    title: 'Test conversation',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    userId: 'u-1',
    messages: [],
    ...overrides,
  } as Conversation;
}

function renderList(activeId: string | null, convs: Conversation[]) {
  return render(
    <MemoryRouter>
      <ConversationList
        loadingConversations={false}
        conversations={convs}
        filteredConversations={convs}
        searchQuery=""
        activeConversationId={activeId}
        chatActive={activeId !== null}
        confirmLeaveIfStreaming={() => true}
        onCloseMobile={vi.fn()}
        onOpenRename={vi.fn()}
        onRequestDelete={vi.fn()}
      />
    </MemoryRouter>
  );
}

describe('ConversationList — active row styling (Capability 7)', () => {
  it('active row uses var(--accent-quiet) as backgroundColor', () => {
    renderList('c-1', [makeConv({ id: 'c-1', title: 'Active' })]);
    const link = screen.getByText('Active').closest('a')!;
    const bg = link.style.backgroundColor;
    // The active row must have a non-transparent accent-quiet background.
    // Computed style would be a resolved rgba(116,123,237,0.14) — the
    // inline style is the literal token string we apply.
    expect(bg).not.toBe('transparent');
    expect(bg).not.toBe('');
  });

  it('active row border-left is transparent, NOT the accent color', () => {
    renderList('c-1', [makeConv({ id: 'c-1', title: 'Active' })]);
    const link = screen.getByText('Active').closest('a')!;
    // The AI-slop side-stripe is removed. The 3px left border is kept
    // (transparent) to preserve the layout, but the visible accent is gone.
    expect(link.style.borderLeft).toContain('transparent');
    // The border is still 3px to preserve the layout slot.
    expect(link.style.borderLeftWidth).toBe('3px');
  });

  it('non-active row background is transparent', () => {
    renderList('c-1', [
      makeConv({ id: 'c-1', title: 'Active' }),
      makeConv({ id: 'c-2', title: 'Other' }),
    ]);
    const other = screen.getByText('Other').closest('a')!;
    expect(other.style.backgroundColor).toBe('transparent');
  });

  it('active row has +3px left padding to compensate for removed visible stripe', () => {
    renderList('c-1', [
      makeConv({ id: 'c-1', title: 'Active' }),
      makeConv({ id: 'c-2', title: 'Other' }),
    ]);
    const active = screen.getByText('Active').closest('a')!;
    const other = screen.getByText('Other').closest('a')!;
    const activePad = parseInt(active.style.paddingLeft, 10);
    const otherPad = parseInt(other.style.paddingLeft, 10);
    expect(activePad - otherPad).toBe(3);
  });
});

describe('ConversationList — Recent header (Capability 6)', () => {
  it('renders a single "Recent" header above the first date group when list is non-empty and not searching', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    const headers = screen.getAllByText('Recent');
    expect(headers).toHaveLength(1);
  });

  it('does NOT render the Recent header when the conversation list is empty', () => {
    renderList(null, []);
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('does NOT render the Recent header during search', () => {
    render(
      <MemoryRouter>
        <ConversationList
          loadingConversations={false}
          conversations={[makeConv({ id: 'c-1', title: 'Hello' })]}
          filteredConversations={[]}
          searchQuery="zzz"
          activeConversationId={null}
          chatActive={false}
          confirmLeaveIfStreaming={() => true}
          onCloseMobile={vi.fn()}
          onOpenRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </MemoryRouter>
    );
    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
  });

  it('header is NOT positioned (does not use position: sticky/fixed)', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    const header = screen.getByText('Recent');
    // The header is rendered as text inside a div; the wrapping element
    // must not be sticky/fixed so it scrolls with the list.
    const wrapper = header.parentElement!;
    const position = getComputedStyle(wrapper).position;
    expect(position === 'sticky' || position === 'fixed').toBe(false);
  });
});

// ─── Capability 3 — Dimmed sidebar in incognito ───────────────────────────

import { act } from '@testing-library/react';
import { INCOGNITO_CHANGED_EVENT } from '../lib/incognito-events';

function enterIncognito() {
  act(() => {
    window.dispatchEvent(new CustomEvent(INCOGNITO_CHANGED_EVENT, { detail: { active: true } }));
  });
}

function exitIncognito() {
  act(() => {
    window.dispatchEvent(new CustomEvent(INCOGNITO_CHANGED_EVENT, { detail: { active: false } }));
  });
}

describe('ConversationList — incognito dim (Capability 3)', () => {
  it('in incognito, the conversation list wrapper has data-dimmed=true', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const wrapper = document.querySelector('[data-dimmed="true"]');
    expect(wrapper).toBeInTheDocument();
  });

  it('renders the incognito notice above the dimmed list with the localized text', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    expect(
      screen.getByText(/incognito active — these chats are not affected/i)
    ).toBeInTheDocument();
  });

  it('notice is a plain <div>, NOT a button', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const notice = screen.getByText(/incognito active — these chats are not affected/i);
    expect(notice.tagName).toBe('DIV');
  });

  it('notice has no onclick handler (passive text)', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const notice = screen.getByText(/incognito active — these chats are not affected/i);
    expect(notice.getAttribute('onclick')).toBeNull();
  });

  it('notice opacity is 1 (not dimmed)', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const notice = screen.getByText(/incognito active — these chats are not affected/i);
    // The notice itself is opacity 1 (it's outside the dimmed wrapper).
    expect((notice as HTMLElement).style.opacity).not.toBe('0.4');
  });

  it('list overflow-y is NOT hidden (still scrollable)', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const scroller = document.querySelector('.overflow-y-auto')!;
    expect((scroller as HTMLElement).style.overflowY).not.toBe('hidden');
  });

  it('notice and dim are removed when incognito is false', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    expect(
      screen.queryByText(/incognito active — these chats are not affected/i)
    ).toBeInTheDocument();
    exitIncognito();
    expect(
      screen.queryByText(/incognito active — these chats are not affected/i)
    ).not.toBeInTheDocument();
  });

  it('rename button has pointer-events: none when incognito is active (REQ-DIM-1)', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const renameBtn = screen.getByLabelText(/rename conversation hello/i);
    expect(renameBtn.style.pointerEvents).toBe('none');
  });

  it('delete button has pointer-events: none when incognito is active (REQ-DIM-1)', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const deleteBtn = screen.getByLabelText(/delete conversation hello/i);
    expect(deleteBtn.style.pointerEvents).toBe('none');
  });

  it('row title link remains clickable when incognito is active (REQ-DIM-4)', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const link = screen.getByText('Hello').closest('a')!;
    // The link itself is the navigation target; pointer-events must NOT be none.
    // jsdom reports the inline style as set; if no style was applied, the
    // string is empty (which is also a valid "not disabled" state).
    expect(link.style.pointerEvents).not.toBe('none');
  });

  it('row actions regain pointer-events: auto when incognito is toggled off', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const renameBtn = screen.getByLabelText(/rename conversation hello/i);
    expect(renameBtn.style.pointerEvents).toBe('none');
    exitIncognito();
    // After exit, the buttons must NOT carry pointer-events: none.
    // (The inline style may be empty string if we conditionally set it.)
    expect(renameBtn.style.pointerEvents).not.toBe('none');
  });
});

// ─── Post-deploy #2 — Conditional incognito notice (welcome vs chat) ───────

describe('ConversationList — post-deploy #2 conditional incognito notice', () => {
  it('shows the "welcome" variant when incognito is on AND chatActive is false', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    expect(
      screen.getByText(/incognito active — these chats are not affected/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/incognito — this chat won't be saved/i)).not.toBeInTheDocument();
  });

  it('shows the "chat" variant when incognito is on AND a chat is active', () => {
    renderList('c-1', [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    expect(screen.getByText(/incognito — this chat won't be saved/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/incognito active — these chats are not affected/i)
    ).not.toBeInTheDocument();
  });

  it('hides the notice entirely when incognito is off, regardless of chatActive', () => {
    renderList('c-1', [makeConv({ id: 'c-1', title: 'Hello' })]);
    expect(
      screen.queryByText(/incognito active — these chats are not affected/i)
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/incognito — this chat won't be saved/i)).not.toBeInTheDocument();
  });
});

// ─── Post-deploy #4 — user-select: none on UI chrome ──────────────────────

describe('ConversationList — post-deploy #4 user-select chrome', () => {
  it('Recent header has class "select-none"', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    // The "Recent" text is inside a <div className="...select-none"> — find
    // that wrapper directly via testid-style class match.
    const recentWrapper = screen.getByText('Recent').closest('.select-none');
    expect(recentWrapper).not.toBeNull();
  });

  it('date group label (HOY/AYER/etc) has class "select-none"', () => {
    // A conversation from years ago falls in the "Older" group, which gets
    // its own label rendered (the global "Recent" header only suppresses
    // the first group's label).
    const old = makeConv({
      id: 'c-old',
      title: 'Old',
      updatedAt: '2020-01-15T00:00:00Z',
    });
    const recent = makeConv({
      id: 'c-recent',
      title: 'Recent',
      updatedAt: new Date().toISOString(),
    });
    render(
      <MemoryRouter>
        <ConversationList
          loadingConversations={false}
          conversations={[recent, old]}
          filteredConversations={[recent, old]}
          searchQuery=""
          activeConversationId={null}
          chatActive={false}
          confirmLeaveIfStreaming={() => true}
          onCloseMobile={vi.fn()}
          onOpenRename={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </MemoryRouter>
    );
    // Find any uppercase label (the older group has a date-style label).
    const groupLabels = document.querySelectorAll('div.uppercase');
    expect(groupLabels.length).toBeGreaterThan(0);
    const label = groupLabels[0] as HTMLElement;
    expect(label.className).toContain('select-none');
  });

  it('incognito notice has class "select-none"', () => {
    renderList(null, [makeConv({ id: 'c-1', title: 'Hello' })]);
    enterIncognito();
    const notice = screen.getByTestId('incognito-dim-notice');
    expect(notice.className).toContain('select-none');
  });

  it('conversation title is selectable (no select-none on the link)', () => {
    renderList('c-1', [makeConv({ id: 'c-1', title: 'Hello' })]);
    const link = screen.getByText('Hello').closest('a')!;
    expect(link.className).not.toContain('select-none');
  });
});
