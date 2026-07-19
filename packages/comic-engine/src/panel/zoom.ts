// panel.cpp의 CUnitPanel::LayoutAvatars 중 "신장 정규화 → 줌 결정 → 최종 배치" 부분과
// pageview.cpp의 Establishing()을 포팅.
// AdjustArtToCoord(패널 전체 카메라/뷰포트 이동)는 GDI 렌더링 계층 관심사라 여기서는 포팅하지 않는다
// — Stage 3(Konva 렌더링)에서 필요해지면 그때 별도로 다룬다.

const round = (x: number): number => Math.floor(x + 0.5); // ROUND(fp) == (int)(fp + 0.5)

/**
 * pageview.cpp의 Establishing() 포팅.
 * 첫 패널(count<=1)이거나, 클론된 패널이면서(방금 새로 만든 패널이 아니면서) count<=2일 때
 * true — 이 경우 LayoutAvatars의 줌인 단계를 건너뛰어 장면을 넓게 보여준다(설정샷).
 * @param totalPanelCount 지금까지 확정된 전체 패널 수(이번에 만들어질 패널 제외).
 * @param justCreatedNewPanel 이번 패널이 클론이 아니라 새로 생성된 패널인지(panel.ts의 shouldStartNewPanel 결과와 동일).
 */
export function isEstablishing(totalPanelCount: number, justCreatedNewPanel: boolean): boolean {
  if (totalPanelCount <= 1) return true;
  if (!justCreatedNewPanel && totalPanelCount <= 2) return true;
  return false;
}

export interface BodyDim {
  actorId: string;
  width: number;
  height: number;
  /**
   * 원작 `GetDimInfo`는 이 값을 두 아바타 타입(Simple/Complex) 모두에서 100으로 하드코딩한다
   * (`normHeight = 100; // rec->normHeight` 주석 처리 — 캐릭터별 실제 키 차이를 반영하는
   * 살아있는 필드가 아니라 죽은 커스터마이징 지점). 원작 그대로 재현하려면 호출자는 항상
   * 100을 넘기면 된다 — 이 필드 자체는 공식이 일반적으로 동작하도록 유지한다.
   */
  normHeight: number;
  headHeight: number;
  /**
   * bitArrowX / width — 스케일과 무관하게 유지되는 화살표 x 위치 비율(원작 arrowX[i]).
   * **호출 순서 주의**: 원작은 `DoGreedyOrdering`이 body의 `m_flip`을 먼저 확정한 뒤에야
   * `GetDimInfo`를 호출해 arrowX를 구한다(미러링되면 anchor의 x위치도 반전됨). 즉 이 값은
   * `doGreedyOrdering()`이 반환한 이 패널의 최종 flip을 반영해 계산된 값이어야 한다 —
   * width/height는 flip과 무관하지만 arrowXRatio만 flip에 의존한다.
   */
  arrowXRatio: number;
}

export interface BodyBox {
  actorId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  arrowX: number;
}

export interface ZoomLayoutInput {
  unitWidth: number;
  unitHeight: number;
  /**
   * 원작은 `#define zoomIn TRUE`(SIGGRAPH 데모 빌드에서만 FALSE)인 컴파일타임 상수라 실질
   * 조건은 사실상 `!establishing`뿐이었다. 향후 "확대 끄기" 같은 사용자 설정을 넣을 여지를
   * 남기기 위해 별도 플래그로 유지하되, 원작 그대로 재현하려면 호출자는 항상 true를 넘기면 된다.
   */
  zoomIn: boolean;
  establishing: boolean;
}

export interface ZoomLayoutResult {
  boxes: BodyBox[];
  zoomFactor: number;
}

interface ScaledBody {
  actorId: string;
  width: number;
  height: number;
  headHeight: number;
  /**
   * 원작의 top[i](= -unitHeight + height) — panel 좌표는 위로 갈수록 증가하므로 이 값이 몸의
   * "머리 쪽" y이고, 키가 클수록 값이 커진다(더 위로 올라감). 필드 이름을 `top`으로 두는 이유는
   * `SetBBox(left, top[i]-height[i], right, top[i])` 호출에서 이 값이 그대로 `m_bbox.Top`이
   * 되기 때문 — `bottom`(모든 몸이 공유하는 -unitHeight, 바닥)과 혼동하지 않도록 구분한다.
   */
  top: number;
  arrowXRatio: number;
}

/**
 * LayoutAvatars 포팅: 신장 정규화 → (폭 초과 시 축소 | 여유 있고 establishing 아니면 확대, 1.1배 미만 스냅) → 마진 배치.
 * 확대(zoom-in) 분기에서는 원작 그대로 머리 쪽 앵커(top[i])를 재계산하지 않는다 — 정규화 시점의 머리
 * 위치에 고정한 채 키만 키워 "발이 붙박인 채 확대"되는 느낌을 낸다. 축소 분기는 반대로 앵커도 다시 계산한다.
 */
export function layoutBodies(dims: readonly BodyDim[], input: ZoomLayoutInput): ZoomLayoutResult {
  const { unitWidth, unitHeight, zoomIn, establishing } = input;
  if (dims.length === 0) return { boxes: [], zoomFactor: 1.0 };

  const maxBodyHeight = Math.trunc(unitHeight / 1.9);
  const maxNorm = Math.max(...dims.map((d) => d.normHeight));

  const scaled: ScaledBody[] = dims.map((d) => {
    const newHeight = round(maxBodyHeight * (d.normHeight / maxNorm));
    const scaleRatio = newHeight / d.height;
    return {
      actorId: d.actorId,
      width: round(scaleRatio * d.width),
      height: newHeight,
      headHeight: round(scaleRatio * d.headHeight),
      top: -unitHeight + newHeight,
      arrowXRatio: d.arrowXRatio,
    };
  });

  const scaledWidth = scaled.reduce((sum, b) => sum + b.width, 0);
  let zoomFactor = 1.0;
  let final = scaled;

  if (scaledWidth > unitWidth) {
    const reduction = unitWidth / scaledWidth;
    final = scaled.map((b) => {
      const height = round(b.height * reduction);
      return { ...b, height, width: round(b.width * reduction), top: -unitHeight + height };
    });
  } else if (zoomIn && !establishing) {
    const maxHeadHeight = Math.max(...scaled.map((b) => b.headHeight));
    const widthFactor = unitWidth / scaledWidth;
    const headFactor = maxBodyHeight / (maxHeadHeight * 1.2); // 머리가 목에서 잘리지 않도록 상한
    zoomFactor = Math.min(widthFactor, headFactor);
    if (zoomFactor < 1.1) zoomFactor = 1.0;

    final = scaled.map((b) => ({
      ...b,
      height: round(b.height * zoomFactor),
      width: round(b.width * zoomFactor),
    }));
  }

  const finalWidth = final.reduce((sum, b) => sum + b.width, 0);
  const margin = Math.trunc((unitWidth - finalWidth) / (final.length + 1));

  let xOffset = margin;
  const boxes: BodyBox[] = final.map((b) => {
    const left = xOffset;
    const right = xOffset + b.width;
    const bottom = b.top - b.height;
    const arrowX = left + round(b.arrowXRatio * (right - left));
    xOffset += b.width + margin;
    return { actorId: b.actorId, left, top: b.top, right, bottom, arrowX };
  });

  return { boxes, zoomFactor };
}
