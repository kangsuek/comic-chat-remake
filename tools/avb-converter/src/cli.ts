// 오프라인 변환 CLI: .avb/.bmp 원본을 PNG+JSON 매니페스트로 바꿔 apps/web/public/assets/에 쓴다.
// 사용법: pnpm convert -- --avatars <dir> --backdrops <dir> --out <dir>
import { readFileSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetCatalog, AvatarManifest, BackdropAsset, PoseAsset } from "@comic-chat/asset-manifest-types";
import sharp from "sharp";
import { parseAvb, type ParsedAvatar } from "./avbParser.js";
import { decodeDibAt, dibToRgba } from "./bmpDecoder.js";
import { compositePose } from "./compositor.js";
import { buildAvatarManifest, buildBackdropAsset } from "./manifest.js";

interface CliArgs {
  avatarsDir: string;
  backdropsDir: string;
  outDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string => {
    const i = argv.indexOf(flag);
    if (i === -1 || i + 1 >= argv.length) throw new Error(`필수 인자 누락: ${flag}`);
    return argv[i + 1]!;
  };
  return { avatarsDir: get("--avatars"), backdropsDir: get("--backdrops"), outDir: get("--out") };
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 이 poseIndex를 합성할 때 mask를 적용할지 결정한다.
 * bodycam.cpp 기준: Simple 아바타는 mask를 절대 쓰지 않고, Complex는 얼굴이면 HEADMASK,
 * 몸통이면 TORSOMASK 플래그를 따른다.
 */
function shouldUseMask(parsed: ParsedAvatar, poseIndex: number): boolean {
  if (parsed.kind === "simple") return false;
  if (parsed.faces.some((f) => f.poseIndex === poseIndex)) return parsed.headMask;
  if (parsed.torsos.some((t) => t.poseIndex === poseIndex)) return parsed.torsoMask;
  return false;
}

async function convertAvatar(filePath: string, outDir: string): Promise<AvatarManifest> {
  const buf = readFileSync(filePath);
  const parsedRaw = parseAvb(buf);
  // avatario.cpp의 LoadAvatarInfo는 내부 AK_NAME 태그를 의도적으로 버리고 .avb 파일명을
  // 진짜 이름으로 쓴다("FOR NOW, IGNORE INTERNAL NAME FIELD") — GetAllAvatarNames()도
  // 디렉터리를 스캔한 파일명으로 아바타 목록을 만든다. 내부 태그 값(예: glenda.avb의
  // AK_NAME="Greg")은 원작에서도 결국 쓰이지 않으므로 여기서도 파일명을 채택한다.
  const fileBaseName = path.basename(filePath, path.extname(filePath));
  const parsed: ParsedAvatar = { ...parsedRaw, name: fileBaseName };
  const characterId = slugify(fileBaseName);
  const avatarDir = path.join(outDir, characterId);
  await mkdir(path.join(avatarDir, "poses"), { recursive: true });

  const poseAssets: PoseAsset[] = [];

  for (let poseIndex = 0; poseIndex < parsed.poseOffsets.length; poseIndex++) {
    const offsets = parsed.poseOffsets[poseIndex]!;
    const fgnd = decodeDibAt(buf, offsets.fgndOffset);

    let rgba: Buffer;
    if (parsed.iconPoseIndex === poseIndex) {
      // 아이콘은 mask/aura 없이 그대로 표시되는 단순 썸네일 (LoadIconRec 참고)
      rgba = dibToRgba(fgnd);
    } else {
      const mask = offsets.transOffset ? decodeDibAt(buf, offsets.transOffset) : null;
      const aura = offsets.auraOffset ? decodeDibAt(buf, offsets.auraOffset) : null;
      rgba = compositePose({ fgnd, mask, aura, useMask: shouldUseMask(parsed, poseIndex) }).rgba;
    }

    const imagePath = `poses/${poseIndex}.png`;
    await sharp(rgba, { raw: { width: fgnd.width, height: fgnd.height, channels: 4 } })
      .png()
      .toFile(path.join(avatarDir, imagePath));
    poseAssets.push({ poseIndex, imagePath, width: fgnd.width, height: fgnd.height });
  }

  const manifest = buildAvatarManifest(characterId, parsed, poseAssets);
  await writeFile(path.join(avatarDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function convertBackdrop(filePath: string, outDir: string): Promise<BackdropAsset> {
  const buf = readFileSync(filePath);
  const dib = decodeDibAt(buf, 0);
  const rgba = dibToRgba(dib);

  const baseName = path.basename(filePath, path.extname(filePath));
  const backdropId = slugify(baseName);
  const backdropDir = path.join(outDir, "backdrops");
  await mkdir(backdropDir, { recursive: true });

  const imagePath = `${backdropId}.png`;
  await sharp(rgba, { raw: { width: dib.width, height: dib.height, channels: 4 } })
    .png()
    .toFile(path.join(backdropDir, imagePath));

  return buildBackdropAsset(backdropId, baseName, `backdrops/${imagePath}`, dib.width, dib.height);
}

async function main(): Promise<void> {
  const { avatarsDir, backdropsDir, outDir } = parseArgs(process.argv.slice(2));
  await mkdir(outDir, { recursive: true });

  const avatarFiles = (await readdir(avatarsDir)).filter((f) => f.endsWith(".avb")).sort();
  const avatars: AvatarManifest[] = [];
  for (const file of avatarFiles) {
    console.log(`아바타 변환 중: ${file}`);
    avatars.push(await convertAvatar(path.join(avatarsDir, file), outDir));
  }

  const backdropFiles = (await readdir(backdropsDir)).filter((f) => f.endsWith(".bmp")).sort();
  const backdrops: BackdropAsset[] = [];
  for (const file of backdropFiles) {
    console.log(`배경 변환 중: ${file}`);
    backdrops.push(await convertBackdrop(path.join(backdropsDir, file), outDir));
  }

  const catalog: AssetCatalog = { avatars, backdrops };
  await writeFile(path.join(outDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  console.log(`완료: 아바타 ${avatars.length}개, 배경 ${backdrops.length}개 → ${outDir}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
