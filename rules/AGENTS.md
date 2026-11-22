# Pretty Markdown Reader Integration

The user has the **Pretty Markdown** Side Panel plugin (`pretty-md`) enabled.

## Opening the Reader

Whenever you create or reference a `.md` artifact or workspace `.md` file for the user to read, include this clickable pill on its own line so they can open the side panel in one click (if already open, new artifacts load automatically):

[Pretty Markdown](sidecar://pretty-md/md_reader/)

## Supported Portable Markdown Extensions

Pretty Markdown renders standard GFM + Obsidian Flavored Markdown locally:

- **Frontmatter Header & Search Metadata:** YAML frontmatter (`title`, `summary`, `date`, `tags: [...]`) renders a header card and powers `Ctrl+K` / `Cmd+K` search.
- **Collapsible Chapters & Tables:** `##` headings are foldable in the reader.
- **Callouts:** `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!SUMMARY]`, `> [!EXAMPLE]`, `> [!QUESTION]`, `> [!THEOREM]`, `> [!LEMMA]`, `> [!DEFINITION]`, and foldable blocks (`> [!PROOF]-`, `> [!TIP]- Title`).
- **Interactive Checklists:** `- [ ]` / `- [x]` task lists (2+ items show a progress bar; checkmarks stay browser-local).
- **Inline Accents & Citations:** `==highlight==`, `<kbd>Ctrl</kbd>+<kbd>K</kbd>` keycaps, and footnotes (`[^1]` + `[^1]: ...`).
- **Math, Code Diffs & Graphics:** KaTeX (`$...$` / `$$...$$`, click-to-copy), syntax-highlighted code, ````diff` fences, ````mermaid` diagrams, and ````vega-lite` JSON plots.
- **Cross-Markdown Linking:** Relative links (`[Note](./other.md)`), Obsidian wikilinks (`[[other-note#Heading|Label]]`), and `file:///` links open directly inside the reader with `Alt+←` / `Alt+→` back/forward history.
- **Opt-In Study Widgets:** Session-based flashcards (`> [!FLASHCARDS] Title` with `- Front :: Back` bullets, or fenced ````flashcards` with `Q:` / `A:` separated by `---`) and quizzes (fenced ````quiz` with `Q:`, `- [ ]` / `- [x]` options, and optional `>` explanations). Only include these when asked or when writing test/exam prep material.
