import { render } from 'preact';
import '#shared/ui/global.css';
import './fa.js';
import { AdminApp } from './App.jsx';

render(<AdminApp />, document.getElementById('app'));
