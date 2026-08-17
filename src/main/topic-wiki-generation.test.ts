import { describe, expect, it } from 'vitest'
import type { TopicMap } from './types'
import { buildTopicWikiEvidencePacket, parseModelJson, parseTopicWikiOutline, parseTopicWikiSection } from './topic-wiki-generation'

function sampleMap(count = 1): TopicMap {
  return {
    topic: { id: 'topic-1', name: 'Workflow', description: 'A local workflow', revision: 3, viewMode: 'map', confirmedOnly: false, focusedWorkstreamId: null, createdAt: '', archivedAt: null, color: '#000000' },
    materials: Array.from({ length: count }, (_, index) => ({ id: `m${index}`, title: `Material ${index}`, excerpt: `Summary ${index}`, extractedText: `Text ${index}`, workstreamId: null })),
    workstreams: [],
    relations: [],
    candidates: [],
    history: { undo: false, redo: false, cursor: 0 }
  } as unknown as TopicMap
}

describe('topic Wiki generation contract', () => {
  it('repairs only a safe trailing comma in a complete JSON object', () => {
    expect(parseModelJson('{"summary":"ok",}')).toEqual({ summary: 'ok' })
    expect(() => parseModelJson('{"summary":"unfinished"')).toThrow()
  })

  it('bounds the evidence packet and retains chunk identity', () => {
    const map = sampleMap(100)
    const chunks = new Map(map.materials.map((material) => [material.id, [{ id: `${material.id}-c1`, materialId: material.id, ordinal: 0, text: 'Evidence '.repeat(120), startOffset: 0, endOffset: 100, pageNumber: null, heading: 'Heading', hash: '', indexedAt: '' }]]))
    const packet = buildTopicWikiEvidencePacket(map, chunks)
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(48_000)
    expect(packet.materials[0].evidence[0]).toMatchObject({ materialId: 'm0', chunkId: 'm0-c1' })
    expect(packet.materials.length).toBeLessThan(100)
  })

  it('accepts fenced outline JSON and drops evidence outside the packet', () => {
    const map = sampleMap()
    const packet = buildTopicWikiEvidencePacket(map, new Map([['m0', [{ id: 'c1', materialId: 'm0', ordinal: 0, text: 'Fact', startOffset: 0, endOffset: 4, pageNumber: null, heading: null, hash: '', indexedAt: '' }]]]))
    const outline = parseTopicWikiOutline('```json\n{"summaryFocus":"Focus","keyPoints":[{"focus":"Supported","evidenceChunkIds":["c1","outside"]}]}\n```', packet)
    expect(outline.summaryFocus).toBe('Focus')
    expect(outline.keyPoints).toEqual([{ focus: 'Supported', evidenceChunkIds: ['c1'] }])
  })

  it('normalizes a section into local evidence objects only and rejects unsupported items', () => {
    const map = sampleMap()
    const packet = buildTopicWikiEvidencePacket(map, new Map([['m0', [{ id: 'c1', materialId: 'm0', ordinal: 0, text: 'Fact', startOffset: 0, endOffset: 4, pageNumber: null, heading: null, hash: '', indexedAt: '' }]]]))
    const result = parseTopicWikiSection('{"items":[{"text":"A conclusion","evidenceChunkIds":["c1","missing"]},{"text":"Unsupported","evidenceChunkIds":["missing"]}]}', 'keyPoints', packet)
    expect(result.keyPoints).toEqual([{ text: 'A conclusion', evidence: [expect.objectContaining({ chunkId: 'c1', materialId: 'm0' })] }])
  })
})
