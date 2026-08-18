import { BookOpen, LayoutDashboard } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import type { TopicWorkspaceView } from '../../types'
import { useI18n } from '../../i18n'
import './topic-wiki.css'

export function TopicViewTabs({ view, onChange }: { view: TopicWorkspaceView; onChange(view: TopicWorkspaceView): void }): React.ReactElement {
  const { t } = useI18n()
  const items: Array<{ id: TopicWorkspaceView; label: string; icon: React.ReactElement }> = [
    { id: 'canvas', label: t('toolbar.topicCanvas'), icon: <LayoutDashboard size={15} /> },
    { id: 'wiki', label: t('wiki.title'), icon: <BookOpen size={15} /> }
  ]
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return
    event.preventDefault()
    onChange(items[next].id)
    document.getElementById(`topic-view-tab-${items[next].id}`)?.focus()
  }
  return <div className="topic-view-tabs" role="tablist" aria-label={t('wiki.topicViews')}>
    {items.map((item, index) => <button id={`topic-view-tab-${item.id}`} key={item.id} type="button" role="tab" aria-label={item.label} aria-selected={view === item.id} aria-controls={`topic-view-panel-${item.id}`} tabIndex={view === item.id ? 0 : -1} className={view === item.id ? 'active' : ''} onClick={() => onChange(item.id)} onKeyDown={(event) => onKeyDown(event, index)}>{item.icon}<span>{item.label}</span></button>)}
  </div>
}
