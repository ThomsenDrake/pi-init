# pi-init

Hierarchical context initialization for [Pi Coding Agent](https://github.com/badlogic/pi-mono) with **progressive disclosure**.

> **The Problem:** Traditional `/init` creates a single, ever-growing context file. Large projects exceed context windows or dilute focus.
> 
> **The Solution:** `pi-init` creates hierarchical `AGENTS.md` files and **progressively discloses** context based on which files you're working with.

## Features

- **Simple Mode**: Single `AGENTS.md` at root (like traditional `/init`)
- **Deep Mode**: Hierarchical `AGENTS.md` with scoring-based placement
- **Progressive Disclosure**: Context injected dynamically when you `read` files
- **Skill Mode**: Create version-controllable project skills
- **Fully Customizable**: Override the prompt template, adjust scoring, configure everything

## Installation

### Via Git (Recommended)

```bash
pi install git:github.com/yourusername/pi-init
```

### Via Local Path

```bash
# Clone or copy to local directory
pi install /path/to/pi-init
```

### Project-Local Install

```bash
# Install only for current project
pi install git:github.com/yourusername/pi-init -l
```

## Usage

### Basic: Simple Mode

Generate a single comprehensive context file:

```
/init
```

This creates `./AGENTS.md` with:
- Project overview and tech stack
- Build/test/development commands
- Code conventions (inferred from existing code)
- Anti-patterns (from comments like "DO NOT", "NEVER")
- Project structure and gotchas

### Advanced: Deep Mode (Progressive Disclosure)

Generate hierarchical context for large projects:

```
/init --mode=deep --depth=3
```

This creates multiple `AGENTS.md` files:
```
project/
├── AGENTS.md              # Root: cross-cutting concerns
├── packages/
│   ├── AGENTS.md          # Package-level conventions
│   ├── core/
│   │   ├── AGENTS.md      # Core-specific patterns
│   │   └── src/
│   └── ui/
│       └── AGENTS.md      # UI-specific patterns
```

**How it works:**
1. Scores each directory by complexity (file count, exports, refs, etc.)
2. Creates `AGENTS.md` where score > threshold
3. Child files only include what's unique (no parent duplication)
4. Automatically injects relevant context when you `read` files

### Skill Mode

Create a shareable Pi skill:

```
/init --mode=skill
```

Creates `.pi/skills/project/`:
- `SKILL.md` - Skill definition with activation triggers
- `rules/` - Modular context files
- Version controlled and shareable via `pi install`

### Custom Output

```
/init --output=CLAUDE.md           # Different filename
/init --mode=deep --max-depth=2    # Limit directory depth
/init --dry-run                    # Preview what would be generated
```

## Progressive Disclosure

The killer feature: **context that finds you**.

When you run `read src/components/Button.tsx`, the extension:
1. Walks up from that file: `src/components/` → `src/` → `.`
2. Discovers `src/components/AGENTS.md`, `src/AGENTS.md`
3. Injects their content into the tool output
4. Caches for the session (won't re-inject)

**Result:** You only see context relevant to what you're working on, not the entire project's history.

### Example

```
> read src/api/auth.ts

[File content...]

---

[Directory Context: src/api/AGENTS.md]
This module handles authentication.
API conventions:
- Use Zod for validation
- Return typed ApiResponse<T>
- Handle errors with ApiError class

---

[Directory Context: src/AGENTS.md]
Backend conventions:
- All API routes in src/api/
- Shared types in src/types/
- Database access via src/db/
```

### View Injected Context

```
/context
```

Shows which `AGENTS.md` files have been injected this session.

### Manual Injection

```
/inject_context --directory=src/components
```

Manually inject context from a specific directory (walks up).

## Configuration

Add to your Pi settings (`~/.pi/agent/settings.json` or `.pi/settings.json`):

```json
{
  "progressiveContext": {
    "enabled": true,
    "maxContextSize": 2000,
    "filenames": ["AGENTS.md", "CLAUDE.md", "CLA.md"],
    "excludeRoot": true
  },
  "init": {
    "defaultMode": "simple",
    "deepMode": {
      "scoreThreshold": 15,
      "maxDepth": 3,
      "weights": {
        "fileCount": 3,
        "subdirCount": 2,
        "codeRatio": 2,
        "uniquePatterns": 2,
        "moduleBoundary": 3,
        "symbolDensity": 2,
        "exportCount": 2,
        "referenceCentrality": 3
      }
    }
  }
}
```

## Customization

### Override the Prompt Template

Create your own `~/.pi/agent/prompts/init.md`:

```bash
# Copy the default template as starting point
cp ~/.pi/agent/git/pi-init/prompts/init.md ~/.pi/agent/prompts/init.md

# Edit to your preferences
# pi will use your version instead of the package default
```

### Adjust Scoring (Deep Mode)

Modify the weights in settings to change which directories get `AGENTS.md`:

```json
{
  "init": {
    "deepMode": {
      "weights": {
        "fileCount": 5,        // Heavier weight = more files triggers AGENTS.md
        "referenceCentrality": 5  // Imported a lot = deserves its own context
      }
    }
  }
}
```

### Custom Filenames

Track different context files:

```json
{
  "progressiveContext": {
    "filenames": ["AGENTS.md", "CLAUDE.md", "TEAM.md", "API.md"]
  }
}
```

## How It Works

### 1. `/init` Command (Prompt Template)

The `/init` command is implemented as a **Pi prompt template**. When you type `/init`, Pi expands this template with your arguments and sends it to the model.

**Benefits:**
- Fully customizable (override the template)
- No core code changes needed
- Works with any model Pi supports

### 2. Progressive Disclosure (Extension Hook)

The extension registers a hook on `tool:read:after`:

```typescript
pi.on("tool:execute:after", (event) => {
  if (event.tool === "read") {
    // Walk up directory tree from file
    // Find AGENTS.md files
    // Inject into output
  }
});
```

**Benefits:**
- Context appears exactly when relevant
- Respects token budgets
- Session-cached (no duplicates)

### 3. Scoring Engine (Deep Mode)

For `/init --mode=deep`, the prompt template directs the model to score directories:

| Factor | Weight | Detection |
|--------|--------|-----------|
| File count | 3x | `find . -type f \| wc -l` |
| Subdir count | 2x | `find . -type d \| wc -l` |
| Code ratio | 2x | File extension analysis |
| Unique patterns | 2x | Config file detection |
| Module boundary | 3x | `index.ts`, `__init__.py` |
| Symbol density | 2x | LSP or AST grep |
| Export count | 2x | LSP or grep |
| Reference centrality | 3x | Import analysis |

## Comparison with Other Agents

| Feature | Claude Code | OpenCode | Gemini CLI | Oh My OpenCode | **Pi + pi-init** |
|---------|-------------|----------|------------|----------------|------------------|
| Init command | Built-in `/init` | Built-in `/init` | Built-in `/init` | `/init-deep` plugin | **Prompt template** |
| Context files | Single `CLAUDE.md` | Single `AGENTS.md` | Single `GEMINI.md` | Hierarchical | **Hierarchical** |
| Progressive loading | No | No | JIT (file-based) | Directory-based | **Directory-based** |
| Scoring system | No | No | No | Yes | **Yes** |
| Customizable | None | None | `context.fileName` | Plugin config | **Fully** |
| Extensible | No | No | No | Plugin | **Native** |
| Implementation | Core | Core | Core | Plugin | **Template + Extension** |

## Best Practices

### When to Use Simple Mode
- Small-medium projects (<100 files)
- Quick starts
- You want minimal complexity

### When to Use Deep Mode
- Monorepos with multiple packages
- Large projects with domain separation
- Different conventions in different areas
- Team-based development (domain experts per area)

### When to Use Skill Mode
- Context you want version controlled
- Shareable across team
- Reusable patterns across projects

### Directory Scoring Guidelines

**Always create AGENTS.md:**
- Root directory
- Package boundaries (in monorepos)
- Major architectural boundaries

**Consider creating:**
- Directories with >20 files
- Areas with unique testing patterns
- Modules with public APIs

**Skip:**
- Small utility directories
- Test-only directories
- Generated code directories

## Troubleshooting

### Context not injecting?

1. Check that `AGENTS.md` exists in parent directories
2. Verify extension is loaded: `pi list` should show `pi-init`
3. Check config: `/settings` → progressiveContext.enabled should be true
4. Check session cache: `/context` shows what's been injected

### Too much context injected?

Adjust in settings:
```json
{
  "progressiveContext": {
    "maxContextSize": 1000,  // Reduce from default 2000
    "excludeRoot": true       // Don't re-inject root (already loaded)
  }
}
```

### Wrong directories getting AGENTS.md?

Adjust scoring weights:
```json
{
  "init": {
    "deepMode": {
      "scoreThreshold": 20  // Higher = fewer files created
    }
  }
}
```

## Contributing

PRs welcome! Areas for improvement:
- [ ] LSP integration for better symbol analysis
- [ ] Git history integration (recent changes context)
- [ ] External docs integration (Context7, etc.)
- [ ] More scoring factors (test coverage, complexity metrics)
- [ ] Automatic AGENTS.md updates (detect drift)

## License

MIT

## Related

- [Pi Coding Agent](https://github.com/badlogic/pi-mono) - The core agent this extends
- [Oh My OpenCode](https://github.com/code-yeongyu/oh-my-opencode) - Inspiration for progressive disclosure
- [Claude Code](https://github.com/anthropics/claude-code) - Original `/init` implementation
