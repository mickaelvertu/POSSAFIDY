import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(error => {
      console.error('Offline app setup failed:', error);
    });
  });
}

// After a deploy, an open tab may request chunks that no longer exist: reload once to get the new build.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  if (sessionStorage.getItem('chunk-reload') !== '1') {
    sessionStorage.setItem('chunk-reload', '1');
    window.location.reload();
  }
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('chunk-reload'), 10000));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
