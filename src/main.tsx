import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './presentation/App.tsx';
import { initializeAppearance } from './presentation/appearance.ts';
import './presentation/styles.css';
import './presentation/theme.css';
import './presentation/cinema.css';
import './styles/tokens.css';
import './presentation/components/controls.css';
import './presentation/features/library/cover-material.css';
import './presentation/features/glass/material.css';
import './presentation/features/glass/action-material.css';
import './presentation/components/selects.css';

initializeAppearance();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
