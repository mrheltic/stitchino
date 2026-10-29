import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n/index.ts';
import { App } from './ui/App.tsx';
import { bindThemeToDocument } from './ui/state/settings.ts';

bindThemeToDocument();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
