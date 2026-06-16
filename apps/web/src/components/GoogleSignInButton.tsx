import { storage } from '../lib/storage';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../lib/api-client';
import { IS_NEW_KEY } from '../lib/onboarding-helpers';

/**
 * "Sign in with Google" button. Sends the Google ID token to /api/auth/google,
 * stores the returned app JWT and navigates home. Renders nothing when
 * VITE_GOOGLE_CLIENT_ID is unset, so the UI degrades gracefully.
 */
export default function GoogleSignInButton({ onError }: { onError?: (message: string) => void }) {
  const navigate = useNavigate();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  if (!clientId) return null;

  const handleCredential = async (credential?: string) => {
    if (!credential) {
      onError?.('No Google credential received');
      return;
    }
    try {
      const data = await apiPost<{ token?: string; created?: boolean }>('/auth/google', {
        credential,
      });
      if (data.token) {
        storage.set('token', data.token);
        if (data.created) storage.set(IS_NEW_KEY, '1');
        navigate('/');
      } else {
        onError?.('No token received');
      }
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={(cred) => handleCredential(cred.credential)}
        onError={() => onError?.('Google sign-in failed')}
        theme="filled_black"
        shape="pill"
        text="continue_with"
        width="320"
      />
    </div>
  );
}
