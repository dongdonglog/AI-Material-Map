import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, type NodeProps } from '@xyflow/react'

export type ProposalNodeData = { title: string; detail: string; kind: 'layout' | 'style' | 'sequence'; color: string | null }
export type WorkstreamContainerNodeData = { name: string; color: string; memberCount: number; collapsed: boolean; pending?: boolean; reason?: string }
export type ProposalEdgeData = { label: string; kind: 'create-relation' | 'rename-relation'; reason: string }

export function ProposalNode({ data }: NodeProps): React.ReactElement {
  const item = data as ProposalNodeData
  return <div className={`proposal-node ${item.kind}`} style={{ borderColor: item.color ?? undefined }}><strong>{item.title}</strong><span>{item.detail}</span></div>
}

export function WorkstreamContainerNode({ data }: NodeProps): React.ReactElement {
  const item = data as WorkstreamContainerNodeData
  return <div className={`workstream-container-node ${item.collapsed ? 'collapsed' : ''} ${item.pending ? 'pending' : ''}`} style={{ '--workstream-color': item.color } as React.CSSProperties}>
    <strong>{item.name}</strong><span>{item.memberCount} cards{item.pending && item.reason ? ` · ${item.reason}` : ''}</span>
  </div>
}

export function ProposalEdge({ sourceX, sourceY, targetX, targetY, data: rawData }: EdgeProps): React.ReactElement {
  const data = rawData as ProposalEdgeData
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY })
  return <>
    <BaseEdge path={path} className={`proposal-edge ${data.kind}`} />
    <EdgeLabelRenderer><div className="proposal-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }} title={data.reason}>{data.label}</div></EdgeLabelRenderer>
  </>
}
