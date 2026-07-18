import { readFileSync } from "node:fs";
import path from "node:path";
import type { AssetCatalog, AvatarManifest } from "@comic-chat/asset-manifest-types";

// tools/avb-converter가 만든 apps/web/public/assets/catalog.json을 그대로 읽는다.
// 두 앱이 같은 모노레포 안에 있으므로 상대 경로로 직접 참조한다.
const DEFAULT_ASSETS_DIR = path.resolve(import.meta.dirname, "../../web/public/assets");

export function loadAvatarCatalog(assetsDir: string = DEFAULT_ASSETS_DIR): Map<string, AvatarManifest> {
  const catalogPath = path.join(assetsDir, "catalog.json");
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog;
  const byCharacterId = new Map<string, AvatarManifest>();
  for (const avatar of catalog.avatars) {
    byCharacterId.set(avatar.characterId, avatar);
  }
  return byCharacterId;
}
