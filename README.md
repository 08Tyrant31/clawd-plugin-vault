# 🗃️ Clawdbot Vault Plugin

[![CI](https://github.com/pepicrft/clawd-plugin-vault/actions/workflows/ci.yml/badge.svg)](https://github.com/pepicrft/clawd-plugin-vault/actions/workflows/ci.yml)

A Clawdbot plugin that turns a local directory into a structured knowledge vault. It replaces Obsidian by keeping everything in plain markdown, but still delivers fast semantic search and embeddings through [qmd](https://github.com/tobi/qmd).

## ✨ Features

- 📁 Local-first vault directory with opinionated structure
- 🧠 QMD-powered search (keyword, semantic, hybrid)
- 🧾 Frontmatter framework for tags, people, projects, sources
- 🔁 Optional git sync (pull before, push after)
- 🧰 CLI + tools + Gateway RPC
- 🤖 Auto-installs qmd via bun or npm when missing

## 📦 Installation

```bash
clawdbot plugins install clawd-plugin-vault
```

Or from GitHub:

```bash
clawdbot plugins install github:pepicrft/clawd-plugin-vault
```

## ⚙️ Configuration

Add to your Clawdbot config:

```json5
{
  plugins: {
    entries: {
      "clawd-plugin-vault": {
        enabled: true,
        config: {
          vaultPath: "/Users/you/Vault",
          collectionName: "vault",
          gitRemote: "origin",
          gitBranch: "main",
          gitSync: true,
          gitAutoCommit: true,
          autoInstallQmd: true,
          mask: "**/*.md"
        }
      }
    }
  }
}
```

## 🗂️ Vault Framework

### Folder Convention

- inbox/ -> raw captures and quick dumps
- notes/ -> evergreen notes and cleaned-up knowledge
- people/ -> bios, conversations, relationship notes
- projects/ -> project briefs, decision logs, retrospectives
- concepts/ -> definitions, frameworks, mental models
- logs/ -> daily notes and timelines

### Frontmatter Rules

Every note should start with YAML frontmatter. Required keys:

- title
- created
- updated

Recommended keys:

- summary: one-line description
- status: seed | sprout | evergreen | stale
- tags: topical keywords
- people: names or handles
- projects: related project names
- sources: [{ title, url }]

Example:

```md
---
title: "Decision: Use QMD for search"
summary: "Why the vault uses qmd for embeddings and querying"
status: "evergreen"
created: "2026-01-03T12:00:00.000Z"
updated: "2026-01-03T12:00:00.000Z"
tags:
  - "search"
  - "qmd"
people:
  - "Pedro"
projects:
  - "Vault"
sources:
  - title: "QMD README"
    url: "https://github.com/tobi/qmd"
---

Body starts here.
```

## 🚀 Usage

### CLI

```bash
# Initialize the vault structure
clawdbot vault init

# Add a note
clawdbot vault add "Decision: QMD" "We index the vault using qmd" \
  --tags search,qmd --projects Vault --status evergreen

# Query (hybrid search by default)
clawdbot vault query "knowledge systems" --mode query --limit 5

# Get a document by path or docid
clawdbot vault get "notes/decision-qmd.md"

# Refresh index
clawdbot vault index --embed
```

### Tools (for agents)

- `vault_add_note`
- `vault_query`
- `vault_embed`

### Gateway RPC

- `vault.add`
- `vault.query`

## 🔁 Git Sync

If `gitRemote` is configured (or the vault already has a remote), the plugin:

1. Pulls before reading or writing
2. Auto-commits changes (when `gitAutoCommit` is true)
3. Pushes after writing

## 🧠 QMD Setup

The plugin auto-installs `qmd` if missing:

- Uses `bun install -g https://github.com/tobi/qmd` when bun is available
- Falls back to `npm install -g https://github.com/tobi/qmd`

If you want to manage `qmd` manually, set `autoInstallQmd: false`.

## ✅ Requirements

- Node 20+
- bun or npm for installing qmd (unless qmd already installed)

## 🧪 Tests

```bash
npm test
npm run build
```
