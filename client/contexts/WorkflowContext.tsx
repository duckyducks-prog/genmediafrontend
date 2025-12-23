import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { Node, Edge } from "reactflow";

// State shape
export interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };
  isDirty: boolean;
  lastSaved: Date | null;
}

// Actions
export type WorkflowAction =
  | { type: "SET_NODES"; payload: Node[] }
  | { type: "SET_EDGES"; payload: Edge[] }
  | { type: "SET_VIEWPORT"; payload: { x: number; y: number; zoom: number } }
  | { type: "UPDATE_NODE"; payload: { id: string; data: any } }
  | { type: "ADD_NODE"; payload: Node }
  | { type: "REMOVE_NODE"; payload: string }
  | { type: "ADD_EDGE"; payload: Edge }
  | { type: "REMOVE_EDGE"; payload: string }
  | { type: "CLEAR_WORKFLOW" }
  | { type: "LOAD_WORKFLOW"; payload: WorkflowState }
  | { type: "MARK_SAVED" };

// Initial state
const initialState: WorkflowState = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  isDirty: false,
  lastSaved: null,
};

// Reducer
function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case "SET_NODES":
      return { ...state, nodes: action.payload, isDirty: true };

    case "SET_EDGES":
      return { ...state, edges: action.payload, isDirty: true };

    case "SET_VIEWPORT":
      return { ...state, viewport: action.payload };

    case "UPDATE_NODE":
      return {
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === action.payload.id
            ? { ...node, data: { ...node.data, ...action.payload.data } }
            : node
        ),
        isDirty: true,
      };

    case "ADD_NODE":
      return { ...state, nodes: [...state.nodes, action.payload], isDirty: true };

    case "REMOVE_NODE":
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.payload),
        edges: state.edges.filter(
          (e) => e.source !== action.payload && e.target !== action.payload
        ),
        isDirty: true,
      };

    case "ADD_EDGE":
      return { ...state, edges: [...state.edges, action.payload], isDirty: true };

    case "REMOVE_EDGE":
      return {
        ...state,
        edges: state.edges.filter((e) => e.id !== action.payload),
        isDirty: true,
      };

    case "CLEAR_WORKFLOW":
      return { ...initialState, isDirty: false };

    case "LOAD_WORKFLOW":
      return { ...action.payload, isDirty: false };

    case "MARK_SAVED":
      return { ...state, isDirty: false, lastSaved: new Date() };

    default:
      return state;
  }
}

// Context
interface WorkflowContextType {
  state: WorkflowState;
  dispatch: React.Dispatch<WorkflowAction>;
}

const WorkflowContext = createContext<WorkflowContextType | null>(null);

// Storage key
const STORAGE_KEY = "genmedia-workflow-state";

// Provider component
export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workflowReducer, initialState, () => {
    // Initialize from localStorage if available
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return {
            ...parsed,
            isDirty: false,
            lastSaved: parsed.lastSaved ? new Date(parsed.lastSaved) : null,
          };
        } catch (e) {
          console.warn("Failed to parse saved workflow:", e);
        }
      }
    }
    return initialState;
  });

  // Auto-save to localStorage on changes (debounced)
  useEffect(() => {
    if (!state.isDirty) return;

    const timeout = setTimeout(() => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          nodes: state.nodes,
          edges: state.edges,
          viewport: state.viewport,
          lastSaved: new Date().toISOString(),
        })
      );
      dispatch({ type: "MARK_SAVED" });
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeout);
  }, [state.nodes, state.edges, state.viewport, state.isDirty]);

  return (
    <WorkflowContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkflowContext.Provider>
  );
}

// Main hook to access context
export function useWorkflow() {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error("useWorkflow must be used within WorkflowProvider");
  }
  return context;
}

// Convenience hook for nodes
export function useWorkflowNodes() {
  const { state, dispatch } = useWorkflow();

  const setNodes = useCallback(
    (nodes: Node[] | ((prev: Node[]) => Node[])) => {
      const newNodes = typeof nodes === "function" ? nodes(state.nodes) : nodes;
      dispatch({ type: "SET_NODES", payload: newNodes });
    },
    [state.nodes, dispatch]
  );

  return [state.nodes, setNodes] as const;
}

// Convenience hook for edges
export function useWorkflowEdges() {
  const { state, dispatch } = useWorkflow();

  const setEdges = useCallback(
    (edges: Edge[] | ((prev: Edge[]) => Edge[])) => {
      const newEdges = typeof edges === "function" ? edges(state.edges) : edges;
      dispatch({ type: "SET_EDGES", payload: newEdges });
    },
    [state.edges, dispatch]
  );

  return [state.edges, setEdges] as const;
}
