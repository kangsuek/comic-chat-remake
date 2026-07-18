// tools/avb-converter가 생성하고 apps/web이 소비하는 매니페스트 JSON의 공용 타입.
// avatario.cpp/bodycam.cpp에서 확인한 필드를 그대로 보존한다 — 렌더러가 GetBodyBox
// (얼굴/몸통 상대 위치 계산)를 그대로 포팅해야 하므로 최종 합성 이미지뿐 아니라
// 원시 위치값도 함께 담는다.
import type { EmotionId } from "@comic-chat/comic-engine";

/** poseOffsets 인덱스 하나가 실제로 변환된 이미지 자산. */
export interface PoseAsset {
  poseIndex: number;
  /** 매니페스트 파일 기준 상대 경로 */
  imagePath: string;
  width: number;
  height: number;
}

export interface FacePoseEntry {
  poseIndex: number;
  emotion: EmotionId;
  intensity: number;
  xCX: number;
  yCX: number;
  deltaXCX: number;
  deltaYCX: number;
  faceX: number;
  faceY: number;
}

export interface TorsoPoseEntry {
  poseIndex: number;
  emotion: EmotionId;
  intensity: number;
  xCX: number;
  yCX: number;
}

export interface SimpleBodyPoseEntry {
  poseIndex: number;
  emotion: EmotionId;
  intensity: number;
  faceX: number;
  faceY: number;
}

/** avatar.h의 HEADMASK/TORSOMASK/TORSOFIRST. headMask/torsoMask는 컨버터가 합성 시점에
 * 이미 반영했으므로 렌더러는 참고용으로만 쓰고, torsoFirst만 z-order 결정에 실제로 쓴다. */
export interface AvatarFlags {
  headMask: boolean;
  torsoMask: boolean;
  torsoFirst: boolean;
}

interface AvatarManifestBase {
  characterId: string;
  name: string;
  flags: AvatarFlags;
  icon: PoseAsset | null;
  /** poseIndex로 조회하는 변환된 이미지 자산 목록(원작의 ditto 제거 후 고유 포즈들). */
  poses: PoseAsset[];
}

export type AvatarManifest =
  | (AvatarManifestBase & { kind: "complex"; faces: FacePoseEntry[]; torsos: TorsoPoseEntry[] })
  | (AvatarManifestBase & { kind: "simple"; bodies: SimpleBodyPoseEntry[] });

export interface BackdropAsset {
  backdropId: string;
  name: string;
  imagePath: string;
  width: number;
  height: number;
}

export interface AssetCatalog {
  avatars: AvatarManifest[];
  backdrops: BackdropAsset[];
}
