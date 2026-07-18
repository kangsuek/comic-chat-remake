// textpose.cpp의 문자열 매처들을 포팅한다. 모든 함수는 항상 대소문자를 구분한다 —
// 원작에서도 대소문자 무시는 매처 내부가 아니라 호출부에서 텍스트/규칙 문자열을
// 미리 소문자화해 넘기는 방식으로 처리한다(ruleEngine.ts 참고).

const PUNCT_CHARS = /[!-/:-@[-`{-~]/;
const SPACE_CHARS = /\s/;
const ALNUM_CHARS = /[0-9A-Za-z]/;

function isPunct(ch: string | undefined): boolean {
  return ch !== undefined && PUNCT_CHARS.test(ch);
}

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && SPACE_CHARS.test(ch);
}

function isAlnum(ch: string | undefined): boolean {
  return ch !== undefined && ALNUM_CHARS.test(ch);
}

/** CheckForUppers 포팅: 소문자가 하나라도 있으면 즉시 false, 대문자가 2개 초과면 true. */
export function checkAllCaps(text: string): boolean {
  let upperCount = 0;
  for (const ch of text) {
    if (/[a-z]/.test(ch)) return false;
    if (/[A-Z]/.test(ch)) upperCount++;
  }
  return upperCount > 1;
}

/**
 * CheckWord 포팅: substr이 단어 경계에서 매칭되는지 확인한다.
 * 앞은 문자열 시작이거나 공백이어야 하고, 뒤는 문자열 끝이거나 공백/구두점이어야 한다.
 */
export function checkWord(text: string, substr: string): boolean {
  let from = 0;
  while (true) {
    const loc = text.indexOf(substr, from);
    if (loc === -1) return false;
    const before = loc === 0 ? undefined : text[loc - 1];
    if (loc === 0 || isSpace(before)) {
      const after = text[loc + substr.length];
      if (after === undefined || isSpace(after) || isPunct(after)) return true;
    }
    from = loc + 1;
  }
}

/** GetEmotionsFromString의 strstr 사용부(FindString) 포팅: 단순 부분 문자열 검사. */
export function findString(text: string, substr: string): boolean {
  return text.includes(substr);
}

/** StartCompare2 포팅: sentenceTail이 substr로 시작하고, 다음 글자가 영숫자가 아니어야 한다. */
export function checkStart(sentenceTail: string, substr: string): boolean {
  if (!sentenceTail.startsWith(substr)) return false;
  return !isAlnum(sentenceTail[substr.length]);
}

function findFirstTerminator(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") return i;
  }
  return -1;
}

/**
 * GetNextSentenceStart + GetEmotionsFromString의 문장 순회 루프 포팅.
 * 선행 공백을 건너뛴 첫 위치, 그리고 '.'/'!'/'?' 뒤에 이어지는 구두점·공백을 건너뛴
 * 위치들을 "문장 시작" 후보로 반환한다.
 */
export function getSentenceStarts(text: string): number[] {
  const starts: number[] = [];
  let pos = 0;
  while (pos < text.length && isSpace(text[pos])) pos++;

  while (pos < text.length) {
    starts.push(pos);
    const terminatorIdx = findFirstTerminator(text, pos);
    if (terminatorIdx === -1) break;
    let next = terminatorIdx;
    while (next < text.length && (isPunct(text[next]) || isSpace(text[next]))) next++;
    pos = next;
  }

  return starts;
}
