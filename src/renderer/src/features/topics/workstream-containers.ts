import type { TopicMap, Workstream } from '../../types'

export interface WorkstreamContainer {
  id: string
  workstream: Workstream
  x: number
  y: number
  width: number
  height: number
  memberCount: number
}

const defaultPosition = (index: number): { x: number; y: number } => ({ x: 120 + (index % 4) * 340, y: 100 + Math.floor(index / 4) * 210 })

export function projectWorkstreamContainers(map: TopicMap): WorkstreamContainer[] {
  const positions = new Map(map.materials.map((material, index) => [material.id, { x: material.canvasX ?? defaultPosition(index).x, y: material.canvasY ?? defaultPosition(index).y, width: material.cardWidth ?? 220, height: material.cardHeight ?? 116 }]))
  return map.workstreams.flatMap((workstream) => {
    const members = map.materials.filter((material) => material.workstreamId === workstream.id).map((material) => positions.get(material.id)!).filter(Boolean)
    if (!members.length) return []
    const left = Math.min(...members.map((member) => member.x)); const top = Math.min(...members.map((member) => member.y)); const right = Math.max(...members.map((member) => member.x + member.width)); const bottom = Math.max(...members.map((member) => member.y + member.height))
    if (workstream.collapsed) return [{ id: `workstream:${workstream.id}`, workstream, x: left - 18, y: top - 42, width: Math.max(220, right - left + 36), height: 36, memberCount: members.length }]
    return [{ id: `workstream:${workstream.id}`, workstream, x: left - 24, y: top - 52, width: right - left + 48, height: bottom - top + 76, memberCount: members.length }]
  })
}
