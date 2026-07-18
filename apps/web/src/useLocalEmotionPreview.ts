import {
  defaultRuleDefinitions,
  loadRules,
  resolveEmotion,
  type EmotionCandidate,
} from "@comic-chat/comic-engine";
import { useMemo } from "react";

// InitializeEmotionRules 포팅: 앱 시작 시 한 번만 규칙셋을 구성한다.
const rules = loadRules(defaultRuleDefinitions);

/**
 * textpose.cpp의 ChatPreSendText(UI::PreSay 경유) 포팅: 원작은 전송 전 타이핑 중에도
 * 아바타가 즉시 반응하는 미리보기를 보였다. 아바타 렌더링은 Phase 2부터지만, 감정 인식
 * 자체는 서버 왕복 없이 클라이언트에서 동기 실행 가능한 순수 함수이므로 지금 미리 붙인다.
 */
export function useLocalEmotionPreview(text: string): EmotionCandidate | null {
  return useMemo(() => resolveEmotion(text, rules).primary, [text]);
}
