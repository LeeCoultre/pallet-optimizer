import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { applyAccent, getStoredAccent } from './utils/accent.js'

/* Apply the user's saved accent color before React mounts so the first
   paint already has the right palette (no flash of the default orange). */
applyAccent(getStoredAccent())

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!CLERK_KEY) {
  throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set. See .env.example.')
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Auftraege list refetches every 5s so other users' actions show up.
      refetchInterval: 5000,
      refetchOnWindowFocus: true,
      staleTime: 2000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* ErrorBoundary wraps everything — even ClerkProvider init can throw
        (e.g. on a malformed publishable key) so the fallback UI must
        sit one level above it. */}
    <ErrorBoundary>
      <ClerkProvider publishableKey={CLERK_KEY}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ClerkProvider>
    </ErrorBoundary>
  </StrictMode>,
)