import { extractVomdTimeSeconds } from "./unit-file-parsing";

describe("extractVomdTimeSeconds", () => {
  it("uses the numeric VOMD raw value instead of the formatted display value", () => {
    expect(
      extractVomdTimeSeconds(
        [
          {
            entries: [
              {
                id: "iqb_time_item",
                value: "90",
                valueAsText: { lang: "de", value: "01:30" },
              },
            ],
          },
        ],
        "iqb_time_item",
      ),
    ).toBe(90);
  });

  it.each(["", "  ", "invalid", "-1", -1, null, undefined])(
    "treats %p as a missing VOMD time",
    (value) => {
      expect(
        extractVomdTimeSeconds(
          [{ entries: [{ id: "iqb_time_stimulus", value }] }],
          "iqb_time_stimulus",
        ),
      ).toBeUndefined();
    },
  );

  it("accepts zero and finds the requested entry across profiles", () => {
    expect(
      extractVomdTimeSeconds(
        [
          { entries: [{ id: "other", value: "30" }] },
          { entries: [{ id: "iqb_time_stimulus", value: 0 }] },
        ],
        "iqb_time_stimulus",
      ),
    ).toBe(0);
  });
});
