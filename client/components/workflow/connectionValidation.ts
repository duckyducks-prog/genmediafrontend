import { Connection } from 'reactflow';
import { 
  WorkflowNode, 
  WorkflowEdge, 
  NODE_CONFIGURATIONS, 
  canConnect, 
  validateMutualExclusion,
  ConnectorType,
  NodeType
} from './types';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Get the connector type for a given handle on a node
 */
export function getConnectorType(
  node: WorkflowNode,
  handleId: string | null | undefined,
  isSource: boolean
): ConnectorType | null {
  const config = NODE_CONFIGURATIONS[node.type as NodeType];
  if (!config) return null;

  const connectors = isSource ? config.outputConnectors : config.inputConnectors;
  const handle = handleId || 'default';
  
  const connector = connectors.find(c => c.id === handle);
  return connector ? connector.type : null;
}

/**
 * Check if an input handle already has an incoming connection
 */
export function hasExistingConnection(
  nodeId: string,
  handleId: string | null | undefined,
  edges: WorkflowEdge[]
): boolean {
  const handle = handleId || 'default';
  return edges.some(
    edge => edge.target === nodeId && (edge.targetHandle || 'default') === handle
  );
}

/**
 * Validate a connection attempt between two nodes
 */
export function validateConnection(
  connection: Connection,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  // Find source and target nodes
  const sourceNode = nodes.find(n => n.id === connection.source);
  const targetNode = nodes.find(n => n.id === connection.target);

  if (!sourceNode || !targetNode) {
    return { valid: false, reason: 'Source or target node not found' };
  }

  // Get node configurations
  const sourceConfig = NODE_CONFIGURATIONS[sourceNode.type as NodeType];
  const targetConfig = NODE_CONFIGURATIONS[targetNode.type as NodeType];

  if (!sourceConfig || !targetConfig) {
    return { valid: false, reason: 'Node configuration not found' };
  }

  // Get connector types
  const sourceType = getConnectorType(sourceNode, connection.sourceHandle, true);
  const targetType = getConnectorType(targetNode, connection.targetHandle, false);

  if (!sourceType || !targetType) {
    return { valid: false, reason: 'Connector not found' };
  }

  // Check type compatibility
  if (!canConnect(sourceType, targetType)) {
    return { 
      valid: false, 
      reason: `Cannot connect ${sourceType} to ${targetType}` 
    };
  }

  // Find the input connector configuration
  const targetHandle = connection.targetHandle || 'default';
  const inputConnector = targetConfig.inputConnectors.find(c => c.id === targetHandle);

  if (!inputConnector) {
    return { valid: false, reason: 'Input connector not found' };
  }

  // Check if input accepts multiple connections
  if (!inputConnector.acceptsMultiple) {
    if (hasExistingConnection(targetNode.id, connection.targetHandle, edges)) {
      return { 
        valid: false, 
        reason: `${inputConnector.label} only accepts one connection` 
      };
    }
  }

  // Check mutual exclusion for GenerateVideo nodes
  if (targetNode.type === NodeType.GenerateVideo) {
    // Build a map of what would be connected after this connection
    const futureConnections: Record<string, any> = {};
    
    // Add existing connections
    edges.forEach(edge => {
      if (edge.target === targetNode.id) {
        const handle = edge.targetHandle || 'default';
        if (handle === 'reference_images') {
          if (!futureConnections[handle]) {
            futureConnections[handle] = [];
          }
          futureConnections[handle].push(true);
        } else {
          futureConnections[handle] = true;
        }
      }
    });

    // Add the new connection
    const newHandle = connection.targetHandle || 'default';
    if (newHandle === 'reference_images') {
      if (!futureConnections[newHandle]) {
        futureConnections[newHandle] = [];
      }
      futureConnections[newHandle].push(true);
    } else {
      futureConnections[newHandle] = true;
    }

    // Validate mutual exclusion
    const validation = validateMutualExclusion(NodeType.GenerateVideo, futureConnections);
    if (!validation.valid) {
      return { valid: false, reason: validation.error };
    }
  }

  return { valid: true };
}
