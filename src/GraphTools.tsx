"use client";
import { useEffect } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { ENode, GameFile } from "./model";
import { useStore } from "./store";
import { canRedoGraph, canUndoGraph } from "./graph-history";

const absolutePosition = (node: ENode, all: ENode[]): { x: number; y: number } => {
  const parent = node.parentId ? all.find(n => n.id === node.parentId) : undefined;
  if (!parent) return { ...node.position };
  const p = absolutePosition(parent, all);
  return { x: p.x + node.position.x, y: p.y + node.position.y };
};
const descendants = (groupId: string, all: ENode[]) => {
  const result = new Set<string>();
  let frontier = [groupId];
  while (frontier.length) {
    const next = all.filter(n => n.parentId && frontier.includes(n.parentId));
    next.forEach(n => result.add(n.id)); frontier = next.map(n => n.id);
  }
  return result;
};
const orderByParent = (nodes: ENode[]) => {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const depth = (n: ENode, seen = new Set<string>()): number => {
    if (!n.parentId || seen.has(n.id)) return 0;
    const parent = byId.get(n.parentId); if (!parent) return 0;
    const next = new Set(seen); next.add(n.id); return depth(parent, next) + 1;
  };
  return nodes.map((node, index) => ({ node, index, depth: depth(node) })).sort((a, b) => a.depth - b.depth || a.index - b.index).map(x => x.node);
};
const withCollapsedVisibility = (nodes: ENode[], edges: GameFile["edges"]) => {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const collapsedAncestor = (node: ENode) => {
    let found:ENode|undefined;
    let parent = node.parentId ? byId.get(node.parentId) : undefined;
    while (parent) { if (parent.data.kind === "group" && parent.data.collapsed) found=parent; parent = parent.parentId ? byId.get(parent.parentId) : undefined; }
    return found;
  };
  const next = nodes.map(n => ({ ...n, hidden: !!collapsedAncestor(n) }));
  const edgeViews = edges.map(e => {
    const source=byId.get(e.source),target=byId.get(e.target),sourceGroup=source&&collapsedAncestor(source),targetGroup=target&&collapsedAncestor(target);
    const viewed={...e,source:sourceGroup?.id??e.source,target:targetGroup?.id??e.target,sourceHandle:sourceGroup?`out-${e.source}`:e.sourceHandle,targetHandle:targetGroup?`in-${e.target}`:e.targetHandle};
    return {...viewed,hidden:viewed.source===viewed.target};
  });
  return { nodes: next, edges: edgeViews };
};
function saveGraph(file: GameFile, nodes: ENode[], edges = file.edges) {
  const visible = withCollapsedVisibility(nodes, edges);
  useStore.getState().replace({ ...file, nodes: visible.nodes, edges, revision: file.revision + 1, updatedAt: Date.now() });
}

