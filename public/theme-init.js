// Setzt die gewählte Darstellung vor dem ersten Zeichnen (kein Aufblitzen). Schlüssel wie in src/theme/darstellung.ts.
try {
  var d = localStorage.getItem('kompass-darstellung');
  if (d === 'hell') document.documentElement.setAttribute('data-theme', 'light');
  else if (d === 'dunkel') document.documentElement.setAttribute('data-theme', 'dark');
} catch (e) { /* ohne Speicher: dem Gerät folgen */ }
