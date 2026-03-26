import { useCallback, useEffect, useState } from "react";
import ReactFlow, { Background, Controls } from "reactflow";
import "reactflow/dist/style.css";

const TYPE_COLORS = {
  SalesOrder: "#3b82f6",
  Delivery: "#10b981",
  Billing: "#f59e0b",
  Payment: "#8b5cf6",
  Customer: "#ef4444",
  Product: "#14b8a6",
};

const NODE_TYPES = {};
const EDGE_TYPES = {};

function GraphView() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodeData, setSelectedNodeData] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadGraph() {
      try {
        setLoading(true);
        const response = await fetch(
          "https://graph-query-system-msbu.onrender.com/api/graph"
        );
        const data = await response.json();

        if (!isMounted) return;

        const mappedNodes = (data.nodes || []).map((node) => ({
          id: node.id,
          data: {
            label: node.data?.label || node.id,
            raw: node.data || {},
          },
          position: {
            x: Math.floor(Math.random() * 1201),
            y: Math.floor(Math.random() * 801),
          },
          style: {
            backgroundColor: TYPE_COLORS[node.type] || "#475569",
            color: "#ffffff",
            padding: "10px",
            borderRadius: "8px",
            fontSize: "11px",
            border: "none",
          },
        }));

        const mappedEdges = (data.edges || []).map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          animated: true,
        }));

        setNodes(mappedNodes);
        setEdges(mappedEdges);
      } catch (error) {
        console.error("Failed to load graph:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadGraph();

    return () => {
      isMounted = false;
    };
  }, []);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeData(node?.data?.raw || null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeData(null);
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {loading ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f8fafc",
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: "28px",
              height: "28px",
              border: "3px solid #cbd5e1",
              borderTop: "3px solid #3b82f6",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      ) : null}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        fitView
      >
        <Controls />
        <Background variant="dots" gap={16} size={1} />
      </ReactFlow>

      {selectedNodeData ? (
        <div
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            width: "280px",
            maxHeight: "70%",
            overflowY: "auto",
            backgroundColor: "#0f172a",
            color: "#e2e8f0",
            borderRadius: "8px",
            padding: "10px",
            zIndex: 20,
            boxShadow: "0 8px 20px rgba(0, 0, 0, 0.25)",
            fontSize: "12px",
          }}
        >
          {Object.entries(selectedNodeData).map(([key, value]) => (
            <div key={key} style={{ marginBottom: "6px" }}>
              <strong>{key}:</strong> {String(value)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default GraphView;
