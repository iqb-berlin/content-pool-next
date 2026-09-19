import { SaxesParser } from "saxes";

export interface NavigationNode {
  kind: "BLOCK" | "UNIT";
  id: string;
  label: string;
  path: string;
  alias?: string;
  children?: NavigationNode[];
}

interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  text: string;
  path: string;
  children: XmlNode[];
}

export class BookletStructureError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

/** Ordered XML parsing, without DTDs or external entity resolution. */
export function parseBookletXml(xml: string, source: string) {
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined;
  const parser = new SaxesParser({ xmlns: false });
  const fail = (message: string): never => {
    throw new BookletStructureError(stack.at(-1)?.path || source, message);
  };
  parser.on("doctype", () => fail("Booklet-DTDs werden nicht unterstützt."));
  parser.on("error", (error) =>
    fail(`Ungültiges Booklet-XML: ${error.message}`),
  );
  parser.on("opentag", (tag) => {
    if (stack.length >= 64)
      fail("Booklet-Verschachtelung überschreitet 64 Ebenen.");
    const parent = stack.at(-1);
    const index =
      parent?.children.filter((child) => child.name === tag.name).length || 0;
    const node: XmlNode = {
      name: tag.name,
      attributes: tag.attributes,
      text: "",
      path: `${parent?.path || source}/${tag.name}[${index}]`,
      children: [],
    };
    if (parent) parent.children.push(node);
    else root = node;
    stack.push(node);
  });
  const appendText = (text: string) => {
    if (stack.length) stack[stack.length - 1].text += text;
  };
  parser.on("text", appendText);
  parser.on("cdata", appendText);
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.write(xml).close();
  if (!root || root.name !== "Booklet") fail("Wurzelelement Booklet fehlt.");
  const booklet = root!;
  const metadata = booklet.children.find((node) => node.name === "Metadata");
  const id =
    metadata?.children.find((node) => node.name === "Id")?.text.trim() || "";
  const label =
    metadata?.children.find((node) => node.name === "Label")?.text.trim() || id;
  if (!id)
    throw new BookletStructureError(
      `${source}/Booklet/Metadata/Id`,
      "Booklet-ID fehlt.",
    );
  const units = booklet.children.find((node) => node.name === "Units");
  if (!units)
    throw new BookletStructureError(
      `${source}/Booklet/Units`,
      "Booklet-Aufgabenfolge fehlt.",
    );
  const blockIds = new Set<string>();
  const block = (node: XmlNode): NavigationNode => {
    const blockId = node.attributes.id?.trim();
    if (!blockId || blockIds.has(blockId)) {
      throw new BookletStructureError(
        node.path,
        "Block-ID fehlt oder ist doppelt.",
      );
    }
    blockIds.add(blockId);
    return {
      kind: "BLOCK",
      id: blockId,
      label: node.attributes.label || blockId,
      path: node.path,
      children: [],
    };
  };
  // ProgressStart/ProgressEnd are a provisional adapter, isolated from the manifest.
  const navigation = (container: XmlNode): NavigationNode[] => {
    const nodes: NavigationNode[] = [];
    const markers: NavigationNode[] = [];
    const destination = () => markers.at(-1)?.children || nodes;
    for (const node of container.children) {
      if (node.name === "Restrictions") continue;
      if (node.name === "ProgressStart") {
        const entry = block(node);
        destination().push(entry);
        markers.push(entry);
      } else if (node.name === "ProgressEnd") {
        const open = markers.at(-1);
        if (!open || (node.attributes.id && node.attributes.id !== open.id)) {
          throw new BookletStructureError(
            node.path,
            "Fortschrittsmarker ist nicht passend geöffnet.",
          );
        }
        if (!open.children?.length)
          throw new BookletStructureError(
            node.path,
            "Leerer Fortschrittsblock.",
          );
        markers.pop();
      } else if (node.name === "Testlet") {
        const entry = block(node);
        entry.children = navigation(node);
        destination().push(entry);
      } else if (node.name === "Unit") {
        const unitId = node.attributes.id?.trim();
        if (!unitId)
          throw new BookletStructureError(node.path, "Unit-ID fehlt.");
        destination().push({
          kind: "UNIT",
          id: unitId,
          label: node.attributes.label || unitId,
          alias: node.attributes.alias,
          path: node.path,
        });
      } else {
        throw new BookletStructureError(
          node.path,
          `Unbekanntes Navigationselement: ${node.name}`,
        );
      }
    }
    if (markers.length)
      throw new BookletStructureError(
        markers[0].path,
        "Fortschrittsblock wurde nicht geschlossen.",
      );
    return nodes;
  };
  return { id, label, children: navigation(units) };
}
