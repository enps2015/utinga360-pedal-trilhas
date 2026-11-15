export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; href: string };

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; tokens: InlineToken[] }
  | { type: 'paragraph'; tokens: InlineToken[] }
  | { type: 'unordered-list'; items: InlineToken[][] }
  | { type: 'ordered-list'; items: InlineToken[][] }
  | { type: 'blockquote'; tokens: InlineToken[] };

export function sanitizeHttpUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function parseInlineTokens(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern =
    /(\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|(https?:\/\/[^\s<)]+))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: input.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined && match[3] !== undefined) {
      const safeHref = sanitizeHttpUrl(match[3]);
      if (safeHref) {
        tokens.push({ type: 'link', label: match[2], href: safeHref });
      } else {
        tokens.push({ type: 'text', text: match[2] });
      }
    } else if (match[4] !== undefined) {
      tokens.push({ type: 'code', text: match[4] });
    } else if (match[5] !== undefined || match[6] !== undefined) {
      tokens.push({ type: 'bold', text: match[5] ?? match[6] });
    } else if (match[7] !== undefined) {
      tokens.push({ type: 'italic', text: match[7] });
    } else if (match[8] !== undefined) {
      const rawUrl = match[8].replace(/[.,;:!?]+$/, '');
      const trailing = match[8].slice(rawUrl.length);
      const safeHref = sanitizeHttpUrl(rawUrl);
      if (safeHref) {
        tokens.push({ type: 'link', label: rawUrl, href: safeHref });
      } else {
        tokens.push({ type: 'text', text: rawUrl });
      }
      if (trailing) {
        tokens.push({ type: 'text', text: trailing });
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < input.length) {
    tokens.push({ type: 'text', text: input.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', text: input }];
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Horizontal rule -> skip cleanly
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      i += 1;
      continue;
    }

    // Heading (# to ####)
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      blocks.push({
        type: 'heading',
        level,
        tokens: parseInlineTokens(headingMatch[2].trim()),
      });
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({
        type: 'blockquote',
        tokens: parseInlineTokens(quoteLines.join(' ').trim()),
      });
      continue;
    }

    // Unordered list (-, *, •)
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: InlineToken[][] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const itemText = lines[i].trim().replace(/^[-*•]\s+/, '');
        items.push(parseInlineTokens(itemText));
        i += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    // Ordered list (1. , 2) )
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: InlineToken[][] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const itemText = lines[i].trim().replace(/^\d+[.)]\s+/, '');
        items.push(parseInlineTokens(itemText));
        i += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    // Paragraph (collect consecutive non-special lines)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        /^(#{1,4})\s+/.test(cur) ||
        cur.startsWith('>') ||
        /^[-*•]\s+/.test(cur) ||
        /^\d+[.)]\s+/.test(cur) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(cur)
      ) {
        break;
      }
      paraLines.push(cur);
      i += 1;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        tokens: parseInlineTokens(paraLines.join(' ')),
      });
    }
  }

  return blocks;
}
