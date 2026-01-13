import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  buildNoteContents,
  normalizeConfig,
  parseCsv,
  resolveNotePath,
  type NoteInput,
  type VaultConfig,
  type VaultConfigInput,
} from "./vault.js";

const PLUGIN_ID = "clawd-plugin-vault";
const PLUGIN_NAME = "Clawdbot Vault";

const VAULT_GUIDE = `# Vault Guide\n\nThis vault is a local-first knowledge base designed to be searchable and durable.\n\n## Structure\n\n- inbox/ -> quick captures and raw ideas\n- notes/ -> evergreen notes and cleaned-up knowledge\n- people/ -> bios, conversations, and relationship notes\n- projects/ -> project briefs, decision logs, and retrospectives\n- concepts/ -> definitions, frameworks, and mental models\n- logs/ -> daily notes and activity logs\n\n## Frontmatter Framework\n\nEvery note should start with YAML frontmatter.\n\nRequired:\n- title\n- created\n- updated\n\nRecommended:\n- summary: one sentence for quick scanning\n- status: seed | sprout | evergreen | stale\n- tags: topical keywords for clustering\n- people: names or handles\n- projects: related project names\n- sources: [{ title, url }]\n\nExample:\n\n---\ntitle: "Decision: Use QMD for search"\nsummary: "Why the vault uses qmd for embeddings and querying"\nstatus: "evergreen"\ncreated: "2026-01-03T12:00:00.000Z"\nupdated: "2026-01-03T12:00:00.000Z"\ntags:\n  - "search"\n  - "qmd"\npeople:\n  - "Pedro"\nprojects:\n  - "Vault"\nsources:\n  - title: "QMD README"\n    url: "https://github.com/tobi/qmd"\n---\n\nBody starts here.\n`;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function execShell(command: string): string {
  return execSync(command, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: "/bin/bash",
  }).trim();
}

function commandExists(command: string): boolean {
  try {
    execShell(`command -v ${command}`);
    return true;
  } catch {
    return false;
  }
}

function ensureQmdInstalled(config: VaultConfig, logger: Console): void {
  if (commandExists("qmd")) return;

  if (!config.autoInstallQmd) {
    throw new Error("qmd is not installed and autoInstallQmd is disabled");
  }

  if (commandExists("bun")) {
    logger.info("Installing qmd via bun...");
    execShell("bun install -g https://github.com/tobi/qmd");
    return;
  }

  if (commandExists("npm")) {
    logger.info("Installing qmd via npm...");
    execShell("npm install -g https://github.com/tobi/qmd");
    return;
  }

  throw new Error("qmd is not installed and neither bun nor npm were found");
}

function runQmd(args: string[]): string {
  const command = ["qmd", ...args.map(shellQuote)].join(" ");
  return execShell(command);
}

function ensureVaultDirectory(vaultPath: string): void {
  fs.mkdirSync(vaultPath, { recursive: true });
}

function ensureVaultGuide(vaultPath: string): void {
  const guidePath = path.join(vaultPath, "VAULT_GUIDE.md");
  if (!fs.existsSync(guidePath)) {
    fs.writeFileSync(guidePath, VAULT_GUIDE, "utf-8");
  }
}

function initVaultStructure(vaultPath: string): void {
  const folders = ["inbox", "notes", "people", "projects", "concepts", "logs"];
  folders.forEach((folder) => {
    fs.mkdirSync(path.join(vaultPath, folder), { recursive: true });
  });
}

function ensureCollection(config: VaultConfig): void {
  try {
    runQmd([
      "collection",
      "add",
      config.vaultPath,
      "--name",
      config.collectionName,
      "--mask",
      config.mask,
    ]);
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("exists")) return;
    throw error;
  }
}

function isGitRepo(vaultPath: string): boolean {
  try {
    execShell(`git -C ${shellQuote(vaultPath)} rev-parse --is-inside-work-tree`);
    return true;
  } catch {
    return false;
  }
}

