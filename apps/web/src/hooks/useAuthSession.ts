import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { storage } from '../lib/storage';
import { apiPost } from '../lib/api-client';

/**
 * Owns the auth session surfaced in the sidebar: the access token, the derived
 * username (decoded from the JWT payload) and logout. Re-decodes on navigation
 * so a fresh login reflects immediately.
 */
export function useAuthSession() {
  const { t } = useTranslation();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(storage.get('token'));
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    const tokenValue = storage.get('token');
    setToken(tokenValue);
    if (!tokenValue) {
      setUserName('');
      return;
    }
    try {
      const payload = JSON.parse(atob(tokenValue.split('.')[1]));
      setUserName(payload.email ? payload.email.split('@')[0] : t('shell.userFallback'));
    } catch {
      // ignore — malformed token, leave username empty
    }
  }, [location, t]);

  const handleLogout = useCallback(async () => {
    // Revoke the refresh token server-side (clears the httpOnly cookie too).
    // Best-effort: we log out locally regardless of the network result.
    try {
      await apiPost('/auth/logout', {});
    } catch {
      // ignore — local logout still proceeds
    }
    // Clear all user-specific state so the next session (especially a
    // DIFFERENT user on the same browser) doesn't inherit selections from
    // the previous one. Regression fixed 2026-06-14: a stale
    // "selectedModel" pointing at a provider the new user doesn't have
    // configured caused a 400 "No API key configured for any candidate
    // provider (openai)" on the first send. See /openspec/STATUS.md.
    storage.remove('token');
    storage.remove('selectedModel');
    storage.remove('roundtable:is-new');
    setToken(null);
    window.location.href = '/';
  }, []);

  return { token, userName, handleLogout };
}
