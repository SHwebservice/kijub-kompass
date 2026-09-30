import { Component, type ErrorInfo, type ReactNode } from 'react';
import { VERSION } from '../version';

interface Props { children: ReactNode; /** Wird beim Neuladen aufgerufen (Tests ersetzen das). */ neuLaden?: () => void }
interface Zustand { fehler: Error | null }

/**
 * Fängt unerwartete Fehler beim Zeichnen ab, damit statt einer weißen Seite eine verständliche Meldung erscheint.
 * Die technische Meldung steht zum Weitergeben an die Koordination in einem eingeklappten Bereich.
 */
export class FehlerGrenze extends Component<Props, Zustand> {
  state: Zustand = { fehler: null };

  static getDerivedStateFromError(fehler: Error): Zustand { return { fehler }; }

  componentDidCatch(fehler: Error, info: ErrorInfo) {
    console.error('Unerwarteter Fehler in der Oberfläche', fehler, info.componentStack);
  }

  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <div className="login">
        <div className="login__box card" role="alert">
          <h1>Da ist etwas schiefgelaufen</h1>
          <p>Die Seite konnte nicht angezeigt werden. Deine Daten sind nicht verloren. Bitte lade die Seite neu. Wenn der Fehler bleibt, melde ihn der Koordination.</p>
          <p>
            <button type="button" className="btn btn--primary" onClick={() => (this.props.neuLaden ?? (() => window.location.reload()))()}>Seite neu laden</button>
          </p>
          <details>
            <summary>Technische Angaben für die Meldung</summary>
            <p className="field__hint">Version {VERSION}</p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.fehler.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
