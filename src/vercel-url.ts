/**
 * Все запросы /api/* на Vercel направляются в одну функцию api/index.ts правилом rewrites из vercel.json:
 *   /api/auth/me  ->  /api/index?__path=auth/me
 *
 * Почему не файл api/[...path].ts: в проектах не на Next.js Vercel превращает такой файл в маршрут
 * только для ОДНОГО сегмента (/api/health), а всё, что глубже (/api/auth/me, /api/waybills/:id/receive),
 * получает 404 от самой платформы.
 *
 * Функция возвращает исходный путь, чтобы Express маршрутизировал /api/auth/me, а не /api/index.
 * Если Vercel уже передал исходный путь, URL не меняется.
 */
export function restoreOriginalUrl(url: string): string {
  const parsed = new URL(url, 'http://localhost');
  const forwarded = parsed.searchParams.get('__path');
  const isFunctionPath = parsed.pathname === '/api' || parsed.pathname === '/api/index';
  if (!isFunctionPath || forwarded === null) return url;

  parsed.searchParams.delete('__path');
  const path = forwarded.replace(/^\/+/, '');
  return `/api${path ? `/${path}` : ''}${parsed.search}`;
}
