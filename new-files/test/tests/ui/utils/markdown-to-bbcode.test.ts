import { markdownToBBCode } from "#ui/utils/markdown-to-bbcode";
import { describe, expect, it } from "vitest";

describe("Ui - Utils - markdown-to-bbcode", () => {
  it("wraps headings in [b]", () => {
    expect(markdownToBBCode("# Big update")).toBe("[b]Big update[/b]");
    expect(markdownToBBCode("### Smaller heading")).toBe("[b]Smaller heading[/b]");
  });

  it("converts bold and italic", () => {
    expect(markdownToBBCode("**bold**")).toBe("[b]bold[/b]");
    expect(markdownToBBCode("__also bold__")).toBe("[b]also bold[/b]");
    expect(markdownToBBCode("*italic*")).toBe("[i]italic[/i]");
    expect(markdownToBBCode("_also italic_")).toBe("[i]also italic[/i]");
  });

  it("converts inline code to a colored span", () => {
    expect(markdownToBBCode("`code`")).toBe("[color=#ffe066]code[/color]");
  });

  it("converts bullet lines to a bullet prefix, not italics", () => {
    expect(markdownToBBCode("- fixed a bug")).toBe("• fixed a bug");
    expect(markdownToBBCode("* fixed another bug")).toBe("• fixed another bug");
  });

  it("keeps markdown link text and drops the URL", () => {
    expect(markdownToBBCode("See [the changelog](https://example.com/notes) for details")).toBe(
      "See the changelog for details",
    );
  });

  it("neutralizes stray brackets so they can't be read as BBCode tags", () => {
    const result = markdownToBBCode("Gained [Speed] boost");
    expect(result).not.toContain("[Speed]");
    expect(result).not.toMatch(/\[.*\]/);
  });

  it("processes multiple lines independently", () => {
    const input = "# Changelog\n- **Fixed** a `crash`\n- Added *new* content";
    const result = markdownToBBCode(input);
    expect(result.split("\n")).toEqual([
      "[b]Changelog[/b]",
      "• [b]Fixed[/b] a [color=#ffe066]crash[/color]",
      "• Added [i]new[/i] content",
    ]);
  });
});
