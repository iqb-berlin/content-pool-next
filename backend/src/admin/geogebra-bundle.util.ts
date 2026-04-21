import * as path from "path";

export const GEOGEBRA_ASSET_PREFIX = "/assets/GeoGebra/";
export const GEOGEBRA_DEPLOY_SCRIPT_PATH =
  "/assets/GeoGebra/GeoGebra/deployggb.js";
export const GEOGEBRA_PLAYER_RESOURCE_BASE = "/api/shared-assets";
export const GEOGEBRA_PLAYER_API_PREFIX = "/api/shared-assets/GeoGebra/";
export const GEOGEBRA_PLAYER_DEPLOY_SCRIPT_PATH =
  "/api/shared-assets/GeoGebra/GeoGebra/deployggb.js";
export const GEOGEBRA_API_PREFIX = "/api/shared-assets/geogebra/";
export const GEOGEBRA_API_DEPLOY_SCRIPT_PATH =
  "/api/shared-assets/geogebra/GeoGebra/deployggb.js";
export const GEOGEBRA_REQUIRED_ENTRY = "GeoGebra/deployggb.js";

export function getFileStoragePath(): string {
  return process.env.FILE_STORAGE_PATH || "./uploads";
}

export function getGeoGebraBundleBaseDir(
  fileStoragePath = getFileStoragePath(),
): string {
  return path.join(fileStoragePath, "shared-assets", "geogebra");
}

export function getGeoGebraBundleCurrentDir(
  fileStoragePath = getFileStoragePath(),
): string {
  return path.join(getGeoGebraBundleBaseDir(fileStoragePath), "current");
}
