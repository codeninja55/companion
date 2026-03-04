/** Strip completed <think>...</think> from streaming display */
export function cleanStreamingThinkTags(raw: string): {
  display: string;
  isThinking: boolean;
} {
  const openCount = (raw.match(/<think>/g) || []).length;
  const closeCount = (raw.match(/<\/think>/g) || []).length;
  const isThinking = openCount > closeCount;

  // Remove completed think blocks
  let display = raw.replace(/<think>[\s\S]*?<\/think>/g, "");
  // Remove open think tag and everything after (currently thinking)
  const openIdx = display.lastIndexOf("<think>");
  if (openIdx !== -1) {
    display = display.slice(0, openIdx);
  }
  return { display: display.trim(), isThinking };
}
