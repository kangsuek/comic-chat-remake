// 말풍선 높이를 정하려면 렌더링 전에 몇 줄이 필요한지 추정해야 한다(실제 줄바꿈은 Konva
// Text가 캔버스로 정확히 계산하지만, 그걸 감싸는 사각형 높이는 미리 알아야 하므로 근사치가
// 필요하다). 원작은 GDI GetTextExtent로 실측했지만 서버/공용 코드에는 DOM/Canvas가 없어
// 문자 수 기반으로 근사한다. 라틴 문자 전용 고정 비율(fontSize*0.55)만 쓰면 한글/CJK처럼
// 정사각형에 가깝게 렌더링되는 문자에서 줄 수를 과소평가해 말풍선 밖으로 텍스트가 넘친다 —
// 그래서 문자별로 "넓은 문자(동아시아 문자)"인지 구분해 폭을 다르게 근사한다.

const NARROW_CHAR_WIDTH_RATIO = 0.55; // 라틴 문자/숫자/기호 근사치
const WIDE_CHAR_WIDTH_RATIO = 1.0; // 한글 음절·자모, 한자, 가나 등은 fontSize에 가깝게 렌더링됨

/** 유니코드 East Asian Width(Wide/Fullwidth)에 해당하는 주요 구간을 간이 판별한다. */
function isWideChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    code >= 0x1100 &&
    (code <= 0x115f || // 한글 자모
      code === 0x2329 ||
      code === 0x232a ||
      (code >= 0x2e80 && code <= 0x303e) || // CJK 부수/기호
      (code >= 0x3041 && code <= 0x33ff) || // 히라가나~CJK 호환
      (code >= 0x3400 && code <= 0x4dbf) || // CJK 확장 A
      (code >= 0x4e00 && code <= 0x9fff) || // CJK 통합 한자
      (code >= 0xa000 && code <= 0xa4cf) || // 이(Yi) 문자
      (code >= 0xac00 && code <= 0xd7a3) || // 한글 음절
      (code >= 0xf900 && code <= 0xfaff) || // CJK 호환 한자
      (code >= 0xff00 && code <= 0xff60) || // 전각 형태
      (code >= 0xffe0 && code <= 0xffe6))
  );
}

function estimateCharWidth(ch: string, fontSize: number): number {
  return fontSize * (isWideChar(ch) ? WIDE_CHAR_WIDTH_RATIO : NARROW_CHAR_WIDTH_RATIO);
}

/** 줄바꿈 없이 한 줄로 이어 썼을 때의 전체 폭 근사치(원작 balloon.cpp의 GetTextExtent 대응). */
export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) width += estimateCharWidth(ch, fontSize);
  return width;
}

/** 공백으로 구분된 단어들 중 가장 넓은 단어의 폭(원작 CLabel::WidestWord 대응). */
export function estimateWidestWordWidth(text: string, fontSize: number): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  return Math.max(...words.map((w) => estimateTextWidth(w, fontSize)));
}

export interface WrapSplitResult {
  /** maxLines 안에 들어가는 앞부분(단어 경계에서 자름). */
  fitted: string;
  /** 못 들어간 나머지. 애초에 분할이 필요 없었으면 null. */
  leftOver: string | null;
}

/**
 * CLabel::SplitHeight 포팅: text가 maxWidth 기준 maxLines를 넘으면 넘치는 지점(단어 경계)에서
 * 잘라 fitted/leftOver로 나눈다. "..." 연결 표시(원작 continuationStr1/2)는 호출자가 필요하면
 * 붙인다 — 여기서는 순수 분할만 담당한다.
 */
export function splitTextToFit(text: string, maxWidth: number, maxLines: number, fontSize: number): WrapSplitResult {
  if (maxLines <= 0 || maxWidth <= 0) return { fitted: "", leftOver: text.length > 0 ? text : null };
  if (estimateWrappedLineCount(text, maxWidth, fontSize) <= maxLines) return { fitted: text, leftOver: null };

  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  let lines = 1;
  let currentWidth = 0;
  let splitIndex = tokens.length;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    let tokenWidth = 0;
    for (const ch of token) tokenWidth += estimateCharWidth(ch, fontSize);

    if (currentWidth > 0 && currentWidth + tokenWidth > maxWidth) {
      lines++;
      currentWidth = tokenWidth;
    } else {
      currentWidth += tokenWidth;
    }

    if (lines > maxLines) {
      splitIndex = i;
      break;
    }
  }

  const fitted = tokens.slice(0, splitIndex).join("").trimEnd();
  const leftOver = tokens.slice(splitIndex).join("").trimStart();
  return { fitted, leftOver: leftOver.length > 0 ? leftOver : null };
}

/**
 * innerWidth 안에 text를 word-wrap(공백 기준, Konva Text의 wrap="word"와 동일한 전략)했을 때
 * 필요한 줄 수를 추정한다. 공백으로 끊을 수 없을 만큼 긴 덩어리(예: 공백 없는 한자/가나
 * 연속 문자열)는 그 안에서도 폭만큼 강제로 꺾인다고 가정한다.
 */
export function estimateWrappedLineCount(text: string, innerWidth: number, fontSize: number): number {
  if (text.length === 0) return 1;
  if (innerWidth <= 0) return 1;

  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  let lines = 1;
  let currentWidth = 0;

  for (const token of tokens) {
    let tokenWidth = 0;
    for (const ch of token) tokenWidth += estimateCharWidth(ch, fontSize);

    if (tokenWidth > innerWidth) {
      if (currentWidth > 0) {
        lines++;
      }
      lines += Math.floor(tokenWidth / innerWidth);
      currentWidth = tokenWidth % innerWidth;
      continue;
    }

    if (currentWidth > 0 && currentWidth + tokenWidth > innerWidth) {
      lines++;
      currentWidth = tokenWidth;
    } else {
      currentWidth += tokenWidth;
    }
  }

  return lines;
}
