import path from "path";

export const DEFAULT_COLLECTION_NAME = "vault";
export const DEFAULT_VAULT_MASK = "**/*.md";

export type VaultConfigInput = {
  vaultPath?: string;
  collectionName?: string;
  gitRemote?: string;
  gitBranch?: string;
  gitSync?: boolean;
  gitAutoCommit?: boolean;
  autoInstallQmd?: boolean;
  mask?: string;
};

export type VaultConfig = {
  vaultPath: string;
  collectionName: string;
  gitRemote?: string;
  gitBranch: string;
  gitSync: boolean;
  gitAutoCommit: boolean;
  autoInstallQmd: boolean;
  mask: string;
};

export type NoteSource = {
  title: string;
  url?: string;
};

export type NoteFrontmatter = {
  title: string;
  summary?: string;
  tags?: string[];
  people?: string[];
  projects?: string[];
  sources?: NoteSource[];
  status?: string;
  created?: string;
  updated?: string;
};

export type NoteInput = {
  title: string;
  body: string;
  summary?: string;
  tags?: string[];
  people?: string[];
  projects?: string[];
  sources?: NoteSource[];
  status?: string;
  relativePath?: string;
  overwrite?: boolean;
};

export function normalizeConfig(input: VaultConfigInput | undefined): VaultConfig {
  if (!input?.vaultPath || typeof input.vaultPath !== "string") {
    throw new Error("vaultPath is required in plugin config");
  }

  return {
    vaultPath: input.vaultPath,
    collectionName: input.collectionName || DEFAULT_COLLECTION_NAME,
    gitRemote: input.gitRemote,
    gitBranch: input.gitBranch || "main",
    gitSync: input.gitSync ?? Boolean(input.gitRemote),
    gitAutoCommit: input.gitAutoCommit ?? true,
    autoInstallQmd: input.autoInstallQmd ?? true,
    mask: input.mask || DEFAULT_VAULT_MASK,
  };
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return slug || "note";
}

export function normalizeList(values?: string[]): string[] | undefined {
  if (!values) return undefined;
  const trimmed = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return trimmed.length > 0 ? trimmed : undefined;
}

export function resolveNotePath(vaultPath: string, input: NoteInput): {
  relativePath: string;
  fullPath: string;
} {
  const relativePath = input.relativePath
    ? input.relativePath
    : path.join("notes", `${slugify(input.title)}.md`);
  const fullPath = path.join(vaultPath, relativePath);
  return { relativePath, fullPath };
}

function yamlString(value: string): string {
  const escaped = value.replace(/"/g, "\\\"");
  return `"${escaped}"`;
}

function yamlArray(key: string, values?: string[]): string[] {
  if (!values || values.length === 0) return [];
  const lines = ["", `${key}:`];
  values.forEach((value) => {
    lines.push(`  - ${yamlString(value)}`);
  });
  return lines;
}

function yamlSources(sources?: NoteSource[]): string[] {
  if (!sources || sources.length === 0) return [];
  const lines = ["", "sources:"];
  sources.forEach((source) => {
    lines.push(`  - title: ${yamlString(source.title)}`);
    if (source.url) {
      lines.push(`    url: ${yamlString(source.url)}`);
    }
  });
  return lines;
}

export function buildFrontmatter(frontmatter: NoteFrontmatter): string {
  const created = frontmatter.created || new Date().toISOString();
  const updated = frontmatter.updated || created;

  const lines = ["---", `title: ${yamlString(frontmatter.title)}`];

  if (frontmatter.summary) {
    lines.push(`summary: ${yamlString(frontmatter.summary)}`);
  }

  if (frontmatter.status) {
    lines.push(`status: ${yamlString(frontmatter.status)}`);
  }

  lines.push(`created: ${yamlString(created)}`);
  lines.push(`updated: ${yamlString(updated)}`);

  lines.push(...yamlArray("tags", normalizeList(frontmatter.tags)));
  lines.push(...yamlArray("people", normalizeList(frontmatter.people)));
  lines.push(...yamlArray("projects", normalizeList(frontmatter.projects)));
  lines.push(...yamlSources(frontmatter.sources));

  lines.push("---", "");
  return lines.join("\n");
}

export function buildNoteContents(input: NoteInput): string {
  const frontmatter = buildFrontmatter({
    title: input.title,
    summary: input.summary,
    tags: input.tags,
    people: input.people,
    projects: input.projects,
    sources: input.sources,
    status: input.status,
  });

  return `${frontmatter}${input.body.trim()}\n`;
}

export function parseCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return values.length > 0 ? values : undefined;
}
