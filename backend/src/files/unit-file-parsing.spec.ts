import { extractVomdTimeSeconds, getXmlRootElement } from "./unit-file-parsing";

describe("getXmlRootElement", () => {
  it("distinguishes a Booklet with nested Unit references from a Unit file", () => {
    expect(
      getXmlRootElement(
        '<?xml version="1.0"?><Booklet><Units><Unit id="u1"/></Units></Booklet>',
      ),
    ).toBe("Booklet");
    expect(getXmlRootElement("<Unit><Id>u1</Id></Unit>")).toBe("Unit");
  });

  it("returns undefined for malformed XML", () => {
    expect(getXmlRootElement("<Unit>")).toBeUndefined();
  });
});

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

  it("accepts the legacy item-time entry ID", () => {
    expect(
      extractVomdTimeSeconds(
        [{ entries: [{ id: "iqb_item_time", value: "45" }] }],
        "iqb_item_time",
      ),
    ).toBe(45);
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
