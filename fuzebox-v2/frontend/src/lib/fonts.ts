/**
 * Typography — system font stack only (no network at build time).
 *
 * `next/font/google` was removed because builds fail with ETIMEDOUT when
 * fonts.googleapis.com is unreachable. Optional self-hosted fonts:
 *   npm install @fontsource/inter @fontsource/jetbrains-mono
 * then import those CSS files here and set --font-sans / --font-mono in globals.css.
 */
export const fontClassNames = "";
