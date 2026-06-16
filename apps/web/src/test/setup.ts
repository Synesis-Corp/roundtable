import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// Initialize the shared i18n instance so components using useTranslation render
// real strings (English fallback in jsdom) instead of raw translation keys.
import i18n from '../i18n';

// Eagerly await init so every test sees fully-loaded resources. The init in
// `../i18n/index.ts` is fire-and-forget; we bridge to the `initialized` event
// here so test files that run after setup don't race the resources load.
await (async () => {
  if (i18n.isInitialized) return;
  await new Promise<void>((resolve) => {
    if (i18n.isInitialized) {
      resolve();
      return;
    }
    i18n.on('initialized', () => resolve());
  });
})();

// Force English so jsdom's navigator.language detection doesn't push us to
// a fallback where the assertion string would be Spanish.
await i18n.changeLanguage('en');

// Unmount React trees after every test so the DOM doesn't leak between cases.
afterEach(() => {
  cleanup();
});
