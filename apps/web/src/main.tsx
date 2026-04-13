import { render } from 'preact';
import { LocationProvider } from 'preact-iso';
import './styles.css';
import { App } from './app';
import { bootSync } from './storage/boot';

// Kick off the initial sync in parallel with the first render. The UI reads
// from signals and will update when hydration finishes.
void bootSync();

const root = document.getElementById('app');
if (!root) throw new Error('#app root element missing');
render(
  <LocationProvider>
    <App />
  </LocationProvider>,
  root,
);
