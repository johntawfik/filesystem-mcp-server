import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  try {
    console.log("Initializing MCP File System Server...");
    const server = await createServer(); // Wait for async initialization
    const transport = new StdioServerTransport();

    console.log("Connecting server via StdioTransport...");
    await server.connect(transport);
    console.log("MCP File System Server connected via stdio. Ready for requests.");

    // Keep the process alive for stdio transport
    process.stdin.resume();
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        console.log("Received SIGINT, shutting down...");
        // Perform any cleanup if necessary
        process.exit(0);
    });
     process.on('SIGTERM', () => {
        console.log("Received SIGTERM, shutting down...");
        process.exit(0);
    });


  } catch (error) {
    console.error("Failed to start MCP File System server:", error);
    process.exit(1);
  }
}

main();
