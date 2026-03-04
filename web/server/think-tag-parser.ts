import type { ContentBlock } from "./session-types.js";

/**
 * Split text blocks containing <think>...</think> tags into separate
 * thinking and text content blocks.
 * Native thinking blocks pass through unchanged.
 */
export function splitThinkTags(blocks: ContentBlock[]): ContentBlock[] {
  const result: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "text") {
      result.push(block);
      continue;
    }
    const parsed = parseThinkTags(block.text);
    result.push(...parsed);
  }
  return result;
}

/**
 * Parse a text string containing <think>...</think> tags into
 * an array of content blocks (thinking and text).
 */
function parseThinkTags(text: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const regex = /<think>([\s\S]*?)<\/think>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the think tag
    const before = text.slice(lastIndex, match.index).trim();
    if (before) {
      blocks.push({ type: "text", text: before });
    }
    // The thinking content
    const thinking = match[1].trim();
    if (thinking) {
      blocks.push({ type: "thinking", thinking });
    }
    lastIndex = regex.lastIndex;
  }

  // Remaining text after last think tag
  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    blocks.push({ type: "text", text: remaining });
  }

  // If nothing was parsed, return original
  if (blocks.length === 0) {
    return [{ type: "text", text }];
  }

  return blocks;
}

/**
 * Strip <think>...</think> tags from streaming text, returning only
 * the non-thinking content.
 */
export function stripThinkTagsFromText(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * Check if a thinking block has empty or whitespace-only content.
 */
export function isBogusThinkingBlock(block: ContentBlock): boolean {
  return block.type === "thinking" && !block.thinking.trim();
}

/**
 * If all content blocks are thinking-only (no text blocks),
 * enrich with the result text as a text block so there's something visible.
 */
export function enrichThinkingOnlyMessages(
  blocks: ContentBlock[],
  resultText?: string,
): ContentBlock[] {
  const hasText = blocks.some(
    (b) => b.type === "text" && b.text.trim().length > 0,
  );
  if (hasText || !resultText) return blocks;
  return [...blocks, { type: "text", text: resultText }];
}

/**
 * Detect if streaming text has an open <think> tag without a closing tag.
 * Used to determine if the model is currently in a thinking phase.
 */
export function hasOpenThinkTag(text: string): boolean {
  const openCount = (text.match(/<think>/g) || []).length;
  const closeCount = (text.match(/<\/think>/g) || []).length;
  return openCount > closeCount;
}

/**
 * Extract visible (non-thinking) text from a string that may contain think tags.
 * Used for streaming display where we want to show text but not thinking content.
 */
export function extractVisibleText(text: string): string {
  // Remove completed think blocks
  let result = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  // Remove any open think tag and everything after it (still thinking)
  const openIdx = result.lastIndexOf("<think>");
  if (openIdx !== -1) {
    result = result.slice(0, openIdx);
  }
  return result.trim();
}
