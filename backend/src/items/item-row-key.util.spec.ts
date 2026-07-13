import {
  buildItemRowKey,
  normalizeItemSubId,
  parseItemRowKey,
  parseItemRowKeyParts,
} from "./item-row-key.util";

describe("item row keys", () => {
  it("uses the item UUID unchanged for simple item rows", () => {
    expect(buildItemRowKey("uuid-1")).toBe("uuid-1");
    expect(parseItemRowKey("uuid-1", "uuid-1")).toEqual({});
  });

  it("creates a reversible key for a partial-credit sub ID", () => {
    const key = buildItemRowKey("uuid-1", "Stufe 1/2");
    expect(key).toBe("uuid-1::Stufe%201%2F2");
    expect(parseItemRowKey(key, "uuid-1")).toEqual({ subId: "Stufe 1/2" });
    expect(parseItemRowKeyParts(key)).toEqual({
      itemUuid: "uuid-1",
      subId: "Stufe 1/2",
    });
  });

  it("normalizes whitespace and rejects unrelated keys", () => {
    expect(normalizeItemSubId("  A  ")).toBe("A");
    expect(parseItemRowKey("uuid-2::A", "uuid-1")).toBeNull();
  });
});
