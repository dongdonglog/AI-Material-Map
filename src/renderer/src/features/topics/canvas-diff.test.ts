import { describe, expect, it } from 'vitest'
import { projectCanvasDiff } from './canvas-diff'
import type { TopicMap, TopicProposal } from '../../types'

const map = { topic: { id: 'topic', name: 'Topic', revision: 2, viewMode: 'map', confirmedOnly: false }, materials: [{ id: 'a', title: 'Alpha', type: 'note', canvasX: 100, canvasY: 120, cardWidth: 220, cardHeight: 116 }, { id: 'b', title: 'Beta', type: 'note', canvasX: 460, canvasY: 120, cardWidth: 220, cardHeight: 116 }], relations: [], workstreams: [], candidates: [] } as unknown as TopicMap
const proposal = (kind: string, payload: Record<string, unknown>, id: string): TopicProposal => ({ id, topicId: 'topic', kind, reason: 'Supported by the selected materials.', evidence: 'Evidence excerpt', materialId: null, relationId: null, payload, status: 'pending', createdAt: '', updatedAt: '', baseRevision: 2, source: 'canvas-ai', stale: false })

describe('projectCanvasDiff', () => {
  it('projects relation, layout, style, and workstream proposals without mutating the map', () => {
    const result = projectCanvasDiff(map, [
      proposal('create_relation', { sourceMaterialId: 'a', targetMaterialId: 'b', label: 'depends on' }, 'relation'),
      proposal('layout', { positions: [{ materialId: 'a', x: 200, y: 300 }] }, 'layout'),
      proposal('set_card_style', { materialId: 'b', color: '#08776f' }, 'style'),
      proposal('create_workstream', { name: 'Workflow', materialIds: ['a', 'b'] }, 'stream')
    ])
    expect(result.counts).toEqual({ relations: 1, cards: 2, workstreams: 1 })
    expect(result.relations[0]).toMatchObject({ source: 'a', target: 'b', label: 'depends on' })
    expect(result.cards[0]).toMatchObject({ materialId: 'a', x: 200, y: 300, kind: 'layout' })
    expect(result.workstreams[0]).toMatchObject({ name: 'Workflow', materialIds: ['a', 'b'] })
    expect(map.relations).toHaveLength(0)
  })

  it('excludes archived, stale, malformed, and unknown proposals', () => {
    const stale = { ...proposal('create_relation', { sourceMaterialId: 'a', targetMaterialId: 'b' }, 'stale'), stale: true }
    const archived = { ...proposal('create_relation', { sourceMaterialId: 'a', targetMaterialId: 'b' }, 'archived'), status: 'archived' as const }
    expect(projectCanvasDiff(map, [stale, archived, proposal('create_relation', { sourceMaterialId: 'missing', targetMaterialId: 'b' }, 'bad')]).counts).toEqual({ relations: 0, cards: 0, workstreams: 0 })
  })
})