export function GroupNode({ id, data, selected }: NodeProps<ENode>) {
  const fileId = useStore(s => s.currentId);
  const file = useStore(s => s.files.find(f => f.id === s.currentId));
  const count = file ? descendants(id, file.nodes).size : 0;
  const group=file?.nodes.find(n=>n.id===id),collapsed=!!group?.data.collapsed;
  const ports=file&&collapsed?file.nodes.filter(n=>descendants(id,file.nodes).has(n.id)):[];
  return <div style={{ width: "100%", height: "100%", minWidth: 180, border: `1px solid ${selected ? "#c4b5fd" : "#685b91"}`, borderRadius: 10, background: "rgba(84,69,124,.15)", color: "#e9e3ff", boxShadow: selected ? "0 0 0 1px #c4b5fd44" : undefined }}>
    <NodeResizer isVisible={!!selected&&!file?.running} minWidth={250} minHeight={90} color="#a78bfa" onResizeEnd={(_,params)=>{if(!file)return;useStore.getState().replace({...file,nodes:file.nodes.map(n=>n.id===id?{...n,style:{...n.style,width:params.width,height:params.height}}:n),revision:file.revision+1,updatedAt:Date.now()});}}/>
    <div style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 10px", borderBottom: "1px solid #685b9155", background: "#41375a55", borderRadius: "10px 10px 0 0", fontSize: 10, fontWeight: 700 }}>
      <span style={{ color: "#c4b5fd" }}>▦</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{data.title}</span>
      <button aria-label={data.collapsed ? "Expand group" : "Collapse group"} title={`${data.collapsed ? "Expand" : "Collapse"} group · ${count} items`} onClick={e => { e.stopPropagation(); if (fileId) toggleGroupCollapsed(fileId, id); }} style={{ border: "1px solid #8173a8", borderRadius: 3, background: "#30283f", color: "#ddd4f5", padding: "2px 5px", fontSize: 9, pointerEvents: "all" }}>{data.collapsed ? "+" : "−"} {count}</button>
    </div>
    {ports?.map((node,index)=><span key={node.id}><Handle id={`in-${node.id}`} type="target" position={Position.Left} style={{top:42+index*11,width:7,height:7,background:"#b9a5f3",border:"1px solid #18151f"}}/><Handle id={`out-${node.id}`} type="source" position={Position.Right} style={{top:42+index*11,width:7,height:7,background:"#b9a5f3",border:"1px solid #18151f"}}/></span>)}
  </div>;
}

export function visibleGraph(nodes:ENode[],edges:GameFile["edges"]){return withCollapsedVisibility(nodes,edges);}

