import type { AvatarManifest, BackdropAsset, PoseAsset } from "@comic-chat/asset-manifest-types";
import type { ParsedAvatar } from "./avbParser.js";

/**
 * ParsedAvatar(avbParser 출력)와 실제로 변환된 포즈 이미지 파일 정보를 합쳐
 * apps/web이 소비할 AvatarManifest를 만든다.
 * @param poseAssets parsed.poseOffsets와 동일한 길이/순서로 대응하는 이미지 자산 목록
 */
export function buildAvatarManifest(characterId: string, parsed: ParsedAvatar, poseAssets: PoseAsset[]): AvatarManifest {
  const flags = { headMask: parsed.headMask, torsoMask: parsed.torsoMask, torsoFirst: parsed.torsoFirst };
  const icon = parsed.iconPoseIndex !== null ? (poseAssets[parsed.iconPoseIndex] ?? null) : null;

  if (parsed.kind === "complex") {
    return {
      characterId,
      name: parsed.name,
      kind: "complex",
      flags,
      icon,
      poses: poseAssets,
      faces: parsed.faces,
      torsos: parsed.torsos,
    };
  }

  return {
    characterId,
    name: parsed.name,
    kind: "simple",
    flags,
    icon,
    poses: poseAssets,
    bodies: parsed.bodies,
  };
}

export function buildBackdropAsset(backdropId: string, name: string, imagePath: string, width: number, height: number): BackdropAsset {
  return { backdropId, name, imagePath, width, height };
}
