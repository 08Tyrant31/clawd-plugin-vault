import { describe, expect, it } from "vitest";
import {
  buildFrontmatter,
  buildNoteContents,
  resolveNotePath,
  slugify,
} from "../vault.js";

describe("vault helpers", () => {
  it("slugify creates stable slugs", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("  **Hello--World** ")).toBe("hello-world");
  });

  it("buildFrontmatter includes fields", () => {
    const frontmatter = buildFrontmatter({
      title: "Decision Log",
      summary: "Why the vault exists",
      tags: ["vault", "decisions"],
      people: ["Pedro"],
      projects: ["Vault"],
      status: "seed",
    });

    expect(frontmatter).toContain("title: \"Decision Log\"");
    expect(frontmatter).toContain("summary: \"Why the vault exists\"");
    expect(frontmatter).toContain("tags:");
    expect(frontmatter).toContain("people:");
    expect(frontmatter).toContain("projects:");
  });

  it("resolveNotePath defaults to notes folder", () => {
    const resolved = resolveNotePath("/vault", { title: "Hello World", body: "Body" });
    expect(resolved.relativePath).toBe("notes/hello-world.md");
    expect(resolved.fullPath).toBe("/vault/notes/hello-world.md");
  });

  it("buildNoteContents returns frontmatter + body", () => {
    const contents = buildNoteContents({
      title: "Test",
      body: "Some text",
    });

    expect(contents).toContain("title: \"Test\"");
    expect(contents).toContain("Some text");
    expect(contents.trim().endsWith("Some text")).toBe(true);
  });
});
