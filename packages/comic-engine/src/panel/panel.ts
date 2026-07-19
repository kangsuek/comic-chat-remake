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
