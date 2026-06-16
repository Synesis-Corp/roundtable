import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../hooks/useProfile';

function detectBrowserLocale(): { country: string; timezone: string } {
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    /* swallows */
  }
  let country = '';
  if (timezone) {
    const parts = timezone.split('/');
    if (parts[1]) {
      country = getCountryFromRegion(parts[1]);
    }
  }
  if (!country) {
    try {
      country = Intl.DateTimeFormat().resolvedOptions().locale?.split('-')[1]?.toUpperCase() || '';
    } catch {
      /* swallows */
    }
  }
  return { country: country.slice(0, 2), timezone };
}

function getCountryFromRegion(city: string): string {
  const map: Record<string, string> = {
    Buenos_Aires: 'AR',
    Cordoba: 'AR',
    Sao_Paulo: 'BR',
    Santiago: 'CL',
    Lima: 'PE',
    Bogota: 'CO',
    Mexico_City: 'MX',
    New_York: 'US',
    Chicago: 'US',
    Los_Angeles: 'US',
    Toronto: 'CA',
    London: 'GB',
    Paris: 'FR',
    Berlin: 'DE',
    Madrid: 'ES',
    Rome: 'IT',
    Tokyo: 'JP',
    Sydney: 'AU',
  };
  return map[city] || '';
}

function simplifyUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  return ua.slice(0, 30);
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ProfileForm() {
  const { t, i18n } = useTranslation();
  const { profile, saving, sessions, updateProfile, revokeSession } = useProfile();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [saved, setSaved] = useState(false);

  const detected = detectBrowserLocale();

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
      if (profile.language) {
        i18n.changeLanguage(profile.language);
        localStorage.setItem('roundtable:lang', profile.language);
      }
    }
  }, [profile, i18n]);

  if (!profile) return null;

  const handleSave = async () => {
    setSaved(false);
    await updateProfile({
      displayName: displayName || null,
      country: detected.country || null,
      timezone: detected.timezone || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLanguageChange = async (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('roundtable:lang', lang);
    await updateProfile({ language: lang });
  };

  return (
    <div className="space-y-4">
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
          {t('profile.title')}
        </h2>
        <p className="mt-1" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {t('profile.subtitle')}
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label
              className="block mb-1.5"
              style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}
            >
              {t('profile.displayName')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profile.displayNamePlaceholder')}
              className="w-full px-3 py-2 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              style={{
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border)',
                color: 'var(--text-1)',
                maxWidth: 360,
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 400 }}>
            <div>
              <label
                className="block mb-1.5"
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}
              >
                {t('profile.country')}
              </label>
              <div
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  color: detected.country ? 'var(--text-1)' : 'var(--text-4)',
                }}
              >
                {detected.country || t('profile.notDetected')}
              </div>
            </div>
            <div>
              <label
                className="block mb-1.5"
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}
              >
                {t('profile.timezone')}
              </label>
              <div
                className="px-3 py-2 rounded-lg text-sm truncate"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  color: detected.timezone ? 'var(--text-1)' : 'var(--text-4)',
                }}
              >
                {detected.timezone || t('profile.notDetected')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              {saving ? t('profile.saving') : t('profile.save')}
            </button>
            {saved && (
              <span className="text-xs" style={{ color: 'var(--m-green)' }}>
                {t('profile.saved')}
              </span>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
          {t('profile.language')}
        </h2>
        <p className="mt-1" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {t('profile.languageHelp')}
        </p>
        <div className="mt-4 flex gap-2">
          {(
            [
              { key: 'en', label: 'English' },
              { key: 'es', label: 'Español' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleLanguageChange(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: i18n.language === key ? 'var(--accent)' : 'var(--bg-app)',
                color: i18n.language === key ? '#fff' : 'var(--text-2)',
                border:
                  i18n.language === key ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>
          {t('profile.sessions')}
        </h2>
        <p className="mt-1" style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
          {t('profile.sessionsHelp')}
        </p>
        <div className="mt-4 space-y-3">
          {sessions.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--text-4)' }}>
              {t('profile.noSessions')}
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-4 p-4 rounded-xl border"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-app)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                    {simplifyUserAgent(s.userAgent)}
                  </span>
                  {s.ip && (
                    <span className="text-xs" style={{ color: 'var(--text-4)' }}>
                      {s.ip}
                    </span>
                  )}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {timeAgo(s.lastSeenAt)}
                </div>
              </div>
              <button
                onClick={() => revokeSession(s.id)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={{
                  color: 'var(--text-3)',
                  borderColor: 'var(--border)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
                  e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-3)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {t('profile.revokeSession')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
