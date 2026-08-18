import { useEffect, useState } from 'react'
import { ErrorBoundary } from '../../app/ErrorBoundary'
import type { Material, TopicMap, TopicWorkspaceView } from '../../types'
import { TopicCanvas } from './TopicCanvas'
import { TopicWikiView } from './TopicWikiView'

export function TopicBoardPage({ map, materials, view, onRefresh, onImportFiles, onBack }: { map: TopicMap; materials: Material[]; view: TopicWorkspaceView; onRefresh(): Promise<void>; onImportFiles(paths: string[], position: { x: number; y: number }): Promise<void>; onBack?: () => void }): React.ReactElement {
  const [wikiVisited, setWikiVisited] = useState(view === 'wiki')
  useEffect(() => { if (view === 'wiki') setWikiVisited(true) }, [view])
  return <section className="topic-workspace">
    <div id="topic-view-panel-canvas" className={`topic-workspace-panel${view === 'canvas' ? ' active' : ''}`} role="tabpanel" aria-labelledby="topic-view-tab-canvas" aria-hidden={view !== 'canvas'}>
      <ErrorBoundary fallback={(error, retry) => <section className="topic-error"><h2>主题画板无法加载</h2><p>{error.message || '主题数据或画布渲染发生错误。'}</p>{onBack && <button className="secondary-button" onClick={onBack}>返回工作台</button>}<button className="primary-button" onClick={retry}>重试</button></section>}><TopicCanvas map={map} materials={materials} onRefresh={onRefresh} onImportFiles={onImportFiles} /></ErrorBoundary>
    </div>
    {wikiVisited ? <div id="topic-view-panel-wiki" className={`topic-workspace-panel${view === 'wiki' ? ' active' : ''}`} role="tabpanel" aria-labelledby="topic-view-tab-wiki" aria-hidden={view !== 'wiki'}>
      <ErrorBoundary fallback={(error, retry) => <section className="topic-error"><h2>主题 Wiki 无法加载</h2><p>{error.message || 'Wiki 数据或阅读视图发生错误。'}</p><button className="primary-button" onClick={retry}>重试</button></section>}><TopicWikiView map={map} /></ErrorBoundary>
    </div> : null}
  </section>
}
