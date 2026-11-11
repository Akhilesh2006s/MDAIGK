import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COLORS } from '@mango/shared';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { App } from './App';
import './styles.css';

// Brand tokens come from @mango/shared so web and mobile stay in sync.
const root = document.documentElement.style;
root.setProperty('--green', COLORS.forestGreen);
root.setProperty('--green-dark', COLORS.forestGreenDark);
root.setProperty('--mango', COLORS.mangoYellow);
root.setProperty('--gold', COLORS.premiumGold);
root.setProperty('--light-green', COLORS.lightGreen);
root.setProperty('--ivory', COLORS.warmIvory);
root.setProperty('--text', COLORS.text);
root.setProperty('--muted', COLORS.textMuted);
root.setProperty('--border', COLORS.border);
root.setProperty('--danger', COLORS.danger);
root.setProperty('--danger-bg', COLORS.dangerBg);
root.setProperty('--info', COLORS.info);
root.setProperty('--locked', COLORS.locked);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
