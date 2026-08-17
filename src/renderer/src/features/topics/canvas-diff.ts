import type { TopicMap, TopicProposal } from '../../types'

export type CanvasDiffKind = 'create-relation' | 'rename-relation' | 'layout' | 'style' | 'sequence'

export interface CanvasDiffRelation {
  id: string
  source: string
  target: string
  label: string
  kind: Extract<CanvasDiffKind, 'create-relation' | 'rename-relation'>
  reason: string
  evidence: string
}

export interface CanvasDiffCard {
  id: string
  materialId: string
  x: number
  y: number
  title: string
  kind: Extract<CanvasDiffKind, 'layout' | 'style' | 'sequence'>
  color: string | null
  detail: string
}

export interface CanvasDiffWorkstream {
  id: string
  name: string
  color: string
  materialIds: string[]
  x: number
  y: number
  width: number
  height: number
  reason: string
}

export interface CanvasDiffProjection {
  relations: CanvasDiffRelation[]
  cards: CanvasDiffCard[]
  workstreams: CanvasDiffWorkstream[]
  counts: { relations: number; cards: number; workstreams: number }
}

const defaultPosition = (index: number): { x: number; y: number } => ({ x: 120 + (index % 4) * 340, y: 100 + Math.floor(index / 4) * 210 })
const validColor = (value: unknown): string | null => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/u.test(value) ? value : null
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''

export function projectCanvasDiff(map: TopicMap, proposals: TopicProposal[]): CanvasDiffProjection {
  const materials = new Map(map.materials.map((material, index) => [material.id, { material, position: { x: material.canvasX ?? defaultPosition(index).x, y: material.canvasY ?? defaultPosition(index).y } }]))
  const relations: CanvasDiffRelation[] = []
  const cards: CanvasDiffCard[] = []
  const workstreams: CanvasDiffWorkstream[] = []
  const pending = proposals.filter((proposal) => proposal.status === 'pending' && !proposal.stale)

  for (const proposal of pending) {
    const payload = proposal.payload ?? {}
    if (proposal.kind === 'create_relation') {
      const source = text(payload.sourceMaterialId); const target = text(payload.targetMaterialId)
      if (source && target && source !== target && materials.has(source) && materials.has(target)) relations.push({ id: `proposal:${proposal.id}`, source, target, label: text(payload.label) || '建议关系', kind: 'create-relation', reason: proposal.reason, evidence: proposal.evidence })
      continue
    }
    if (proposal.kind === 'rename_relation') {
      const relationId = text(proposal.relationId ?? payload.relationId)
      const relation = map.relations.find((item) => item.id === relationId)
      if (relation && text(payload.label)) relations.push({ id: `proposal:${proposal.id}`, source: relation.sourceMaterialId, target: relation.targetMaterialId, label: text(payload.label), kind: 'rename-relation', reason: proposal.reason, evidence: proposal.evidence })
      continue
    }
    if (proposal.kind === 'layout') {
      const positions = Array.isArray(payload.positions) ? payload.positions : []
      positions.forEach((rawPosition) => {
        if (!rawPosition || typeof rawPosition !== 'object') return
        const position = rawPosition as Record<string, unknown>; const materialId = text(position.materialId)
        const item = materials.get(materialId); const x = Number(position.x); const y = Number(position.y)
        if (!item || !Number.isFinite(x) || !Number.isFinite(y)) return
        cards.push({ id: `proposal:${proposal.id}:${materialId}`, materialId, x, y, title: item.material.displayTitle ?? item.material.title, kind: 'layout', color: null, detail: `建议位置 (${Math.round(x)}, ${Math.round(y)})` })
      })
      continue
    }
    if (proposal.kind === 'set_card_style') {
      const materialId = text(proposal.materialId ?? payload.materialId); const item = materials.get(materialId)
      if (item) cards.push({ id: `proposal:${proposal.id}:${materialId}`, materialId, x: item.position.x + 18, y: item.position.y + 18, title: item.material.displayTitle ?? item.material.title, kind: 'style', color: validColor(payload.color ?? payload.cardColor), detail: '建议卡片样式' })
      continue
    }
    if (proposal.kind === 'set_sequence') {
      const materialId = text(proposal.materialId ?? payload.materialId); const item = materials.get(materialId); const sequence = Number(payload.sequence)
      if (item && Number.isInteger(sequence)) cards.push({ id: `proposal:${proposal.id}:${materialId}`, materialId, x: item.position.x, y: item.position.y - 34, title: item.material.displayTitle ?? item.material.title, kind: 'sequence', color: null, detail: `建议顺序 ${sequence}` })
      continue
    }
    if (proposal.kind === 'create_workstream') {
      const materialIds = Array.isArray(payload.materialIds) ? payload.materialIds.map(String).filter((materialId) => materials.has(materialId)) : []
      if (!materialIds.length) continue
      const bounds = materialIds.map((materialId) => materials.get(materialId)!).reduce((current, item) => ({ left: Math.min(current.left, item.position.x), top: Math.min(current.top, item.position.y), right: Math.max(current.right, item.position.x + (item.material.cardWidth ?? 220)), bottom: Math.max(current.bottom, item.position.y + (item.material.cardHeight ?? 116)) }), { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY })
      const padding = 28
      workstreams.push({ id: `proposal:${proposal.id}`, name: text(payload.name) || '建议分组', color: validColor(payload.color) ?? '#7654a6', materialIds, x: bounds.left - padding, y: bounds.top - padding - 24, width: bounds.right - bounds.left + padding * 2, height: bounds.bottom - bounds.top + padding * 2 + 24, reason: proposal.reason })
    }
  }

  return { relations, cards, workstreams, counts: { relations: relations.length, cards: cards.length, workstreams: workstreams.length } }
}
