import { BookOpen, FileText, X } from 'lucide-react'
import type { TopicMap, TopicWikiContent, TopicWikiEvidence } from '../../types'
import { useI18n } from '../../i18n'
import { groupTopicWikiMaterials, topicWikiSectionCounts, type TopicWikiSectionId } from './topic-wiki-navigation'

export function TopicWikiNavigation({ map, content, activeSection, mobileOpen, onSection, onMaterial, onClose }: { map: TopicMap; content: TopicWikiContent | null; activeSection: TopicWikiSectionId; mobileOpen: boolean; onSection(section: TopicWikiSectionId): void; onMaterial(evidence: TopicWikiEvidence): void; onClose(): void }): React.ReactElement {
  const { t } = useI18n()
  const counts = topicWikiSectionCounts(content)
  const groups = groupTopicWikiMaterials(map)
  const sections: Array<{ id: TopicWikiSectionId; label: string }> = [
    { id: 'summary', label: t('wiki.summary') },
    { id: 'keyPoints', label: t('wiki.keyPoints') },
    { id: 'relations', label: t('wiki.relations') },
    { id: 'openQuestions', label: t('wiki.openQuestions') }
  ]
  return <aside className={`topic-wiki-navigation${mobileOpen ? ' mobile-open' : ''}`} aria-label={t('wiki.navigation')}>
    <header><span><BookOpen size={15} />{t('wiki.contents')}</span><button className="icon-button topic-wiki-mobile-close" title={t('wiki.close')} aria-label={t('wiki.close')} onClick={onClose}><X size={15} /></button></header>
    <nav className="topic-wiki-section-links" aria-label={t('wiki.contents')}>
      {sections.map((section) => <button key={section.id} className={activeSection === section.id ? 'active' : ''} onClick={() => onSection(section.id)}><span>{section.label}</span><small>{counts[section.id]}</small></button>)}
    </nav>
    <div className="topic-wiki-navigation-divider" />
    <div className="topic-wiki-material-heading"><span>{t('wiki.topicMaterials')}</span><small>{map.materials.length}</small></div>
    <div className="topic-wiki-material-groups">
      {groups.map((group) => <section key={group.id}>
        <h3 style={{ '--topic-group-color': group.color } as React.CSSProperties}>{group.unassigned ? t('wiki.unassignedMaterials') : group.name}</h3>
        {group.materials.map((material) => <button key={material.id} title={material.displayTitle ?? material.title} onClick={() => onMaterial({ materialId: material.id, chunkId: null, title: material.displayTitle ?? material.title, excerpt: material.displayExcerpt ?? material.excerpt ?? '', heading: null })}><FileText size={13} /><span>{material.displayTitle ?? material.title}</span></button>)}
      </section>)}
    </div>
  </aside>
}
