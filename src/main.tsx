import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AdminProvider } from './context/AdminContext';
import { FeedbackProvider } from './context/FeedbackContext';
import './index.css';

// Bittet den Browser, die lokalen Band-Daten nicht bei Speicherknappheit zu löschen.
navigator.storage?.persist?.().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminProvider>
      <FeedbackProvider>
        <App />
      </FeedbackProvider>
    </AdminProvider>
  </StrictMode>,
);
