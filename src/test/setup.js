import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount and clear the DOM after every test so component tests stay isolated.
afterEach(() => cleanup());

// jsdom has no IntersectionObserver — CoverImage (lazy-load) needs one. Stub it
// so components that observe viewport visibility render without crashing.
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}
