import type { MaterialChunk, TopicMap, TopicWikiBullet, TopicWikiContent, TopicWikiEvidence, TopicWikiRelation } from './types'

export interface TopicWikiEvidencePacket {
  topic: { id: string; name: string; description: string; revision: number }
  materials: Array<{ id: string; title: string; summary: string; evidence: TopicWikiEvidence[] }>
  relations: Array<{ sourceMaterialId: string; targetMaterialId: string; label: string; relationType: string; evidence: string }>
  workstreams: Array<{ name: string; materialIds: string[] }>
}

export interface TopicWikiOutlineItem {
  focus: string
  evidenceChunkIds: string[]
}

export interface TopicWikiOutlineRelation extends TopicWikiOutlineItem {
  sourceMaterialId: string
  targetMaterialId: string
  label: string
}

export interface TopicWikiOutline {
  summaryFocus: string
  keyPoints: TopicWikiOutlineItem[]
  relations: TopicWikiOutlineRelation[]
  openQuestions: TopicWikiOutlineItem[]
}

export type TopicWikiSection = 'summary' | 'keyPoints' | 'relations' | 'openQuestions'

const MAX_PACKET_CHARS = 48_000
const MAX_MATERIALS = 80
const MAX_CHUNKS_PER_MATERIAL = 3
const MAX_EVIDENCE_CHARS = 420
const MAX_ITEMS = 12

function cleanText(value: unknown, limit: number): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, limit)
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function parseModelJson(text: string): Record<string, unknown> {
  let cleaned = text.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '').trim()
  for (let depth = 0; depth < 2 && cleaned.startsWith('"'); depth += 1) {
    const decoded = JSON.parse(cleaned)
    if (typeof decoded !== 'string') break
    cleaned = decoded.trim()
  }
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Model output did not contain a JSON object.')
  const candidate = cleaned.slice(start, end + 1)
  let parsed: unknown
  try { parsed = JSON.parse(candidate) as unknown } catch {
    // Providers sometimes leave a trailing comma inside an otherwise complete
    // JSON object. Repair only this unambiguous case; truncated objects still
    // go through the bounded provider retry.
    parsed = JSON.parse(candidate.replace(/,\s*([}\]])/gu, '$1')) as unknown
  }
  const object = asObject(parsed)
  if (!object) throw new Error('Model output was not a JSON object.')
  return object
}

export function buildTopicWikiEvidencePacket(map: TopicMap, chunksByMaterial: Map<string, MaterialChunk[]>): TopicWikiEvidencePacket {
  const materials: TopicWikiEvidencePacket['materials'] = []
  let used = 0
  for (const material of map.materials.slice(0, MAX_MATERIALS)) {
    const evidence = (chunksByMaterial.get(material.id) ?? []).slice(0, MAX_CHUNKS_PER_MATERIAL).map((chunk) => ({
      materialId: material.id,
      chunkId: chunk.id,
      title: material.title.slice(0, 180),
      excerpt: cleanText(chunk.text, MAX_EVIDENCE_CHARS),
      heading: chunk.heading ? cleanText(chunk.heading, 160) : null,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      pageNumber: chunk.pageNumber
    }))
    const row = { id: material.id, title: material.title.slice(0, 180), summary: cleanText(material.excerpt ?? material.extractedText ?? '', 480), evidence }
    const cost = JSON.stringify(row).length
    if (materials.length && used + cost > MAX_PACKET_CHARS) break
    materials.push(row); used += cost
  }
  const materialIds = new Set(materials.map((material) => material.id))
  return {
    topic: { id: map.topic.id, name: cleanText(map.topic.name, 180), description: cleanText(map.topic.description ?? '', 600), revision: map.topic.revision },
    materials,
    relations: map.relations.filter((relation) => materialIds.has(relation.sourceMaterialId) && materialIds.has(relation.targetMaterialId)).slice(0, 120).map((relation) => ({ sourceMaterialId: relation.sourceMaterialId, targetMaterialId: relation.targetMaterialId, label: cleanText(relation.label, 100), relationType: cleanText(relation.relationType, 60), evidence: cleanText(relation.evidenceText ?? '', 300) })),
    workstreams: map.workstreams.map((stream) => ({ name: cleanText(stream.name, 120), materialIds: map.materials.filter((material) => material.workstreamId === stream.id && materialIds.has(material.id)).map((material) => material.id) }))
  }
}

export function packetEvidence(packet: TopicWikiEvidencePacket): Map<string, TopicWikiEvidence> {
  return new Map(packet.materials.flatMap((material) => material.evidence.map((evidence) => [evidence.chunkId!, evidence] as const)))
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : []
}

