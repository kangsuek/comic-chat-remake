import type { AssetCatalog } from "@comic-chat/asset-manifest-types";
import { useEffect, useState } from "react";

export type AssetCatalogState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; catalog: AssetCatalog };

/** tools/avb-converter가 생성한 apps/web/public/assets/catalog.json을 fetch한다. */
export function useAssetCatalog(): AssetCatalogState {
  const [state, setState] = useState<AssetCatalogState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/assets/catalog.json")
      .then((res) => {
        if (!res.ok) throw new Error(`catalog.json 로드 실패: ${res.status}`);
        return res.json() as Promise<AssetCatalog>;
      })
      .then((catalog) => {
        if (!cancelled) setState({ status: "ready", catalog });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
