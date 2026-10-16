import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import App from './App';

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
