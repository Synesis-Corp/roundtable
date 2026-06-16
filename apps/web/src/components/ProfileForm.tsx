import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProfile } from '../hooks/useProfile';

export function ProfileForm() {
  const { t } = useTranslation();
  const { profile, saving, updateProfile } = useProfile();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [timezone, setTimezone] = useState(profile?.timezone ?? '');
  const [saved, setSaved] = useState(false);

  if (!profile) return null;

  const handleSave = async () => {
    setSaved(false);
    await updateProfile({
      displayName: displayName || null,
      country: country || null,
      timezone: timezone || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mb-6 p-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
      <h2 className="text-sm font-semibold text-[var(--text-1)] mb-3">{t('profile.title')}</h2>
      <p className="text-xs text-[var(--text-3)] mb-4">{t('profile.subtitle')}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
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
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
            {t('profile.country')}
          </label>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
            placeholder={t('profile.countryPlaceholder')}
            maxLength={2}
            className="w-full px-3 py-2 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border)',
              color: 'var(--text-1)',
            }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
            {t('profile.timezone')}
          </label>
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder={t('profile.timezonePlaceholder')}
            className="w-full px-3 py-2 rounded-lg text-sm border transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border)',
              color: 'var(--text-1)',
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {saving ? t('profile.saving') : t('profile.save')}
        </button>
        {saved && <span className="text-xs text-[var(--m-green)]">{t('profile.saved')}</span>}
      </div>
    </div>
  );
}
