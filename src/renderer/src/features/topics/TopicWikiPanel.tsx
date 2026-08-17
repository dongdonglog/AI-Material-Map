import { AlertTriangle, BookOpen, Check, ExternalLink, History, RefreshCw, RotateCcw, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { TopicMap, TopicWikiBullet, TopicWikiContent, TopicWikiEvidence, TopicWikiPage, TopicWikiRevision } from '../../types'
import { useI18n } from '../../i18n'
import './topic-wiki.css'

function statusLabel(status: TopicWikiPage['status'], t: (key: any, values?: Record<string, string | number>) => string): string {
  const labels: Record<TopicWikiPage['status'], string> = { empty: t('wiki.empty' as never), current: t('wiki.current' as never), 'needs-update': t('wiki.needsUpdate' as never), draft: t('wiki.draft' as never), 'needs-review': t('wiki.needsReview' as never) }
  return labels[status]
}

function fallbackLabel(value: string, t: (key: any, values?: Record<string, string | number>) => string): string {
  const [stage, reason] = value.split(':')
  return `${t(`wiki.stage.${stage}` as never)}：${t(`wiki.fallbackReason.${reason || 'invalid-json'}` as never)}`
}

export function TopicWikiPanel({ map, onClose, onOpenEvidence }: { map: TopicMap; onClose(): void; onOpenEvidence(evidence: TopicWikiEvidence): void }): React.ReactElement {
  const { t } = useI18n()
  const [page, setPage] = useState<TopicWikiPage | null>(null)
  const [revisions, setRevisions] = useState<TopicWikiRevision[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const load = async (): Promise<void> => setPage(await window.materialMap.wiki.get(map.topic.id) as TopicWikiPage)
  useEffect(() => { void load().catch((error) => setNotice(error instanceof Error ? error.message : t('wiki.loadFailed'))) }, [map.topic.id])
  useEffect(() => { if (!busy) return; const timer = window.setInterval(() => { void load().catch(() => undefined) }, 800); return () => window.clearInterval(timer) }, [busy, map.topic.id])
  const content = useMemo<TopicWikiContent | null>(() => page?.draft?.content ?? page?.content ?? null, [page])
  const isDraft = Boolean(page?.draft)
  const diffCount = page?.draft && page.content ? (page.draft.content.summary !== page.content.summary ? 1 : 0) + Math.abs(page.draft.content.keyPoints.length - page.content.keyPoints.length) + Math.abs(page.draft.content.relations.length - page.content.relations.length) + Math.abs(page.draft.content.openQuestions.length - page.content.openQuestions.length) : 0
  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setBusy(true); setNotice('')
    try { setPage(await action() as TopicWikiPage); setNotice(success) } catch (error) { setNotice(error instanceof Error ? error.message : t('wiki.operationFailed')); await load().catch(() => undefined) } finally { setBusy(false) }
  }
  const toggleHistory = async (): Promise<void> => {
    const next = !historyOpen; setHistoryOpen(next)
    if (!next) return
    try { const items = await window.materialMap.wiki.revisions(map.topic.id) as TopicWikiRevision[]; setRevisions(items); setSelectedVersion(items.find((item) => item.version !== page?.version)?.version ?? null) } catch (error) { setNotice(error instanceof Error ? error.message : t('wiki.historyFailed')) }
  }
  const evidenceCount = content ? [...content.keyPoints, ...content.openQuestions].reduce((sum, item) => sum + item.evidence.length, 0) + content.relations.reduce((sum, item) => sum + item.evidence.length, 0) : 0
  return <aside className="topic-wiki-panel" aria-label={t('wiki.title')}>
    <header className="topic-wiki-header"><div><span className="view-pill"><BookOpen size={14} />{t('wiki.title')}</span><p>{t('wiki.subtitle')}</p></div><button className="icon-button" title={t('wiki.close')} aria-label={t('wiki.close')} onClick={onClose}><X size={17} /></button></header>
    <div className="topic-wiki-actions">
      <span className={`topic-wiki-status status-${page?.status ?? 'empty'}`}>{page ? statusLabel(page.status, t) : t('wiki.loading')}</span>
      <div className="topic-wiki-action-buttons">{page?.version ? <button className="icon-button" title={t('wiki.history')} aria-label={t('wiki.history')} disabled={busy} onClick={() => void toggleHistory()}><History size={16} /></button> : null}{page?.canUndo && !isDraft && <button className="secondary-button" disabled={busy} onClick={() => void run(() => window.materialMap.wiki.undo(map.topic.id), t('wiki.undone'))}><Undo2 size={14} />{t('wiki.undo')}</button>}<button className="primary-button" disabled={busy} onClick={() => void run(() => window.materialMap.wiki.generate(map.topic.id), t('wiki.draftReady'))}><RefreshCw size={15} />{busy ? t('wiki.generating') : page?.content ? t('wiki.generateUpdate') : t('wiki.generate')}</button></div>
    </div>
    {page?.latestRun && (busy || page.latestRun.status === 'failed' || page.latestRun.status === 'partial') ? <div className={`topic-wiki-run status-${page.latestRun.status}`}><span>{t('wiki.runStage', { stage: t(`wiki.stage.${page.latestRun.stage}` as never) })}</span>{page.latestRun.warnings.length ? <small>{t('wiki.runFallbacks', { count: page.latestRun.warnings.length })}：{page.latestRun.warnings.map((warning) => fallbackLabel(warning, t)).join('、')}</small> : null}{page.latestRun.error ? <p>{page.latestRun.error}</p> : null}</div> : null}
    {page?.checks.length ? <div className="topic-wiki-checks"><AlertTriangle size={15} /><span>{t('wiki.checks', { count: page.checks.length })}</span></div> : null}
    {isDraft && <div className="topic-wiki-draft-banner"><strong>{t('wiki.draftBanner')}</strong><span>{t('wiki.draftRevision', { revision: page?.draft?.baseRevision ?? 0 })}</span>{page?.content && <details><summary>{t('wiki.viewDiff', { count: diffCount })}</summary><div className="topic-wiki-diff"><div><small>{t('wiki.oldSummary')}</small><p>{page.content.summary}</p></div><div><small>{t('wiki.newSummary')}</small><p>{page.draft?.content.summary}</p></div><span>{t('wiki.sectionCounts', { oldPoints: page.content.keyPoints.length, newPoints: page.draft?.content.keyPoints.length ?? 0, oldRelations: page.content.relations.length, newRelations: page.draft?.content.relations.length ?? 0 })}</span></div></details>}<div><button className="secondary-button" disabled={busy} onClick={() => void run(() => window.materialMap.wiki.discard(map.topic.id), t('wiki.discarded'))}><X size={14} />{t('wiki.discard')}</button><button className="primary-button" disabled={busy || page?.status !== 'draft'} onClick={() => void run(() => window.materialMap.wiki.apply(map.topic.id), t('wiki.applied'))}><Check size={14} />{t('wiki.apply')}</button></div></div>}
    {historyOpen && <section className="topic-wiki-history"><header><strong>{t('wiki.history')}</strong><button className="icon-button" title={t('wiki.close')} aria-label={t('wiki.close')} onClick={() => setHistoryOpen(false)}><X size={14} /></button></header>{revisions.map((revision) => <article className={revision.version === page?.version ? 'current' : selectedVersion === revision.version ? 'selected' : ''} key={revision.id}><button className="topic-wiki-history-item" onClick={() => setSelectedVersion(revision.version)}><strong>{t('wiki.version', { version: revision.version })}</strong><span>{t(`wiki.editSource.${revision.editSource}` as never)}{revision.model ? ` · ${revision.model}` : ''}</span></button>{revision.version !== page?.version && <button className="icon-button" disabled={busy || isDraft} title={t('wiki.restoreVersion')} aria-label={t('wiki.restoreVersion')} onClick={() => void run(() => window.materialMap.wiki.revertRevision(map.topic.id, revision.version), t('wiki.restored'))}><RotateCcw size={14} /></button>}</article>)}{selectedVersion !== null && page?.content && revisions.find((item) => item.version === selectedVersion) ? <div className="topic-wiki-history-diff"><small>{t('wiki.oldSummary')}</small><p>{revisions.find((item) => item.version === selectedVersion)?.content.summary}</p><small>{t('wiki.newSummary')}</small><p>{page.content.summary}</p></div> : null}</section>}
    {!content ? <div className="topic-wiki-empty"><BookOpen size={28} /><strong>{t('wiki.emptyTitle')}</strong><p>{t('wiki.emptyCopy')}</p></div> : <div className="topic-wiki-content">
      <section className="topic-wiki-summary"><h3>{t('wiki.summary')}</h3><p>{content.summary}</p></section>
      <WikiBullets title={t('wiki.keyPoints')} items={content.keyPoints} emptyLabel={t('wiki.none')} noEvidenceLabel={t('wiki.noEvidence')} onOpenEvidence={onOpenEvidence} />
      <section className="topic-wiki-section"><h3>{t('wiki.relations')}</h3>{content.relations.length ? <div className="topic-wiki-relations">{content.relations.map((relation) => <article key={`${relation.sourceMaterialId}:${relation.targetMaterialId}:${relation.label}`}><strong>{titleFor(map, relation.sourceMaterialId)} <span>→</span> {titleFor(map, relation.targetMaterialId)}</strong><p>{relation.explanation}</p><WikiEvidence items={relation.evidence} emptyLabel={t('wiki.noEvidence')} onOpenEvidence={onOpenEvidence} /></article>)}</div> : <p className="topic-wiki-muted">{t('wiki.none')}</p>}</section>
      <WikiBullets title={t('wiki.openQuestions')} items={content.openQuestions} emptyLabel={t('wiki.none')} noEvidenceLabel={t('wiki.noEvidence')} onOpenEvidence={onOpenEvidence} />
      <footer className="topic-wiki-footer">{t('wiki.evidenceCount', { count: evidenceCount })}</footer>
    </div>}
    {notice && <p className="topic-wiki-notice">{notice}</p>}
  </aside>
}

function titleFor(map: TopicMap, id: string): string { const material = map.materials.find((item) => item.id === id); return material?.displayTitle ?? material?.title ?? id }
function WikiBullets({ title, items, emptyLabel, noEvidenceLabel, onOpenEvidence }: { title: string; items: TopicWikiBullet[]; emptyLabel: string; noEvidenceLabel: string; onOpenEvidence(evidence: TopicWikiEvidence): void }): React.ReactElement {
  return <section className="topic-wiki-section"><h3>{title}</h3>{items.length ? <div className="topic-wiki-bullets">{items.map((item, index) => <article key={`${item.text}:${index}`}><p>{item.text}</p><WikiEvidence items={item.evidence} emptyLabel={noEvidenceLabel} onOpenEvidence={onOpenEvidence} /></article>)}</div> : <p className="topic-wiki-muted">{emptyLabel}</p>}</section>
}
function WikiEvidence({ items, emptyLabel, onOpenEvidence }: { items: TopicWikiEvidence[]; emptyLabel: string; onOpenEvidence(evidence: TopicWikiEvidence): void }): React.ReactElement {
  return <div className="topic-wiki-evidence">{items.length ? items.map((item, index) => <button key={`${item.materialId}:${item.chunkId ?? index}`} onClick={() => onOpenEvidence(item)} title={item.excerpt}><ExternalLink size={12} /><span>{item.title}{item.heading ? ` · ${item.heading}` : ''}</span></button>) : <span className="topic-wiki-no-evidence">{emptyLabel}</span>}</div>
}
