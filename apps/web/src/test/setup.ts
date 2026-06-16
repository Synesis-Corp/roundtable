import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// Initialize the shared i18n instance so components using useTranslation render
// real strings (English fallback in jsdom) instead of raw translation keys.
import "../i18n";

// Unmount React trees after every test so the DOM doesn't leak between cases.
afterEach(() => {
  cleanup();
});
