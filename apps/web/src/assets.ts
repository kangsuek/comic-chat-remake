/** tools/avb-converter가 apps/web/public/assets/에 구운 정적 자산의 URL을 만든다. */
export function avatarAssetUrl(characterId: string, imagePath: string): string {
  return `/assets/${characterId}/${imagePath}`;
}

export function backdropAssetUrl(imagePath: string): string {
  return `/assets/${imagePath}`;
}
