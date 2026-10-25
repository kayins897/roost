import { FileUp,ListPlus,X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { formatPlaytime,MEDIA_LABELS } from '../domain/library.ts';
import type { SteamImportResult } from '../domain/steamImport.ts';
import { createSteamImportItems,parseSteamImport,previewSteamImport,STEAM_IMPORT_MAX_BYTES } from '../domain/steamImport.ts';
import type { ExternalId,MediaItem,MediaType,CompletionStatus,ProgressStatus } from '../domain/types.ts';
import { COMPLETION_LABELS, COMPLETION_STATUSES } from '../domain/gameProgress.ts';
import { STATUS_LABELS } from '../domain/library.ts';
import { experienceClassificationPatch, type GameExperienceClassification } from '../domain/gameExperience.ts';
import { CLASSIFICATIONS, CLASSIFICATION_LABELS } from './features/library/experienceOptions.ts';
import './steam-import.css';
import { useDialogKeyboard } from './useDialogKeyboard.ts';

export function SteamLibraryImport({ items, exclusions, onClose, onImport }: {
  items: MediaItem[];
  exclusions?: ExternalId[];
  onClose: () => void;
  onImport: (newItems: MediaItem[]) => boolean;
}) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<SteamImportResult | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'existing' | 'within' | 'excluded'>('all');
  const [category, setCategory] = useState<MediaType>('game');
  const [initialStatus, setInitialStatus] = useState<ProgressStatus>('want');
  // v0.4.24：游戏清单的初态按当前游玩关系选择（非游戏沿用通用状态）。
  const [initialClassification, setInitialClassification] = useState<GameExperienceClassification | 'auto'>('auto');
  const [initialCompletion, setInitialCompletion] = useState<CompletionStatus>('unknown');
  const dialog = useRef<HTMLElement>(null);
  const source = useRef<HTMLTextAreaElement>(null);
  const currentToggle = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const previews = useMemo(() => parsed ? previewSteamImport(parsed.games, items, exclusions) : [], [parsed, items, exclusions]);
  const eligible = previews.filter(row => !row.duplicate);
  const chosen = eligible.filter(row => selection.has(row.key));
  // 预览分类：利用既有去重原因区分库中重复、清单内重复与已移除跳过；搜索与分类只影响显示，不改变选择。
  const filterOf = (row: typeof previews[number]) => row.duplicate === null ? 'new' : row.duplicate === 'existing-id' || row.duplicate === 'existing-name' ? 'existing' : row.duplicate === 'excluded' ? 'excluded' : 'within';
  const counts = useMemo(() => { const value = { all: previews.length, new: 0, existing: 0, within: 0, excluded: 0 }; for (const row of previews) value[filterOf(row)]++; return value; }, [previews]);
  const shown = previews.filter(row => (filter === 'all' || filterOf(row) === filter) && row.game.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const shownEligible = shown.filter(row => !row.duplicate);
  const shownSelected = shownEligible.filter(row => selection.has(row.key)).length;
  const hiddenSelected = chosen.length - shownEligible.filter(row => selection.has(row.key)).length;
  const allShownSelected = shownEligible.length > 0 && shownEligible.every(row => selection.has(row.key));
  useEffect(() => { if (currentToggle.current) currentToggle.current.indeterminate = shownSelected > 0 && !allShownSelected; }, [shownSelected, allShownSelected, filter, search]);
  function requestClose() { if (text.trim()) setDiscard(true); else onClose(); }
  // 选择器沿用原 trapFocus 实现（排除文件输入），键盘行为统一由 useDialogKeyboard 提供。
  useDialogKeyboard(dialog, requestClose, {
    selector: 'button:not([disabled]), input:not([disabled]):not([type="file"]), textarea:not([disabled]), select:not([disabled]), a[href]',
    initialFocus: () => source.current,
  });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  function parse(value: string) {
    setError(''); setSubmitted(false); setSearch(''); setFilter('all');
    try {
      const result = parseSteamImport(value, category);
      setParsed(result);
      const categories = [...new Set(result.games.map(work => work.category ?? 'game'))];
      if (categories.length === 1) setCategory(categories[0]);
      const rows = previewSteamImport(result.games, items, exclusions);
      setSelection(new Set(rows.filter(row => !row.duplicate).map(row => row.key)));
    } catch (failure) {
      setParsed(null); setSelection(new Set());
      setError(failure instanceof Error ? failure.message : '未能识别清单，请检查格式');
    }
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > STEAM_IMPORT_MAX_BYTES) { setError('清单超过 2 MB，请拆分后导入'); return; }
    setReading(true); setError('');
    try {
      const value = await file.text();
      if (!alive.current) return;
      setText(value); parse(value);
    } catch { if (alive.current) setError('文件未能读取，请重试或直接粘贴清单'); }
    finally { if (alive.current) setReading(false); }
  }
  function importSelected() {
    if (submitted || !chosen.length) return;
    setError(''); setSubmitted(true);
    try {
      // Re-evaluate against the latest props before creating records; duplicates never enter a save.
      const additions = createSteamImportItems(chosen.map(row => row.game), initialStatus, category === 'game' ? 'planned' : undefined, category === 'game' ? initialCompletion : undefined);
      const classified = additions.map(item => item.category === 'game' && initialClassification !== 'auto' ? { ...item, ...experienceClassificationPatch(initialClassification) } : item);
      if (onImport(classified)) onClose();
      else { setSubmitted(false); setError('保存未完成，预览和选择已保留。请处理收藏库保存提示后重试'); }
    } catch (failure) {
      setSubmitted(false); setError(failure instanceof Error ? failure.message : '未能保存，预览和选择已保留');
    }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <section className="modal modal--wide steam-library-import" role="dialog" aria-modal="true" aria-label="批量导入作品" ref={dialog}>
      <div className="modal-heading"><div><h2>批量导入作品</h2><p>先检查清单，只把选中的新作品加入收藏。</p></div><button type="button" className="icon-button" aria-label="关闭批量导入" onClick={requestClose}><X size={19} /></button></div>
      {discard && <div className="steam-import-discard" role="alert"><p>本次清单尚未导入，关闭后将丢弃这份预览。</p><div><button type="button" className="button button--ghost" onClick={() => setDiscard(false)}>继续整理</button><button type="button" className="button button--ghost" onClick={onClose}>放弃本次清单</button></div></div>}
      <div className="steam-import-source">
        <div className="steam-import-options"><label className="form-field">文本清单的板块<select aria-label="文本清单的板块" value={category} disabled={reading || submitted} onChange={event => { setCategory(event.target.value as MediaType); setParsed(null); setSelection(new Set()); setError(''); }}><option value="game">Steam 游戏</option><option value="screen">影视</option><option value="book">书籍</option><option value="music">音乐</option></select></label>{category === 'game' ? <><label className="form-field">新增游戏的体验分类<select aria-label="新增游戏的体验分类" value={initialClassification} disabled={submitted} onChange={event => setInitialClassification(event.target.value as GameExperienceClassification | 'auto')}><option value="auto">自动识别 · 无记录先待体验</option>{CLASSIFICATIONS.map(value => <option key={value} value={value}>{CLASSIFICATION_LABELS[value]}</option>)}</select></label><label className="form-field">新增游戏的通关进度<select aria-label="新增游戏的通关进度" value={initialCompletion} disabled={submitted} onChange={event => setInitialCompletion(event.target.value as CompletionStatus)}>{COMPLETION_STATUSES.map(value => <option key={value} value={value}>{COMPLETION_LABELS[value]}</option>)}</select></label></> : <label className="form-field">新增作品的初始状态<select aria-label="新增作品的初始状态" value={initialStatus} disabled={submitted} onChange={event => setInitialStatus(event.target.value as ProgressStatus)}>{(['want','active','finished','paused'] as const).map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}</select></label>}</div>
        <label className="form-field">作品清单<textarea ref={source} rows={5} maxLength={STEAM_IMPORT_MAX_BYTES} value={text} disabled={reading || submitted} placeholder={category === 'game' ? '每行一个游戏名称，也支持：\n游戏名称 | https://store.steampowered.com/app/…/ | 游玩分钟\n或粘贴 GetOwnedGames / 栖域批量 JSON 清单' : '每行一个作品名称\n详细资料可选择或粘贴栖域批量 JSON 清单'} onChange={event => { setText(event.target.value); setParsed(null); setSelection(new Set()); setError(''); setDiscard(false); }} /></label>
        <div className="steam-import-source-actions"><label className="button button--ghost steam-import-file"><FileUp size={16} />选择文件<input type="file" accept=".json,.txt,application/json,text/plain" aria-label="选择清单文件" disabled={reading || submitted} onChange={event => { void readFile(event); }} /></label><button type="button" className="button button--primary" disabled={reading || submitted || !text.trim()} onClick={() => parse(text)}><ListPlus size={16} />{reading ? '读取中…' : '生成预览'}</button></div>
        <p className="steam-import-hint">支持 JSON / TXT，最多 2 MB、2000 件。栖域批量清单会使用文件中各作品的板块；完整收藏备份请到“数据与设置”导入。</p>
        {category === 'game' && <p className="steam-import-hint">Steam JSON 可用 response.games、games 或数组，需含 name；playtime_forever 单位为分钟。</p>}
        {category === 'game' && <details className="steam-import-help"><summary>只有 Steam 主页链接，怎样批量导入？</summary><p>主页链接无法保证提供完整游戏库。官方 GetOwnedGames 接口需要 Web API 密钥，且取决于游戏详情的可见性。本功能读取你提供的清单，不会登录账号或自动同步。</p><p>可以先整理成每行一个游戏名称，或提供包含名称的 GetOwnedGames JSON；现有作品不会被覆盖。封面、开发商等资料可随后通过“检索与导入”补充。</p><a href="https://partner.steamgames.com/doc/webapi/IPlayerService#GetOwnedGames" target="_blank" rel="noreferrer">Steam 官方接口说明</a></details>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {parsed && <div className="steam-import-preview">
        <div className="steam-import-summary" role="status" aria-live="polite"><span><strong>{eligible.length}</strong> 件可新增</span><span><strong>{previews.length - eligible.length}</strong> 件重复</span><span><strong>{parsed.skipped.length}</strong> 行未识别</span></div>
        {parsed.skipped.length > 0 && <details className="steam-import-warnings"><summary>查看未识别的行</summary><ul>{parsed.skipped.slice(0, 20).map(warning => <li key={warning.row}>第 {warning.row} 行：{warning.reason}</li>)}</ul>{parsed.skipped.length > 20 && <p>另有 {parsed.skipped.length - 20} 行，可修正清单后重新生成预览。</p>}</details>}
        {previews.length > 0 ? <><div className="steam-import-filters" role="group" aria-label="预览分类筛选">{([['all','全部'],['new','可新增'],['existing','库中重复'],['within','清单内重复'],['excluded','已移除跳过']] as const).map(([value,label]) => <button type="button" key={value} className={`steam-import-filter${filter === value ? ' is-active' : ''}`} aria-pressed={filter === value} disabled={submitted} onClick={() => setFilter(value)}>{label} {counts[value]}</button>)}</div>
        <div className="steam-import-selection"><label><input type="checkbox" aria-label="选择全部新作品" checked={eligible.length > 0 && chosen.length === eligible.length} disabled={!eligible.length || submitted} onChange={event => setSelection(event.target.checked ? new Set(eligible.map(row => row.key)) : new Set())} />全选新增 <span>{chosen.length} / {eligible.length}</span></label><label><input ref={currentToggle} type="checkbox" aria-label="全选当前结果" checked={allShownSelected} disabled={!shownEligible.length || submitted} onChange={event => setSelection(currentSet => { const next = new Set(currentSet); for (const row of shownEligible) event.target.checked ? next.add(row.key) : next.delete(row.key); return next; })} />当前结果 <span>{shownSelected} / {shownEligible.length}</span></label>{hiddenSelected > 0 && <small className="steam-import-hidden" role="status">另有 {hiddenSelected} 件已选作品被搜索或分类隐藏</small>}<label className="steam-import-search"><input aria-label="查找清单中的作品" placeholder="查找清单" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
          <div className="steam-import-rows" aria-label="作品导入预览">{shown.map(row => <label key={row.key} className={`steam-import-row${row.duplicate ? ' steam-import-row--duplicate' : ''}`}><input type="checkbox" aria-label={`导入 ${row.game.title}`} disabled={!!row.duplicate || submitted} checked={!row.duplicate && selection.has(row.key)} onChange={event => setSelection(current => { const next = new Set(current); if (event.target.checked) next.add(row.key); else next.delete(row.key); return next; })} /><span className="steam-import-game"><strong>{row.game.title}</strong><small>{[MEDIA_LABELS[row.game.category ?? 'game'], row.game.subcategory, row.game.year, row.game.appId ? `Steam ${row.game.appId}` : undefined, row.game.playtimeMinutes !== undefined ? formatPlaytime(row.game.playtimeMinutes) : undefined].filter(Boolean).join(' · ')}</small></span><span className="steam-import-row-state">{row.duplicate === 'excluded' ? '已移除，跳过' : row.duplicate === 'existing-id' ? `已收藏${row.matchedTitle ? `：${row.matchedTitle}` : ''}` : row.duplicate === 'existing-name' ? `收藏中同名${row.matchedTitle ? `：${row.matchedTitle}` : ''}` : row.duplicate === 'source-id' ? '清单内同编号' : row.duplicate === 'source-name' ? '清单内同名' : '新增'}</span></label>)}{!shown.length && <p className="steam-import-hint">清单中没有匹配名称。</p>}</div>
          <p className="steam-import-hint">重复项会跳过；同名但确为不同作品，可通过单件收录确认。已有印象、状态、时长和记录均不会改变；不根据收录清单推测观看经历。</p></> : <p className="steam-import-hint">没有可识别的作品，请检查未识别的行或重新提供带名称的清单。</p>}
      </div>}
      <div className="modal-actions"><button type="button" className="button button--ghost" onClick={requestClose}>取消</button><button type="button" className="button button--primary" disabled={!chosen.length || submitted || reading || discard} onClick={importSelected}>{submitted ? '正在保存…' : `导入选中的 ${chosen.length} 件`}</button></div>
    </section>
  </div>;
}
