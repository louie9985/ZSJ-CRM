import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("restricted notification Markdown", () => {
  it("keeps the frontend element whitelist aligned with the server AST whitelist without raw HTML", async () => {
    const frontend = await readFile(resolve(process.cwd(), "src/restricted-markdown.tsx"), "utf8");
    const backend = await readFile(resolve(process.cwd(), "../../packages/crm-modules/notifications/src/template.ts"), "utf8");
    expect(frontend).toContain('["p", "br", "strong", "em", "ul", "ol", "li", "blockquote", "code"]');
    expect(backend).toContain('["root", "paragraph", "text", "strong", "emphasis", "list", "listItem", "blockquote", "inlineCode", "break"]');
    expect(frontend).toContain("skipHtml");
    expect(frontend).not.toContain("dangerouslySetInnerHTML");
  });
});
