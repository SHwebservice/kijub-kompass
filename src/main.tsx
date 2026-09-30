import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { FehlerGrenze } from './components/FehlerGrenze';
import './styles/tokens.css';
import './styles/base.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FehlerGrenze>
      <App />
    </FehlerGrenze>
  </StrictMode>,
);
