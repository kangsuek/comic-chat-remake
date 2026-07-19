import {
  createInitialPoseState,
  defaultRuleDefinitions,
  loadRules,
  matchPose,
  resolveEmotion,
  type PoseState,
  type SpeechMode,
} from "@comic-chat/comic-engine";
import type { AvatarManifest } from "@comic-chat/asset-manifest-types";
import type { HistoryEntry, SayHistoryEntry } from "@comic-chat/protocol";
import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RoomConnection } from "./useRoomConnection";

// InitializeEmotionRules 포팅(useLocalEmotionPreview.ts와 동일 인스턴스 재사용 이유는 없음 —
// loadRules는 순수하고 저렴해 모듈별로 한 번씩 구성해도 무방하다).
const rules = loadRules(defaultRuleDefinitions);

export interface BuildProvisionalEntryInput {
  text: string;
  mode: SpeechMode;
  targetActorId?: string;
  selfActorId: string;
  nick: string;
  characterId: string;
  avatar: AvatarManifest;
  /** matchPose가 이 자리에서 직접 갱신한다(서버 Room.say와 동일한 부수효과 방식). */
  poseState: PoseState;
  clientId: string;
  now: number;
}

/**
 * apps/server/src/room.ts의 Room.say()가 하는 계산(resolveEmotion → matchPose)을 클라이언트에서
 * 그대로 반복해 "서버 확정 전 잠정" historyEntry를 만든다. React에 의존하지 않는 순수 함수로
 * 뽑아 useOptimisticSay.test.ts에서 직접 검증한다.
 */
export function buildProvisionalEntry(input: BuildProvisionalEntryInput): SayHistoryEntry {
  const resolution = resolveEmotion(input.text, rules);
  const pose = matchPose(input.avatar, resolution.candidates, input.poseState);

  return {
    type: "say",
    mode: input.mode,
    actorId: input.selfActorId,
    nick: input.nick,
    text: input.text,
    emotion: resolution.primary,
    characterId: input.characterId,
    pose,
    ...(input.targetActorId ? { targetActorId: input.targetActorId } : {}),
    clientId: input.clientId,
    ts: input.now,
  };
}

/**
 * 서버가 확정한 historyEntry 목록(confirmedEntries)을 보고, 같은 clientId를 가진 보류 항목을
 * pending에서 제거한다(canonical로 교체된 것이므로 더 이상 낙관적으로 그릴 필요가 없음).
 * 그중 내가 보낸 것이었다면(actorId === selfActorId) canonical pose로 poseState를 재동기화해
 * 다음 낙관적 계산이 서버의 라운드로빈 상태와 어긋나지 않게 한다. pending을 제자리에서
 * 수정하고, 뭔가 바뀌었으면 true를 돌려준다(호출자가 리렌더를 트리거할지 판단하는 용도).
 */
export function reconcilePending(
  pending: Map<string, HistoryEntry>,
  confirmedEntries: readonly HistoryEntry[],
  selfActorId: string | null,
  poseState: PoseState,
): boolean {
  let changed = false;
  for (const entry of confirmedEntries) {
    // reaction 이벤트는 낙관적 미리보기 대상이 아니라 clientId 자체가 없다(항상 즉시 전송).
    if (entry.type !== "say" || !entry.clientId || !pending.delete(entry.clientId)) continue;
    changed = true;
    if (entry.actorId !== selfActorId) continue;
    if (entry.pose.kind === "complex") {
      poseState.lastFaceIndex = entry.pose.faceIndex;
      poseState.lastTorsoIndex = entry.pose.torsoIndex;
    } else {
      poseState.lastBodyIndex = entry.pose.bodyIndex;
    }
  }
  return changed;
}

export interface OptimisticSay {
  /**
   * connection.entries에 "아직 서버 확인이 안 된 내 메시지"(낙관적 미리보기)를 이어붙인 목록.
   * ChatRoom은 foldEvents에 connection.entries 대신 이 값을 넘기면 된다.
   */
  entries: HistoryEntry[];
  say: (text: string, mode?: SpeechMode, targetActorId?: string) => void;
}

