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
    if (parts[0] && parts[1]) {
      country = getCountryFromRegion(parts[0], parts[1]);
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

function getCountryFromRegion(continent: string, city: string): string {
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

export function ProfileForm() {
  const { t } = useTranslation();
  const { profile, saving, updateProfile } = useProfile();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [saved, setSaved] = useState(false);

  const detected = detectBrowserLocale();

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName ?? '');
    }
  }, [profile]);

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

  return (
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
          <p className="mt-1" style={{ fontSize: 11, color: 'var(--text-4)' }}>
            {t('profile.displayNameHelp')}
          </p>
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
  );
}
