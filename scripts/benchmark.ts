/** Reproducible v1.5 canvas benchmark for 100, 300, and 500 cards. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { WorkspaceService } from '../src/main/workspace-service'
import { projectCanvasDiff } from '../src/renderer/src/features/topics/canvas-diff'
import { projectWorkstreamContainers } from '../src/renderer/src/features/topics/workstream-containers'
import { layoutTopic } from '../src/renderer/src/lib/topic-layout'

const SCALES = [100, 300, 500] as const
const WORKSTREAM_COLORS = ['#08776f', '#3568b8', '#a14569', '#b26a21', '#7654a6']
type BenchmarkDatabase = { exec(sql: string): void; run(sql: string, params?: Array<string | number | null>): void }
type ServiceInternals = { db: BenchmarkDatabase; persist(): void }
type CanvasMap = ReturnType<WorkspaceService['topicMap']>

function fitBounds(map: CanvasMap): { x: number; y: number; width: number; height: number } {
  const rects = [
    ...map.materials.map((material) => ({ x: material.canvasX ?? 0, y: material.canvasY ?? 0, width: material.cardWidth ?? 220, height: material.cardHeight ?? 116 })),
    ...projectWorkstreamContainers(map).map((container) => ({ x: container.x, y: container.y, width: container.width, height: container.height }))
  ]
  const left = Math.min(...rects.map((rect) => rect.x)); const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width)); const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function seedCanvasData(service: WorkspaceService, scale: number): { topicId: string; materialIds: string[] } {
  const database = (service as unknown as ServiceInternals).db
  const topicId = `benchmark-topic-${scale}-${randomUUID()}`
  const date = new Date().toISOString()
  const materialIds = Array.from({ length: scale }, () => randomUUID())
  const workstreamIds = Array.from({ length: 5 }, () => randomUUID())
  database.exec('BEGIN')
  database.run('INSERT INTO topics (id, name, description, created_at, archived_at, color, revision, view_mode, confirmed_only, focused_workstream_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [topicId, `Benchmark ${scale}`, null, date, null, '#08776f', 1, 'map', 0, null])
  workstreamIds.forEach((id, index) => database.run('INSERT INTO workstreams (id, topic_id, name, position, source, color, collapsed) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, topicId, `Lane ${index + 1}`, index, 'manual', WORKSTREAM_COLORS[index], 0]))
  materialIds.forEach((id, index) => {
    const title = `Material ${index + 1}`
    database.run('INSERT INTO materials (id, type, title, mime_type, source_path, stored_path, url, site_name, excerpt, extracted_text, imported_at, occurred_at, occurred_at_source, status, error, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, 'note', title, 'text/plain', null, null, null, null, title, `Synthetic canvas evidence ${index + 1}.`, date, date, 'import', 'complete', null, null])
    database.run('INSERT INTO topic_materials (topic_id, material_id, workstream_id, canvas_x, canvas_y, position_source, sequence, sequence_source, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [topicId, id, workstreamIds[index % workstreamIds.length], 120 + (index % 10) * 280, 100 + Math.floor(index / 10) * 170, 'manual', index + 1, 'manual', date])
    if (index > 0) database.run('INSERT INTO relations (id, source_material_id, target_material_id, label, relation_type, evidence_text, evidence_material_id, confidence, created_by, created_at, topic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), materialIds[index - 1], id, 'next', 'next', 'Synthetic sequence.', materialIds[index - 1], 0.8, 'manual', date, topicId])
  })
  database.exec('COMMIT')
  ;(service as unknown as ServiceInternals).persist()
  return { topicId, materialIds }
}

interface ScaleResult {
  scale: number
  seedMs: number
  topicLoadMs: number
  fitViewMs: number
  dragPersistMs: number
  layoutMs: number
  edgeCount: number
  workstreamCount: number
  proposalPreviewCount: number
}

async function benchmarkScale(scale: number): Promise<ScaleResult> {
  const root = mkdtempSync(join(tmpdir(), `material-map-bench-${scale}-`))
  const service = new WorkspaceService()
  try {
    await service.create(join(root, 'workspace'), `Bench ${scale}`)
    const seedStart = performance.now()
    const seeded = seedCanvasData(service, scale)
    const seedMs = performance.now() - seedStart

    const loadStart = performance.now()
    const map = service.topicMap(seeded.topicId)
    const proposalPreview = projectCanvasDiff(map, [{ id: 'preview-relation', topicId: seeded.topicId, kind: 'create_relation', reason: 'Benchmark preview.', evidence: 'Synthetic sequence.', materialId: null, relationId: null, payload: { sourceMaterialId: seeded.materialIds[0], targetMaterialId: seeded.materialIds[1], label: 'preview', relationType: 'next' }, status: 'pending', createdAt: '', updatedAt: '' }, { id: 'preview-lane', topicId: seeded.topicId, kind: 'create_workstream', reason: 'Benchmark preview.', evidence: 'Synthetic lane.', materialId: null, relationId: null, payload: { name: 'Preview lane', materialIds: seeded.materialIds.slice(0, 12) }, status: 'pending', createdAt: '', updatedAt: '' }])
    const topicLoadMs = performance.now() - loadStart

    const fitStart = performance.now()
    const bounds = fitBounds(map)
    if (bounds.width <= 0 || bounds.height <= 0) throw new Error('Canvas bounds were invalid.')
    const fitViewMs = performance.now() - fitStart

    const dragStart = performance.now()
    service.positionMaterial(seeded.topicId, seeded.materialIds[0], 420, 260)
    const dragged = service.topicMap(seeded.topicId).materials.find((material) => material.id === seeded.materialIds[0])
    if (dragged?.canvasX !== 420 || dragged.canvasY !== 260) throw new Error('Canvas drag did not persist.')
    const dragPersistMs = performance.now() - dragStart

    const layoutStart = performance.now()
    const positions = layoutTopic(map.materials.map((material) => ({ id: material.id, position: { x: material.canvasX ?? 0, y: material.canvasY ?? 0 }, data: {} })) as never, map.relations.map((relation) => ({ id: relation.id, source: relation.sourceMaterialId, target: relation.targetMaterialId })) as never)
    if (positions.length !== map.materials.length) throw new Error('Canvas layout did not return every card.')
    const layoutMs = performance.now() - layoutStart
    return { scale, seedMs, topicLoadMs, fitViewMs, dragPersistMs, layoutMs, edgeCount: map.relations.length, workstreamCount: map.workstreams.length, proposalPreviewCount: proposalPreview.counts.relations + proposalPreview.counts.cards + proposalPreview.counts.workstreams }
  } finally {
    service.close()
    rmSync(root, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  const scales: ScaleResult[] = []
  for (const scale of SCALES) scales.push(await benchmarkScale(scale))
  const failures = scales.flatMap((result) => [
    result.edgeCount !== result.scale - 1 ? `scale=${result.scale}: expected ${result.scale - 1} relations` : '',
    result.workstreamCount !== 5 ? `scale=${result.scale}: expected 5 workstreams` : '',
    result.proposalPreviewCount !== 2 ? `scale=${result.scale}: proposal projection failed` : ''
  ]).filter(Boolean)
  const report = { version: '1.5.0', generatedAt: new Date().toISOString(), scales, gate: { passed: failures.length === 0, failures } }
  const reportPath = process.env.MATERIAL_MAP_BENCHMARK_REPORT ?? join(tmpdir(), 'material-map-benchmark-v15.json')
  mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
  if (failures.length) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
