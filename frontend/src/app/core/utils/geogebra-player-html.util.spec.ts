import { describe, expect, it } from 'vitest';
import {
  GEOGEBRA_PLAYER_RESOURCE_BASE,
  rewriteGeoGebraAssetUrls,
} from './geogebra-player-html.util';

describe('rewriteGeoGebraAssetUrls', () => {
  it('rewrites legacy GeoGebra asset paths to the API-backed path', () => {
    expect(
      rewriteGeoGebraAssetUrls(
        '<script src="/assets/GeoGebra/GeoGebra/deployggb.js"></script>',
      ),
    ).toContain('/api/shared-assets/GeoGebra/GeoGebra/deployggb.js');
  });

  it('rewrites the player resource base fallback to the shared API route', () => {
    expect(
      rewriteGeoGebraAssetUrls('getResourceURL(){return this.resourceURL||"assets"}'),
    ).toContain(`getResourceURL(){return this.resourceURL||"${GEOGEBRA_PLAYER_RESOURCE_BASE}"}`);
  });

  it('leaves unrelated html untouched', () => {
    expect(rewriteGeoGebraAssetUrls('<div>Hello</div>')).toBe('<div>Hello</div>');
  });
});
