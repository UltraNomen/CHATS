import { render } from 'preact';
import '#shared/ui/global.css';
import { App } from './App.jsx';

// The app behaves like a native one: no pinch, double-tap or focus zoom.
// The viewport tag covers Android and the iOS focus zoom; touch-action stops double-tap (and pinch where supported);
// iOS Safari ignores both for pinch, so its gesture events are cancelled too.
document.documentElement.style.touchAction = 'pan-x pan-y';
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, e => e.preventDefault(), { passive: false });

render(<App />, document.getElementById('app'));
