// panel.cpp의 AddLine 핵심 흐름(패널 클론/신규 판단 → FetchSpeaker → LayoutAvatars의
// 그리디 순서/방향 결정 → UpdateHistoresis)을 이벤트 로그 전체에 대해 fold하는 순수 함수.
// 서버(Room)와 클라이언트(낙관적 미리보기/재접속 replay) 양쪽이 동일하게 import해서 쓴다.
//
// 스코프 결정: 줌/픽셀 배치(zoom.ts의 layoutBodies)는 실제 자산 크기가 필요한 렌더링 시점
// 관심사라 여기서 다루지 않는다 — Stage 3에서 렌더러가 이 결과의 Panel.bodies 순서/flip을
// 그대로 넘겨 layoutBodies()를 호출한다. AddTalkTos(말을 건 상대를 자동으로 패널에 끌어오는
// 기능)도 지금은 빼뒀다 — 원작에서 talkTo는 아바타별 지속 선택 상태(UI 드롭다운)인데 현재
// 프로토콜에는 이를 지정할 방법이 아직 없어(항상 빈 배열) 호출해도 항상 no-op이기 때문이다.
// Phase 4에서 발화 addressing이 프로토콜에 추가되면 이 파일의 `speakers` 구성부에 이어붙이면 된다.
import { fetchSpeaker, shouldStartNewPanel } from "./panel.js";
import { doGreedyOrdering, updateHysteresis, type HysteresisMap, type PlacementPerson } from "./placement.js";
import { clonePanel, type Panel, type PoseSelection, type SpeechMode } from "./types.js";

export interface SayEvent {
  actorId: string;
  characterId: string;
  mode: SpeechMode;
  text: string;
  /** 이미 계산되어 저장된 값(예: comic-engine의 matchComplexPose/matchSimplePose 결과) — fold는 재계산하지 않는다. */
  pose: PoseSelection;
}

export interface FoldResult {
  /** 시간순 패널 목록(클론으로 대체된 이전 버전은 포함하지 않음 — 원작의 RemoveLastPanel과 동일). */
  panels: Panel[];
  /** 다음 이벤트를 fold할 때 이어서 넘길 히스테리시스 상태. */
  hysteresis: HysteresisMap;
}

const EMPTY_RESULT: FoldResult = { panels: [], hysteresis: {} };

/** 이벤트 로그 전체(또는 이어붙일 이전 결과 + 새 이벤트들)를 fold해 패널 목록을 재구성한다. */
export function foldEvents(events: readonly SayEvent[], previous: FoldResult = EMPTY_RESULT): FoldResult {
  let panels = previous.panels;
  let hysteresis = previous.hysteresis;

  for (const event of events) {
    const currentPanel = panels.length > 0 ? panels[panels.length - 1]! : null;
    const isNew = shouldStartNewPanel({
      currentPanel,
      speakerActorId: event.actorId,
      mode: event.mode,
      totalPanelCount: panels.length,
    });

    const panel: Panel = isNew ? { bodies: [], balloons: [] } : clonePanel(currentPanel!);
    panels = isNew ? panels : panels.slice(0, -1); // 클론이 이전 패널을 대체(원작의 RemoveLastPanel)

    fetchSpeaker(panel, event.actorId, event.characterId, event.pose);
    panel.balloons.push({ speakerActorId: event.actorId, text: event.text, mode: event.mode });

    const speakers: PlacementPerson[] = panel.bodies.map((b) => ({ actorId: b.actorId, talkTo: [] }));
    const placed = doGreedyOrdering(speakers, hysteresis);
    for (const { person, flip } of placed) {
      const body = panel.bodies.find((b) => b.actorId === person.actorId)!;
      body.flip = flip;
    }
    hysteresis = updateHysteresis(placed, hysteresis);

    panels = [...panels, panel];
  }

  return { panels, hysteresis };
}
