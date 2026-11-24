/**
 * Resolve a path from public/ against Vite's base URL. With the relative base
 * configured in vite.config.ts this works on GitHub Pages project sites and at
 * a domain root.
 */
export function assetUrl(publicPath: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${publicPath.replace(/^\/+/, "")}`;
}
