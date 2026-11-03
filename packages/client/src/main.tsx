import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted Inter (no external CDN) for all UI text and figures.
import '@fontsource-variable/inter';

import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
