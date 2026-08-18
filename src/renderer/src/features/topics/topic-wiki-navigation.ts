import type { TopicMap, TopicWikiContent } from '../../types'

export type TopicWikiSectionId = 'summary' | 'keyPoints' | 'relations' | 'openQuestions'
export type TopicWikiMaterial = TopicMap['materials'][number]

export interface TopicWikiMaterialGroup {
  id: string
  name: string
  color: string
  unassigned: boolean
  materials: TopicWikiMaterial[]
}

const materialTitle = (material: TopicWikiMaterial): string => material.displayTitle ?? material.title

export function sortTopicWikiMaterials(materials: TopicWikiMaterial[]): TopicWikiMaterial[] {
  return [...materials].sort((left, right) => {
    const leftSequence = left.sequence ?? Number.POSITIVE_INFINITY
    const rightSequence = right.sequence ?? Number.POSITIVE_INFINITY
    if (leftSequence !== rightSequence) return leftSequence - rightSequence
    const added = String(left.addedAt ?? '\uffff').localeCompare(String(right.addedAt ?? '\uffff'))
    return added || materialTitle(left).localeCompare(materialTitle(right), undefined, { numeric: true })
  })
}

export function groupTopicWikiMaterials(map: TopicMap): TopicWikiMaterialGroup[] {
  const groups = [...map.workstreams]
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name))
    .map((workstream) => ({
      id: workstream.id,
      name: workstream.name,
      color: workstream.color,
      unassigned: false,
      materials: sortTopicWikiMaterials(map.materials.filter((material) => material.workstreamId === workstream.id))
    }))
    .filter((group) => group.materials.length > 0)
  const unassigned = sortTopicWikiMaterials(map.materials.filter((material) => !material.workstreamId || !map.workstreams.some((workstream) => workstream.id === material.workstreamId)))
  if (unassigned.length) groups.push({ id: 'unassigned', name: '', color: '#8c999d', unassigned: true, materials: unassigned })
  return groups
}

export function topicWikiSectionCounts(content: TopicWikiContent | null): Record<TopicWikiSectionId, number> {
  return {
    summary: content?.summary.trim() ? 1 : 0,
    keyPoints: content?.keyPoints.length ?? 0,
    relations: content?.relations.length ?? 0,
    openQuestions: content?.openQuestions.length ?? 0
  }
}
