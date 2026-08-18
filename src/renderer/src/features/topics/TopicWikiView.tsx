import { AlertTriangle, BookOpen, Check, ExternalLink, History, Menu, RefreshCw, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TopicMap, TopicWikiBullet, TopicWikiContent, TopicWikiEvidence, TopicWikiPage, TopicWikiRevision } from '../../types'
import { useI18n } from '../../i18n'
import { TopicWikiEvidencePanel } from './TopicWikiEvidencePanel'
import { TopicWikiHistoryDialog } from './TopicWikiHistoryDialog'
import { TopicWikiNavigation } from './TopicWikiNavigation'
import type { TopicWikiSectionId } from './topic-wiki-navigation'
import './topic-wiki.css'

function statusLabel(status: TopicWikiPage['status'], t: (key: any, values?: Record<string, string | number>) => string): string {
  const labels: Record<TopicWikiPage['status'], string> = { empty: t('wiki.empty'), current: t('wiki.current'), 'needs-update': t('wiki.needsUpdate'), draft: t('wiki.draft'), 'needs-review': t('wiki.needsReview') }
  return labels[status]
}

function fallbackLabel(value: string, t: (key: any, values?: Record<string, string | number>) => string): string {
  const [stage, reason] = value.split(':')
  return `${t(`wiki.stage.${stage}`)}：${t(`wiki.fallbackReason.${reason || 'invalid-json'}`)}`
}

function titleFor(map: TopicMap, id: string): string {
  const material = map.materials.find((item) => item.id === id)
  return material?.displayTitle ?? material?.title ?? id
}

