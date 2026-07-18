/**
 * Converts the practical subset of markdown a release changelog actually
 * uses into BBCode tags for `BBCodeText` (`#ui/text`'s `addBBCodeTextObject`,
 * already used elsewhere for colored dialogue text). Not a full CommonMark
 * implementation — just headings, bold/italic, inline code, bullet lists,
 * and links (rendered as text only, since this is a small canvas with no
 * clickable-hyperlink support).
 */

// Full-width lookalikes, not real "[" / "]" - used to neutralize any bracket
// in the source text that isn't part of a markdown link, so it can't be
// misread as a BBCode tag once we start emitting our own.
const BRACKET_OPEN_ESCAPE = "［"; // ［
const BRACKET_CLOSE_ESCAPE = "］"; // ］

const CODE_COLOR = "#ffe066";

function processInline(text: string): string {
  let result = text;

  // Markdown links: keep the label, drop the URL - must run before bracket
  // escaping, since this is the one legitimate use of "[...]" we want to consume.
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

  // Any remaining brackets are either stray/unbalanced or literal text -
  // neutralize them so they can't be parsed as BBCode tags.
  result = result.replace(/\[/g, BRACKET_OPEN_ESCAPE).replace(/\]/g, BRACKET_CLOSE_ESCAPE);

  // Bold before italic, so "**x**" isn't first consumed by the single-"*" rule.
  result = result.replace(/\*\*([^*]+)\*\*/g, "[b]$1[/b]");
  result = result.replace(/__([^_]+)__/g, "[b]$1[/b]");
  result = result.replace(/\*([^*]+)\*/g, "[i]$1[/i]");
  result = result.replace(/_([^_]+)_/g, "[i]$1[/i]");

  result = result.replace(/`([^`]+)`/g, `[color=${CODE_COLOR}]$1[/color]`);

  return result;
}

export function markdownToBBCode(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => {
      const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
      if (headingMatch) {
        return `[b]${processInline(headingMatch[1])}[/b]`;
      }

      const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
      if (bulletMatch) {
        return `• ${processInline(bulletMatch[1])}`;
      }

      return processInline(line);
    })
    .join("\n");
}
