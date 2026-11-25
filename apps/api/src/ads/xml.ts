// SPDX-License-Identifier: AGPL-3.0-only

/** One element of an XML document. */
export interface XmlNode {
  /** The name without a namespace prefix. */
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  /** The text directly inside the element, without its children, trimmed. */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decode(value: string): string {
  return value.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1]?.toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

const NAME = /[^\s/>=]+/y;

/**
 * Reads an XML document into a tree. Made for answers of ad servers: it keeps
 * elements, attributes and text, and ignores declarations, comments and
 * processing instructions. It is forgiving about what a server may get wrong,
 * but returns null for something that is not XML at all.
 */
export function parseXml(source: string): XmlNode | null {
  const root: XmlNode = { name: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const text: string[][] = [[]];
  let at = 0;

  const flush = () => {
    const node = stack.at(-1);
    const parts = text.at(-1);
    if (node && parts && parts.length > 0) {
      node.text = decode(parts.join('')).trim();
    }
  };

  while (at < source.length) {
    const open = source.indexOf('<', at);
    if (open === -1) {
      text.at(-1)?.push(source.slice(at));
      break;
    }
    if (open > at) {
      text.at(-1)?.push(source.slice(at, open));
    }
    if (source.startsWith('<!--', open)) {
      const end = source.indexOf('-->', open + 4);
      at = end === -1 ? source.length : end + 3;
    } else if (source.startsWith('<![CDATA[', open)) {
      const end = source.indexOf(']]>', open + 9);
      const raw = source.slice(open + 9, end === -1 ? source.length : end);
      // CDATA is text as it stands: escape it so that decoding leaves it alone.
      text.at(-1)?.push(raw.replaceAll('&', '&amp;'));
      at = end === -1 ? source.length : end + 3;
    } else if (source.startsWith('<?', open) || source.startsWith('<!', open)) {
      const end = source.indexOf('>', open + 2);
      at = end === -1 ? source.length : end + 1;
    } else if (source.startsWith('</', open)) {
      const end = source.indexOf('>', open + 2);
      at = end === -1 ? source.length : end + 1;
      if (stack.length > 1) {
        flush();
        stack.pop();
        text.pop();
      }
    } else {
      const node: XmlNode = { name: '', attributes: {}, children: [], text: '' };
      let cursor = open + 1;
      NAME.lastIndex = cursor;
      const name = NAME.exec(source);
      if (!name) {
        return null;
      }
      node.name = name[0].includes(':') ? name[0].slice(name[0].indexOf(':') + 1) : name[0];
      cursor = NAME.lastIndex;
      let selfClosing = false;
      // Attributes, up to the end of the tag.
      for (;;) {
        while (cursor < source.length && /\s/.test(source[cursor] ?? '')) {
          cursor += 1;
        }
        const char = source[cursor];
        if (char === undefined) {
          return null;
        }
        if (char === '>') {
          cursor += 1;
          break;
        }
        if (char === '/' && source[cursor + 1] === '>') {
          selfClosing = true;
          cursor += 2;
          break;
        }
        NAME.lastIndex = cursor;
        const attribute = NAME.exec(source);
        if (!attribute) {
          return null;
        }
        cursor = NAME.lastIndex;
        let value = '';
        if (source[cursor] === '=') {
          cursor += 1;
          const quote = source[cursor];
          if (quote === '"' || quote === "'") {
            const end = source.indexOf(quote, cursor + 1);
            if (end === -1) {
              return null;
            }
            value = source.slice(cursor + 1, end);
            cursor = end + 1;
          } else {
            const bare = /[^\s>]+/y;
            bare.lastIndex = cursor;
            const match = bare.exec(source);
            value = match?.[0] ?? '';
            cursor = bare.lastIndex;
          }
        }
        const key = attribute[0].includes(':')
          ? attribute[0].slice(attribute[0].indexOf(':') + 1)
          : attribute[0];
        node.attributes[key] = decode(value);
      }
      at = cursor;
      stack.at(-1)?.children.push(node);
      if (!selfClosing) {
        stack.push(node);
        text.push([]);
      }
    }
  }
  while (stack.length > 1) {
    flush();
    stack.pop();
    text.pop();
  }
  flush();
  return root.children[0] ?? null;
}

/** The first child element of a name, or undefined. */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((item) => item.name === name);
}

/** All child elements of a name. */
export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((item) => item.name === name) ?? [];
}
