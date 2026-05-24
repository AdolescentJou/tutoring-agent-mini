"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/** 图谱节点 */
interface GraphNode {
  id: string;
  name: string;
  mastery: "not_started" | "basic" | "proficient" | "mastered" | "unknown";
}

/** 图谱边 */
interface GraphEdge {
  source: string;
  target: string;
}

/** 图谱数据 */
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  totalEdges: number;
}

const MASTERY_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  mastered: { color: "#16a34a", label: "已掌握", bg: "#dcfce7" },
  proficient: { color: "#2563eb", label: "熟练", bg: "#dbeafe" },
  basic: { color: "#d97706", label: "基础", bg: "#fef3c7" },
  not_started: { color: "#9ca3af", label: "未学习", bg: "#f3f4f6" },
  unknown: { color: "#e5e7eb", label: "未知", bg: "#f9fafb" },
};

export default function KnowledgeGraph() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 布局参数
  const NODE_RADIUS = 24;
  const LAYER_GAP = 120;

  /** 加载图谱数据 */
  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/knowledge-graph");
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (err) {
      console.error("加载知识图谱失败:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  /** 计算分层布局（按依赖深度） */
  function computeLayout(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    positions: Map<string, { x: number; y: number }>;
    layers: string[][];
    svgWidth: number;
    svgHeight: number;
  } | null {
    if (!data || data.nodes.length === 0) return null;

    // 拓扑排序计算层级
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const n of data.nodes) inDegree.set(n.id, 0);
    for (const e of data.edges) {
      if (!adjList.has(e.source)) adjList.set(e.source, []);
      adjList.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    }

    // BFS 分层
    const layers: string[][] = [];
    const visited = new Set<string>();
    const queue: string[] = [];

    for (const [id, deg] of inDegree) {
      if (deg === 0) { queue.push(id); visited.add(id); }
    }

    while (queue.length > 0) {
      const size = queue.length;
      const layer: string[] = [];
      for (let i = 0; i < size; i++) {
        const id = queue.shift()!;
        layer.push(id);
        for (const next of adjList.get(id) || []) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      layers.push(layer);
    }

    // 未访问的节点（环或孤立）放到最后一层
    for (const n of data.nodes) {
      if (!visited.has(n.id)) {
        if (layers.length === 0) layers.push([]);
        layers[layers.length - 1].push(n.id);
      }
    }

    // 计算坐标
    const positions = new Map<string, { x: number; y: number }>();
    const svgWidth = 800;
    const svgHeight = Math.max(400, layers.length * LAYER_GAP + 100);

    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li];
      const y = 60 + li * LAYER_GAP;
      const xStep = svgWidth / (layer.length + 1);
      layer.forEach((id, idx) => {
        positions.set(id, { x: xStep * (idx + 1), y });
      });
    }

    return { nodes: data.nodes, edges: data.edges, positions, layers, svgWidth, svgHeight };
  }

  if (loading) {
    return (
      <div className="graph-loading">
        <div className="graph-spinner" />
        <span>加载知识图谱...</span>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="graph-empty">
        <span>📊 暂无图谱数据</span>
      </div>
    );
  }

  const layout = computeLayout();
  if (!layout) return null;

  const { nodes, edges, positions, layers, svgWidth, svgHeight } = layout;

  /** 获取节点位置（安全默认值） */
  function getNodePos(id: string) {
    if (!layout) return { x: 400, y: 200 };
    const p = layout.positions.get(id);
    return p ? p : { x: 400, y: 200 };
  }

  return (
    <div className="knowledge-graph" ref={containerRef}>
      {/* 图例 */}
      <div className="graph-legend">
        <span className="legend-title">掌握程度</span>
        {Object.entries(MASTERY_CONFIG).map(([key, cfg]) => (
          <div key={key} className="legend-item">
            <span className="legend-dot" style={{ background: cfg.color }} />
            <span>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* 统计 */}
      <div className="graph-stats">
        <span>共 {data.totalNodes} 个知识点</span>
        <span>·</span>
        <span>{data.totalEdges} 条依赖关系</span>
        <span>·</span>
        <span>{layers.length} 层</span>
      </div>

      {/* SVG 图谱 */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="graph-svg"
        width="100%"
        height={`${Math.min(svgHeight, 500)}px`}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="28"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
          </marker>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 边 */}
        {edges.map((e, i) => {
          const from = getNodePos(e.source);
          const to = getNodePos(e.target);
          const isHighlighted =
            hoveredNode === e.source ||
            hoveredNode === e.target ||
            selectedNode === e.source ||
            selectedNode === e.target;

          return (
            <line
              key={`edge-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={`graph-edge ${isHighlighted ? "highlight" : ""}`}
              markerEnd="url(#arrowhead)"
            />
          );
        })}

        {/* 节点 */}
        {nodes.map((node) => {
          const p = getNodePos(node.id);
          const cfg = MASTERY_CONFIG[node.mastery] ?? MASTERY_CONFIG.unknown;
          const isHovered = hoveredNode === node.id;
          const isSelected = selectedNode === node.id;

          return (
            <g
              key={node.id}
              className="graph-node-group"
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onClick={() =>
                setSelectedNode(selectedNode === node.id ? null : node.id)
              }
            >
              {(isHovered || isSelected) && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_RADIUS + 4}
                  fill={cfg.color}
                  opacity="0.15"
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={NODE_RADIUS}
                fill={cfg.bg}
                stroke={cfg.color}
                strokeWidth={isSelected ? 3 : isHovered ? 2 : 1.5}
                filter={node.mastery === "mastered" ? "url(#glow)" : undefined}
              />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                dominantBaseline="middle"
                className="graph-label"
                fontSize={11}
                fontWeight={isSelected ? 600 : 500}
              >
                {node.name}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 节点详情浮层 */}
      {selectedNode && (() => {
        const node = nodes.find((n) => n.id === selectedNode);
        if (!node) return null;
        const cfg = MASTERY_CONFIG[node.mastery] ?? MASTERY_CONFIG.unknown;
        const p = getNodePos(selectedNode);
        const deps = edges
          .filter((e) => e.target === selectedNode)
          .map((e) => nodes.find((n) => n.id === e.source)?.name)
          .filter((x): x is string => !!x);
        const nexts = edges
          .filter((e) => e.source === selectedNode)
          .map((e) => nodes.find((n) => n.id === e.target)?.name)
          .filter((x): x is string => !!x);

        return (
          <div
            className="graph-tooltip"
            style={{
              left: `${Math.min(p.x + 40, svgWidth - 180)}px`,
              top: `${p.y}px`,
            }}
          >
            <div className="tooltip-name">{node.name}</div>
            <div className="tooltip-mastery">
              <span
                className="mastery-badge"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {cfg.label}
              </span>
            </div>
            {deps.length > 0 && (
              <div className="tooltip-rel">
                <span className="rel-label">前置:</span>{" "}
                {deps.join("、")}
              </div>
            )}
            {nexts.length > 0 && (
              <div className="tooltip-rel">
                <span className="rel-label">后继:</span>{" "}
                {nexts.join("、")}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
