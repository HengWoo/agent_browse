import { z } from 'zod';
import { defineTool } from '../ToolDefinition.js';

interface AXNode {
  nodeId: string;
  role: { value: string };
  name?: { value: string };
  value?: { value: string };
  description?: { value: string };
  properties?: Array<{ name: string; value: { value: unknown } }>;
  childIds?: string[];
  backendDOMNodeId?: number;
  ignored?: boolean;
}

interface FormattedNode {
  uid: string;
  role: string;
  name: string;
  value?: string;
  depth: number;
}

let uidCounter = 0;

/**
 * Assigns short sequential UIDs to a11y nodes for easy reference.
 * Returns a flat array of formatted nodes.
 */
function formatAXTree(nodes: AXNode[], maxNodes: number = 5000): FormattedNode[] {
  if (!nodes || nodes.length === 0) return [];

  // Build parent→children map
  const childMap = new Map<string, string[]>();
  const nodeMap = new Map<string, AXNode>();
  for (const node of nodes) {
    nodeMap.set(node.nodeId, node);
    if (node.childIds) {
      childMap.set(node.nodeId, node.childIds);
    }
  }

  const result: FormattedNode[] = [];
  const rootId = nodes[0]?.nodeId;
  if (!rootId) return result;

  // DFS traversal with depth tracking
  const stack: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];

  while (stack.length > 0 && result.length < maxNodes) {
    const { id, depth } = stack.pop()!;
    const node = nodeMap.get(id);
    if (!node || node.ignored) continue;

    const role = node.role?.value ?? 'unknown';
    const name = node.name?.value ?? '';

    // Skip generic/ignored roles with no meaningful content
    if (role === 'none' && !name) continue;

    uidCounter++;
    result.push({
      uid: `e${uidCounter}`,
      role,
      name,
      value: node.value?.value,
      depth,
    });

    // Push children in reverse order so first child is processed first
    const children = childMap.get(id);
    if (children) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({ id: children[i], depth: depth + 1 });
      }
    }
  }

  return result;
}

function renderTree(nodes: FormattedNode[]): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const indent = '  '.repeat(node.depth);
    let line = `${indent}[${node.uid}] ${node.role}`;
    if (node.name) line += ` "${node.name}"`;
    if (node.value) line += ` value="${node.value}"`;
    lines.push(line);
  }
  return lines.join('\n');
}

export const snapshot = defineTool({
  name: 'snapshot',
  description: 'Take an accessibility tree snapshot of the page. Returns a structured text tree with UIDs that can be used with click_selector. Requires tab to be attached.',
  schema: {
    tabId: z.number().int().describe('The tab ID.'),
  },
  handler: async (request, response, context) => {
    const result = await context.bridge.send('snapshot', { tabId: request.params.tabId }, 60000);
    if (!result.success) {
      throw new Error(result.error ?? 'Snapshot failed');
    }

    const axNodes = (result.data as { nodes: AXNode[] })?.nodes ?? (result.data as AXNode[]);
    const formatted = formatAXTree(Array.isArray(axNodes) ? axNodes : []);

    if (formatted.length === 0) {
      response.appendText('No accessibility nodes found. The page may be empty or not loaded.');
      return;
    }

    const tree = renderTree(formatted);
    const MAX_SIZE = 500 * 1024; // 500KB cap
    if (tree.length > MAX_SIZE) {
      response.appendText(`Page snapshot (truncated to ${MAX_SIZE / 1024}KB — ${formatted.length} nodes):\n\n${tree.slice(0, MAX_SIZE)}\n\n... (truncated)`);
    } else {
      response.appendText(`Page snapshot (${formatted.length} nodes):\n\n${tree}`);
    }
  },
});
