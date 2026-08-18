import { RotateCcw, X } from 'lucide-react'
import type { TopicWikiPage, TopicWikiRevision } from '../../types'
import { useI18n } from '../../i18n'

export function TopicWikiHistoryDialog({ page, revisions, selectedVersion, busy, onSelect, onRestore, onClose }: { page: TopicWikiPage; revisions: TopicWikiRevision[]; selectedVersion: number | null; busy: boolean; onSelect(version: number): void; onRestore(version: number): void; onClose(): void }): React.ReactElement {
  const { t } = useI18n()
  const selected = revisions.find((item) => item.version === selectedVersion) ?? null
  return <div className="topic-wiki-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section className="topic-wiki-history-dialog" role="dialog" aria-modal="true" aria-label={t('wiki.history')}>
      <header><div><strong>{t('wiki.history')}</strong><p>{t('wiki.historyCopy')}</p></div><button className="icon-button" title={t('wiki.close')} aria-label={t('wiki.close')} onClick={onClose}><X size={16} /></button></header>
      <div className="topic-wiki-history-layout">
        <div className="topic-wiki-history-list">
          {revisions.map((revision) => <article className={revision.version === page.version ? 'current' : selectedVersion === revision.version ? 'selected' : ''} key={revision.id}>
            <button className="topic-wiki-history-item" onClick={() => onSelect(revision.version)}><strong>{t('wiki.version', { version: revision.version })}</strong><span>{t(`wiki.editSource.${revision.editSource}` as never)}{revision.model ? ` · ${revision.model}` : ''}</span></button>
            {revision.version !== page.version && <button className="icon-button" disabled={busy || Boolean(page.draft)} title={t('wiki.restoreVersion')} aria-label={t('wiki.restoreVersion')} onClick={() => onRestore(revision.version)}><RotateCcw size={14} /></button>}
          </article>)}
        </div>
        <div className="topic-wiki-history-preview">
          {!selected ? <p>{t('wiki.selectVersion')}</p> : <>
            <small>{selected.version === page.version ? t('wiki.currentVersion') : t('wiki.version', { version: selected.version })}</small>
            <h3>{t('wiki.summary')}</h3>
            <p>{selected.content.summary}</p>
            {selected.version !== page.version && page.content ? <><h3>{t('wiki.currentSummary')}</h3><p>{page.content.summary}</p></> : null}
          </>}
        </div>
      </div>
    </section>
  </div>
}
