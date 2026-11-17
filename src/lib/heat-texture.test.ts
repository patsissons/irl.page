import { describe, expect, it } from "vitest";
import { heatColor, project } from "./heat-texture";

describe("heat texture", () => {
  it("runs from a cool colour to a hot one", () => {
    expect(heatColor(0)).toEqual([48, 18, 59]);
    expect(heatColor(1)).toEqual([208, 36, 4]);
    expect(heatColor(0.3)).toEqual([49, 180, 215]);
    expect(heatColor(-1)).toEqual(heatColor(0));
    expect(heatColor(2)).toEqual(heatColor(1));
  });

  it("places venues on an equirectangular map", () => {
    expect(project({ lat: 0, lng: 0 }, 1024, 512)).toEqual({
      x: 512,
      y: 256,
      stretch: 1,
    });
    expect(project({ lat: 90, lng: -180 }, 1024, 512)).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it("stretches blobs sideways away from the equator, up to a limit", () => {
    const at60 = project({ lat: 60, lng: 0 }, 1024, 512).stretch;
    expect(at60).toBeCloseTo(2, 5);
    expect(project({ lat: 89.9, lng: 0 }, 1024, 512).stretch).toBeCloseTo(
      1 / 0.15,
      5,
    );
  });
});
