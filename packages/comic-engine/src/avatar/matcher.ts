// avatar.cpp의 CAvatarComplex::GetBodyFromEmotion(CEmotionOpts&) /
// CAvatarSimple::GetBodyFromEmotion(CEmotionOpts&) / GetHeadAndBodyFromEmotion /
// GetBodyIndexFromEmotion / Set*Neutral 포팅.
//
// 실제 파이프라인(textpose.cpp의 ChatPreSendText → av->GetBodyFromEmotion(emo))은
// "가장 우선순위 높은 감정 하나"가 아니라 resolveEmotion()이 만든 감정 후보 전체를
// 우선순위 내림차순으로 순회하며 얼굴/몸통 슬롯을 채운다 — 예를 들어 SHOUT 후보가
// 얼굴을 채우고, 그다음 우선순위인 POINTOTHER(제스처) 후보가 몸통을 채우는 식으로
// 서로 다른 후보가 얼굴/몸통에 각각 반영될 수 있다. plan.md 초안의 "targetEmotion
// 하나"라는 단순화된 시그니처는 이 사실이 밝혀지기 전 가정이었다(docs/phases/02 참고).
import type { EmotionId } from "../emotion.js";
import type { EmotionCandidate } from "../rules/ruleEngine.js";
import { angleDistance, isWheelOrNeutral, poseAngle } from "./emotionWheel.js";

interface PoseLike {
  emotion: EmotionId;
  intensity: number;
}

function* byDescendingPriority(candidates: readonly EmotionCandidate[]): Generator<EmotionCandidate> {
  const remaining = candidates.map((c) => c.priority);
  while (true) {
    let bestIndex = -1;
    let bestPriority = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (remaining[i]! > bestPriority) {
        bestPriority = remaining[i]!;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) return;
    remaining[bestIndex] = 0; // "nuke this entry, so we don't kill again"
    yield candidates[bestIndex]!;
  }
}

/**
 * 8방향 원환 감정: 각도거리 PI/NEMOTIONS(=8) 이내 후보 중 강도차가 가장 작은 포즈를 고른다.
 * 실측 결과(Phase 2 스파이크) 얼굴/몸통/단일바디 레코드는 제스처 감정을 쓰지 않으므로
 * 원작처럼 필터링 없이 각도거리를 계산해도 결과가 같다 — 여기서는 명시적으로 걸러
 * (참고 값이 없는) 제스처 포즈가 우연히 선택되는 걸 방지한다.
 */
function nearestWheelIndex<T extends PoseLike>(records: readonly T[], targetAngle: number, targetIntensity: number): number {
  let nearestAngle = 3 * Math.PI;
  let nearestIntensityDelta = 2.0;
  let best = -1;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    if (!isWheelOrNeutral(rec.emotion)) continue;
    const thisAngle = angleDistance(poseAngle(rec.emotion), targetAngle);
    if (thisAngle <= nearestAngle) {
      const deltaI = Math.abs(targetIntensity - rec.intensity);
      if (thisAngle === nearestAngle && deltaI >= nearestIntensityDelta) continue;
      nearestAngle = thisAngle;
      nearestIntensityDelta = deltaI;
      best = i;
    }
  }
  return best;
}

/** 제스처 감정(WAVE 등): 정확히 같은 감정 태그를 가진 첫 포즈를 채택한다. */
function exactGestureIndex<T extends PoseLike>(records: readonly T[], emotion: EmotionId): number {
  for (let i = 0; i < records.length; i++) {
    if (records[i]!.emotion === emotion) return i;
  }
  return -1;
}

/** avatar.h의 EM_NEUTRAL이면서 intensity==0인 포즈를 lastIndex 다음부터 라운드로빈으로 찾는다
 * (Set*Neutral 포팅). 하나도 없으면 원작과 동일하게 그냥 0번을 채택한다. */
function pickNeutralIndex<T extends PoseLike>(records: readonly T[], lastIndex: number): number {
  if (records.length === 0) return -1;
  let c = lastIndex;
  for (let i = 0; i < records.length; i++) {
    c = (c + 1) % records.length;
    if (records[c]!.emotion === "NEUTRAL" && records[c]!.intensity === 0) return c;
  }
  return 0; // 원작 주석: "Oh well, just set it to first"
}

function getHeadAndBodyIndex<F extends PoseLike, T extends PoseLike>(
  candidate: EmotionCandidate,
  faces: readonly F[],
  torsos: readonly T[],
): { faceIndex: number; torsoIndex: number } {
  if (isWheelOrNeutral(candidate.emotion)) {
    return { faceIndex: nearestWheelIndex(faces, poseAngle(candidate.emotion), candidate.intensity), torsoIndex: -1 };
  }
  return { faceIndex: -1, torsoIndex: exactGestureIndex(torsos, candidate.emotion) };
}

