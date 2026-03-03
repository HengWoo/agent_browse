import createDebug from 'debug';

const NAMESPACE = 'agent-browse';

export const logger = createDebug(NAMESPACE);

// Ensure all debug output goes to stderr (stdout is reserved for MCP protocol)
createDebug.log = console.error.bind(console);
