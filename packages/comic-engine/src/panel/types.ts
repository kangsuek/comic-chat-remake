// panel.h/panel.cpp의 CPanel/CBody/CBalloon 데이터 모델을 순수 데이터(JSON 직렬화 가능)로 포팅.
// 원작은 CBody 포인터를 CBalloon::m_speaker가 직접 가리키고, 클론 시 그 포인터를 일일이
// 재연결해야 했다(panel.cpp의 ReplaceBody 주석 "must be done *after*..." 참고). 여기서는
// actorId(문자열)로 참조해 그 문제 자체가 없다 — structuredClone으로 깊은 복사하면 끝.
export type SpeechMode = "say" | "think" | "whisper" | "shout" | "action";
/** SpeechMode 전체 목록 — packages/protocol이 zod enum을 만들 때 타입과 값이 어긋나지 않게 재사용한다. */
export const ALL_SPEECH_MODES: readonly SpeechMode[] = ["say", "think", "whisper", "shout", "action"];

export type PoseSelection =
  | { kind: "complex"; faceIndex: number; torsoIndex: number }
  | { kind: "simple"; bodyIndex: number };

export interface PanelBody {
  actorId: string;
  characterId: string;
  pose: PoseSelection;
  /** true면 좌우 반전(대화 상대를 바라보도록). avatar.h의 m_flip. */
  flip: boolean;
}

export interface PanelBalloon {
  speakerActorId: string;
  text: string;
  mode: SpeechMode;
}

export interface Panel {
  bodies: PanelBody[];
  /** 시간순(발화순) 말풍선 목록. panel.cpp의 m_elements(이번 단계는 말풍선만 다룸). */
  balloons: PanelBalloon[];
}

/** 깊은 복사 — structuredClone으로 충분(참조가 아니라 actorId로 연결되므로 재연결 불필요). */
export function clonePanel(panel: Panel): Panel {
  return structuredClone(panel);
}
