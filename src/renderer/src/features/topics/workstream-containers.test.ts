import { describe, expect, it } from 'vitest'
import type { TopicMap } from '../../types'
import { projectWorkstreamContainers } from './workstream-containers'

describe('projectWorkstreamContainers', () => {
  it('wraps assigned cards and reduces a collapsed lane to its header', () => {
    const map = {
      materials: [
        { id: 'alpha', title: 'Alpha', workstreamId: 'lane-1', canvasX: 100, canvasY: 80, cardWidth: 240, cardHeight: 120 },
        { id: 'beta', title: 'Beta', workstreamId: 'lane-1', canvasX: 410, canvasY: 230, cardWidth: 200, cardHeight: 110 },
        { id: 'outside', title: 'Outside', workstreamId: null, canvasX: 20, canvasY: 20, cardWidth: 220, cardHeight: 116 }
      ],
      workstreams: [{ id: 'lane-1', topicId: 'topic-1', name: 'Research', position: 0, source: 'manual', color: '#3568B8', collapsed: false }],
      relations: [], candidates: [], topic: { id: 'topic-1' }, history: { undo: false, redo: false, cursor: 0 }
    } as unknown as TopicMap

    expect(projectWorkstreamContainers(map)).toEqual([expect.objectContaining({
      id: 'workstream:lane-1', x: 76, y: 28, width: 558, height: 336, memberCount: 2,
      workstream: expect.objectContaining({ color: '#3568B8' })
    })])

    map.workstreams[0].collapsed = true
    expect(projectWorkstreamContainers(map)[0]).toMatchObject({ x: 82, y: 38, width: 546, height: 36, memberCount: 2 })
  })

  it('does not emit a container for a workstream without cards', () => {
    const map = { materials: [], workstreams: [{ id: 'empty', topicId: 'topic-1', name: 'Empty', position: 0, source: 'manual', color: '#08776f', collapsed: false }], relations: [], candidates: [], topic: { id: 'topic-1' }, history: { undo: false, redo: false, cursor: 0 } } as unknown as TopicMap
    expect(projectWorkstreamContainers(map)).toEqual([])
  })
})
