import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/globals.css'

// Global error handler — 防止黑屏，错误会显示在 ErrorBoundary 中
window.addEventListener('error', (e) => {
  console.error('[Global Error]', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Promise]', e.reason);
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