export function TopicWikiView({ map }: { map: TopicMap }): React.ReactElement {
  const { t } = useI18n()
  const [page, setPage] = useState<TopicWikiPage | null>(null)
  const [loadError, setLoadError] = useState('')
  const [revisions, setRevisions] = useState<TopicWikiRevision[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [evidence, setEvidence] = useState<TopicWikiEvidence | null>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<TopicWikiSectionId>('summary')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const readerRef = useRef<HTMLElement | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setPage(await window.materialMap.wiki.get(map.topic.id) as TopicWikiPage)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('wiki.loadFailed'))
    }
  }, [map.topic.id, map.topic.revision, t])

  useEffect(() => {
    setPage(null)
    setEvidence(null)
    setHistoryOpen(false)
    setActiveSection('summary')
    void load()
  }, [load])
  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => { void load() }, 800)
    return () => window.clearInterval(timer)
  }, [busy, load])

  const content = useMemo<TopicWikiContent | null>(() => page?.draft?.content ?? page?.content ?? null, [page])
  const evidenceCount = useMemo(() => content ? [...content.keyPoints, ...content.openQuestions].reduce((sum, item) => sum + item.evidence.length, 0) + content.relations.reduce((sum, item) => sum + item.evidence.length, 0) : 0, [content])
  const isDraft = Boolean(page?.draft)
  const diffCount = page?.draft && page.content ? (page.draft.content.summary !== page.content.summary ? 1 : 0) + Math.abs(page.draft.content.keyPoints.length - page.content.keyPoints.length) + Math.abs(page.draft.content.relations.length - page.content.relations.length) + Math.abs(page.draft.content.openQuestions.length - page.content.openQuestions.length) : 0

  useEffect(() => {
    const root = readerRef.current
    if (!root || !content) return
    const sections = [...root.querySelectorAll<HTMLElement>('[data-wiki-section]')]
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0]
      const section = visible?.target.getAttribute('data-wiki-section') as TopicWikiSectionId | null
      if (section) setActiveSection(section)
    }, { root, rootMargin: '-15% 0px -70% 0px', threshold: 0 })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [content])

  const run = async (action: () => Promise<unknown>, success: string): Promise<void> => {
    setBusy(true)
    setNotice('')
    try {
      setPage(await action() as TopicWikiPage)
      setNotice(success)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('wiki.operationFailed'))
      await load()
    } finally {
      setBusy(false)
    }
  }
  const openHistory = async (): Promise<void> => {
    try {
      const items = await window.materialMap.wiki.revisions(map.topic.id) as TopicWikiRevision[]
      setRevisions(items)
      setSelectedVersion(items.find((item) => item.version === page?.version)?.version ?? items[0]?.version ?? null)
      setHistoryOpen(true)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('wiki.historyFailed'))
    }
  }
  const selectSection = (section: TopicWikiSectionId): void => {
    setActiveSection(section)
    setNavigationOpen(false)
    readerRef.current?.querySelector<HTMLElement>(`[data-wiki-section="${section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const openEvidence = (item: TopicWikiEvidence): void => {
    setEvidence(item)
    setNavigationOpen(false)
  }

  return <section className={`topic-wiki-workspace${evidence ? ' with-evidence' : ''}`} aria-label={t('wiki.title')}>
    <TopicWikiNavigation map={map} content={content} activeSection={activeSection} mobileOpen={navigationOpen} onSection={selectSection} onMaterial={openEvidence} onClose={() => setNavigationOpen(false)} />
    <main className="topic-wiki-reader" ref={readerRef}>
      <header className="topic-wiki-reader-toolbar">
        <button className="icon-button topic-wiki-navigation-toggle" title={t('wiki.navigation')} aria-label={t('wiki.navigation')} onClick={() => setNavigationOpen(true)}><Menu size={17} /></button>
        <span className={`topic-wiki-status status-${page?.status ?? 'empty'}`}>{page ? statusLabel(page.status, t) : t('wiki.loading')}</span>
        <span className="topic-wiki-meta">{t('wiki.readerMeta', { version: page?.version ?? 0, materials: map.materials.length, evidence: evidenceCount })}</span>
        <div className="topic-wiki-action-buttons">
          {page?.version ? <button className="secondary-button" disabled={busy} onClick={() => void openHistory()}><History size={15} />{t('wiki.history')}</button> : null}
          {page?.canUndo && !isDraft ? <button className="secondary-button" disabled={busy} onClick={() => void run(() => window.materialMap.wiki.undo(map.topic.id), t('wiki.undone'))}><Undo2 size={14} />{t('wiki.undo')}</button> : null}
          <button className="primary-button" disabled={busy} onClick={() => void run(() => window.materialMap.wiki.generate(map.topic.id), t('wiki.draftReady'))}><RefreshCw size={15} />{busy ? t('wiki.generating') : page?.content ? t('wiki.generateUpdate') : t('wiki.generate')}</button>
        </div>
      </header>

      {loadError ? <div className="topic-wiki-load-error"><AlertTriangle size={24} /><strong>{t('wiki.loadFailed')}</strong><p>{loadError}</p><button className="secondary-button" onClick={() => void load()}>{t('wiki.retry')}</button></div> : <>
        {page?.latestRun && (busy || page.latestRun.status === 'failed' || page.latestRun.status === 'partial') ? <div className={`topic-wiki-run status-${page.latestRun.status}`}><span>{t('wiki.runStage', { stage: t(`wiki.stage.${page.latestRun.stage}` as never) })}</span>{page.latestRun.warnings.length ? <small>{t('wiki.runFallbacks', { count: page.latestRun.warnings.length })}：{page.latestRun.warnings.map((warning) => fallbackLabel(warning, t)).join('、')}</small> : null}{page.latestRun.error ? <p>{page.latestRun.error}</p> : null}</div> : null}
        {page?.checks.length ? <div className="topic-wiki-checks"><AlertTriangle size={15} /><span>{t('wiki.checks', { count: page.checks.length })}</span></div> : null}
        {isDraft ? <div className="topic-wiki-draft-banner"><div><strong>{t('wiki.draftBanner')}</strong><span>{t('wiki.draftRevision', { revision: page?.draft?.baseRevision ?? 0 })}</span></div>{page?.content ? <details><summary>{t('wiki.viewDiff', { count: diffCount })}</summary><div className="topic-wiki-diff"><div><small>{t('wiki.oldSummary')}</small><p>{page.content.summary}</p></div><div><small>{t('wiki.newSummary')}</small><p>{page.draft?.content.summary}</p></div><span>{t('wiki.sectionCounts', { oldPoints: page.content.keyPoints.length, newPoints: page.draft?.content.keyPoints.length ?? 0, oldRelations: page.content.relations.length, newRelations: page.draft?.content.relations.length ?? 0 })}</span></div></details> : null}<div className="topic-wiki-draft-actions"><button className="secondary-button" disabled={busy} onClick={() => void run(() => window.materialMap.wiki.discard(map.topic.id), t('wiki.discarded'))}><X size={14} />{t('wiki.discard')}</button><button className="primary-button" disabled={busy || page?.status !== 'draft'} onClick={() => void run(() => window.materialMap.wiki.apply(map.topic.id), t('wiki.applied'))}><Check size={14} />{t('wiki.apply')}</button></div></div> : null}
        {notice ? <p className="topic-wiki-notice">{notice}<button className="icon-button" title={t('wiki.close')} aria-label={t('wiki.close')} onClick={() => setNotice('')}><X size={13} /></button></p> : null}
        {!page ? <div className="topic-wiki-empty"><BookOpen size={28} /><strong>{t('wiki.loading')}</strong></div> : !content ? <div className="topic-wiki-empty"><BookOpen size={30} /><strong>{t('wiki.emptyTitle')}</strong><p>{t('wiki.emptyCopy')}</p></div> : <TopicWikiArticle map={map} content={content} evidenceCount={evidenceCount} onOpenEvidence={openEvidence} />}
      </>}
    </main>
    <TopicWikiEvidencePanel map={map} evidence={evidence} onClose={() => setEvidence(null)} />
    {historyOpen && page ? <TopicWikiHistoryDialog page={page} revisions={revisions} selectedVersion={selectedVersion} busy={busy} onSelect={setSelectedVersion} onRestore={(version) => void run(() => window.materialMap.wiki.revertRevision(map.topic.id, version), t('wiki.restored'))} onClose={() => setHistoryOpen(false)} /> : null}
  </section>
}

function TopicWikiArticle({ map, content, evidenceCount, onOpenEvidence }: { map: TopicMap; content: TopicWikiContent; evidenceCount: number; onOpenEvidence(evidence: TopicWikiEvidence): void }): React.ReactElement {
  const { t } = useI18n()
  return <article className="topic-wiki-article">
    <header><span><BookOpen size={14} />{t('wiki.title')}</span><h1>{map.topic.name}</h1>{map.topic.description ? <p>{map.topic.description}</p> : null}</header>
    <section data-wiki-section="summary"><h2>{t('wiki.summary')}</h2><p>{content.summary}</p></section>
    <WikiBullets section="keyPoints" title={t('wiki.keyPoints')} items={content.keyPoints} emptyLabel={t('wiki.none')} noEvidenceLabel={t('wiki.noEvidence')} onOpenEvidence={onOpenEvidence} />
    <section data-wiki-section="relations"><h2>{t('wiki.relations')}</h2>{content.relations.length ? <div className="topic-wiki-relations">{content.relations.map((relation) => <article key={`${relation.sourceMaterialId}:${relation.targetMaterialId}:${relation.label}`}><strong>{titleFor(map, relation.sourceMaterialId)} <span>→</span> {titleFor(map, relation.targetMaterialId)}</strong><p>{relation.explanation}</p><WikiEvidence items={relation.evidence} emptyLabel={t('wiki.noEvidence')} onOpenEvidence={onOpenEvidence} /></article>)}</div> : <p className="topic-wiki-muted">{t('wiki.none')}</p>}</section>
    <WikiBullets section="openQuestions" title={t('wiki.openQuestions')} items={content.openQuestions} emptyLabel={t('wiki.none')} noEvidenceLabel={t('wiki.noEvidence')} onOpenEvidence={onOpenEvidence} />
    <footer>{t('wiki.evidenceCount', { count: evidenceCount })}</footer>
  </article>
}

function WikiBullets({ section, title, items, emptyLabel, noEvidenceLabel, onOpenEvidence }: { section: TopicWikiSectionId; title: string; items: TopicWikiBullet[]; emptyLabel: string; noEvidenceLabel: string; onOpenEvidence(evidence: TopicWikiEvidence): void }): React.ReactElement {
  return <section data-wiki-section={section}><h2>{title}</h2>{items.length ? <div className="topic-wiki-bullets">{items.map((item, index) => <article key={`${item.text}:${index}`}><p>{item.text}</p><WikiEvidence items={item.evidence} emptyLabel={noEvidenceLabel} onOpenEvidence={onOpenEvidence} /></article>)}</div> : <p className="topic-wiki-muted">{emptyLabel}</p>}</section>
}

function WikiEvidence({ items, emptyLabel, onOpenEvidence }: { items: TopicWikiEvidence[]; emptyLabel: string; onOpenEvidence(evidence: TopicWikiEvidence): void }): React.ReactElement {
  return <div className="topic-wiki-evidence">{items.length ? items.map((item, index) => <button key={`${item.materialId}:${item.chunkId ?? index}`} onClick={() => onOpenEvidence(item)} title={item.excerpt}><ExternalLink size={12} /><span>{item.title}{item.heading ? ` · ${item.heading}` : ''}</span></button>) : <span className="topic-wiki-no-evidence">{emptyLabel}</span>}</div>
}
