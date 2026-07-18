import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import { computeComplexBodyBox, computeSimpleBodyBox } from "@comic-chat/comic-engine";
import type { PoseSelection } from "@comic-chat/protocol";
import { Fragment } from "react";
import { Group, Image as KonvaImage } from "react-konva";
import { avatarAssetUrl } from "../assets";
import { useImage } from "../useImage";

interface AvatarSpriteProps {
  avatar: AvatarManifest;
  pose: PoseSelection;
  width: number;
  height: number;
  /** 대화 상대를 바라보도록 좌우 반전(m_flip). Phase 3 전까지는 항상 false. */
  flip?: boolean;
}

/**
 * bodycam.cpp의 CBodyDouble::DrawBody / CBodySingle::DrawBody 포팅.
 * Complex는 GetBodyBox로 계산한 오프셋에 얼굴+몸통을 겹쳐 Group으로 합성하고,
 * flags.torsoFirst로 어느 쪽이 위에 그려질지(z-order) 정한다.
 */
export function AvatarSprite({ avatar, pose, width, height, flip = false }: AvatarSpriteProps) {
  const isSimple = avatar.kind === "simple" && pose.kind === "simple";
  const isComplex = avatar.kind === "complex" && pose.kind === "complex";

  const simpleBody = isSimple && avatar.kind === "simple" && pose.kind === "simple" ? avatar.bodies[pose.bodyIndex] : undefined;
  const simplePoseAsset = simpleBody ? avatar.poses[simpleBody.poseIndex] : undefined;

  const face = isComplex && avatar.kind === "complex" && pose.kind === "complex" ? avatar.faces[pose.faceIndex] : undefined;
  const torso = isComplex && avatar.kind === "complex" && pose.kind === "complex" ? avatar.torsos[pose.torsoIndex] : undefined;
  const facePoseAsset = face ? avatar.poses[face.poseIndex] : undefined;
  const torsoPoseAsset = torso ? avatar.poses[torso.poseIndex] : undefined;

  // Hooks는 항상 같은 순서로 호출해야 하므로 해당 없는 경우 null을 넘겨 no-op 처리한다.
  const simpleImg = useImage(simplePoseAsset ? avatarAssetUrl(avatar.characterId, simplePoseAsset.imagePath) : null);
  const faceImg = useImage(facePoseAsset ? avatarAssetUrl(avatar.characterId, facePoseAsset.imagePath) : null);
  const torsoImg = useImage(torsoPoseAsset ? avatarAssetUrl(avatar.characterId, torsoPoseAsset.imagePath) : null);

  const groupProps = flip ? { x: width, scaleX: -1 } : { x: 0, scaleX: 1 };

  if (isSimple && simplePoseAsset && simpleImg) {
    const rect = computeSimpleBodyBox({
      bodyWidth: simplePoseAsset.width,
      bodyHeight: simplePoseAsset.height,
      clientWidth: width,
      clientHeight: height,
    });
    return (
      <Group {...groupProps}>
        <KonvaImage image={simpleImg} x={rect.left} y={rect.top} width={rect.width} height={rect.height} />
      </Group>
    );
  }

  if (isComplex && face && torso && facePoseAsset && torsoPoseAsset) {
    const box = computeComplexBodyBox({
      torsoWidth: torsoPoseAsset.width,
      torsoHeight: torsoPoseAsset.height,
      torsoXCX: torso.xCX,
      torsoYCX: torso.yCX,
      faceWidth: facePoseAsset.width,
      faceHeight: facePoseAsset.height,
      faceXCX: face.xCX,
      faceYCX: face.yCX,
      faceDeltaXCX: face.deltaXCX,
      faceDeltaYCX: face.deltaYCX,
      clientWidth: width,
      clientHeight: height,
    });

    const torsoNode = torsoImg && (
      <KonvaImage key="torso" image={torsoImg} x={box.torso.left} y={box.torso.top} width={box.torso.width} height={box.torso.height} />
    );
    const headNode = faceImg && (
      <KonvaImage key="head" image={faceImg} x={box.head.left} y={box.head.top} width={box.head.width} height={box.head.height} />
    );

    return (
      <Group {...groupProps}>
        {avatar.flags.torsoFirst ? (
          <Fragment>
            {torsoNode}
            {headNode}
          </Fragment>
        ) : (
          <Fragment>
            {headNode}
            {torsoNode}
          </Fragment>
        )}
      </Group>
    );
  }

  return null;
}
