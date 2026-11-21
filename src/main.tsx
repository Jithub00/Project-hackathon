import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import App from './App';
import { AppProvider } from './lib/app-context';
import { ErrorBoundary } from './components/site/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
