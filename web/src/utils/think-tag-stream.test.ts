import { describe, it, expect } from "vitest";
import { cleanStreamingThinkTags } from "./think-tag-stream.js";

describe("cleanStreamingThinkTags", () => {
  it("returns original text when no think tags present", () => {
    const result = cleanStreamingThinkTags("Hello world");
    expect(result).toEqual({ display: "Hello world", isThinking: false });
  });

  it("strips completed think blocks and marks as not thinking", () => {
    const result = cleanStreamingThinkTags("<think>done</think> Answer");
    expect(result).toEqual({ display: "Answer", isThinking: false });
  });

  it("detects open think tag and hides content after it", () => {
    const result = cleanStreamingThinkTags("Prefix <think>still going...");
    expect(result).toEqual({ display: "Prefix", isThinking: true });
  });

  it("handles mix of completed and open think tags", () => {
    const result = cleanStreamingThinkTags(
      "<think>first</think> Middle <think>second still open",
    );
    expect(result).toEqual({ display: "Middle", isThinking: true });
  });

  it("returns empty display when all text is inside think tags", () => {
    const result = cleanStreamingThinkTags("<think>all thinking</think>");
    expect(result).toEqual({ display: "", isThinking: false });
  });

  it("handles text that is only an open think tag", () => {
    const result = cleanStreamingThinkTags("<think>reasoning");
    expect(result).toEqual({ display: "", isThinking: true });
  });

  it("strips trailing partial <think tag prefixes", () => {
    // Single '<' at end
    expect(cleanStreamingThinkTags("Hello <").display).toBe("Hello");
    // Partial '<th' at end
    expect(cleanStreamingThinkTags("Hello <th").display).toBe("Hello");
    // Partial '<thin' at end
    expect(cleanStreamingThinkTags("Hello <thin").display).toBe("Hello");
    // Partial '<think' at end (no '>')
    expect(cleanStreamingThinkTags("Hello <think").display).toBe("Hello");
    // Full tag should still be handled by the existing logic, not this regex
    expect(cleanStreamingThinkTags("Hello <think>reasoning").display).toBe("Hello");
  });
});