function getBodyIndex<B extends PoseLike>(candidate: EmotionCandidate, bodies: readonly B[]): number {
  return isWheelOrNeutral(candidate.emotion)
    ? nearestWheelIndex(bodies, poseAngle(candidate.emotion), candidate.intensity)
    : exactGestureIndex(bodies, candidate.emotion);
}

export interface ComplexPoseMatch {
  faceIndex: number;
  torsoIndex: number;
}

/**
 * CAvatarComplex::GetBodyFromEmotion(CEmotionOpts&) 포팅.
 * 얼굴/몸통 둘 다 채워질 때까지(혹은 후보가 바닥날 때까지) 우선순위 내림차순으로 후보를 소비한다.
 */
export function matchComplexPose<F extends PoseLike, T extends PoseLike>(
  candidates: readonly EmotionCandidate[],
  faces: readonly F[],
  torsos: readonly T[],
  lastFaceIndex: number,
  lastTorsoIndex: number,
): ComplexPoseMatch {
  let foundFace = -1;
  let foundTorso = -1;

  for (const candidate of byDescendingPriority(candidates)) {
    const { faceIndex, torsoIndex } = getHeadAndBodyIndex(candidate, faces, torsos);
    if (faceIndex >= 0 && foundFace < 0) foundFace = faceIndex;
    if (torsoIndex >= 0 && foundTorso < 0) foundTorso = torsoIndex;
    if (foundFace >= 0 && foundTorso >= 0) break;
  }

  if (foundFace < 0) foundFace = pickNeutralIndex(faces, lastFaceIndex);
  if (foundTorso < 0) foundTorso = pickNeutralIndex(torsos, lastTorsoIndex);

  return { faceIndex: foundFace, torsoIndex: foundTorso };
}

export interface SimplePoseMatch {
  bodyIndex: number;
}

/**
 * CAvatarSimple::GetBodyFromEmotion(CEmotionOpts&) 포팅.
 * Complex와 달리 첫 성공 매칭 즉시 종료한다(원작 코드의 break가 if 안에 있음).
 */
export function matchSimplePose<B extends PoseLike>(
  candidates: readonly EmotionCandidate[],
  bodies: readonly B[],
  lastBodyIndex: number,
): SimplePoseMatch {
  let foundBody = -1;

  for (const candidate of byDescendingPriority(candidates)) {
    const bodyIndex = getBodyIndex(candidate, bodies);
    if (bodyIndex >= 0) {
      foundBody = bodyIndex;
      break;
    }
  }

  if (foundBody < 0) foundBody = pickNeutralIndex(bodies, lastBodyIndex);
  return { bodyIndex: foundBody };
}

/** avatar.cpp의 m_lastFace/m_lastTorso/m_lastBody(NEUTRAL 폴백 라운드로빈 시작점) 상태. */
export interface PoseState {
  lastFaceIndex: number;
  lastTorsoIndex: number;
  lastBodyIndex: number;
}

export function createInitialPoseState(): PoseState {
  return { lastFaceIndex: -1, lastTorsoIndex: -1, lastBodyIndex: -1 };
}

export type MatchedPoseSelection = { kind: "complex"; faceIndex: number; torsoIndex: number } | { kind: "simple"; bodyIndex: number };

/**
 * matchComplexPose/matchSimplePose를 아바타 kind에 따라 분기 호출하고, 결과로 poseState를
 * 그 자리에서 갱신한다(다음 매칭이 이어서 라운드로빈되도록). 서버(Room.say)와 클라이언트
 * (낙관적 미리보기, Phase 4 3단계)가 정확히 같은 라운드로빈 진행을 관찰하려면 이 조합 로직
 * 자체가 양쪽에서 이원화되면 안 되므로 comic-engine으로 승격했다(plan.md의 핵심 설계 원칙).
 */
export function matchPose<F extends PoseLike, T extends PoseLike, B extends PoseLike>(
  avatar: { kind: "complex"; faces: readonly F[]; torsos: readonly T[] } | { kind: "simple"; bodies: readonly B[] },
  candidates: readonly EmotionCandidate[],
  poseState: PoseState,
): MatchedPoseSelection {
  if (avatar.kind === "complex") {
    const { faceIndex, torsoIndex } = matchComplexPose(candidates, avatar.faces, avatar.torsos, poseState.lastFaceIndex, poseState.lastTorsoIndex);
    poseState.lastFaceIndex = faceIndex;
    poseState.lastTorsoIndex = torsoIndex;
    return { kind: "complex", faceIndex, torsoIndex };
  }
  const { bodyIndex } = matchSimplePose(candidates, avatar.bodies, poseState.lastBodyIndex);
  poseState.lastBodyIndex = bodyIndex;
  return { kind: "simple", bodyIndex };
}
