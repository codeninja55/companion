import { describe, it, expect } from "vitest";
import type { ContentBlock } from "./session-types.js";
import {
  splitThinkTags,
  stripThinkTagsFromText,
  isBogusThinkingBlock,
  enrichThinkingOnlyMessages,
  hasOpenThinkTag,
  extractVisibleText,
} from "./think-tag-parser.js";

// ─── splitThinkTags ─────────────────────────────────────────────────────────

describe("splitThinkTags", () => {
  it("passes through blocks with no think tags unchanged", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Hello world" },
      { type: "tool_use", id: "t1", name: "Bash", input: {} },
    ];
    expect(splitThinkTags(blocks)).toEqual(blocks);
  });

  it("splits a single text block with one think tag", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Before <think>reasoning here</think> After" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "text", text: "Before" },
      { type: "thinking", thinking: "reasoning here" },
      { type: "text", text: "After" },
    ]);
  });

  it("splits a text block with multiple think tags", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "A <think>first</think> B <think>second</think> C" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "text", text: "A" },
      { type: "thinking", thinking: "first" },
      { type: "text", text: "B" },
      { type: "thinking", thinking: "second" },
      { type: "text", text: "C" },
    ]);
  });

  it("handles think tag at the start of text", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "<think>reasoning</think> Response text" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "thinking", thinking: "reasoning" },
      { type: "text", text: "Response text" },
    ]);
  });

  it("handles think tag at the end of text", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Some text <think>final thought</think>" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "text", text: "Some text" },
      { type: "thinking", thinking: "final thought" },
    ]);
  });

  it("handles text that is entirely a think block", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "<think>all thinking</think>" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "thinking", thinking: "all thinking" },
    ]);
  });

  it("preserves native thinking blocks unchanged", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "native thinking" },
      { type: "text", text: "some text" },
    ];
    expect(splitThinkTags(blocks)).toEqual(blocks);
  });

  it("handles mixed native thinking + text-with-think-tags", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "native" },
      { type: "text", text: "A <think>parsed</think> B" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "thinking", thinking: "native" },
      { type: "text", text: "A" },
      { type: "thinking", thinking: "parsed" },
      { type: "text", text: "B" },
    ]);
  });

  it("filters empty thinking content from split", () => {
    // Empty think tags produce no thinking block
    const blocks: ContentBlock[] = [
      { type: "text", text: "Before <think>  </think> After" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "text", text: "Before" },
      { type: "text", text: "After" },
    ]);
  });

  it("handles unclosed think tag by returning original text", () => {
    // The regex only matches complete <think>...</think> pairs,
    // so unclosed tags leave the text as-is.
    const blocks: ContentBlock[] = [
      { type: "text", text: "Hello <think>incomplete" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "text", text: "Hello <think>incomplete" },
    ]);
  });

  it("handles multiline think content", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "Start\n<think>\nLine 1\nLine 2\n</think>\nEnd" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "text", text: "Start" },
      { type: "thinking", thinking: "Line 1\nLine 2" },
      { type: "text", text: "End" },
    ]);
  });

  it("preserves tool_use and tool_result blocks unchanged", () => {
    const blocks: ContentBlock[] = [
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/x" } },
      { type: "tool_result", tool_use_id: "t1", content: "ok" },
      { type: "text", text: "<think>thought</think> answer" },
    ];
    const result = splitThinkTags(blocks);
    expect(result).toEqual([
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/x" } },
      { type: "tool_result", tool_use_id: "t1", content: "ok" },
      { type: "thinking", thinking: "thought" },
      { type: "text", text: "answer" },
    ]);
  });
});

// ─── stripThinkTagsFromText ─────────────────────────────────────────────────

describe("stripThinkTagsFromText", () => {
  it("strips completed think tags from text", () => {
    const result = stripThinkTagsFromText("Hello <think>reasoning</think> world");
    expect(result).toBe("Hello  world");
  });

  it("strips multiple think tags", () => {
    const result = stripThinkTagsFromText("<think>a</think> X <think>b</think> Y");
    expect(result).toBe("X  Y");
  });

  it("returns text unchanged when no think tags present", () => {
    expect(stripThinkTagsFromText("no tags here")).toBe("no tags here");
  });

  it("returns empty string when text is only a think block", () => {
    expect(stripThinkTagsFromText("<think>all thinking</think>")).toBe("");
  });
});

