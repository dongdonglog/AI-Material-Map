import { AlertTriangle, FileText, X } from 'lucide-react'
import { MaterialPreview } from '../../MaterialPreview'
import type { TopicMap, TopicWikiEvidence } from '../../types'
import type { EvidenceFocus } from '../../lib/evidence-focus'
import { useI18n } from '../../i18n'

export function TopicWikiEvidencePanel({ map, evidence, onClose }: { map: TopicMap; evidence: TopicWikiEvidence | null; onClose(): void }): React.ReactElement | null {
  const { t } = useI18n()
  if (!evidence) return null
  const material = map.materials.find((item) => item.id === evidence.materialId)
  const hasLocation = evidence.startOffset != null || evidence.endOffset != null || evidence.pageNumber != null || Boolean(evidence.heading) || Boolean(evidence.chunkId)
  const focus: EvidenceFocus | null = hasLocation ? {
    key: `${evidence.materialId}:${evidence.chunkId ?? ''}:${evidence.startOffset ?? ''}:${evidence.endOffset ?? ''}`,
    materialId: evidence.materialId,
    startOffset: evidence.startOffset ?? null,
    endOffset: evidence.endOffset ?? null,
    pageNumber: evidence.pageNumber ?? null,
    heading: evidence.heading ?? null
  } : null
  return <aside className="topic-wiki-evidence-panel" aria-label={t('wiki.sourceEvidence')}>
    <header><div><span><FileText size={15} />{t('wiki.sourceEvidence')}</span><small>{material?.type ?? t('wiki.missingMaterial')}</small></div><button className="icon-button" title={t('wiki.closeEvidence')} aria-label={t('wiki.closeEvidence')} onClick={onClose}><X size={16} /></button></header>
    {!material || material.availability === 'unavailable' ? <div className="topic-wiki-evidence-unavailable"><AlertTriangle size={22} /><strong>{t('wiki.evidenceUnavailable')}</strong><p>{evidence.title}</p>{evidence.excerpt && <blockquote>{evidence.excerpt}</blockquote>}</div> : <div className="topic-wiki-source-reader">
      <div className="topic-wiki-source-title"><h2>{material.displayTitle ?? material.title}</h2><p>{[evidence.pageNumber ? t('wiki.pageNumber', { page: evidence.pageNumber }) : '', evidence.heading ?? ''].filter(Boolean).join(' · ') || t('wiki.fullMaterial')}</p></div>
      <div className="topic-wiki-source-document"><MaterialPreview material={material} text={material.extractedText ?? material.excerpt ?? evidence.excerpt ?? ''} focus={focus} /></div>
    </div>}
  </aside>
}
