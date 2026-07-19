// panel.cpp의 AddTalkTos/EvalPair/EvalPlacement/DoGreedyOrdering/UpdateHistoresis 포팅.
// 실측(panel.cpp) 확인: CBodyRecord.m_priority는 설정만 되고 배치 알고리즘 어디서도
// 읽히지 않는 죽은 필드라 포팅하지 않는다.

export interface PlacementPerson {
  actorId: string;
  /** 이 사람이 현재 말을 거는 대상들(빈 배열이면 "세상을 향해" 말하는 것으로 취급). */
  talkTo: readonly string[];
}

export interface PlacedEntry {
  person: PlacementPerson;
  /** true = 좌우 반전(대화 상대를 바라보도록). */
  flip: boolean;
}

export interface HysteresisState {
  lastDir: boolean;
  lastRight: string | null;
  lastLeft: string | null;
}

export type HysteresisMap = Readonly<Record<string, HysteresisState>>;

/**
 * talkTo 대상을 최대 maxTotal명까지 채워 넣는다(panel.cpp의 AddTalkTos).
 * 최초 화자 목록만 순회하며(새로 추가된 사람의 talkTo는 재귀적으로 확장하지 않음),
 * resolveTalkTo로 새로 추가되는 사람의 talkTo도 채워 EvalPair 계산에 쓸 수 있게 한다.
 */
export function addTalkTos(
  initialSpeakers: readonly PlacementPerson[],
  resolveTalkTo: (actorId: string) => readonly string[],
  maxTotal = 5,
): PlacementPerson[] {
  const result = [...initialSpeakers];
  const initialCount = result.length;

  for (let i = 0; i < initialCount; i++) {
    for (const targetId of result[i]!.talkTo) {
      if (result.length >= maxTotal) return result; // "don't add more than 5 people to the panel!!!"
      if (result.some((p) => p.actorId === targetId)) continue; // duplicate
      result.push({ actorId: targetId, talkTo: resolveTalkTo(targetId) });
    }
  }

  return result;
}

/** 두 사람의 상대적 배치(deltaPlacement: b2가 b1보다 몇 칸 오른쪽인지)에 대한 페널티. */
export function evalPair(b1: PlacementPerson, b1Flip: boolean, b2: PlacementPerson, b2Flip: boolean, deltaPlacement: number): number {
  let rating = 0;
  let desiredDir: boolean;
  let distance = deltaPlacement;
  if (distance > 0) {
    desiredDir = false;
  } else {
    desiredDir = true;
    distance = -distance;
  }

  if (b1.talkTo.length === 0) {
    if (b1Flip !== desiredDir) rating += 4; // 세상을 향해 말하는데 이 방향을 안 보고 있음
    if (b2Flip === desiredDir) rating += 2; // 상대가 나를 안 보고 있음(경미)
  } else {
    // 원작은 talkTo 배열 전체를 순회하며 b2와 일치하는 항목마다 페널티를 "반복" 적용한다
    // (av1->m_talkTo에 같은 대상이 중복으로 들어있으면 그만큼 여러 번 더해짐) — .includes()로
    // 존재 여부만 한 번 확인하면 이 중복 케이스에서 원작보다 페널티가 덜 매겨진다.
    for (const targetId of b1.talkTo) {
      if (targetId !== b2.actorId) continue;
      if (b1Flip === desiredDir) rating += 4 * (distance - 1); // 방향은 맞음 — 거리 비례 약한 페널티
      else rating += 40; // 말을 걸면서 그쪽을 안 보고 있음 — 중벌점
      if (b2Flip === desiredDir) rating += 4; // 상대가 나를 안 보고 있음
    }
  }

  return rating;
}

function computeDisplacementPenalty(arr: readonly PlacedEntry[], hysteresis: HysteresisMap): number {
  let penalty = 0;
  for (let i = 0; i < arr.length; i++) {
    const h = hysteresis[arr[i]!.person.actorId];
    if (i > 0 && h?.lastRight !== arr[i - 1]!.person.actorId) penalty++;
    if (i < arr.length - 1 && h?.lastLeft !== arr[i + 1]!.person.actorId) penalty++;
  }
  return penalty;
}

function sumPairwiseCost(arr: readonly PlacedEntry[]): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i]!;
      const b = arr[j]!;
      sum += evalPair(a.person, a.flip, b.person, b.flip, j - i);
      sum += evalPair(b.person, b.flip, a.person, a.flip, i - j);
    }
  }
  return sum;
}

/**
 * candidate를 currentlyPlaced의 index 위치에 넣었을 때의 비용을 양쪽 방향(flip) 모두 계산해
 * 더 싼 쪽을 고른다. 이미 배치된 사람들의 flip은 그리디하게 고정(재고려하지 않음).
 * 동점이면 해당 아바타의 직전 방향(lastDir)을 유지한다.
 */
export function evalPlacement(
  currentlyPlaced: readonly PlacedEntry[],
  candidate: PlacementPerson,
  index: number,
  hysteresis: HysteresisMap,
): { rating: number; dir: boolean } {
  const withFalse = [...currentlyPlaced];
  withFalse.splice(index, 0, { person: candidate, flip: false });
  const penalty = computeDisplacementPenalty(withFalse, hysteresis);
  const ratingR = penalty + sumPairwiseCost(withFalse);

  const withTrue = [...currentlyPlaced];
  withTrue.splice(index, 0, { person: candidate, flip: true });
  const ratingL = penalty + sumPairwiseCost(withTrue);

  if (ratingR < ratingL) return { rating: ratingR, dir: false };
  if (ratingR > ratingL) return { rating: ratingL, dir: true };
  return { rating: ratingR, dir: hysteresis[candidate.actorId]?.lastDir ?? false };
}

/** 사람들을 하나씩, 모든 삽입 위치×양방향 중 가장 싼 곳에 그리디하게 배치한다. */
export function doGreedyOrdering(people: readonly PlacementPerson[], hysteresis: HysteresisMap): PlacedEntry[] {
  const placed: PlacedEntry[] = [];

  for (const person of people) {
    let bestRating = Infinity;
    let bestPosition = 0;
    let bestDir = false;

    for (let j = 0; j <= placed.length; j++) {
      const { rating, dir } = evalPlacement(placed, person, j, hysteresis);
      if (rating < bestRating) {
        bestRating = rating;
        bestPosition = j;
        bestDir = dir;
      }
    }

    placed.splice(bestPosition, 0, { person, flip: bestDir });
  }

  return placed;
}

/** 배치 결과로 다음 패널의 히스테리시스 상태를 갱신한다(불변 갱신 — 새 맵을 반환). */
export function updateHysteresis(placed: readonly PlacedEntry[], hysteresis: HysteresisMap): HysteresisMap {
  const next: Record<string, HysteresisState> = { ...hysteresis };

  for (let i = 0; i < placed.length; i++) {
    const actorId = placed[i]!.person.actorId;
    const prev = next[actorId];
    next[actorId] = {
      lastDir: placed[i]!.flip,
      lastRight: i > 0 ? placed[i - 1]!.person.actorId : (prev?.lastRight ?? null),
      lastLeft: i < placed.length - 1 ? placed[i + 1]!.person.actorId : (prev?.lastLeft ?? null),
    };
  }

  return next;
}
