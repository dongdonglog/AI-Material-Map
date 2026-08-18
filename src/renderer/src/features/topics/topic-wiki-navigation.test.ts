import { describe, expect, it } from 'vitest'
import type { TopicMap, TopicWikiContent } from '../../types'
import { groupTopicWikiMaterials, topicWikiSectionCounts } from './topic-wiki-navigation'

const map = {
  topic: { id: 'topic', name: 'Topic' },
  workstreams: [
    { id: 'later', name: 'Later', position: 2, color: '#222222' },
    { id: 'first', name: 'First', position: 1, color: '#111111' }
  ],
  materials: [
    { id: 'b', title: 'Beta', workstreamId: 'first', sequence: 2, addedAt: '2026-01-02' },
    { id: 'a', title: 'Alpha', workstreamId: 'first', sequence: 1, addedAt: '2026-01-03' },
    { id: 'c', title: 'Charlie', workstreamId: 'later', sequence: null, addedAt: '2026-01-01' },
    { id: 'z', title: 'Zulu', workstreamId: null, sequence: null, addedAt: '2026-01-02' },
    { id: 'orphan', title: 'Orphan', workstreamId: 'missing', sequence: null, addedAt: '2026-01-01' },
    { id: 'missing-date', title: 'No date', workstreamId: null, sequence: null }
  ],
  relations: [],
  candidates: []
} as unknown as TopicMap

describe('topic Wiki navigation', () => {
  it('groups by workstream order, sorts by sequence, and puts unassigned materials last', () => {
    const groups = groupTopicWikiMaterials(map)
    expect(groups.map((group) => group.id)).toEqual(['first', 'later', 'unassigned'])
    expect(groups[0].materials.map((material) => material.id)).toEqual(['a', 'b'])
    expect(groups[2].materials.map((material) => material.id)).toEqual(['orphan', 'z', 'missing-date'])
  })

  it('reports stable section counts for empty and generated Wiki content', () => {
    expect(topicWikiSectionCounts(null)).toEqual({ summary: 0, keyPoints: 0, relations: 0, openQuestions: 0 })
    const content = { summary: 'Overview', keyPoints: [{ text: 'One', evidence: [] }], relations: [], openQuestions: [{ text: 'Question', evidence: [] }] } as TopicWikiContent
    expect(topicWikiSectionCounts(content)).toEqual({ summary: 1, keyPoints: 1, relations: 0, openQuestions: 1 })
  })
})
