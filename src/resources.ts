import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ALLOWED_DIRS } from './config.js';

export function registerFileSystemResources(server: McpServer) {
  // 1. General File System Interface Resource
  server.resource(
    "filesystem-interface",
    "file://system",
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: "Interface for interacting with the server's local file system within allowed directories."
      }]
    })
  );

  // 2. List Allowed Directories Resource
  server.resource(
    "list-allowed-directories",
    "file://system/allowed-directories", // Changed URI slightly
    async (uri) => ({
      contents: [{
        uri: uri.href,
        // Provide relative paths from the perspective of the project root for clarity
        text: `Allowed base directories for file operations:\n${ALLOWED_DIRS.map(d => `- ${d.replace('/home/project/', '')}`).join('\n')}`
      }]
    })
  );
}