export function GraphTools({ file, nodes }: { file: GameFile; nodes: ENode[] }) {
  const undoGraph = useStore(s => s.undoGraph), redoGraph = useStore(s => s.redoGraph);
  useStore(s => s.files.find(f => f.id === file.id)?.revision);
  const selected = nodes.filter(n => n.selected);
  const group = () => {
    if (file.running || selected.length < 2) return;
    const chosen = selected.filter(n => !selected.some(other => other.id !== n.id && descendants(other.id, file.nodes).has(n.id)));
    const positions = chosen.map(n => absolutePosition(file.nodes.find(x => x.id === n.id) ?? n, file.nodes));
    const left = Math.min(...positions.map(p => p.x)) - 26, top = Math.min(...positions.map(p => p.y)) - 42;
    const right = Math.max(...chosen.map((n, i) => positions[i].x + ((n.width as number) || 210))) + 26;
    const bottom = Math.max(...chosen.map((n, i) => positions[i].y + ((n.height as number) || 125))) + 28;
    const id = crypto.randomUUID();
    const groupNode: ENode = { id, type: "group", position: { x: left, y: top }, style: { width: Math.max(250, right-left), height: Math.max(180, bottom-top) }, data: { kind: "group", title: "New group", description: "A named canvas group.", collapsed: false } };
    const children = chosen.map(n => { const abs = absolutePosition(file.nodes.find(x => x.id === n.id) ?? n, file.nodes); return { ...(file.nodes.find(x => x.id === n.id) ?? n), parentId: id, extent: "parent" as const, position: { x: abs.x-left, y: abs.y-top }, selected: false }; });
    const childIds = new Set(children.map(n => n.id));
    const ordered = orderByParent([...file.nodes.filter(n => !childIds.has(n.id)), groupNode, ...children]);
    saveGraph(file, ordered);
  };
  const ungroup = () => {
    if (file.running) return;
    const ids = new Set(selected.filter(n => n.data.kind === "group").map(n => n.id));
    if (!ids.size) return;
    const all = file.nodes.filter(n => !ids.has(n.id)).map(n => {
      if (!n.parentId || !ids.has(n.parentId)) return n;
      const abs = absolutePosition(n, file.nodes);
      return { ...n, parentId: undefined, extent: undefined, position: abs, selected: false };
    });
    saveGraph(file, all);
  };
  const copy = () => {
    const ids = new Set(selected.map(n => n.id));
    selected.filter(n => n.data.kind === "group").forEach(n => descendants(n.id, file.nodes).forEach(id => ids.add(id)));
    if (!ids.size) return;
    const selectedNodes = file.nodes.filter(n => ids.has(n.id));
    const selectedIds = new Set(selectedNodes.map(n => n.id));
    const clip = { nodes: selectedNodes.map(n => ({ ...n, position: n.parentId && selectedIds.has(n.parentId) ? { ...n.position } : absolutePosition(n, file.nodes) })), edges: file.edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target)) };
    localStorage.setItem("idle-lab-graph-clipboard", JSON.stringify(clip));
  };
  const paste = () => {
    if (file.running) return;
    try {
      const clip = JSON.parse(localStorage.getItem("idle-lab-graph-clipboard") || "null") as { nodes: ENode[]; edges: GameFile["edges"] } | null;
      if (!clip?.nodes?.length) return;
      const ids = new Map(clip.nodes.map(n => [n.id, crypto.randomUUID()]));
      const rootIds = new Set(clip.nodes.filter(n => !n.parentId || !ids.has(n.parentId)).map(n => n.id));
      const nodesCopy = clip.nodes.map(n => {
        const copy = structuredClone(n); const isRoot = rootIds.has(n.id);
        return { ...copy, id: ids.get(n.id)!, parentId: n.parentId && ids.has(n.parentId) ? ids.get(n.parentId) : undefined, extent: n.parentId && ids.has(n.parentId) ? "parent" as const : undefined, position: { x: n.position.x + (isRoot ? 40 : 0), y: n.position.y + (isRoot ? 40 : 0) }, selected: false, hidden: false };
      });
      const edgesCopy = clip.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ ...structuredClone(e), id: crypto.randomUUID(), source: ids.get(e.source)!, target: ids.get(e.target)!, hidden: false }));
      saveGraph(file, [...file.nodes, ...nodesCopy], [...file.edges, ...edgesCopy]);
    } catch { /* A stale or malformed browser clipboard is ignored. */ }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); copy(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); paste(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g" && !e.shiftKey) { e.preventDefault(); group(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") { e.preventDefault(); ungroup(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redoGraph(); else undoGraph(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redoGraph(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  });
  const button: React.CSSProperties = { width: "auto", height: 25, whiteSpace: "nowrap", border: "1px solid #343741", borderRadius: 5, padding: "4px 7px", background: "#20212a", color: "#c3c5cf", fontSize: 9 };
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
    <button style={button} title="Group selected nodes (Ctrl+G)" disabled={file.running || selected.length < 2} onClick={group}>Group</button>
    <button style={button} title="Ungroup selected group (Ctrl+Shift+G)" disabled={file.running || !selected.some(n => n.data.kind === "group")} onClick={ungroup}>Ungroup</button>
    <button style={button} title="Copy selected nodes and internal links (Ctrl+C)" disabled={!selected.length} onClick={copy}>Copy</button>
    <button style={button} title="Paste copied nodes (Ctrl+V)" disabled={file.running} onClick={paste}>Paste</button>
    <button style={button} title="Undo graph edit (Ctrl+Z)" disabled={file.running || !canUndoGraph(file.id)} onClick={undoGraph}>Undo</button>
    <button style={button} title="Redo graph edit (Ctrl+Shift+Z)" disabled={file.running || !canRedoGraph(file.id)} onClick={redoGraph}>Redo</button>
  </div>;
}

export function toggleGroupCollapsed(fileId: string, groupId: string) {
  const file = useStore.getState().files.find(f => f.id === fileId); if (!file || file.running) return;
  const group = file.nodes.find(n => n.id === groupId && n.data.kind === "group"); if (!group) return;
  const nodes = file.nodes.map(n => n.id === groupId ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed } } : n);
  saveGraph(file, nodes);
}
