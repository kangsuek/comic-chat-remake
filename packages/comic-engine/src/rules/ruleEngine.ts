import type { EmotionId } from "../emotion.js";
import { checkAllCaps, checkStart, checkWord, findString, getSentenceStarts } from "./matchers.js";

export type RuleFunction =
  | "AllCaps"
  | "FindString"
  | "FindString*"
  | "CheckWord"
  | "CheckWord*"
  | "CheckStart"
  | "CheckStart*";

export interface RuleDefinition {
  emotion: EmotionId;
  function: RuleFunction;
  arg: string;
  strength: number;
}

interface CompiledRule {
  emotion: EmotionId;
  arg: string;
  strength: number;
  caseSensitive: boolean;
}

export interface RuleSet {
  capsRule: { emotion: EmotionId; strength: number } | null;
  generalRules: CompiledRule[];
  wordRules: CompiledRule[];
  sentenceRules: CompiledRule[];
}

// avatar.h: #define MAXEMOPTS 10
const MAX_EMOTION_CANDIDATES = 10;

export interface EmotionCandidate {
  emotion: EmotionId;
  intensity: number;
  priority: number;
}

export interface EmotionResolution {
  candidates: EmotionCandidate[];
  primary: EmotionCandidate | null;
}

/** RegisterRule 포팅: 규칙 정의를 함수 종류별(캡스/일반/단어/문장)로 분류한다. */
export function loadRules(definitions: RuleDefinition[]): RuleSet {
  const ruleSet: RuleSet = {
    capsRule: null,
    generalRules: [],
    wordRules: [],
    sentenceRules: [],
  };

  for (const def of definitions) {
    switch (def.function) {
      case "AllCaps":
        // 원작과 동일하게 우선순위 비교 없이 마지막에 등록된 AllCaps 규칙이 그대로 채택된다.
        ruleSet.capsRule = { emotion: def.emotion, strength: def.strength };
        break;
      case "FindString":
        ruleSet.generalRules.push(compileRule(def, true));
        break;
      case "FindString*":
        ruleSet.generalRules.push(compileRule(def, false));
        break;
      case "CheckWord":
        ruleSet.wordRules.push(compileRule(def, true));
        break;
      case "CheckWord*":
        ruleSet.wordRules.push(compileRule(def, false));
        break;
      case "CheckStart":
        ruleSet.sentenceRules.push(compileRule(def, true));
        break;
      case "CheckStart*":
        ruleSet.sentenceRules.push(compileRule(def, false));
        break;
    }
  }

  return ruleSet;
}

function compileRule(def: RuleDefinition, caseSensitive: boolean): CompiledRule {
  return {
    emotion: def.emotion,
    arg: caseSensitive ? def.arg : def.arg.toLowerCase(),
    strength: def.strength,
    caseSensitive,
  };
}

/** CEmotionOpts::Add(OVERRIDEBYPRIORITY) 포팅: 동일 emotion은 더 높은 priority일 때만 덮어쓴다. */
function addCandidate(
  candidates: EmotionCandidate[],
  emotion: EmotionId,
  intensity: number,
  priority: number,
): void {
  const existing = candidates.find((c) => c.emotion === emotion);
  if (existing) {
    if (existing.priority < priority) {
      existing.priority = priority;
      existing.intensity = intensity;
    }
    return;
  }
  if (candidates.length >= MAX_EMOTION_CANDIDATES) return;
  candidates.push({ emotion, intensity, priority });
}

/** GetEmotionsFromString 포팅: 텍스트를 규칙셋에 통과시켜 감정 후보 목록을 얻는다. */
export function resolveEmotion(text: string, rules: RuleSet): EmotionResolution {
  const candidates: EmotionCandidate[] = [];
  const lower = text.toLowerCase();

  if (rules.capsRule && checkAllCaps(text)) {
    addCandidate(candidates, rules.capsRule.emotion, 1.0, rules.capsRule.strength);
  }

  for (const rule of rules.generalRules) {
    const haystack = rule.caseSensitive ? text : lower;
    if (findString(haystack, rule.arg)) {
      addCandidate(candidates, rule.emotion, 1.0, rule.strength);
    }
  }

  for (const rule of rules.wordRules) {
    const haystack = rule.caseSensitive ? text : lower;
    if (checkWord(haystack, rule.arg)) {
      addCandidate(candidates, rule.emotion, 1.0, rule.strength);
    }
  }

  const sentenceStarts = getSentenceStarts(text);
  for (const pos of sentenceStarts) {
    for (const rule of rules.sentenceRules) {
      const haystack = rule.caseSensitive ? text : lower;
      if (checkStart(haystack.slice(pos), rule.arg)) {
        addCandidate(candidates, rule.emotion, 1.0, rule.strength);
      }
    }
  }

  return { candidates, primary: pickPrimary(candidates) };
}

/** 후보 중 priority가 가장 높은 감정을 고른다(동점이면 먼저 등록된 쪽 유지) — 데모 UI의 대표 감정 라벨용. */
function pickPrimary(candidates: EmotionCandidate[]): EmotionCandidate | null {
  let best: EmotionCandidate | null = null;
  for (const c of candidates) {
    if (!best || c.priority > best.priority) best = c;
  }
  return best;
}