function listGitRemotes(vaultPath: string): string[] {
  try {
    const output = execShell(`git -C ${shellQuote(vaultPath)} remote`);
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function looksLikeRemoteUrl(value: string): boolean {
  return value.includes("://") || value.endsWith(".git") || value.includes("@");
}

function ensureGitRepo(config: VaultConfig, logger: Console): boolean {
  if (isGitRepo(config.vaultPath)) return true;
  if (!config.gitRemote) return false;

  execShell(`git -C ${shellQuote(config.vaultPath)} init`);
  logger.info("Initialized git repository for vault.");

  const remotes = listGitRemotes(config.vaultPath);
  if (looksLikeRemoteUrl(config.gitRemote)) {
    if (!remotes.includes("origin")) {
      execShell(
        `git -C ${shellQuote(config.vaultPath)} remote add origin ${shellQuote(config.gitRemote)}`
      );
      logger.info("Added origin remote for vault.");
    }
  }

  return true;
}

function resolveGitRemote(config: VaultConfig): string | null {
  const remotes = listGitRemotes(config.vaultPath);
  if (config.gitRemote && remotes.includes(config.gitRemote)) {
    return config.gitRemote;
  }

  if (config.gitRemote && looksLikeRemoteUrl(config.gitRemote)) {
    if (remotes.includes("origin")) return "origin";
    return null;
  }

  if (remotes.includes("origin")) return "origin";
  return remotes[0] || null;
}

function gitPull(config: VaultConfig): void {
  const remote = resolveGitRemote(config);
  if (!remote) return;
  execShell(
    `git -C ${shellQuote(config.vaultPath)} pull --rebase ${shellQuote(remote)} ${shellQuote(config.gitBranch)}`
  );
}

function gitHasChanges(config: VaultConfig): boolean {
  const output = execShell(
    `git -C ${shellQuote(config.vaultPath)} status --porcelain`
  );
  return output.length > 0;
}

function gitCommit(config: VaultConfig, message: string): void {
  execShell(`git -C ${shellQuote(config.vaultPath)} add -A`);
  try {
    execShell(
      `git -C ${shellQuote(config.vaultPath)} commit -m ${shellQuote(message)}`
    );
  } catch (error: any) {
    const messageText = String(error?.message || "");
    if (messageText.includes("nothing to commit")) return;
    throw error;
  }
}

function gitPush(config: VaultConfig): void {
  const remote = resolveGitRemote(config);
  if (!remote) return;
  execShell(
    `git -C ${shellQuote(config.vaultPath)} push ${shellQuote(remote)} ${shellQuote(config.gitBranch)}`
  );
}

function syncBefore(config: VaultConfig, logger: Console): void {
  if (!config.gitSync) return;
  if (!ensureGitRepo(config, logger)) return;
  gitPull(config);
}

function syncAfter(config: VaultConfig, logger: Console, message: string): void {
  if (!config.gitSync) return;
  if (!ensureGitRepo(config, logger)) return;

  if (!gitHasChanges(config)) return;

  if (config.gitAutoCommit) {
    gitCommit(config, message);
  }

  gitPush(config);
}

function updateIndex(config: VaultConfig): void {
  runQmd(["update"]);
}

function embedIndex(config: VaultConfig, force?: boolean): void {
  const args = ["embed"];
  if (force) args.push("-f");
  runQmd(args);
}

function queryVault(
  config: VaultConfig,
  query: string,
  mode: "search" | "vsearch" | "query",
  options: { limit?: number; minScore?: number; json?: boolean }
): any {
  const args = [mode, query, "-c", config.collectionName];
  if (options.limit) {
    args.push("-n", String(options.limit));
  }
  if (options.minScore !== undefined) {
    args.push("--min-score", String(options.minScore));
  }
  if (options.json !== false) {
    args.push("--json");
  }

  const output = runQmd(args);
  if (options.json === false) return output;

  try {
    return JSON.parse(output);
  } catch {
    return output;
  }
}

function readConfig(api: any): VaultConfig {
  const entries = api?.config?.plugins?.entries || {};
  const entryConfig =
    entries[PLUGIN_ID]?.config || entries.vault?.config || entries[PLUGIN_NAME]?.config;

  const config: VaultConfigInput = {
    ...(entryConfig || {}),
  };

  if (!config.vaultPath && process.env.VAULT_PATH) {
    config.vaultPath = process.env.VAULT_PATH;
  }

  return normalizeConfig(config);
}

function createLogger(api: any): Console {
  return api?.logger || console;
}

function addNote(config: VaultConfig, note: NoteInput, logger: Console): string {
  ensureVaultDirectory(config.vaultPath);
  ensureVaultGuide(config.vaultPath);
  initVaultStructure(config.vaultPath);

  syncBefore(config, logger);

  const { relativePath, fullPath } = resolveNotePath(config.vaultPath, note);

  if (!note.overwrite && fs.existsSync(fullPath)) {
    throw new Error(`Note already exists at ${relativePath}`);
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const contents = buildNoteContents(note);
  fs.writeFileSync(fullPath, contents, "utf-8");

  updateIndex(config);

  syncAfter(config, logger, `vault: add ${relativePath}`);

  return relativePath;
}

export default {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  configSchema: {
    parse: (value: unknown) => value as VaultConfigInput,
    uiHints: {
      vaultPath: { label: "Vault Path", placeholder: "/Users/you/Vault" },
      collectionName: { label: "QMD Collection Name", placeholder: "vault" },
      gitRemote: { label: "Git Remote", placeholder: "origin" },
      gitBranch: { label: "Git Branch", placeholder: "main" },
      gitSync: { label: "Git Sync", description: "Pull before and push after changes." },
      gitAutoCommit: { label: "Git Auto Commit" },
      autoInstallQmd: { label: "Auto Install QMD" },
      mask: { label: "File Mask", placeholder: "**/*.md" },
    },
  },
  register(api: any) {
    const logger = createLogger(api);
    const config = readConfig(api);

    ensureVaultDirectory(config.vaultPath);
    ensureQmdInstalled(config, logger);
    ensureCollection(config);

    api.registerCli(
      ({ program }: any) => {
        const vault = program.command("vault").description("Local vault management");

        vault
          .command("init")
          .description("Initialize vault folders and guide")
          .action(() => {
            ensureVaultDirectory(config.vaultPath);
            initVaultStructure(config.vaultPath);
            ensureVaultGuide(config.vaultPath);
            console.log(`Vault initialized at ${config.vaultPath}`);
          });

        vault
          .command("add <title> [content...]")
          .option("-p, --path <relativePath>", "Relative path for the note")
          .option("-s, --summary <summary>", "One-line summary")
          .option("-t, --tags <tags>", "Comma-separated tags")
          .option("-P, --people <people>", "Comma-separated people")
          .option("-r, --projects <projects>", "Comma-separated projects")
          .option("-S, --status <status>", "Note status (seed|sprout|evergreen|stale)")
          .option("-e, --embed", "Run qmd embed after writing")
          .option("-o, --overwrite", "Overwrite existing note", false)
          .description("Add a note to the vault")
          .action((title: string, contentParts: string[], options: any) => {
            const body = contentParts.join(" ").trim();
            if (!body) {
              throw new Error("Note body is required");
            }

            const relativePath = addNote(
              config,
              {
                title,
                body,
                summary: options.summary,
                tags: parseCsv(options.tags),
                people: parseCsv(options.people),
                projects: parseCsv(options.projects),
                status: options.status,
                relativePath: options.path,
                overwrite: options.overwrite,
              },
              logger
            );

            if (options.embed) {
              embedIndex(config);
            }

            console.log(`Saved ${relativePath}`);
          });

        vault
          .command("query <query>")
          .option("-m, --mode <mode>", "search | vsearch | query", "query")
          .option("-n, --limit <limit>", "Limit results", "5")
          .option("--min-score <score>", "Minimum score", "0")
          .description("Query the vault with qmd")
          .action((query: string, options: any) => {
            syncBefore(config, logger);
            const mode = options.mode as "search" | "vsearch" | "query";
            const limit = parseInt(options.limit, 10);
            const minScore = parseFloat(options.minScore);
            const results = queryVault(config, query, mode, {
              limit,
              minScore,
              json: false,
            });
            console.log(results);
          });

        vault
          .command("get <docidOrPath>")
          .option("-l, --lines <lines>", "Max lines", "200")
          .description("Get a document by path or docid")
          .action((docidOrPath: string, options: any) => {
            syncBefore(config, logger);
            const output = runQmd(["get", docidOrPath, "-l", String(options.lines)]);
            console.log(output);
          });

        vault
          .command("index")
          .option("-e, --embed", "Run qmd embed")
          .description("Refresh qmd index for the vault")
          .action((options: any) => {
            syncBefore(config, logger);
            updateIndex(config);
            if (options.embed) {
              embedIndex(config);
            }
            console.log("Vault index updated");
          });

        vault
          .command("embed")
          .option("-f, --force", "Force re-embed")
          .description("Generate embeddings for the vault")
          .action((options: any) => {
            syncBefore(config, logger);
            embedIndex(config, options.force);
            console.log("Embeddings generated");
          });

        vault
          .command("status")
          .description("Show qmd status")
          .action(() => {
            syncBefore(config, logger);
            const output = runQmd(["status"]);
            console.log(output);
          });
      },
      { commands: ["vault"] }
    );

    api.registerTool({
      name: "vault_add_note",
      description: "Create a markdown note inside the vault with structured frontmatter.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          summary: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          people: { type: "array", items: { type: "string" } },
          projects: { type: "array", items: { type: "string" } },
          status: { type: "string" },
          relativePath: { type: "string" },
          overwrite: { type: "boolean" },
        },
        required: ["title", "body"],
      },
      async execute(_id: string, params: NoteInput) {
        const relativePath = addNote(config, params, logger);
        return {
          content: [
            {
              type: "text",
              text: `Saved ${relativePath}`,
            },
          ],
        };
      },
    });

    api.registerTool({
      name: "vault_query",
      description: "Query the vault using qmd search, vsearch, or query.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: { type: "string", enum: ["search", "vsearch", "query"] },
          limit: { type: "number" },
          minScore: { type: "number" },
        },
        required: ["query"],
      },
      async execute(_id: string, params: any) {
        syncBefore(config, logger);
        const results = queryVault(config, params.query, params.mode || "query", {
          limit: params.limit,
          minScore: params.minScore,
          json: true,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      },
    });

    api.registerTool({
      name: "vault_embed",
      description: "Generate embeddings for the vault using qmd embed.",
      parameters: {
        type: "object",
        properties: {
          force: { type: "boolean" },
        },
      },
      async execute(_id: string, params: any) {
        syncBefore(config, logger);
        embedIndex(config, params?.force);
        return {
          content: [
            {
              type: "text",
              text: "Embeddings generated",
            },
          ],
        };
      },
    });

    api.registerGatewayMethod("vault.query", async (params: any) => {
      syncBefore(config, logger);
      return queryVault(config, params.query, params.mode || "query", {
        limit: params.limit,
        minScore: params.minScore,
        json: true,
      });
    });

    api.registerGatewayMethod("vault.add", async (params: NoteInput) => {
      const relativePath = addNote(config, params, logger);
      return { path: relativePath };
    });
  },
};
