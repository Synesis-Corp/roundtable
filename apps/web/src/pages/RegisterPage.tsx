import { storage } from '../lib/storage';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiPost } from '../lib/api-client';
import { IS_NEW_KEY } from '../lib/onboarding-helpers';
import GoogleSignInButton from '../components/GoogleSignInButton';
import GitHubSignInButton from '../components/GitHubSignInButton';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.register.errors.mismatch'));
      return;
    }

    if (password.length < 8) {
      setError(t('auth.register.errors.tooShort'));
      return;
    }

    setLoading(true);

    try {
      const data = await apiPost<{ token?: string; created?: boolean }>('/auth/register', {
        email,
        password,
      });

      // Auto-login: backend already returns a token on successful registration.
      if (data.token) {
        storage.set('token', data.token);
        if (data.created) storage.set(IS_NEW_KEY, '1');
        navigate('/');
      } else {
        navigate('/login');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.register.errors.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="auth-bg" className="auth-bg flex-1 flex items-center justify-center px-4">
      <div data-testid="auth-card" className="auth-card w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div data-testid="auth-header" className="text-center mb-10">
          <img
            src="/logo/app-icon-gradient.svg"
            alt="Roundtable"
            className="mx-auto mb-4 h-14 w-14 rounded-3xl shadow-2xl"
          />
          <h1
            className="font-serif text-[clamp(28px,4vw,36px)] leading-[1.1] tracking-tight"
            style={{ color: 'var(--text-1)' }}
          >
            {t('auth.register.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-2">{t('auth.register.subtitle')}</p>
        </div>

        {error && (
          <div className="card-dark border-red-500/30 bg-red-900/5 mb-6">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              {t('common.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={t('common.emailPlaceholder')}
              className="input-dark w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              {t('common.password')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder={t('auth.register.passwordPlaceholder')}
              className="input-dark w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              {t('auth.register.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder={t('auth.register.confirmPlaceholder')}
              className="input-dark w-full"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full text-base py-2.5">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="dot-pulse">
                  <span />
                  <span />
                  <span />
                </span>
                {t('auth.register.submitting')}
              </span>
            ) : (
              t('auth.register.submit')
            )}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-gray-500">
          <div className="h-px flex-1 bg-gray-700/60" />
          <span>{t('common.or')}</span>
          <div className="h-px flex-1 bg-gray-700/60" />
        </div>

        <GoogleSignInButton onError={setError} />
        <div className="mt-3">
          <GitHubSignInButton onError={setError} />
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t('auth.register.haveAccount')}{' '}
          <Link
            to="/login"
            className="text-blue-400 hover:text-blue-300 underline underline-offset-2 font-medium"
          >
            {t('auth.register.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
