import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted type system (no external CDN). See index.css for how each family
// is mapped to a role: Public Sans = UI/body, Spectral = display, Plex Mono = figures.
import '@fontsource-variable/public-sans/wght.css';
import '@fontsource/spectral/400.css';
import '@fontsource/spectral/500.css';
import '@fontsource/spectral/600.css';
import '@fontsource/spectral/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';

import './index.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
