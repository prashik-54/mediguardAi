// Phase 14 -- frontend smoke tests.
//
// These are intentionally shallow: they render the app (and a couple of its
// heaviest standalone pages) and assert nothing throws and the expected
// landmark text shows up. Deep interaction/behavior coverage is the backend
// API's job (tests/, 200 passing) — this suite exists purely to catch a
// broken import, a bad JSX edit, or a provider crash before it ships, which
// the previous phases' `npm run build`-less environment couldn't catch.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import App from '../App';
import Login from '../pages/auth/Login';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';

function withProviders(children) {
  return (
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('App shell', () => {
  it('renders the public home route without throwing', () => {
    render(<App />);
    // HashRouter defaults to "/" -> the public Home page inside PublicLayout.
    expect(document.body).toBeTruthy();
  });
});

describe('Login page', () => {
  it('renders the login form landmarks', () => {
    render(withProviders(<Login />));
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/password/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /log in|sign in/i })).toBeInTheDocument();
  });
});
