import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { FehlerGrenze } from './components/FehlerGrenze';
import { installiereFehlerMeldung } from './fehlermeldungen/melden';
import { meldeFehler } from './fehlermeldungen/melder';
import './styles/tokens.css';
import './styles/base.css';
import './styles/glas.css';
import { starteDarstellung } from './theme/darstellung';

starteDarstellung();
installiereFehlerMeldung(meldeFehler);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FehlerGrenze>
      <App />
    </FehlerGrenze>
  </StrictMode>,
);