// ─── isBogusThinkingBlock ───────────────────────────────────────────────────

describe("isBogusThinkingBlock", () => {
  it("returns true for empty thinking content", () => {
    expect(isBogusThinkingBlock({ type: "thinking", thinking: "" })).toBe(true);
  });

  it("returns true for whitespace-only thinking content", () => {
    expect(isBogusThinkingBlock({ type: "thinking", thinking: "   \n  " })).toBe(true);
  });

  it("returns false for thinking with actual content", () => {
    expect(isBogusThinkingBlock({ type: "thinking", thinking: "reasoning" })).toBe(false);
  });

  it("returns false for non-thinking block types", () => {
    expect(isBogusThinkingBlock({ type: "text", text: "" })).toBe(false);
  });
});

// ─── enrichThinkingOnlyMessages ─────────────────────────────────────────────

describe("enrichThinkingOnlyMessages", () => {
  it("adds result text when only thinking blocks exist", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "reasoning" },
    ];
    const result = enrichThinkingOnlyMessages(blocks, "Final answer");
    expect(result).toEqual([
      { type: "thinking", thinking: "reasoning" },
      { type: "text", text: "Final answer" },
    ]);
  });

  it("returns blocks unchanged when text blocks exist", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "reasoning" },
      { type: "text", text: "visible text" },
    ];
    const result = enrichThinkingOnlyMessages(blocks, "Final answer");
    expect(result).toBe(blocks);
  });

  it("returns blocks unchanged when no result text provided", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "reasoning" },
    ];
    const result = enrichThinkingOnlyMessages(blocks);
    expect(result).toBe(blocks);
  });

  it("does not count whitespace-only text as visible", () => {
    const blocks: ContentBlock[] = [
      { type: "thinking", thinking: "reasoning" },
      { type: "text", text: "   " },
    ];
    const result = enrichThinkingOnlyMessages(blocks, "Answer");
    expect(result).toEqual([
      { type: "thinking", thinking: "reasoning" },
      { type: "text", text: "   " },
      { type: "text", text: "Answer" },
    ]);
  });
});

// ─── hasOpenThinkTag ────────────────────────────────────────────────────────

describe("hasOpenThinkTag", () => {
  it("returns true when there is an unclosed think tag", () => {
    expect(hasOpenThinkTag("Hello <think>reasoning in progress")).toBe(true);
  });

  it("returns false when all think tags are closed", () => {
    expect(hasOpenThinkTag("<think>done</think> answer")).toBe(false);
  });

  it("returns false when there are no think tags", () => {
    expect(hasOpenThinkTag("plain text")).toBe(false);
  });

  it("returns true with mixed closed and open tags", () => {
    expect(hasOpenThinkTag("<think>a</think> <think>still open")).toBe(true);
  });

  it("returns false when open and close counts match", () => {
    expect(hasOpenThinkTag("<think>a</think><think>b</think>")).toBe(false);
  });
});

// ─── extractVisibleText ─────────────────────────────────────────────────────

describe("extractVisibleText", () => {
  it("removes completed think blocks from text", () => {
    expect(extractVisibleText("A <think>hidden</think> B")).toBe("A  B");
  });

  it("removes open think tag and everything after it", () => {
    expect(extractVisibleText("Visible <think>still thinking...")).toBe("Visible");
  });

  it("handles text with both completed and open think tags", () => {
    const text = "<think>done</think> Middle <think>still going";
    expect(extractVisibleText(text)).toBe("Middle");
  });

  it("returns full text when no think tags present", () => {
    expect(extractVisibleText("just text")).toBe("just text");
  });

  it("returns empty string when everything is in think tags", () => {
    expect(extractVisibleText("<think>all hidden</think>")).toBe("");
  });
});