function evidenceIds(row: Record<string, unknown>): string[] {
  const ids = stringArray(row.evidenceChunkIds ?? row.evidence_chunk_ids)
  if (ids.length) return ids
  return Array.isArray(row.evidence) ? row.evidence.flatMap((item) => { const object = asObject(item); return object && typeof object.chunkId === 'string' ? [object.chunkId] : [] }) : []
}

function itemFrom(value: unknown, allowedChunks: Set<string>): TopicWikiOutlineItem | null {
  const row = asObject(value); if (!row) return null
  const focus = cleanText(row.focus ?? row.text ?? row.question, 500)
  if (!focus) return null
  return { focus, evidenceChunkIds: evidenceIds(row).filter((id) => allowedChunks.has(id)).slice(0, 4) }
}

export function parseTopicWikiOutline(text: string, packet: TopicWikiEvidencePacket): TopicWikiOutline {
  const parsed = parseModelJson(text); const root = asObject(parsed.outline) ?? parsed
  const allowedChunks = new Set(packet.materials.flatMap((material) => material.evidence.map((item) => item.chunkId!)))
  const allowedMaterials = new Set(packet.materials.map((material) => material.id))
  const keyPoints = Array.isArray(root.keyPoints) ? root.keyPoints.flatMap((item) => { const parsedItem = itemFrom(item, allowedChunks); return parsedItem?.evidenceChunkIds.length ? [parsedItem] : [] }).slice(0, MAX_ITEMS) : []
  const openQuestions = Array.isArray(root.openQuestions) ? root.openQuestions.flatMap((item) => { const parsedItem = itemFrom(item, allowedChunks); return parsedItem?.evidenceChunkIds.length ? [parsedItem] : [] }).slice(0, 8) : []
  const relations = Array.isArray(root.relations) ? root.relations.flatMap((item) => {
    const row = asObject(item); if (!row) return []
    const sourceMaterialId = String(row.sourceMaterialId ?? ''); const targetMaterialId = String(row.targetMaterialId ?? '')
    const parsedItem = itemFrom(row, allowedChunks)
    if (!parsedItem?.evidenceChunkIds.length || !allowedMaterials.has(sourceMaterialId) || !allowedMaterials.has(targetMaterialId) || sourceMaterialId === targetMaterialId) return []
    return [{ ...parsedItem, sourceMaterialId, targetMaterialId, label: cleanText(row.label ?? 'related', 80) || 'related' }]
  }).slice(0, MAX_ITEMS) : []
  return { summaryFocus: cleanText(root.summaryFocus ?? root.summary, 700), keyPoints, relations, openQuestions }
}

export function fallbackTopicWikiOutline(packet: TopicWikiEvidencePacket): TopicWikiOutline {
  const firstEvidence = packet.materials.flatMap((material) => material.evidence.map((evidence) => ({ material, evidence })))
  return {
    summaryFocus: packet.topic.description || packet.materials.map((material) => material.title).join('、').slice(0, 600),
    keyPoints: firstEvidence.slice(0, 6).map(({ material, evidence }) => ({ focus: material.summary || material.title, evidenceChunkIds: [evidence.chunkId!] })),
    relations: packet.relations.slice(0, 6).flatMap((relation) => {
      const sourceEvidence = packet.materials.find((material) => material.id === relation.sourceMaterialId)?.evidence[0]
      return sourceEvidence ? [{ sourceMaterialId: relation.sourceMaterialId, targetMaterialId: relation.targetMaterialId, label: relation.label || relation.relationType || 'related', focus: relation.evidence || relation.label, evidenceChunkIds: [sourceEvidence.chunkId!] }] : []
    }),
    openQuestions: []
  }
}

export function outlinePrompt(packet: TopicWikiEvidencePacket): string {
  return `You are planning a topic Wiki overview. Return ONLY JSON with this shape: {"summaryFocus":"...","keyPoints":[{"focus":"...","evidenceChunkIds":["chunk-id"]}],"relations":[{"sourceMaterialId":"id","targetMaterialId":"id","label":"...","focus":"...","evidenceChunkIds":["chunk-id"]}],"openQuestions":[{"focus":"...","evidenceChunkIds":["chunk-id"]}]}. Choose at most 8 keyPoints, 6 relations, and 6 openQuestions. Every item must cite chunk IDs copied exactly from the packet. Do not write final prose, invent IDs, use outside knowledge, or use Markdown. Topic packet: ${JSON.stringify(packet)}`
}

