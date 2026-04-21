const GEO_GEBRA_ASSET_PREFIX = '/assets/GeoGebra/';
const GEO_GEBRA_API_ASSET_PREFIX = '/api/shared-assets/GeoGebra/';
const GEO_GEBRA_RESOURCE_URL_PATTERN =
  /getResourceURL\(\)\{return this\.resourceURL\|\|["']assets["']\}/g;

export const GEOGEBRA_PLAYER_RESOURCE_BASE = '/api/shared-assets';

export function rewriteGeoGebraAssetUrls(html: string): string {
  return String(html || '')
    .split(GEO_GEBRA_ASSET_PREFIX)
    .join(GEO_GEBRA_API_ASSET_PREFIX)
    .replace(
      GEO_GEBRA_RESOURCE_URL_PATTERN,
      `getResourceURL(){return this.resourceURL||"${GEOGEBRA_PLAYER_RESOURCE_BASE}"}`,
    );
}
