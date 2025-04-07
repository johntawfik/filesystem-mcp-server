import path from 'node:path';
import fs from 'node:fs/promises';

// --- Configuration ---
// WARNING: In a real application, get this from command-line arguments or environment variables.
// For this example, we allow operations within a 'data' subdirectory of the project.
const projectRoot = '/home/project';
export const ALLOWED_DIRS: string[] = [
  path.resolve(projectRoot, 'data')
];

// Ensure allowed directories exist on startup
export async function initializeAllowedDirs() {
  for (const dir of ALLOWED_DIRS) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`Ensured allowed directory exists: ${dir}`);
    } catch (error) {
      console.error(`Failed to create allowed directory ${dir}:`, error);
      // Decide if this should be a fatal error
    }
  }
}


/**
 * Resolves a user-provided path relative to the project root and validates
 * if it falls within one of the allowed directories.
 * Throws an error if the path is outside allowed directories or invalid.
 *
 * @param userPath The path provided by the user/LLM.
 * @returns The absolute, validated path.
 * @throws Error if path is invalid or outside allowed directories.
 */
export function resolveAndValidatePath(userPath: string): string {
  if (typeof userPath !== 'string' || !userPath.trim()) {
    throw new Error('Invalid path provided: Path cannot be empty.');
  }

  // Prevent path traversal attacks (e.g., '../../etc/passwd')
  const resolvedPath = path.resolve(projectRoot, userPath);

  // Check if the resolved path is within any of the allowed directories
  const isAllowed = ALLOWED_DIRS.some(allowedDir => {
    const relative = path.relative(allowedDir, resolvedPath);
    // Ensure the path is *within* the allowed directory, not the directory itself
    // or outside of it (relative path should not start with '..' or be empty if it's the dir itself)
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });

  if (!isAllowed) {
    // Be careful not to leak absolute path information in error messages to the LLM
    throw new Error(`Access denied: Path '${userPath}' is outside the allowed directories.`);
  }

  return resolvedPath;
}

/**
 * Validates if a source path is within allowed directories. Used for operations
 * like move where the destination might be implicitly validated by resolveAndValidatePath.
 *
 * @param sourcePath The source path to validate.
 * @throws Error if path is invalid or outside allowed directories.
 */
export function validateSourcePath(sourcePath: string): string {
    // Re-use the main validation logic
    return resolveAndValidatePath(sourcePath);
}