export function sectionPrompt(section: TopicWikiSection, packet: TopicWikiEvidencePacket, outline: TopicWikiOutline): string {
  const evidence = packetEvidence(packet)
  const selectedIds = section === 'summary' ? [...new Set(outline.keyPoints.flatMap((item) => item.evidenceChunkIds))].slice(0, 8) : section === 'relations' ? [...new Set(outline.relations.flatMap((item) => item.evidenceChunkIds))].slice(0, 16) : section === 'openQuestions' ? [...new Set(outline.openQuestions.flatMap((item) => item.evidenceChunkIds))].slice(0, 12) : [...new Set(outline.keyPoints.flatMap((item) => item.evidenceChunkIds))].slice(0, 20)
  const evidenceContext = selectedIds.map((id) => evidence.get(id)).filter((item): item is TopicWikiEvidence => Boolean(item))
  const instruction = section === 'summary' ? 'Return {"summary":"..."} with a concise Chinese overview.' : section === 'relations' ? 'Return {"items":[{"sourceMaterialId":"id","targetMaterialId":"id","label":"...","explanation":"...","evidenceChunkIds":["id"]}]}.' : `Return {"items":[{"text":"...","evidenceChunkIds":["id"]}]} for ${section === 'keyPoints' ? 'key conclusions' : 'open questions'}.`
  return `You are filling one section of a topic Wiki. ${instruction} Use only the supplied outline and evidence. Copy material and chunk IDs exactly. Every item must cite at least one supplied evidence chunk. Return JSON only, no Markdown or prose. Outline: ${JSON.stringify(outline)} Evidence: ${JSON.stringify(evidenceContext)}`
}

function evidenceFor(ids: string[], evidence: Map<string, TopicWikiEvidence>): TopicWikiEvidence[] {
  return [...new Set(ids)].map((id) => evidence.get(id)).filter((item): item is TopicWikiEvidence => Boolean(item))
}

export function parseTopicWikiSection(text: string, section: TopicWikiSection, packet: TopicWikiEvidencePacket): Partial<TopicWikiContent> {
  const parsed = parseModelJson(text); const root = asObject(parsed.content) ?? parsed; const evidence = packetEvidence(packet)
  if (section === 'summary') return { summary: cleanText(root.summary ?? root.text, 2400) }
  const rawItems = Array.isArray(root.items) ? root.items : Array.isArray(root[section]) ? root[section] : []
  if (section === 'relations') {
    const materialIds = new Set(packet.materials.map((material) => material.id))
    const relations: TopicWikiRelation[] = rawItems.flatMap((item) => {
      const row = asObject(item); if (!row) return []
      const sourceMaterialId = String(row.sourceMaterialId ?? ''); const targetMaterialId = String(row.targetMaterialId ?? '')
      if (!materialIds.has(sourceMaterialId) || !materialIds.has(targetMaterialId) || sourceMaterialId === targetMaterialId) return []
      const explanation = cleanText(row.explanation ?? row.text, 1200); if (!explanation) return []
      const itemEvidence = evidenceFor(evidenceIds(row), evidence)
      return itemEvidence.length ? [{ sourceMaterialId, targetMaterialId, label: cleanText(row.label ?? 'related', 80) || 'related', explanation, evidence: itemEvidence }] : []
    }).slice(0, MAX_ITEMS)
    return { relations }
  }
  const bullets: TopicWikiBullet[] = rawItems.flatMap((item) => {
    const row = asObject(item); if (!row) return []
    const textValue = cleanText(row.text ?? row.focus ?? row.question, 1200); if (!textValue) return []
    const itemEvidence = evidenceFor(evidenceIds(row), evidence)
    return itemEvidence.length ? [{ text: textValue, evidence: itemEvidence }] : []
  }).slice(0, MAX_ITEMS)
  return section === 'keyPoints' ? { keyPoints: bullets } : { openQuestions: bullets }
}

export function fallbackTopicWikiContent(packet: TopicWikiEvidencePacket, outline: TopicWikiOutline): TopicWikiContent {
  const evidence = packetEvidence(packet)
  return {
    summary: outline.summaryFocus || `Topic overview: ${packet.topic.name}`,
    keyPoints: outline.keyPoints.map((item) => ({ text: item.focus, evidence: evidenceFor(item.evidenceChunkIds, evidence) })).filter((item) => item.evidence.length > 0),
    relations: outline.relations.map((item) => ({ sourceMaterialId: item.sourceMaterialId, targetMaterialId: item.targetMaterialId, label: item.label, explanation: item.focus, evidence: evidenceFor(item.evidenceChunkIds, evidence) })),
    openQuestions: outline.openQuestions.map((item) => ({ text: item.focus, evidence: evidenceFor(item.evidenceChunkIds, evidence) })).filter((item) => item.evidence.length > 0)
  }
}
