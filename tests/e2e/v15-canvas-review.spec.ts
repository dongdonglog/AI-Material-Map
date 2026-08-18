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

async function startWikiModel(): Promise<string> {
  modelServer = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.url === '/api/tags') { response.end(JSON.stringify({ models: [{ name: 'wiki-e2e-model' }] })); return }
    let body = ''
    request.on('data', (chunk) => { body += String(chunk) })
    request.on('end', () => {
      const prompt = String((JSON.parse(body) as { prompt?: string }).prompt ?? '')
      if (prompt.includes('planning a topic Wiki')) {
        const packet = JSON.parse(prompt.slice(prompt.indexOf('Topic packet: ') + 'Topic packet: '.length)) as { materials: Array<{ id: string; evidence: Array<{ chunkId: string }> }> }
        const [first, second] = packet.materials
        const firstChunk = first?.evidence[0]?.chunkId
        const secondChunk = second?.evidence[0]?.chunkId
        response.end(JSON.stringify({ response: JSON.stringify({
          summaryFocus: '本主题整理 Go 服务端开发的基础能力与 HTTP 实践路径。',
          keyPoints: [
            { focus: 'Go 的并发模型和标准库适合构建可维护的服务端程序。', evidenceChunkIds: [firstChunk] },
            { focus: 'HTTP 服务需要统一路由、超时控制与可观测性。', evidenceChunkIds: [secondChunk] }
          ],
          relations: [{ sourceMaterialId: first?.id, targetMaterialId: second?.id, label: '基础到实践', focus: '语言基础支撑 HTTP 服务的工程实现。', evidenceChunkIds: [firstChunk] }],
          openQuestions: [{ focus: '如何为高并发请求补充限流与优雅关闭策略？', evidenceChunkIds: [secondChunk] }]
        }) }))
        return
      }
      const evidence = JSON.parse(prompt.slice(prompt.indexOf('Evidence: ') + 'Evidence: '.length)) as Array<{ materialId: string; chunkId: string }>
      const outline = JSON.parse(prompt.slice(prompt.indexOf('Outline: ') + 'Outline: '.length, prompt.indexOf(' Evidence: '))) as { relations: Array<{ sourceMaterialId: string; targetMaterialId: string }> }
      const [first, second = first] = evidence
      const content = prompt.includes('Return {"summary"')
        ? { summary: '本主题以 Go 服务端开发为主线，从语言并发能力与标准库出发，进一步连接到 HTTP 路由、超时控制、日志与可观测性实践，形成从基础知识到工程落地的阅读路径。' }
        : prompt.includes('for key conclusions')
          ? { items: [{ text: 'Go 的并发模型和标准库适合构建结构清晰、易于维护的服务端程序。', evidenceChunkIds: [first?.chunkId] }, { text: 'HTTP 服务应统一处理路由、超时、错误响应和可观测性。', evidenceChunkIds: [second?.chunkId] }] }
          : prompt.includes('Return {"items":[{"sourceMaterialId"')
            ? { items: [{ sourceMaterialId: outline.relations[0]?.sourceMaterialId, targetMaterialId: outline.relations[0]?.targetMaterialId, label: '基础到实践', explanation: '语言基础为 HTTP 服务中的并发处理、错误管理和生命周期控制提供实现基础。', evidenceChunkIds: [first?.chunkId] }] }
            : { items: [{ text: '如何在高并发场景下补充限流、追踪与优雅关闭策略？', evidenceChunkIds: [first?.chunkId] }] }
      response.end(JSON.stringify({ response: JSON.stringify(content) }))
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

  test('switches to the full topic Wiki workspace while keeping the canvas mounted', async () => {
    launched = await launchApp()
    const { window, workspaceRoot } = launched
    await seedWorkspace(window, workspaceRoot)
    const topicName = `Wiki topic ${Date.now()}`
    await window.evaluate(async (name) => {
      const api = (window as unknown as { materialMap: any }).materialMap
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const jobs = await api.jobs()
        if (jobs.every((job: { status: string }) => job.status === 'complete' || job.status === 'failed')) break
        await new Promise((resolve) => window.setTimeout(resolve, 50))
      }
      const materials = await api.materials.list()
      const topic = await api.topics.create(name)
      await api.topics.addMaterials(topic.id, materials.map((material: { id: string }) => material.id))
    }, topicName)
    await window.reload()
    await window.locator('button', { hasText: workspaceRoot }).click()
    await window.locator('.app-shell').waitFor()
    await window.locator('.topic-item', { hasText: topicName }).click()
    await expect(window.locator('.whiteboard-stage')).toBeVisible()
    await expect(window.getByRole('tab', { name: '主题画板' })).toHaveAttribute('aria-selected', 'true')
    await window.getByRole('tab', { name: '主题 Wiki' }).click()
    await expect(window.locator('.topic-wiki-workspace')).toBeVisible()
    await expect(window.getByText('还没有主题 Wiki')).toBeVisible()
    await expect(window.locator('.topic-wiki-material-groups button').first()).toBeVisible()
    await expect(window.locator('.whiteboard-stage')).toHaveCount(1)
    await expect(window.locator('.whiteboard-stage')).toBeHidden()
    await window.getByRole('tab', { name: '主题画板' }).click()
    await expect(window.locator('.whiteboard-stage')).toBeVisible()
  })

  test('reviews a generated Wiki, records its version, and locates cited source text', async () => {
    const modelBaseUrl = await startWikiModel()
    launched = await launchApp()
    const { window, workspaceRoot } = launched
    await window.evaluate(async (root) => {
      const api = (window as unknown as { materialMap: any }).materialMap
      await api.workspace.create(root, 'Go 服务端知识库')
      await api.materials.document('01-Go语言基础.md', '# Go 语言基础\nGo 通过 goroutine、channel 和标准库支持高并发服务，并保持代码结构清晰。', 'md')
      await api.materials.document('02-HTTP服务实践.md', '# HTTP 服务实践\nHTTP 服务需要统一路由、超时控制、错误响应、日志与可观测性。', 'md')
    }, workspaceRoot)
    const topicName = 'Go 服务端开发'
    await window.evaluate(async ({ name, baseUrl }) => {
      const api = (window as unknown as { materialMap: any }).materialMap
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const jobs = await api.jobs()
        if (jobs.every((job: { status: string }) => job.status === 'complete' || job.status === 'failed')) break
        await new Promise((resolve) => window.setTimeout(resolve, 50))
      }
      const materials = await api.materials.list()
      const topic = await api.topics.create(name)
      await api.topics.addMaterials(topic.id, materials.map((material: { id: string }) => material.id))
      const profile = await api.profiles.save({ name: `Wiki test model ${Date.now()}`, provider: 'ollama', wireApi: 'chat_completions', baseUrl })
      await api.settings.save({ profileId: profile.id, provider: profile.provider, baseUrl: profile.baseUrl, chatModel: profile.recommendedModel ?? 'wiki-e2e-model', embeddingModel: '', allowCloud: false, enabled: true })
    }, { name: topicName, baseUrl: modelBaseUrl })
    await window.reload()
    await window.locator('button', { hasText: workspaceRoot }).click()
    await window.locator('.topic-item', { hasText: topicName }).click()
    await window.getByRole('tab', { name: '主题 Wiki' }).click()
    await window.getByRole('button', { name: '生成 Wiki' }).click()
    await expect(window.locator('.topic-wiki-draft-banner')).toBeVisible()
    await expect(window.locator('.topic-wiki-evidence button').first()).toBeVisible()
    await window.getByRole('button', { name: '忽略草稿' }).click()
    await expect(window.getByText('Wiki 草稿已忽略。')).toBeVisible()
    await expect(window.locator('.topic-wiki-draft-banner')).toHaveCount(0)
    await window.getByRole('button', { name: '生成 Wiki' }).click()
    await expect(window.locator('.topic-wiki-draft-banner')).toBeVisible()
    await window.getByRole('button', { name: '应用草稿' }).click()
    await expect(window.getByText('Wiki 草稿已应用。')).toBeVisible()
    await window.getByRole('button', { name: '版本历史' }).click()
    await expect(window.locator('.topic-wiki-history-dialog')).toBeVisible()
    await expect(window.locator('.topic-wiki-history-dialog').getByText('版本 1', { exact: true })).toBeVisible()
    await window.locator('.topic-wiki-history-dialog > header .icon-button').click()
    await window.locator('.topic-wiki-material-groups button').first().click()
    await expect(window.locator('.topic-wiki-evidence-panel')).toBeVisible()
    await expect(window.locator('.topic-wiki-source-title h2')).toBeVisible()
    await expect(window.locator('[data-evidence-highlight]')).toHaveCount(0)
    await window.getByRole('button', { name: '关闭证据原文' }).click()
    await window.locator('.topic-wiki-evidence button').first().click()
    await expect(window.locator('.topic-wiki-evidence-panel')).toBeVisible()
    await expect(window.locator('.evidence-locator')).toBeVisible()
    await expect(window.locator('[data-evidence-highlight]')).toBeVisible()
    await expect(window.locator('.topbar h1')).toHaveText(topicName)
    await window.getByRole('button', { name: '关闭证据原文' }).click()
    await expect(window.locator('.topic-wiki-evidence-panel')).toHaveCount(0)
    await expect(window.locator('.topic-wiki-workspace')).toBeVisible()
    await window.getByRole('button', { name: '撤销应用' }).click()
    await expect(window.getByText('已恢复到上一个正式版本。')).toBeVisible()
    await expect(window.getByText('还没有主题 Wiki')).toBeVisible()
  })

  test('uses drawers for Wiki navigation and evidence in a narrow window', async () => {
    launched = await launchApp()
    const { window, workspaceRoot } = launched
    await seedWorkspace(window, workspaceRoot)
    const topicName = `Wiki narrow ${Date.now()}`
    await window.evaluate(async (name) => {
      const api = (window as unknown as { materialMap: any }).materialMap
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const jobs = await api.jobs()
        if (jobs.every((job: { status: string }) => job.status === 'complete' || job.status === 'failed')) break
        await new Promise((resolve) => window.setTimeout(resolve, 50))
      }
      const materials = await api.materials.list()
      const topic = await api.topics.create(name)
      await api.topics.addMaterials(topic.id, materials.map((material: { id: string }) => material.id))
    }, topicName)
    await window.reload()
    await window.setViewportSize({ width: 900, height: 760 })
    await window.locator('button', { hasText: workspaceRoot }).click()
    await window.locator('.topic-item', { hasText: topicName }).click()
    await window.getByRole('tab', { name: '主题 Wiki' }).click()
    await window.getByRole('button', { name: 'Wiki 导航' }).click()
    await expect(window.locator('.topic-wiki-navigation.mobile-open')).toBeVisible()
    await window.locator('.topic-wiki-material-groups button').first().click()
    await expect(window.locator('.topic-wiki-evidence-panel')).toBeVisible()
    const boxes = await Promise.all([window.locator('.topic-wiki-reader').boundingBox(), window.locator('.topic-wiki-evidence-panel').boundingBox()])
    expect(boxes.every(Boolean)).toBe(true)
    expect((boxes[1]?.x ?? -1) + (boxes[1]?.width ?? 0)).toBeLessThanOrEqual(901)
  })
})
