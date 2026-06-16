import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Conversation } from '@chat/sdk';
import { storage } from '../lib/storage';
import { apiGet, apiDelete, apiPatch, apiPost } from '../lib/api-client';

/**
 * Owns the sidebar conversation history and every mutation on it: fetch (on
 * navigation + on the `conversation:updated` event from ChatPage), soft-delete,
 * rename, and AI re-title. Keeps all the modal-pending state cohesive in one
 * place so Layout only wires presentation.
 *
 * @param activeConversationId the open conversation, used to navigate home when
 *   the currently-open conversation is deleted.
 */
export function useConversations(activeConversationId: string | null) {
  const location = useLocation();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  // Soft-delete confirmation: holds the conversation pending deletion (or null).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Rename: holds the conversation being renamed (or null) + the draft title.
  const [pendingRename, setPendingRename] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [regeneratingTitle, setRegeneratingTitle] = useState(false);

  const fetchConversations = useCallback(() => {
    const t = storage.get('token');
    if (!t) return;
    setLoadingConversations(true);
    apiGet<Conversation[]>('/conversations')
      .then((data) => setConversations(Array.isArray(data) ? data : []))
      .catch(() => setConversations([]))
      .finally(() => setLoadingConversations(false));
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, location.pathname]);

  // Listen for "conversation:updated" events emitted by ChatPage so the
  // sidebar can refresh without forcing a page navigation.
  useEffect(() => {
    const handler = () => fetchConversations();
    window.addEventListener('conversation:updated', handler);
    return () => window.removeEventListener('conversation:updated', handler);
  }, [fetchConversations]);

  const handleDeleteConfirmed = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDelete(`/conversations/${pendingDelete.id}`);
      setConversations((prev) => prev.filter((c) => c.id !== pendingDelete.id));
      // If the deleted conversation is open, leave it.
      if (activeConversationId === pendingDelete.id) navigate('/');
      setPendingDelete(null);
    } catch {
      // Keep the dialog open so the user can retry; deletion just didn't happen.
    } finally {
      setDeleting(false);
    }
  };

  const openRename = (id: string, title: string) => {
    setPendingRename({ id, title });
    setRenameValue(title);
  };

  const handleRenameConfirmed = async () => {
    if (!pendingRename) return;
    const title = renameValue.trim();
    if (!title || title === pendingRename.title) {
      setPendingRename(null);
      return;
    }
    setRenaming(true);
    try {
      await apiPatch(`/conversations/${pendingRename.id}`, { title });
      setConversations((prev) =>
        prev.map((c) => (c.id === pendingRename.id ? { ...c, title } : c))
      );
      setPendingRename(null);
    } catch {
      // Keep the dialog open so the user can retry.
    } finally {
      setRenaming(false);
    }
  };

  // Ask the model to generate a fresh title for an existing conversation. Fills
  // the input so the user can still tweak/confirm it before saving. (P.3)
  const handleRegenerateTitle = async () => {
    if (!pendingRename || regeneratingTitle) return;
    setRegeneratingTitle(true);
    try {
      const { title } = await apiPost<{ title: string }>(
        `/conversations/${pendingRename.id}/retitle`,
        {}
      );
      setRenameValue(title);
      setConversations((prev) =>
        prev.map((c) => (c.id === pendingRename.id ? { ...c, title } : c))
      );
    } catch {
      // Leave the field untouched so the user can rename manually instead.
    } finally {
      setRegeneratingTitle(false);
    }
  };

  return {
    conversations,
    loadingConversations,
    // delete
    pendingDelete,
    setPendingDelete,
    deleting,
    handleDeleteConfirmed,
    // rename
    pendingRename,
    setPendingRename,
    renameValue,
    setRenameValue,
    renaming,
    regeneratingTitle,
    openRename,
    handleRenameConfirmed,
    handleRegenerateTitle,
  };
}
