import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFileSystemResources } from "./resources.js";
import { registerFileSystemTools } from "./tools.js";
import { initializeAllowedDirs } from './config.js';

export async function createServer(): Promise<McpServer> {
  // Ensure allowed directories are ready before server setup
  await initializeAllowedDirs();

  const server = new McpServer({
    name: "FileSystemServer",
    version: "1.0.0",
    description: "MCP server for interacting with a restricted local file system."
  });

  // Register all components
  registerFileSystemResources(server);
  registerFileSystemTools(server);

  console.log("File System MCP Server configured.");
  console.log("Registered Resources:", server.listResources().map(r => r.name));
  console.log("Registered Tools:", server.listTools().map(t => t.name));


  return server;
}
