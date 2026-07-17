import { load, type CheerioAPI } from "cheerio";
import { type AnyNode, type ChildNode, type Element, isTag } from "domhandler";

function wrapElement(
  root: CheerioAPI,
  element: Element | null | undefined,
): HtmlElementWrapper | null {
  return element ? new HtmlElementWrapper(root, element) : null;
}

function wrapElements(
  root: CheerioAPI,
  elements: Iterable<Element>,
): HtmlElementWrapper[] {
  return Array.from(
    elements,
    (element) => new HtmlElementWrapper(root, element),
  );
}

function findFirstElement(nodes: Iterable<AnyNode>): Element | undefined {
  for (const node of nodes) {
    if (isTag(node)) {
      return node;
    }
  }
  return undefined;
}

function getNodeText(root: CheerioAPI, node: AnyNode): string {
  if ("data" in node) {
    return node.data || "";
  }
  return root(node).text();
}

function getAdjacentElement(
  node: AnyNode,
  direction: "prev" | "next",
): Element | null {
  let current = direction === "prev" ? node.prev : node.next;
  while (current) {
    if (isTag(current)) {
      return current;
    }
    current = direction === "prev" ? current.prev : current.next;
  }
  return null;
}

/** 对 DOM Node 的极简包装，用来模拟 Venera 里的 HTML 解析对象。 */
export class HtmlNodeWrapper {
  private readonly root: CheerioAPI;
  private readonly node: AnyNode;

  constructor(root: CheerioAPI, node: AnyNode) {
    this.root = root;
    this.node = node;
  }

  get text(): string {
    return getNodeText(this.root, this.node);
  }

  get type(): string {
    switch (this.node.nodeType) {
      case 1:
        return "element";
      case 3:
        return "text";
      case 8:
        return "comment";
      case 9:
        return "document";
      default:
        return "unknown";
    }
  }

  toElement(): HtmlElementWrapper | null {
    return isTag(this.node)
      ? new HtmlElementWrapper(this.root, this.node)
      : null;
  }
}

/** 对 DOM Element 的极简包装，暴露配置源常用的查询/遍历属性。 */
export class HtmlElementWrapper {
  private readonly root: CheerioAPI;
  private readonly element: Element;

  constructor(root: CheerioAPI, element: Element) {
    this.root = root;
    this.element = element;
  }

  get text(): string {
    return this.root(this.element).text();
  }

  get attributes(): Record<string, string> {
    return { ...this.element.attribs };
  }

  querySelector(selector: string): HtmlElementWrapper | null {
    return wrapElement(
      this.root,
      this.root(this.element).find(selector).get(0),
    );
  }

  querySelectorAll(selector: string): HtmlElementWrapper[] {
    return wrapElements(
      this.root,
      this.root(this.element).find(selector).toArray(),
    );
  }

  get children(): HtmlElementWrapper[] {
    return wrapElements(this.root, this.element.childNodes.filter(isTag));
  }

  get nodes(): HtmlNodeWrapper[] {
    return this.element.childNodes.map(
      (node: ChildNode) => new HtmlNodeWrapper(this.root, node),
    );
  }

  get innerHTML(): string {
    return this.root(this.element).html() || "";
  }

  get parent(): HtmlElementWrapper | null {
    const parent = this.element.parent;
    return parent && isTag(parent)
      ? new HtmlElementWrapper(this.root, parent)
      : null;
  }

  get classNames(): string[] {
    const className = this.element.attribs["class"] || "";
    return className.split(/\s+/).filter(Boolean);
  }

  get id(): string | null {
    return this.element.attribs.id || null;
  }

  get localName(): string {
    return this.element.name;
  }

  get previousElementSibling(): HtmlElementWrapper | null {
    return wrapElement(this.root, getAdjacentElement(this.element, "prev"));
  }

  get nextElementSibling(): HtmlElementWrapper | null {
    return wrapElement(this.root, getAdjacentElement(this.element, "next"));
  }
}

/** 负责把 HTML 字符串变成可查询文档对象。 */
export class HtmlDocumentWrapper {
  private readonly root: CheerioAPI;

  constructor(html: string) {
    this.root = load(html);
  }

  querySelector(selector: string): HtmlElementWrapper | null {
    return wrapElement(
      this.root,
      findFirstElement(this.root(selector).toArray()),
    );
  }

  querySelectorAll(selector: string): HtmlElementWrapper[] {
    return wrapElements(this.root, this.root(selector).toArray().filter(isTag));
  }

  getElementById(id: string): HtmlElementWrapper | null {
    const element = this.root("[id]")
      .toArray()
      .find((node): node is Element => isTag(node) && node.attribs.id === id);
    return wrapElement(this.root, element);
  }

  dispose(): void {}
}
