/** Base pública acessível pelo Edge (device na LAN). */
export function publicBaseUrl() {
  return (
    process.env.PUBLIC_BASE_URL ??
    `http://localhost:${process.env.PORT ?? 3001}`
  ).replace(/\/$/, '');
}

/**
 * Reescreve URLs localhost/127.0.0.1 para PUBLIC_BASE_URL,
 * para o Edge físico conseguir baixar mídia/screenshots.
 */
export function toPublicUrl(url: string) {
  if (!url) return url;
  const base = publicBaseUrl();
  return url.replace(
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i,
    base,
  );
}
