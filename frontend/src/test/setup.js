// Phase 14 -- shared setup for the frontend smoke tests.
// jsdom has no `fetch` and there is no live backend during these tests, so every
// context provider that pings the API on mount (AuthProvider token check,
// SystemStatusProvider health probe, etc.) gets a stub that always "fails
// gracefully" the same way the app already handles a real network error —
// the point of these tests is that nothing *throws* while rendering, not to
// exercise real API responses (that's the backend's job in tests/).
import '@testing-library/jest-dom/vitest';

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ detail: 'stubbed in tests' }),
      text: () => Promise.resolve('stubbed in tests'),
    })
  );
  window.localStorage.clear();
});
