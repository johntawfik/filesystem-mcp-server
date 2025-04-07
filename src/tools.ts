import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'glob';
import { resolveAndValidatePath, validateSourcePath } from './config.js';

export function registerFileSystemTools(server: McpServer) {

  // --- Helper Function for Error Handling ---
  function createErrorResult(message: string, details?: unknown) {
    console.error("File System Tool Error:", message, details);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true
    };
  }

  // --- Tool Definitions ---

  // 1. Read File
  server.tool(
    "read_file",
    { path: z.string().describe("Path to the file to read (relative to project root).") },
    async ({ path: userPath }) => {
      try {
        const filePath = resolveAndValidatePath(userPath);
        const content = await fs.readFile(filePath, 'utf-8');
        return { content: [{ type: "text", text: content }] };
      } catch (error: any) {
        return createErrorResult(`Failed to read file '${userPath}'. ${error.message}`);
      }
    }
  );

  // 2. Read Multiple Files
  server.tool(
    "read_multiple_files",
    { paths: z.array(z.string()).describe("List of file paths to read (relative to project root).") },
    async ({ paths: userPaths }) => {
      const results = await Promise.allSettled(userPaths.map(async (userPath) => {
        let filePath: string;
        try {
          filePath = resolveAndValidatePath(userPath);
          const content = await fs.readFile(filePath, 'utf-8');
          return { path: userPath, success: true, content };
        } catch (error: any) {
          return { path: userPath, success: false, error: error.message };
        }
      }));

      const outputText = results.map(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          return `--- File: ${result.value.path} ---\n${result.value.content}\n--- End: ${result.value.path} ---`;
        } else if (result.status === 'fulfilled' && !result.value.success) {
          return `--- File: ${result.value.path} ---\nError: ${result.value.error}\n--- End: ${result.value.path} ---`;
        } else { // status === 'rejected' (shouldn't happen with the inner try/catch, but good practice)
          return `--- File: [Unknown Path] ---\nError: Unexpected issue processing this path.\n--- End: [Unknown Path] ---`;
        }
      }).join('\n\n');

      return { content: [{ type: "text", text: outputText }] };
    }
  );

  // 3. Write File
  server.tool(
    "write_file",
    {
      path: z.string().describe("Path where the file should be created/overwritten (relative to project root)."),
      content: z.string().describe("The content to write to the file.")
    },
    async ({ path: userPath, content }) => {
      try {
        const filePath = resolveAndValidatePath(userPath);
        // Ensure parent directory exists before writing
        const dirPath = path.dirname(filePath);
        await fs.mkdir(dirPath, { recursive: true }); // mkdir is idempotent
        await fs.writeFile(filePath, content, 'utf-8');
        return { content: [{ type: "text", text: `Successfully wrote content to '${userPath}'.` }] };
      } catch (error: any) {
        return createErrorResult(`Failed to write file '${userPath}'. ${error.message}`);
      }
    }
  );

  // 4. Edit File (Simplified Version)
  server.tool(
    "edit_file",
    {
      path: z.string().describe("Path to the file to edit (relative to project root)."),
      edits: z.array(z.object({
        oldText: z.string().describe("Text to search for (exact match, case-sensitive)."),
        newText: z.string().describe("Text to replace 'oldText' with.")
      })).describe("List of edit operations (applied sequentially)."),
      dryRun: z.boolean().optional().default(false).describe("If true, preview changes without saving.")
    },
    async ({ path: userPath, edits, dryRun }) => {
      let filePath: string;
      try {
        filePath = resolveAndValidatePath(userPath);
      } catch (error: any) {
        return createErrorResult(`Invalid path '${userPath}'. ${error.message}`);
      }

      try {
        let currentContent = await fs.readFile(filePath, 'utf-8');
        let modifiedContent = currentContent;
        let changesMade = false;
        let appliedEditsInfo: string[] = [];

        for (const edit of edits) {
          const originalLength = modifiedContent.length;
          modifiedContent = modifiedContent.replaceAll(edit.oldText, edit.newText);
          if (modifiedContent.length !== originalLength || currentContent.includes(edit.oldText)) {
             if (modifiedContent !== currentContent.replaceAll(edit.oldText, edit.newText)) { // Check if replacement actually happened
                changesMade = true;
                appliedEditsInfo.push(`Replaced all occurrences of "${edit.oldText}" with "${edit.newText}".`);
             } else if (!modifiedContent.includes(edit.oldText) && currentContent.includes(edit.oldText)) {
                 // Handles cases where oldText was present but replaced entirely by previous edits
                 appliedEditsInfo.push(`Note: "${edit.oldText}" was present initially but removed by prior edits.`);
             } else if (!currentContent.includes(edit.oldText)) {
                 appliedEditsInfo.push(`Skipped: "${edit.oldText}" not found.`);
             }
          } else {
             appliedEditsInfo.push(`Skipped: "${edit.oldText}" not found.`);
          }
        }


        if (dryRun) {
          if (!changesMade) {
            return { content: [{ type: "text", text: `Dry run for '${userPath}': No changes would be made based on the provided edits.\n\nApplied Edits Info:\n${appliedEditsInfo.join('\n')}` }] };
          }
          // In a dry run, show the potential result
          return {
            content: [
              { type: "text", text: `Dry run for '${userPath}'. Changes would be applied.\n\nApplied Edits Info:\n${appliedEditsInfo.join('\n')}\n\n--- Potential New Content ---\n${modifiedContent}` }
            ]
          };
        } else {
          if (!changesMade) {
             return { content: [{ type: "text", text: `No changes applied to '${userPath}' as edits resulted in no modifications.\n\nApplied Edits Info:\n${appliedEditsInfo.join('\n')}` }] };
          }
          // Apply changes if not a dry run and changes were detected
          await fs.writeFile(filePath, modifiedContent, 'utf-8');
          return { content: [{ type: "text", text: `Successfully edited '${userPath}'.\n\nApplied Edits Info:\n${appliedEditsInfo.join('\n')}` }] };
        }

      } catch (error: any) {
        if (error.code === 'ENOENT') {
           return createErrorResult(`File not found at '${userPath}'.`);
        }
        return createErrorResult(`Failed to edit file '${userPath}'. ${error.message}`);
      }
    }
  );


  // 5. Create Directory
  server.tool(
    "create_directory",
    { path: z.string().describe("Path for the new directory (relative to project root). Parent directories will be created if they don't exist.") },
    async ({ path: userPath }) => {
      try {
        // Allow creating directories *at* the allowed boundary, but not outside
        const dirPath = resolveAndValidatePath(userPath);
        await fs.mkdir(dirPath, { recursive: true });
        return { content: [{ type: "text", text: `Directory '${userPath}' ensured.` }] };
      } catch (error: any) {
        // Check if it's just trying to create within an allowed dir that doesn't exist yet
         if (error.message.includes('Access denied')) {
             // Let's try resolving the parent to see if THAT is allowed
             try {
                 const parentUserPath = path.dirname(userPath);
                 // If parent is '.', resolve relative to project root
                 const parentPath = parentUserPath === '.' ? '/home/project' : parentUserPath;
                 resolveAndValidatePath(parentPath + '/dummy'); // Check if parent is allowed
                 // If parent is allowed, proceed with creation
                 const dirPath = path.resolve('/home/project', userPath); // Resolve again without validation throwing
                 await fs.mkdir(dirPath, { recursive: true });
                 return { content: [{ type: "text", text: `Directory '${userPath}' ensured.` }] };
             } catch (parentError: any) {
                 // If parent isn't allowed either, then it's a genuine access error
                 return createErrorResult(`Failed to create directory '${userPath}'. Cannot create directories outside allowed paths. ${parentError.message}`);
             }
         }
        return createErrorResult(`Failed to create directory '${userPath}'. ${error.message}`);
      }
    }
  );

  // 6. List Directory
  server.tool(
    "list_directory",
    { path: z.string().describe("Path to the directory to list (relative to project root).") },
    async ({ path: userPath }) => {
      try {
        const dirPath = resolveAndValidatePath(userPath);
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const listing = entries.map(entry => {
          const type = entry.isDirectory() ? '[DIR] ' : '[FILE]';
          return `${type} ${entry.name}`;
        });
        const output = listing.length > 0 ? listing.join('\n') : 'Directory is empty.';
        return { content: [{ type: "text", text: `Contents of '${userPath}':\n${output}` }] };
      } catch (error: any) {
         if (error.code === 'ENOENT') {
           return createErrorResult(`Directory not found at '${userPath}'.`);
         }
         if (error.code === 'ENOTDIR') {
            return createErrorResult(`Path '${userPath}' is a file, not a directory.`);
         }
        return createErrorResult(`Failed to list directory '${userPath}'. ${error.message}`);
      }
    }
  );

  // 7. Move File/Directory
  server.tool(
    "move_file",
    {
      source: z.string().describe("Source path (file or directory) to move (relative to project root)."),
      destination: z.string().describe("Destination path (relative to project root).")
    },
    async ({ source: userSource, destination: userDest }) => {
      let sourcePath: string;
      let destPath: string;
      try {
        // Validate source is within allowed dirs independently
        sourcePath = validateSourcePath(userSource);
        // Validate destination and resolve it
        destPath = resolveAndValidatePath(userDest);

        // Check if source exists before trying to move
         try {
             await fs.access(sourcePath);
         } catch (accessError) {
             return createErrorResult(`Source path '${userSource}' does not exist or is not accessible.`);
         }


        // Check if destination already exists
        try {
          await fs.access(destPath);
          // If access doesn't throw, it exists
          return createErrorResult(`Destination path '${userDest}' already exists. Cannot overwrite.`);
        } catch (error) {
          // Error means it doesn't exist, which is good. Continue.
        }

         // Ensure destination parent directory exists
         const destDirPath = path.dirname(destPath);
         await fs.mkdir(destDirPath, { recursive: true });


        await fs.rename(sourcePath, destPath);
        return { content: [{ type: "text", text: `Successfully moved '${userSource}' to '${userDest}'.` }] };
      } catch (error: any) {
        return createErrorResult(`Failed to move '${userSource}' to '${userDest}'. ${error.message}`);
      }
    }
  );

  // 8. Search Files
  server.tool(
    "search_files",
    {
      path: z.string().describe("Starting directory path for the search (relative to project root)."),
      pattern: z.string().describe("Glob pattern to search for (e.g., '*.txt', '**/*.js')."),
      excludePatterns: z.array(z.string()).optional().default([]).describe("Glob patterns to exclude (e.g., 'node_modules/**', '*.log').")
    },
    async ({ path: userPath, pattern, excludePatterns }) => {
      try {
        const startPath = resolveAndValidatePath(userPath);

        // Ensure the start path exists and is a directory
        try {
            const stats = await fs.stat(startPath);
            if (!stats.isDirectory()) {
                return createErrorResult(`Search path '${userPath}' is not a directory.`);
            }
        } catch (statError: any) {
             if (statError.code === 'ENOENT') {
                 return createErrorResult(`Search path '${userPath}' does not exist.`);
             }
             throw statError; // Re-throw other stat errors
        }


        const results = await glob(pattern, {
          cwd: startPath, // Search within the validated path
          nodir: false, // Include directories in results unless excluded
          ignore: excludePatterns,
          absolute: false, // Keep paths relative to startPath for now
          dot: true, // Include dotfiles/dotdirs in matches
          nocase: true, // Case-insensitive matching
        });

        // Prepend the original userPath to make results relative to project root again
        const fullPaths = results.map(res => path.join(userPath, res));

        const output = fullPaths.length > 0
          ? `Search results for pattern '${pattern}' in '${userPath}':\n${fullPaths.join('\n')}`
          : `No files or directories found matching pattern '${pattern}' in '${userPath}'.`;

        return { content: [{ type: "text", text: output }] };
      } catch (error: any) {
        return createErrorResult(`Failed to search in '${userPath}'. ${error.message}`);
      }
    }
  );

  // 9. Get File Info
  server.tool(
    "get_file_info",
    { path: z.string().describe("Path to the file or directory (relative to project root).") },
    async ({ path: userPath }) => {
      try {
        const filePath = resolveAndValidatePath(userPath);
        const stats = await fs.stat(filePath);
        const info = {
          path: userPath,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size, // Size in bytes
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          accessed: stats.atime.toISOString(),
          // Permissions are complex (numeric mode vs string), providing mode is simpler
          permissionsMode: stats.mode.toString(8), // Octal representation
        };
        const outputText = `
Path: ${info.path}
Type: ${info.type}
Size: ${info.size} bytes
Created: ${info.created}
Modified: ${info.modified}
Accessed: ${info.accessed}
Permissions (octal): ${info.permissionsMode}
        `.trim();
        return { content: [{ type: "text", text: outputText }] };
      } catch (error: any) {
         if (error.code === 'ENOENT') {
           return createErrorResult(`File or directory not found at '${userPath}'.`);
         }
        return createErrorResult(`Failed to get info for '${userPath}'. ${error.message}`);
      }
    }
  );

   // 10. List Allowed Directories (as a Tool - alternative to resource)
   // Sometimes exposing info via a tool is preferred if it might involve computation
   // or if you want consistent API style. Keeping the resource version too.
   server.tool(
     "list_allowed_directories_tool", // Different name to avoid conflict
     {}, // No input needed
     async () => {
       try {
         // Import ALLOWED_DIRS dynamically if needed, or ensure it's accessible
         const { ALLOWED_DIRS: dirs } = await import('./config.js');
         const output = `Allowed base directories for file operations:\n${dirs.map(d => `- ${d.replace('/home/project/', '')}`).join('\n')}`;
         return { content: [{ type: "text", text: output }] };
       } catch (error: any) {
         return createErrorResult(`Failed to retrieve allowed directories. ${error.message}`);
       }
     }
   );
}
