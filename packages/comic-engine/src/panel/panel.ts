// panel.cpp의 CUnitPanelPage::AddLine 앞부분(패널을 새로 만들지 클론할지 결정) 포팅.
import type { Panel, PanelBody, PoseSelection, SpeechMode } from "./types.js";

export interface ShouldStartNewPanelInput {
  currentPanel: Panel | null;
  speakerActorId: string;
  mode: SpeechMode;
  /** 지금까지 확정된 전체 패널 수(이 발화로 만들어질 패널은 포함하지 않음). */
  totalPanelCount: number;
}

/**
 * true를 반환하는 4가지 조건(원작 그대로):
 * 1) mode가 action(이모트/액션)이면 항상 새 패널
 * 2) 현재 패널이 없음(대화 시작)
 * 3) 현재 패널에 말풍선이 이미 5개 이상(`m_elements.GetCount() >= 5`)
 * 4) 지금까지 만들어진 패널이 2개 미만(초반 설정샷 보장, `m_panels.GetCount() < 2`)
 * 5) 화자가 이미 이 패널에 있음(`AvatarInPanel`) — **같은 화자 연속 발화는 새 패널**,
 *    클론(이어붙임)은 아직 패널에 없던 새 화자가 합류할 때만 일어난다(스파이크로 확인, plan.md 정정).
 */
export function shouldStartNewPanel({ currentPanel, speakerActorId, mode, totalPanelCount }: ShouldStartNewPanelInput): boolean {
  if (mode === "action") return true;
  if (!currentPanel) return true;
  if (currentPanel.balloons.length >= 5) return true;
  if (totalPanelCount < 2) return true;
  if (currentPanel.bodies.some((b) => b.actorId === speakerActorId)) return true;
  return false;
}

/** panel.cpp의 CPanel::FetchSpeaker 포팅: 이미 패널에 있으면 그대로, 없으면 새로 추가한다. */
export function fetchSpeaker(panel: Panel, actorId: string, characterId: string, pose: PoseSelection): PanelBody {
  const existing = panel.bodies.find((b) => b.actorId === actorId);
  if (existing) return existing;

  const body: PanelBody = { actorId, characterId, pose, flip: false };
  panel.bodies.push(body);
  return body;
}

export interface ShouldStartNewReactionPanelInput {
  currentPanel: Panel | null;
  totalPanelCount: number;
}

/**
 * panel.cpp의 CUnitPanelPage::AddReaction 앞부분(새/클론 판단) 포팅. AddLine과 조건이 다르다 —
 * "화자가 이미 패널에 있음" 강제 신규 조건이 **없고**(리액션은 같은 패널 안에서 포즈만 갱신할
 * 수 있어야 하므로), 대신 바디 5개 캡을 쓴다(`oldP->m_bodies.GetCount() >= 5` — AddLine의
 * 말풍선 5개 캡과는 다른 카운트).
 */
export function shouldStartNewReactionPanel({ currentPanel, totalPanelCount }: ShouldStartNewReactionPanelInput): boolean {
  if (!currentPanel) return true;
  if (currentPanel.bodies.length >= 5) return true;
  if (totalPanelCount < 2) return true;
  return false;
}

/**
 * panel.cpp의 CPanel::ReplaceBody(있으면 포즈 교체) + FetchSpeaker(없으면 추가) 조합 포팅 —
 * AddReaction이 정확히 이 순서로 호출한다(`if (!newP->ReplaceBody(id)) newP->FetchSpeaker(id);`).
 * fetchSpeaker와 달리 이미 있는 경우 기존 포즈를 새 포즈로 덮어쓴다(flip은 그대로 유지 —
 * 어차피 doGreedyOrdering이 뒤에서 다시 계산해 덮어쓴다).
 */
export function replaceOrAddBody(panel: Panel, actorId: string, characterId: string, pose: PoseSelection): PanelBody {
  const index = panel.bodies.findIndex((b) => b.actorId === actorId);
  if (index >= 0) {
    const replaced: PanelBody = { actorId, characterId, pose, flip: panel.bodies[index]!.flip };
    panel.bodies[index] = replaced;
    return replaced;
  }
  return fetchSpeaker(panel, actorId, characterId, pose);
}
