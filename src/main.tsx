import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// A missing old chunk must not discard an open form by silently reloading.
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  window.dispatchEvent(new Event('app-update-available'));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
