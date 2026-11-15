import { Fragment } from 'react';
import {
  parseMarkdownBlocks,
  type InlineToken,
  type MarkdownBlock,
} from '../utils/markdown.ts';

function renderInlineTokens(tokens: InlineToken[]) {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'bold':
        return (
          <strong key={idx} className="font-semibold text-[#1C241E]">
            {token.text}
          </strong>
        );
      case 'italic':
        return (
          <em key={idx} className="italic">
            {token.text}
          </em>
        );
      case 'code':
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 text-[12px] font-mono bg-[#EFE8DA] text-[#1B4332] rounded"
          >
            {token.text}
          </code>
        );
      case 'link':
        return (
          <a
            key={idx}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-[#0E7490] hover:text-[#1B4332] break-words"
          >
            {token.label}
          </a>
        );
      case 'text':
      default:
        return <Fragment key={idx}>{token.text}</Fragment>;
    }
  });
}

function renderBlock(block: MarkdownBlock, index: number) {
  switch (block.type) {
    case 'heading': {
      const cls =
        block.level <= 2
          ? 'text-sm font-semibold text-[#1B4332] pt-1'
          : 'text-[13px] font-semibold text-[#1C241E] pt-0.5';
      return (
        <div key={index} className={cls}>
          {renderInlineTokens(block.tokens)}
        </div>
      );
    }
    case 'unordered-list':
      return (
        <ul key={index} className="list-disc pl-4 space-y-1.5">
          {block.items.map((itemTokens, itemIdx) => (
            <li key={itemIdx} className="leading-relaxed">
              {renderInlineTokens(itemTokens)}
            </li>
          ))}
        </ul>
      );
    case 'ordered-list':
      return (
        <ol key={index} className="list-decimal pl-4 space-y-1.5">
          {block.items.map((itemTokens, itemIdx) => (
            <li key={itemIdx} className="leading-relaxed">
              {renderInlineTokens(itemTokens)}
            </li>
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote
          key={index}
          className="px-3 py-2 rounded-lg bg-[#EFE8DA]/70 text-xs text-[#3B4239] leading-relaxed"
        >
          {renderInlineTokens(block.tokens)}
        </blockquote>
      );
    case 'paragraph':
    default:
      return (
        <p key={index} className="leading-relaxed">
          {renderInlineTokens(block.tokens)}
        </p>
      );
  }
}

export function MarkdownMessage({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);
  if (blocks.length === 0) {
    return <p className="leading-relaxed">{content}</p>;
  }
  return <div className="space-y-2.5 text-sm text-[#1C241E]">{blocks.map(renderBlock)}</div>;
}
