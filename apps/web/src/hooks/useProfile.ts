import { useState, useEffect } from 'react';
import { apiGet, apiPatch, apiDelete } from '../lib/api-client';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  country: string | null;
  timezone: string | null;
  language: string | null;
}

export interface UserSession {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiGet<UserProfile>('/auth/profile'),
      apiGet<{ sessions: UserSession[] }>('/auth/sessions'),
    ])
      .then(([profileData, sessionsData]) => {
        if (!cancelled) {
          setProfile(profileData);
          setSessions(sessionsData.sessions);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateProfile(
    fields: Partial<Pick<UserProfile, 'displayName' | 'country' | 'timezone' | 'language'>>
  ) {
    setSaving(true);
    try {
      const updated = await apiPatch<UserProfile>('/auth/profile', fields);
      setProfile(updated);
      return updated;
    } finally {
      setSaving(false);
    }
  }

  async function revokeSession(sessionId: string) {
    await apiDelete(`/auth/sessions/${sessionId}`);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  return { profile, loading, saving, sessions, updateProfile, revokeSession };
}
