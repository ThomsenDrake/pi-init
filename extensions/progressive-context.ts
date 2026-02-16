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
    // Check if we've reached or passed root
    const isRootOrAbove = current === rootDir || !current.startsWith(rootDir);
    
    // Skip root if configured (Pi already loads root AGENTS.md)
    if (config.excludeRoot && isRootOrAbove) {
      break;
    }

    // Look for AGENTS.md files in current directory
    for (const filename of config.filenames) {
      const filePath = path.join(current, filename);
      if (fs.existsSync(filePath)) {
        found.push(filePath);
        break; // Only take first match per directory
      }
    }

    if (isRootOrAbove) break;

    // Move to parent
    const parent = path.dirname(current);
    if (parent === current) break; // Reached filesystem root
    current = parent;
  }

  // Return closest parent first (reverse order)
  return found.reverse();
}

function truncateContent(content: string, maxSize: number): string {
  if (content.length <= maxSize) return content;
  
  // Try to truncate at a reasonable boundary
  const truncated = content.slice(0, maxSize);
  const lastBoundary = Math.max(
    truncated.lastIndexOf("\n\n"),
    truncated.lastIndexOf("\n---\n")
  );
  
  if (lastBoundary > maxSize * 0.8) {
    return truncated.slice(0, lastBoundary) + 
           "\n\n[Note: Content truncated. Full file: read directly]";
  }
  
  return truncated + "\n\n[Note: Content truncated. Full file: read directly]";
}

export default function progressiveContextExtension(pi: ExtensionAPI) {
  // Load configuration
  const config: ProgressiveContextConfig = {
    enabled: true,
    maxContextSize: MAX_CONTEXT_SIZE,
    filenames: AGENTS_FILENAMES,
    excludeRoot: true,
    ...(pi.config.progressiveContext || {}),
  };

  if (!config.enabled) {
    console.log("[progressive-context] Disabled via config");
    return;
  }

  console.log("[progressive-context] Extension loaded");

  // Hook into tool execution
  pi.on("tool:execute:after", async (event) => {
    if (event.tool !== "read") return;
    
    const sessionID = event.sessionId;
    const filePath = event.args?.path as string;
    const rootDir = pi.workspaceRoot || process.cwd();
    
    if (!filePath) return;

    // Resolve to absolute path
    const absolutePath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(rootDir, filePath);
    
    const dir = path.dirname(absolutePath);
    const cache = getSessionCache(sessionID);

    // Find relevant AGENTS.md files
    const agentsFiles = findAgentsFilesUp(dir, rootDir, config);
    
    if (agentsFiles.length === 0) return;

    // Build context injection
    const contexts: string[] = [];
    
    for (const agentsPath of agentsFiles) {
      // Skip if already injected this session
      if (cache.injectedPaths.has(agentsPath)) continue;

      try {
        const content = fs.readFileSync(agentsPath, "utf-8");
        const truncated = truncateContent(content, config.maxContextSize);
        
        contexts.push(`[Directory Context: ${path.relative(rootDir, agentsPath)}]\n${truncated}`);
        cache.injectedPaths.add(agentsPath);
      } catch (err) {
        // File may have been deleted between existsSync and readFileSync
        console.error(`[progressive-context] Error reading ${agentsPath}:`, err);
      }
    }

    if (contexts.length > 0) {
      // Append context to tool result
      const contextBlock = CONTEXT_SEPARATOR + contexts.join(CONTEXT_SEPARATOR);
      
      // Modify the output
      event.output = event.output || {};
      if (typeof event.output.content === "string") {
        event.output.content += contextBlock;
      } else {
        event.output.context = contextBlock;
      }
      
      console.log(`[progressive-context] Injected ${contexts.length} context file(s) for ${filePath}`);
    }
  });

  // Clean up cache on session end
  pi.on("session:end", (event) => {
    sessionCaches.delete(event.sessionId);
    console.log(`[progressive-context] Cleaned up session ${event.sessionId}`);
  });

  // Register a custom tool for manual context injection
  pi.registerTool({
    name: "inject_context",
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
    handler: async (args, ctx) => {
      const dir = args.directory as string;
      const rootDir = pi.workspaceRoot || process.cwd();
      const absoluteDir = path.isAbsolute(dir) ? dir : path.join(rootDir, dir);
      
      const agentsFiles = findAgentsFilesUp(absoluteDir, rootDir, {
        ...config,
        excludeRoot: false, // Allow explicit root injection
      });
      
      if (agentsFiles.length === 0) {
        return {
          content: `No AGENTS.md files found in ${dir} or parent directories`,
        };
      }
      
      const contexts: string[] = [];
      for (const agentsPath of agentsFiles) {
        try {
          const content = fs.readFileSync(agentsPath, "utf-8");
          const truncated = truncateContent(content, config.maxContextSize);
          contexts.push(`[${path.relative(rootDir, agentsPath)}]:\n${truncated}`);
        } catch (err) {
          contexts.push(`[Error reading ${agentsPath}]`);
        }
      }
      
      return {
        content: contexts.join(CONTEXT_SEPARATOR),
      };
    },
  });

  // Register a command to show injected context
  pi.registerCommand({
    name: "context",
    description: "Show currently injected progressive context for this session",
    handler: async (ctx) => {
      const sessionID = ctx.sessionId;
      const cache = getSessionCache(sessionID);
      
      if (cache.injectedPaths.size === 0) {
        return {
          content: "No progressive context injected yet this session.\n\nContext is injected automatically when you read files in directories with AGENTS.md files.",
        };
      }
      
      const paths = Array.from(cache.injectedPaths).map(p => 
        `  - ${path.relative(pi.workspaceRoot || process.cwd(), p)}`
      ).join("\n");
      
      return {
        content: `Injected context files this session:\n${paths}\n\nThese will persist until the session ends.`,
      };
    },
  });
}

// Re-export types for TypeScript users
export type { ProgressiveContextConfig };
