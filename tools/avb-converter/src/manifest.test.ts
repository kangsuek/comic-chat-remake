import type { PoseAsset } from "@comic-chat/asset-manifest-types";
import { describe, expect, it } from "vitest";
import type { ParsedAvatar } from "./avbParser.js";
import { buildAvatarManifest, buildBackdropAsset } from "./manifest.js";

describe("buildAvatarManifest", () => {
  it("complex 아바타 매니페스트를 조립한다", () => {
    const parsed: ParsedAvatar = {
      name: "Mike",
      style: 1,
      flags: 5,
      headMask: true,
      torsoMask: false,
      torsoFirst: true,
      iconPoseIndex: 0,
      poseOffsets: [
        { fgndOffset: 747, transOffset: 0, auraOffset: 0 },
        { fgndOffset: 1525, transOffset: 6207, auraOffset: 10891 },
      ],
      kind: "complex",
      faces: [{ poseIndex: 1, emotion: "NEUTRAL", intensity: 0, xCX: 108, yCX: 149, deltaXCX: 0, deltaYCX: -5, faceX: 101, faceY: 94 }],
      torsos: [],
    };
    const poseAssets: PoseAsset[] = [
      { poseIndex: 0, imagePath: "poses/0.png", width: 40, height: 40 },
      { poseIndex: 1, imagePath: "poses/1.png", width: 198, height: 165 },
    ];

    const manifest = buildAvatarManifest("mike", parsed, poseAssets);

    expect(manifest.characterId).toBe("mike");
    expect(manifest.name).toBe("Mike");
    expect(manifest.kind).toBe("complex");
    expect(manifest.flags).toEqual({ headMask: true, torsoMask: false, torsoFirst: true });
    expect(manifest.icon).toEqual(poseAssets[0]);
    expect(manifest.poses).toBe(poseAssets);
    if (manifest.kind === "complex") {
      expect(manifest.faces).toEqual(parsed.faces);
      expect(manifest.torsos).toEqual([]);
    }
  });

  it("simple 아바타 매니페스트를 조립한다", () => {
    const parsed: ParsedAvatar = {
      name: "Tux",
      style: 1,
      flags: 0,
      headMask: false,
      torsoMask: false,
      torsoFirst: false,
      iconPoseIndex: null,
      poseOffsets: [{ fgndOffset: 991, transOffset: 0, auraOffset: 10487 }],
      kind: "simple",
      bodies: [{ poseIndex: 0, emotion: "NEUTRAL", intensity: 0, faceX: 10, faceY: 20 }],
    };
    const poseAssets: PoseAsset[] = [{ poseIndex: 0, imagePath: "poses/0.png", width: 167, height: 393 }];

    const manifest = buildAvatarManifest("tux", parsed, poseAssets);
    expect(manifest.icon).toBeNull();
    if (manifest.kind === "simple") {
      expect(manifest.bodies).toEqual(parsed.bodies);
    }
  });
});

describe("buildBackdropAsset", () => {
  it("배경 자산 객체를 만든다", () => {
    expect(buildBackdropAsset("field", "Field", "backdrops/field.png", 315, 315)).toEqual({
      backdropId: "field",
      name: "Field",
      imagePath: "backdrops/field.png",
      width: 315,
      height: 315,
    });
  });
});
