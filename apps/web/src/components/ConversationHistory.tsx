import { storage } from "../lib/storage";
import { useState, useEffect, useCallback } from "react";
import type { Conversation } from "@chat/sdk";
import { apiGet } from "../lib/api-client";

interface Props {
  onSelectConversation?: (conversationId: string) => void;
}

export default function ConversationHistory({ onSelectConversation }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const token = storage.get("token");

  const fetchConversations = useCallback(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiGet<Conversation[]>("/conversations")
      .then((data) => setConversations(Array.isArray(data) ? data : []))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m`;
    if (diffHrs < 24) return `${diffHrs}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="dot-pulse"><span /><span /><span /></div>
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="label-text px-2 mb-2">Recent</div>
      {conversations.length === 0 ? (
        <p className="text-xs text-gray-600 px-2">No conversations yet</p>
      ) : (
        <div className="space-y-0.5">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation?.(conv.id)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800/50 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <div className="text-xs font-medium text-gray-300 truncate">
                {conv.title}
              </div>
              <div className="text-[11px] text-gray-600 mt-0.5 flex items-center justify-between">
                <span className="truncate">
                  {conv.messages?.[conv.messages.length - 1]?.content.slice(0, 30) ?? ""}
                </span>
                <span className="shrink-0 ml-2">{formatTime(conv.updatedAt)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
