---
name: init
description: Initialize project context with hierarchical AGENTS.md files
descriptionForClaudeCode: Analyze codebase and create progressive context files
hints: ["$MODE", "$OUTPUT", "$DEPTH"]
---

You are an expert software architect analyzing a codebase to create context files for the Pi coding agent.

## Task

Analyze the current working directory and generate {{MODE}}-{{OUTPUT}} context files that help Pi understand this project.

## Mode: {{MODE}}

{{#if MODE === "simple"}}
Create a single AGENTS.md file at the project root ({{OUTPUT}}).

This should be a comprehensive but concise overview (~100-150 lines) covering:
- Project identity and purpose
- Technology stack (detected from config files)
- Build, test, and development commands
- Code conventions inferred from existing code
- Anti-patterns found in comments (DO NOT, NEVER, HACK, etc.)
- Project structure with non-obvious purposes noted
- Gotchas and tribal knowledge

Skip generic advice that applies to all projects. Focus on what's unique here.
{{/if}}

{{#if MODE === "deep"}}
Create a HIERARCHICAL AGENTS.md structure with progressive disclosure:

1. **Root {{OUTPUT}}** - Cross-cutting concerns, global conventions
2. **Subdirectory {{OUTPUT}} files** - Domain-specific context where complexity warrants it

Scoring matrix for subdirectories:
- File count >20 (3x weight)
- Subdirectory count >5 (2x weight)
- Code ratio >70% (2x weight)
- Has unique config (.eslintrc, etc.) (2x weight)
- Module boundary (index.ts, __init__.py) (3x weight)
- Symbol density >30 (2x weight, if LSP available)
- Export count >10 (2x weight, if LSP available)
- Reference centrality >20 refs (3x weight)

Decision rules:
- Score >15: Create subdirectory {{OUTPUT}}
- Score 8-15: Create if distinct domain
- Score <8: Skip (parent covers it)

Child files must NEVER repeat parent content. Only add what's unique to that directory.

Max depth: {{DEPTH}}
{{/if}}

{{#if MODE === "skill"}}
Create a Pi skill at `.pi/skills/project/`:
- SKILL.md - Skill definition and activation triggers
- rules/ directory with modular context files
- This makes the context version-controllable and shareable
{{/if}}

## Output Format

{{#if MODE === "simple"}}
```markdown
# Project Context

**Generated:** {{TIMESTAMP}} by pi /init
**Source:** Auto-analysis of codebase

## Overview
{1-2 sentences: what this project does}

## Technology Stack
{Detected from package.json, go.mod, Cargo.toml, pyproject.toml, etc.}

## Build & Development
```bash
{Commands to build, test, run dev server, lint, etc.}
```

## Testing
{How to run single test, test patterns, test frameworks used}

## Code Conventions
{Inferred from reading 3-5 representative files}
- Naming patterns
- File organization
- Error handling style
- Import patterns

## Anti-Patterns (Detected)
{From comments: DO NOT, NEVER, HACK, XXX, FIXME with context}
{From existing rules files: .cursorrules, .github/copilot-instructions.md}

## Project Structure
```
{tree with non-obvious purposes noted}
```

## Notes
{Gotchas, tribal knowledge, quirks of this codebase}
```
{{/if}}

{{#if MODE === "deep"}}
Root {{OUTPUT}}:
```markdown
# PROJECT KNOWLEDGE BASE

**Generated:** {{TIMESTAMP}}
**Mode:** deep (hierarchical)

## OVERVIEW
{Cross-cutting project identity}

## STRUCTURE
{High-level organization}

## GLOBAL CONVENTIONS
{Apply everywhere}

## ANTI-PATTERNS (GLOBAL)
{Never do these}

## COMMANDS
```bash
{Root-level build/test/dev}
```
```

Subdirectory {{OUTPUT}} (example):
```markdown
# {DIRECTORY} Context

**Scope:** {Specific domain}

## Local Conventions
{What's different here vs parent}

## Module Boundaries
{API contracts, public interfaces}

## Testing
{Domain-specific test patterns}

## Notes
{Local gotchas}
```

Quality gates:
- 50-150 lines (root), 30-80 lines (subdirs)
- No generic advice
- No parent duplication
- Telegraphic style
{{/if}}

## Analysis Steps

1. **Detect Project Type**
   - Look for: package.json, go.mod, Cargo.toml, pyproject.toml, pom.xml, build.gradle
   - Identify: language, framework, build system

2. **Find Build Commands**
   - Check: package.json scripts, Makefile, Justfile, .github/workflows
   - Note: dev, build, test, lint commands

3. **Extract Conventions**
   - Read 3-5 representative source files
   - Infer: naming, structure, patterns, style

4. **Collect Anti-Patterns**
   - Grep: "DO NOT", "NEVER", "HACK", "XXX", "FIXME"
   - Read: .cursorrules, .cursor/rules/, .github/copilot-instructions.md
   - Check: CLAUDE.md, .claude/CLAUDE.md

5. **Map Structure**
   - Use find/ls to understand layout
   - Identify: entry points, source dirs, config locations

6. **Score Directories** (if mode=deep)
   - Calculate complexity score for each directory
   - Determine which get their own {{OUTPUT}}

## Execution

{{#if MODE === "simple"}}
Write the {{OUTPUT}} file directly.
{{/if}}

{{#if MODE === "deep"}}
Write root {{OUTPUT}} first.
Then for each qualifying subdirectory:
- Launch parallel tasks to write subdirectory {{OUTPUT}} files
- Each should be independent and non-redundant
{{/if}}

{{#if MODE === "skill"}}
Create .pi/skills/project/ structure:
1. SKILL.md with triggers and description
2. rules/ directory with modular rule files
3. Reference modular files from SKILL.md
{{/if}}

## Final Report

```
/init complete

Mode: {{MODE}}
Files created:
  [OK] ./{{OUTPUT}} (root, {N} lines)
  {{#if MODE === "deep"}}[OK] ./src/{{OUTPUT}} ({N} lines)
  [OK] ./src/components/{{OUTPUT}} ({N} lines){{/if}}

Directories analyzed: {N}
{{OUTPUT}} created: {N}
{{#if MODE === "deep"}}Max depth: {{DEPTH}}{{/if}}
```
