declare const __BUILD_VERSION__: string | undefined;

/** Kurze Commit-ID des laufenden Standes („lokal“ bei der Entwicklung und in Tests). */
export const VERSION: string = typeof __BUILD_VERSION__ === 'string' && __BUILD_VERSION__ ? __BUILD_VERSION__ : 'lokal';
