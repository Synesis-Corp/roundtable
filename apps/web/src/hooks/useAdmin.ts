import { useState, useEffect } from 'react';
import { apiGet } from '../lib/api-client';

interface AdminState {
  isAdmin: boolean;
  loading: boolean;
}

/**
 * Verifies whether the current user has admin access by attempting to fetch
 * the admin overview endpoint. Uses the same session-cached pattern as other
 * hooks — one check per mount, result cached for the session.
 *
 * If the endpoint returns 200, the user is admin. 403 means not admin.
 * Other errors are treated as not-admin (fail-safe).
 */
export function useAdmin(): AdminState {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<Record<string, unknown>>('/admin/metrics/overview')
      .then(() => {
        if (!cancelled) {
          setIsAdmin(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin, loading };
}
