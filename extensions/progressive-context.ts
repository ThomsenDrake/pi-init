/**
 * Progressive Context Extension for Pi
 * 
 * Implements hierarchical AGENTS.md discovery and injection.
 * When a file is read, walks up the directory tree to find relevant
 * AGENTS.md files and injects their content dynamically.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const AGENTS_FILENAMES = ["AGENTS.md", "CLAUDE.md", "CLA.md"];
const CONTEXT_SEPARATOR = "\n\n---\n\n";
const MAX_CONTEXT_SIZE = 2000; // Characters to inject
const MAX_CACHED_SESSIONS = 100; // Prevent unbounded memory growth

interface ProgressiveContextConfig {
  enabled: boolean;
  maxContextSize: number;
  filenames: string[];
  excludeRoot: boolean; // Root AGENTS.md already loaded by Pi
}

interface SessionCache {
  injectedPaths: Set<string>;
}

const sessionCaches = new Map<string, SessionCache>();

function getSessionCache(sessionID: string): SessionCache {
  // Evict oldest if at capacity to prevent memory leak
  if (sessionCaches.size >= MAX_CACHED_SESSIONS && !sessionCaches.has(sessionID)) {
    const firstKey = sessionCaches.keys().next().value;
    sessionCaches.delete(firstKey);
  }
  
  if (!sessionCaches.has(sessionID)) {
    sessionCaches.set(sessionID, {
      injectedPaths: new Set(),
    });
  }
  return sessionCaches.get(sessionID)!;
}

function findAgentsFilesUp(
  startDir: string,
  rootDir: string,
  config: ProgressiveContextConfig
): string[] {
  const found: string[] = [];
  let current = startDir;

  while (true) {
    // Check if we're at root
    const isAtRoot = current === rootDir;
    const isAboveRoot = !current.startsWith(rootDir) && current !== rootDir;
    
    // Look for AGENTS.md files in current directory
    // Skip only if we're at root AND excludeRoot is configured
    if (!isAtRoot || !config.excludeRoot) {
      for (const filename of config.filenames) {
        const filePath = path.join(current, filename);
        try {
          // Try to read and verify it's a file (handles race conditions)
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            found.push(filePath);
            break; // Only take first match per directory
          }
        } catch {
          // File doesn't exist or not accessible, skip
        }
      }
    }

    // Stop if we've reached or passed root
    if (isAtRoot || isAboveRoot) break;

    // Move to parent
    const parent = path.dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }

  // Return closest parent first (reverse order - outermost first)
  return found.reverse();
}

function truncateContent(content: string, maxSize: number, filePath: string, rootDir: string): string {
  if (content.length <= maxSize) return content;
  
  // Try to truncate at a reasonable boundary
  const truncated = content.slice(0, maxSize);
  const lastBoundary = Math.max(
    truncated.lastIndexOf("\n\n"),
    truncated.lastIndexOf("\n---\n")
  );
  
  const relativePath = path.relative(rootDir, filePath);
  const note = `\n\n[Note: Content truncated. Read full file: ${relativePath}]`;
  
  if (lastBoundary > maxSize * 0.8) {
    return truncated.slice(0, lastBoundary) + note;
  }
  
  return truncated + note;
}

export default function progressiveContextExtension(pi: ExtensionAPI) {
  // Load configuration with proper array merging
  const config: ProgressiveContextConfig = {
    enabled: true,
    maxContextSize: MAX_CONTEXT_SIZE,
    filenames: [...AGENTS_FILENAMES], // Clone to avoid mutation
    excludeRoot: true,
    ...(pi.config.progressiveContext || {}),
  };
  
  // Merge filenames array properly instead of replacing
  if (pi.config?.progressiveContext?.filenames) {
    config.filenames = [
      ...AGENTS_FILENAMES,
      ...pi.config.progressiveContext.filenames,
    ];
  }

  if (!config.enabled) {
    console.log("[progressive-context] Disabled via config");
    return;
  }

  console.log("[progressive-context] Extension loaded");

  // Hook into tool execution
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "read") return;
    
    const sessionID = ctx.sessionManager.getSessionId();
    const filePath = event.input?.path;
    const rootDir = pi.workspaceRoot || process.cwd();
    
    // Validate filePath is a string
    if (typeof filePath !== "string" || !filePath) return;

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(rootDir, filePath);
    
    // Validate path stays within workspace (prevent path traversal)
    const resolvedPath = path.resolve(absolutePath);
    const resolvedRoot = path.resolve(rootDir);
    if (!resolvedPath.startsWith(resolvedRoot)) {
      console.warn(`[progressive-context] Path ${filePath} outside workspace, skipping`);
      return;
    }
    
    const dir = path.dirname(absolutePath);
    const cache = getSessionCache(sessionID);

    // Find relevant AGENTS.md files
    const agentsFiles = findAgentsFilesUp(dir, resolvedRoot, config);
    
    if (agentsFiles.length === 0) return;

    // Build context injection
    const contexts: string[] = [];
    
    for (const agentsPath of agentsFiles) {
      // Skip if already injected this session
      if (cache.injectedPaths.has(agentsPath)) continue;

      try {
        const content = fs.readFileSync(agentsPath, "utf-8");
        const truncated = truncateContent(content, config.maxContextSize, agentsPath, resolvedRoot);
        const relativePath = path.relative(resolvedRoot, agentsPath);
        
        contexts.push(`[Directory Context: ${relativePath}]\n${truncated}`);
        cache.injectedPaths.add(agentsPath);
      } catch (err) {
        // Log error but don't crash
        console.error(`[progressive-context] Error reading ${agentsPath}:`, err);
      }
    }

    if (contexts.length > 0) {
      // Append context to tool result
      const contextBlock = CONTEXT_SEPARATOR + contexts.join(CONTEXT_SEPARATOR);
      
      // Build new content array with injected context
      const newContent = [...event.content];
      newContent.push({ type: "text" as const, text: contextBlock });
      
      console.log(`[progressive-context] Injected ${contexts.length} context file(s) for ${filePath}`);
      
      // Return modified result (don't modify event directly)
      return {
        content: newContent,
        details: event.details,
        isError: event.isError,
      };
    }
  });

  // Clean up cache on session shutdown
  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionID = ctx.sessionManager.getSessionId();
    sessionCaches.delete(sessionID);
    console.log(`[progressive-context] Cleaned up session ${sessionID}`);
  });

  // Register a custom tool for manual context injection
  pi.registerTool({
    name: "inject_context",
    label: "Inject Context",
    description: "Manually inject AGENTS.md context from a specific directory",
    parameters: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directory to look for AGENTS.md (walks up from here)",
        },
      },
      required: ["directory"],
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const dir = params.directory as string;
      const rootDir = pi.workspaceRoot || process.cwd();
      const resolvedRoot = path.resolve(rootDir);
      const absoluteDir = path.isAbsolute(dir) ? path.resolve(dir) : path.join(resolvedRoot, dir);
      
      // Validate path stays within workspace
      if (!absoluteDir.startsWith(resolvedRoot)) {
        return {
          content: [{ type: "text" as const, text: `Error: Directory ${dir} is outside the workspace` }],
          isError: true,
        };
      }
      
      const agentsFiles = findAgentsFilesUp(absoluteDir, resolvedRoot, {
        ...config,
        excludeRoot: false, // Allow explicit root injection
      });
      
      if (agentsFiles.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No AGENTS.md files found in ${dir} or parent directories` }],
        };
      }
      
      const contexts: string[] = [];
      for (const agentsPath of agentsFiles) {
        try {
          const content = fs.readFileSync(agentsPath, "utf-8");
          const truncated = truncateContent(content, config.maxContextSize, agentsPath, resolvedRoot);
          const relativePath = path.relative(resolvedRoot, agentsPath);
          contexts.push(`[${relativePath}]:\n${truncated}`);
        } catch (err) {
          contexts.push(`[Error reading ${agentsPath}]`);
        }
      }
      
      return {
        content: [{ type: "text" as const, text: contexts.join(CONTEXT_SEPARATOR) }],
      };
    },
  });

  // Register a command to show injected context
  pi.registerCommand("context", {
    description: "Show currently injected progressive context for this session",
    handler: async (_args, ctx) => {
      const sessionID = ctx.sessionManager.getSessionId();
      const cache = getSessionCache(sessionID);
      const rootDir = pi.workspaceRoot || process.cwd();
      
      if (cache.injectedPaths.size === 0) {
        return {
          content: "No progressive context injected yet this session.\n\nContext is injected automatically when you read files in directories with AGENTS.md files.",
        };
      }
      
      const paths = Array.from(cache.injectedPaths).map(p => 
        `  - ${path.relative(rootDir, p)}`
      ).join("\n");
      
      return {
        content: `Injected context files this session:\n${paths}\n\nThese will persist until the session ends.`,
      };
    },
  });
}

// Re-export types for TypeScript users
export type { ProgressiveContextConfig };
