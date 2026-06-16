import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees after every test so the DOM doesn't leak between cases.
afterEach(() => {
  cleanup();
});
