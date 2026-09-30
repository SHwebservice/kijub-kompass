import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

/* Kleines Design-System. Stile stehen in src/styles/base.css, Werte in tokens.css. */

type Variante = 'standard' | 'primary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  klein?: boolean;
  block?: boolean;
  laedt?: boolean;
}

export function Button({ variante = 'standard', klein, block, laedt, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  const klassen = ['btn', variante !== 'standard' && `btn--${variante}`, klein && 'btn--sm', block && 'btn--block', className]
    .filter(Boolean).join(' ');
  return (
    <button {...rest} type={type} className={klassen} disabled={disabled || laedt} aria-busy={laedt || undefined}>
      {laedt && <Spinner beschriftung="" />}
      {children}
    </button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>;
}

type BadgeTon = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export function Badge({ children, ton = 'neutral' }: { children: ReactNode; ton?: BadgeTon }) {
  return <span className={`badge${ton === 'neutral' ? '' : ` badge--${ton}`}`}>{children}</span>;
}

export function Spinner({ beschriftung = 'Lädt …' }: { beschriftung?: string }) {
  return (
    <span role={beschriftung ? 'status' : undefined}>
      <span className="spinner" aria-hidden="true" />
      {beschriftung && <span className="sr-only">{beschriftung}</span>}
    </span>
  );
}

export function Alert({ ton = 'info', children }: { ton?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  return <div className={`alert alert--${ton}`} role={ton === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function EmptyState({ icon = '🗂️', titel, children }: { icon?: string; titel: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">{icon}</span>
      <strong>{titel}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function PageHeader({ titel, children }: { titel: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{titel}</h1>
      {children}
    </div>
  );
}

interface FieldBasis { label: string; hinweis?: string; fehler?: string | null }

/** Beschriftetes Eingabefeld; Label, Hinweis und Fehlertext sind per aria mit dem Feld verbunden. */
export function TextField({ label, hinweis, fehler, ...rest }: FieldBasis & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const beschreibung = [hinweis && `${id}-h`, fehler && `${id}-e`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input {...rest} id={id} className="input" aria-invalid={fehler ? true : undefined} aria-describedby={beschreibung} />
      {hinweis && <span className="field__hint" id={`${id}-h`}>{hinweis}</span>}
      {fehler && <span className="field__error" id={`${id}-e`}>{fehler}</span>}
    </div>
  );
}

export function SelectField({ label, hinweis, fehler, children, ...rest }: FieldBasis & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  const beschreibung = [hinweis && `${id}-h`, fehler && `${id}-e`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <select {...rest} id={id} className="input" aria-invalid={fehler ? true : undefined} aria-describedby={beschreibung}>
        {children}
      </select>
      {hinweis && <span className="field__hint" id={`${id}-h`}>{hinweis}</span>}
      {fehler && <span className="field__error" id={`${id}-e`}>{fehler}</span>}
    </div>
  );
}