/**
 * plan.md의 "클라이언트는 전송 즉시 동일 로직을 로컬로 돌려 낙관적 미리보기를 보여주고,
 * 서버 응답 도착 시 canonical 결과로 교체(reconcile)" 설계를 구현한다(Phase 4 3단계).
 *
 * 이 단계는 원작을 포팅하는 게 아니라 이 리메이크만의 신규 아키텍처 결정이다 — 원작은 서버가
 * IRC PRIVMSG를 보통 발신자에게 echo하지 않으므로 각 클라이언트가 자기 발화를 로컬 계산
 * 결과로 "그게 곧 최종"으로 그렸다(재조정 개념 자체가 없음). 우리는 서버를 canonical 소스로
 * 두기로 했으므로(원작과 다른 설계, plan.md) 로컬 미리보기와 서버 확정 결과가 다를 수 있어
 * reconcile이 필요하다.
 *
 * 실제 계산(buildProvisionalEntry)과 재조정(reconcilePending)은 React 비의존 순수 함수로 위에
 * 뽑아뒀다 — 이 훅 자체는 그 둘을 WS 연결/렌더 사이클에 이어붙이는 얇은 접착부다.
 */
export function useOptimisticSay(connection: RoomConnection, catalog: { avatars: AvatarManifest[] } | null): OptimisticSay {
  const pendingRef = useRef<Map<string, HistoryEntry>>(new Map());
  const [, forceRender] = useReducer((c: number) => c + 1, 0);
  const poseStateRef = useRef(createInitialPoseState());
  const seqRef = useRef(0);

  // 새 연결(재접속 등으로 selfActorId가 바뀜)마다 라운드로빈 상태를 리셋한다 — 서버도 새
  // actorId는 항상 -1/-1/-1부터 시작하므로(Room.join) 맞춰야 한다.
  useEffect(() => {
    poseStateRef.current = createInitialPoseState();
    pendingRef.current.clear();
    forceRender();
  }, [connection.selfActorId]);

  useEffect(() => {
    if (pendingRef.current.size === 0) return;
    const changed = reconcilePending(pendingRef.current, connection.entries, connection.selfActorId, poseStateRef.current);
    if (changed) forceRender();
  }, [connection.entries, connection.selfActorId]);

  const say = useCallback(
    (text: string, mode: SpeechMode = "say", targetActorId?: string) => {
      const selfActorId = connection.selfActorId;
      const me = connection.members.find((m) => m.actorId === selfActorId);
      const avatar = catalog?.avatars.find((a) => a.characterId === me?.characterId);
      // 필요한 정보가 아직 없거나(카탈로그 로딩 중 등) 연결이 끊긴 상태면 낙관적 미리보기를
      // 만들지 않는다 — 특히 연결이 끊겼을 때 미리보기를 그려두면 서버가 메시지를 받지 못해
      // 영원히 확정되지 않는 "유령 말풍선"이 남는다(connection.say는 소켓이 열려있지 않으면
      // 그냥 아무 것도 안 보내고 끝나므로, 그 경우 여기서도 낙관적 렌더링을 하지 않는 게 맞다).
      if (!selfActorId || !me || !avatar || connection.status !== "open") {
        connection.say(text, mode, targetActorId);
        return;
      }

      const clientId = `${selfActorId}-${Date.now()}-${seqRef.current++}`;
      const provisional = buildProvisionalEntry({
        text,
        mode,
        targetActorId,
        selfActorId,
        nick: me.nick,
        characterId: me.characterId,
        avatar,
        poseState: poseStateRef.current,
        clientId,
        now: Date.now(),
      });
      pendingRef.current.set(clientId, provisional);
      forceRender();
      connection.say(text, mode, targetActorId, clientId);
    },
    [connection, catalog],
  );

  const entries = pendingRef.current.size > 0 ? [...connection.entries, ...pendingRef.current.values()] : connection.entries;
  return { entries, say };
}
