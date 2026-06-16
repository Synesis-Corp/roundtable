import { useState, useEffect } from 'react';
import { apiGet, apiPatch } from '../lib/api-client';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  country: string | null;
  timezone: string | null;
}

/**
 * Loads and saves user profile fields (displayName, country, timezone).
 */
export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<UserProfile>('/auth/profile')
      .then((data) => {
        if (!cancelled) setProfile(data);
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
    fields: Partial<Pick<UserProfile, 'displayName' | 'country' | 'timezone'>>
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

  return { profile, loading, saving, updateProfile };
}
