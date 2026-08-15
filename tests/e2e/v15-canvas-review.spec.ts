import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from 'playwright/test'
import { closeApp, electronAvailable, launchApp, seedWorkspace, type LaunchedApp } from './helpers'

test.skip(!electronAvailable, 'The packaged Electron entry point is required for this suite.')

let launched: LaunchedApp | null = null
let modelServer: Server | null = null

test.afterEach(async () => {
  await closeApp(launched)
  launched = null
  if (modelServer) await new Promise<void>((resolve) => modelServer?.close(() => resolve()))
  modelServer = null
})

async function startCanvasModel(): Promise<string> {
  modelServer = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/tags') {
      response.end(JSON.stringify({ models: [{ name: 'canvas-e2e-model' }] }))
      return
    }
    let body = ''
    request.on('data', (chunk) => { body += String(chunk) })
    request.on('end', () => {
      const prompt = String((JSON.parse(body) as { prompt?: string }).prompt ?? '')
      const contextMatch = prompt.match(/Current topic context: (.+)\. User instruction:/su)
      const context = JSON.parse(contextMatch?.[1] ?? '{}') as { materials?: Array<{ id: string }> }
      const [first, second] = context.materials ?? []
      const plan = {
        summary: 'Create a review lane and show the proposed sequence.',
        actions: [
          { id: 'relation', kind: 'create_relation', reason: 'The first document points to the second.', evidence: 'The two local documents reference each other.', materialId: null, relationId: null, payload: { sourceMaterialId: first?.id, targetMaterialId: second?.id, label: 'next', relationType: 'next', confidence: 0.9 } },
          { id: 'lane', kind: 'create_workstream', reason: 'Both documents are part of the same review.', evidence: 'They share the review context.', materialId: null, relationId: null, payload: { name: 'Review lane', materialIds: [first?.id, second?.id] } }
        ],
        warnings: []
      }
      response.end(JSON.stringify({ response: JSON.stringify(plan) }))
    })
  })
  await new Promise<void>((resolve) => modelServer?.listen(0, '127.0.0.1', resolve))
  const address = modelServer.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

test.describe('v1.5 canvas proposal review', () => {
  test('shows the AI diff before atomically applying all pending proposals', async () => {
    const modelBaseUrl = await startCanvasModel()
    launched = await launchApp()
    const { window, workspaceRoot } = launched
    await seedWorkspace(window, workspaceRoot)
    const setup = await window.evaluate(async ({ baseUrl }) => {
      const api = (window as unknown as { materialMap: any }).materialMap
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const jobs = await api.jobs()
        if (jobs.every((job: { status: string }) => job.status === 'complete' || job.status === 'failed')) break
        await new Promise((resolve) => window.setTimeout(resolve, 50))
      }
      const materials = await api.materials.list()
      const topic = await api.topics.create('Canvas review')
      await api.topics.addMaterials(topic.id, materials.map((material: { id: string }) => material.id))
      const profile = await api.profiles.save({ name: `Canvas test model ${Date.now()}`, provider: 'ollama', wireApi: 'chat_completions', baseUrl })
      await api.settings.save({ profileId: profile.id, provider: profile.provider, baseUrl: profile.baseUrl, chatModel: profile.recommendedModel ?? 'canvas-e2e-model', embeddingModel: '', allowCloud: false, enabled: true })
      const map = await api.topics.map(topic.id)
      await api.planCanvas({ topicId: topic.id, selectedMaterialIds: materials.map((material: { id: string }) => material.id), instruction: 'Create a review plan.', baseRevision: map.topic.revision, allowCloud: false })
      return { topicId: topic.id }
    }, { baseUrl: modelBaseUrl }) as { topicId: string }

    await window.reload()
    await window.locator('button', { hasText: workspaceRoot }).click()
    await expect(window.locator('.app-shell')).toBeVisible()
    await window.locator('.topic-item', { hasText: 'Canvas review' }).click()
    await expect(window.locator('.whiteboard-stage')).toBeVisible()
    await window.locator('button.proposal-tool').click()
    await expect(window.locator('.proposal-inspector')).toBeVisible()
    await expect(window.locator('.proposal-edge')).toHaveCount(1)
    await expect(window.locator('.workstream-container-node.pending')).toHaveCount(1)

    await window.locator('.proposal-batch-actions .primary-button').click()
    await expect.poll(async () => window.evaluate(async (topicId) => {
      const api = (window as unknown as { materialMap: any }).materialMap
      const map = await api.topics.map(topicId)
      return { pending: (await api.topics.proposals(topicId)).length, proposedRelations: map.relations.filter((relation: { label: string }) => relation.label === 'next').length, workstreams: map.workstreams.map((workstream: { name: string; source: string }) => ({ name: workstream.name, source: workstream.source })), undo: map.history.undo }
    }, setup.topicId)).toEqual({ pending: 0, proposedRelations: 1, workstreams: [{ name: 'Review lane', source: 'ai' }], undo: true })
  })
})
