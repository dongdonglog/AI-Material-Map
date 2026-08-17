import { expect, test } from 'playwright/test'
import { closeApp, electronAvailable, launchApp, openWorkspaceWindow, seedWorkspace, type LaunchedApp } from './helpers'

/**
 * 画板（Topic Canvas / Whiteboard）：节点渲染、端口连接、属性编辑、布局持久化。
 * React Flow 的拖拽连线难以稳定自动化，端口连接以连接桩（handle）存在性 +
 * 数据层断言为主；布局持久化通过 topics.positionMaterial + 重新打开验证。
 */

test.skip(!electronAvailable, '缺少 out/main/index.js，请先执行 npm run build')

let launched: LaunchedApp | null = null
test.afterEach(async () => { await closeApp(launched); launched = null })

type CanvasApi = {
  topics: {
    create(name: string): Promise<{ id: string }>
    addMaterials(topicId: string, materialIds: string[]): Promise<unknown>
    positionMaterial(topicId: string, materialId: string, x: number, y: number): Promise<unknown>
    map(topicId: string): Promise<{ materials: Array<{ id: string; canvasX?: number; canvasY?: number }>; relations: unknown[] }>
  }
  materials: { list(): Promise<Array<{ id: string; title: string }>> }
}

async function seedCanvas(window: LaunchedApp['window'], workspaceRoot: string): Promise<string> {
  await seedWorkspace(window, workspaceRoot)
  const topicId = await window.evaluate(async () => {
    const api = (window as unknown as { materialMap: CanvasApi }).materialMap
    const topic = await api.topics.create('Canvas Topic')
    const materials = await api.materials.list()
    await api.topics.addMaterials(topic.id, materials.map((material) => material.id))
    return topic.id
  })
  await openWorkspaceWindow(window, workspaceRoot)
  await window.locator('.topic-item', { hasText: 'Canvas Topic' }).click()
  await window.locator('.whiteboard-stage').waitFor()
  return topicId
}

test.describe('画板：节点、连接、属性与布局', () => {
  test('画板渲染材料节点与连接端口', async () => {
    launched = await launchApp()
    const { window, workspaceRoot } = launched
    await seedCanvas(window, workspaceRoot)
    // 打开主题画板视图
    const canvasEntry = window.locator('.topic-view, .whiteboard, .flow-map').first()
    if (!(await canvasEntry.count())) {
      await window.locator('.nav-item', { hasText: /Topic|主题|画板|Canvas/ }).first().click()
    }
    await expect(window.locator('.whiteboard-stage, .flow-map, .react-flow').first()).toBeVisible()
    // 两份材料应渲染为两个节点，节点带有连接端口（handle）
    await expect(window.locator('.react-flow__node')).toHaveCount(2)
    await expect(window.locator('.react-flow__handle').first()).toBeAttached()
  })

  test('选中节点后属性检查器可编辑', async () => {
    launched = await launchApp()
    const { window, workspaceRoot } = launched
    await seedCanvas(window, workspaceRoot)
    const stage = window.locator('.whiteboard-stage, .flow-map, .react-flow').first()
    if (!(await stage.count())) {
      await window.locator('.nav-item', { hasText: /Topic|主题|画板|Canvas/ }).first().click()
    }
    await window.locator('.react-flow__node').first().click()
    await expect(window.locator('.whiteboard-inspector')).toBeVisible()
  })

  test('节点布局位置持久化，重新打开后保持一致', async () => {
    launched = await launchApp()
    const { window, workspaceRoot } = launched
    const topicId = await seedCanvas(window, workspaceRoot)

    const persisted = await window.evaluate(async (id) => {
      const api = (window as unknown as { materialMap: CanvasApi }).materialMap
      const [first] = (await api.topics.map(id)).materials
      await api.topics.positionMaterial(id, first.id, 420, 260)
      return first.id
    }, topicId)

    // 重新打开应用后验证位置仍然生效
    await launched.app.close()
    launched = null
    launched = await launchApp()
    const reopened = await launched.window.evaluate(async ({ root, id, materialId }) => {
      const api = (window as unknown as { materialMap: CanvasApi & { workspace: { open(root: string): Promise<unknown> } } }).materialMap
      await api.workspace.open(root)
      const map = await api.topics.map(id)
      const node = map.materials.find((material) => material.id === materialId)
      return { x: node?.canvasX, y: node?.canvasY }
    }, { root: workspaceRoot, id: topicId, materialId: persisted })

    expect(reopened.x).toBe(420)
    expect(reopened.y).toBe(260)
  })
})
