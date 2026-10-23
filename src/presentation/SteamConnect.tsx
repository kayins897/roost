import { ArrowUpRight,CheckCircle2,Download,Link2,RefreshCw,Search,Square,Unplug,X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { formatPlaytime } from '../domain/library.ts';
import type { SteamConnectionState,SteamEnrichmentProgress,SteamLibraryResult } from '../domain/steamConnection.ts';
import type { SteamImportGame } from '../domain/steamImport.ts';
import type { SteamLibraryGame,SteamSyncOptions,SteamSyncRow } from '../domain/steamSync.ts';
import { planSteamSync } from '../domain/steamSync.ts';
import type { ExternalId,MediaItem } from '../domain/types.ts';
import { desktopBridge } from '../infrastructure/repository.ts';
import './steam-connect.css';
import { useDialogKeyboard } from './useDialogKeyboard.ts';

type Group = 'all' | SteamSyncRow['kind'];
const groupLabels = { new: '新增', update: '可更新', unchanged: '已是最新', ambiguous: '待确认', excluded: '已移除，跳过' };
const fieldLabels: Record<string, string> = { creator: '开发商', year: '发行年份', originalTitle: '作品原名', coverUrl: '封面', platforms: '平台', subcategory: '平台', externalIds: '来源关联', sourceUrl: '来源链接', playtimeMinutes: '游玩时长' };
function libraryGames(games: SteamImportGame[]): SteamLibraryGame[] {
  if (games.some(game => typeof game.appId !== 'string')) throw new Error('Steam 返回的游戏缺少 AppID，请重新读取');
  return games as SteamLibraryGame[];
}

export function SteamConnect({ items, exclusions, onClose, onSync }: {
  items: MediaItem[];
  exclusions?: ExternalId[];
  onClose: () => void;
  onSync: (games: SteamLibraryGame[], selectedAppIds: ReadonlySet<string>, options: SteamSyncOptions) => boolean;
}) {
  const [connection, setConnection] = useState<SteamConnectionState | null>(null);
  const [initializing, setInitializing] = useState(Boolean(desktopBridge));
  const [profile, setProfile] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [includeFree, setIncludeFree] = useState(false);
  const [updatePlaytime, setUpdatePlaytime] = useState(true);
  const [result, setResult] = useState<SteamLibraryResult | null>(null);
  const [games, setGames] = useState<SteamLibraryGame[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState<Group>('all');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'' | 'read' | 'enrich' | 'forget'>('');
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<SteamEnrichmentProgress | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [discard, setDiscard] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const source = useRef<HTMLInputElement>(null);
  const keepPreview = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const busyRef = useRef(busy); busyRef.current = busy;
  const options = useMemo(() => ({ updatePlaytime, exclusions }), [updatePlaytime, exclusions]);
  const rows = useMemo(() => planSteamSync(games, items, options), [games, items, options]);
  const eligible = rows.filter(row => row.kind === 'new' || row.kind === 'update');
  const chosen = eligible.filter(row => selection.has(row.appId));
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const shown = rows.filter(row => (group === 'all' || row.kind === group) && (!normalizedSearch || `${row.game.title} ${row.game.originalTitle || ''} ${row.appId}`.toLocaleLowerCase().includes(normalizedSearch)));
  const shownEligible = shown.filter(row => row.kind === 'new' || row.kind === 'update');
  const allShownSelected = shownEligible.length > 0 && shownEligible.every(row => selection.has(row.appId));

  function closeNow() {
    if (busyRef.current === 'read' || busyRef.current === 'enrich') desktopBridge?.cancelSteamRequest();
    setApiKey(''); onClose();
  }
  function requestClose() {
    if (discard) { setDiscard(false); return; }
    if (busyRef.current || result || apiKey) setDiscard(true);
    else closeNow();
  }
  // 选择器与可见过滤沿用原 trapFocus 实现，键盘行为统一由 useDialogKeyboard 提供。
  useDialogKeyboard(dialog, requestClose, {
    selector: 'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]',
    filterVisible: true,
    initialFocus: () => source.current,
  });
  useEffect(() => {
    alive.current = true;
    let unsubscribe: (() => void) | undefined;
    if (desktopBridge) {
      unsubscribe = desktopBridge.onSteamProgress(value => { if (alive.current && busyRef.current === 'enrich') setProgress(value); });
      void desktopBridge.getSteamConnection().then(response => {
        if (!alive.current) return;
        if (!response.ok || !response.value) { setError(response.error || '无法读取 Steam 连接设置'); return; }
        setConnection(response.value); setProfile(response.value.profile); setRememberKey(response.value.canRemember);
      }).catch(() => { if (alive.current) setError('无法读取 Steam 连接设置，请稍后重试'); })
        .finally(() => { if (alive.current) setInitializing(false); });
    }
    return () => {
      alive.current = false; unsubscribe?.();
      if (busyRef.current === 'read' || busyRef.current === 'enrich') desktopBridge?.cancelSteamRequest();
    };
  }, []);
  useEffect(() => { if (discard) keepPreview.current?.focus(); }, [discard]);
  useEffect(() => { if (!initializing) source.current?.focus(); }, [initializing]);
  async function readLibrary(event: FormEvent) {
    event.preventDefault();
    if (!desktopBridge || busy || initializing || !profile.trim() || (!apiKey.trim() && !connection?.hasApiKey)) return;
    setBusy('read'); busyRef.current = 'read'; setError(''); setMessage('正在向 Steam 读取账号游戏库…'); setCancelling(false); setDisconnecting(false);
    try {
      const response = await desktopBridge.readSteamLibrary({ profile: profile.trim(), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), rememberKey: Boolean(rememberKey && connection?.canRemember), includePlayedFreeGames: includeFree });
      if (!alive.current) return;
      if (!response.ok || !response.value) throw new Error(response.error || '未能读取 Steam 游戏库');
      const incoming = libraryGames(response.value.games);
      const preview = planSteamSync(incoming, items, options);
      setApiKey(''); setResult(response.value); setGames(incoming);
      setSelection(new Set(preview.filter(row => row.kind === 'new' || row.kind === 'update').map(row => row.appId)));
      setSearch(''); setGroup('all'); setMessage(`读取到 ${incoming.length} 款游戏。检查预览后，再将选中的内容保存到收藏库。`);
      void desktopBridge.getSteamConnection().then(updated => {
        if (alive.current && updated.ok && updated.value) { setConnection(updated.value); setProfile(updated.value.profile); }
      }).catch(() => { /* The loaded preview remains useful if connection-state refresh fails. */ });
    } catch (failure) { if (alive.current) { setError(failure instanceof Error ? failure.message : '读取失败，请稍后重试'); setMessage(''); } }
    finally { if (alive.current) { setBusy(''); busyRef.current = ''; setCancelling(false); } }
  }
  async function enrich() {
    if (!desktopBridge || busy || !games.length) return;
    setBusy('enrich'); busyRef.current = 'enrich'; setError(''); setMessage('正在补充封面、开发商与发行年份…'); setProgress({ completed: 0, total: games.length, title: '' }); setCancelling(false);
    const previouslyEligible = new Set(eligible.map(row => row.appId));
    try {
      const matchingItems = new Map(rows.filter(row => row.existingId).map(row => [row.appId, items.find(item => item.id === row.existingId)]));
      const seededGames = games.map(game => {
        const existing = matchingItems.get(game.appId);
        if (!existing) return game;
        const seeded = { ...game };
        for (const field of ['coverUrl', 'creator', 'year', 'originalTitle'] as const) {
          if (existing[field]?.trim()) seeded[field] = existing[field];
        }
        return seeded;
      });
      const response = await desktopBridge.enrichSteamLibrary(seededGames);
      if (!alive.current) return;
      if (!response.ok || !response.value) throw new Error(response.error || '资料补全失败；之前的预览仍保留');
      const incoming = libraryGames(response.value.games);
      const nextRows = planSteamSync(incoming, items, options);
      setGames(incoming);
      setSelection(current => new Set(nextRows.filter(row => (row.kind === 'new' || row.kind === 'update') && (current.has(row.appId) || !previouslyEligible.has(row.appId))).map(row => row.appId)));
      const value = response.value;
      setMessage(`${value.cancelled ? '已停止补全，已取得的资料保留在预览中。' : '资料补全结束。'}${value.missingCovers ? ` ${value.missingCovers} 款封面暂不可用。` : ' 封面已齐全。'}${value.missingDetails ? ` ${value.missingDetails} 款详细资料暂不可用。` : ''}${value.detailsRateLimited ? ' Steam 暂时限制了资料请求，可稍后重试。' : ''} 保存后才会写入收藏库。`);
    } catch (failure) { if (alive.current) { setError(failure instanceof Error ? failure.message : '资料补全失败；之前的预览仍保留'); setMessage(''); } }
    finally { if (alive.current) { setBusy(''); busyRef.current = ''; setCancelling(false); } }
  }
  function cancelRequest() { if (busy === 'read' || busy === 'enrich') { setCancelling(true); desktopBridge?.cancelSteamRequest(); } }
  async function forget() {
    if (!desktopBridge || busy) return;
    setBusy('forget'); busyRef.current = 'forget'; setError('');
    try {
      const response = await desktopBridge.forgetSteamConnection();
      if (!alive.current) return;
      if (!response.ok || !response.value) throw new Error(response.error || '断开连接失败，请重试');
      setConnection(response.value); setProfile(''); setApiKey(''); setDisconnecting(false); setMessage('Steam 连接已清除，收藏中的游戏和本次预览均保留。');
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '断开连接失败'); }
    finally { if (alive.current) { setBusy(''); busyRef.current = ''; } }
  }
  function saveSelected() {
    if (busy || submitted || !chosen.length) return;
    setSubmitted(true); setError('');
    try {
      if (onSync(games, new Set(chosen.map(row => row.appId)), options)) { setApiKey(''); onClose(); }
      else { setSubmitted(false); setError('保存未完成，预览和选择已保留。请处理收藏库保存提示后重试。'); }
    } catch (failure) { setSubmitted(false); setError(failure instanceof Error ? failure.message : '保存失败，预览和选择已保留'); }
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <section ref={dialog} className="modal modal--wide steam-connect" role="dialog" aria-modal="true" aria-label="连接 Steam">
      <div className="modal-heading"><div><h2>连接 Steam</h2><p>读取游戏库与游玩时长，先预览，再保存。</p></div><button type="button" className="icon-button" aria-label="关闭 Steam 连接" onClick={requestClose}><X size={19} /></button></div>
      {discard && <div className="steam-connect-confirm" role="alert"><p>{busy ? '关闭将取消本次读取，并丢弃尚未保存的预览。' : '关闭将丢弃尚未保存的预览和输入的密钥。'}已收藏的作品不会改变。</p><div><button ref={keepPreview} type="button" className="button button--secondary" onClick={() => setDiscard(false)}>继续查看</button><button type="button" className="button button--ghost" onClick={closeNow}>关闭并放弃预览</button></div></div>}
      {!desktopBridge ? <p className="steam-connect-note">Steam 连接在 Windows 桌面版提供。浏览器版可继续使用批量清单导入。</p> : <>
        <form className="steam-connect-source" onSubmit={event => { void readLibrary(event); }}>
          <div className="steam-connect-fields"><label className="form-field">Steam 主页链接或 SteamID64<input ref={source} aria-label="Steam 主页链接或 SteamID64" value={profile} onChange={event => setProfile(event.target.value)} maxLength={256} autoComplete="off" disabled={Boolean(busy) || initializing} placeholder="https://steamcommunity.com/profiles/…/" required /></label><label className="form-field">Steam Web API 密钥<input type="password" aria-label="Steam Web API 密钥" value={apiKey} onChange={event => setApiKey(event.target.value)} maxLength={128} autoComplete="new-password" spellCheck={false} disabled={Boolean(busy) || initializing} placeholder={connection?.hasApiKey ? '已保存密钥，留空即可继续读取' : '输入你的免费 Steam API 密钥'} /></label></div>
          <div className="steam-connect-key-help"><a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">免费申请 Steam API 密钥<ArrowUpRight size={13} /></a><span>{connection?.hasApiKey ? <><CheckCircle2 size={13} />{connection.remembered ? '已加密记住密钥' : '当前连接可用'}</> : '无需付费 API，也不需要 Steam 密码'}</span></div>
          <div className="steam-connect-options"><label><input type="checkbox" checked={rememberKey} disabled={Boolean(busy) || !connection?.canRemember} onChange={event => setRememberKey(event.target.checked)} />在这台电脑加密记住密钥</label><label><input type="checkbox" checked={includeFree} disabled={Boolean(busy)} onChange={event => setIncludeFree(event.target.checked)} />同时收录玩过的免费游戏</label></div>
          {connection && !connection.canRemember && <p className="steam-connect-note">本机加密存储不可用，密钥仅供本次连接使用。</p>}
          <p className="steam-connect-note">若无法读取，请检查 Steam“游戏详情”和游玩时长的可见性。免费游戏选项会影响返回数量。不会读取账号密码，也不会根据时长推断通关状态。</p>
          <div className="steam-connect-source-actions">{connection?.hasApiKey && <button type="button" className="button button--ghost" disabled={Boolean(busy)} onClick={() => setDisconnecting(current => !current)}><Unplug size={15} />断开连接</button>}<button type="submit" className="button button--primary" disabled={Boolean(busy) || initializing || !profile.trim() || (!apiKey.trim() && !connection?.hasApiKey)}><Download size={16} />{busy === 'read' ? '正在读取…' : result ? '重新读取游戏库' : '读取游戏库'}</button></div>
        </form>
        {disconnecting && <div className="steam-connect-confirm" role="alert"><p>清除本机保存的 Steam 连接？已收藏的游戏、封面和体验记录都会保留。</p><div><button type="button" className="button button--secondary" disabled={Boolean(busy)} onClick={() => setDisconnecting(false)}>保留连接</button><button type="button" className="button button--ghost" disabled={Boolean(busy)} onClick={() => { void forget(); }}>确认断开连接</button></div></div>}
        {result && <div className="steam-connect-preview">
          <div className="steam-connect-result-heading"><div><h3>游戏库预览</h3><p>Steam 返回 {result.reportedCount} 款 · 本次读取 {games.length} 款{result.fetchedAt ? ` · ${new Date(result.fetchedAt).toLocaleString('zh-CN')}` : ''}<br />来源 SteamID：{result.steamId}</p></div><button type="button" className="button button--secondary" disabled={Boolean(busy) || submitted || !games.length} onClick={() => { void enrich(); }}><RefreshCw size={15} />补全封面与资料</button></div>
          <div className="steam-connect-counts">{(Object.keys(groupLabels) as SteamSyncRow['kind'][]).map(kind => <button type="button" key={kind} aria-pressed={group === kind} className={group === kind ? 'is-selected' : ''} onClick={() => setGroup(current => current === kind ? 'all' : kind)}><strong>{rows.filter(row => row.kind === kind).length}</strong><span>{groupLabels[kind]}</span></button>)}</div>
          <label className="steam-connect-playtime"><input type="checkbox" checked={updatePlaytime} disabled={Boolean(busy) || submitted} onChange={event => setUpdatePlaytime(event.target.checked)} /><span>更新游玩时长<small>只增不减，保留更高的本地记录；关闭后仍为新增游戏收录 Steam 时长。</small></span></label>
          <p className="steam-connect-note">已有作品仅补充缺失资料；印象、标签、喜欢、状态和体验记录保留。同名但未关联 Steam ID、或来源存在冲突的作品列为“待确认”，本次不会自动合并。</p>
          <div className="steam-connect-selection"><label><input type="checkbox" aria-label="全选当前可同步游戏" checked={allShownSelected} disabled={!shownEligible.length || Boolean(busy) || submitted} onChange={event => setSelection(current => { const next = new Set(current); for (const row of shownEligible) { if (event.target.checked) next.add(row.appId); else next.delete(row.appId); } return next; })} />全选当前结果 <span>已选 {chosen.length}</span></label><div className="steam-connect-search"><Search size={15} /><input aria-label="查找 Steam 库游戏" placeholder="搜索名称或 AppID" value={search} onChange={event => setSearch(event.target.value)} /></div>{group !== 'all' && <button type="button" className="text-button" onClick={() => setGroup('all')}>显示全部</button>}</div>
          <div className="steam-connect-rows" aria-label="Steam 同步预览">{shown.map(row => <label className={`steam-connect-row steam-connect-row--${row.kind}`} key={row.appId}><input type="checkbox" aria-label={`同步 ${row.game.title}`} disabled={Boolean(busy) || submitted || !['new', 'update'].includes(row.kind)} checked={['new', 'update'].includes(row.kind) && selection.has(row.appId)} onChange={event => setSelection(current => { const next = new Set(current); if (event.target.checked) next.add(row.appId); else next.delete(row.appId); return next; })} /><span className="steam-connect-cover">{row.game.coverUrl?.startsWith('data:image/') ? <img src={row.game.coverUrl} alt="" loading="lazy" /> : <Link2 size={17} />}</span><span className="steam-connect-game"><strong>{row.game.title}</strong><small>{`Steam ${row.appId}`}{row.game.playtimeMinutes !== undefined ? ` · ${formatPlaytime(row.game.playtimeMinutes)}` : ' · 时长未提供'}</small><small>{row.kind === 'ambiguous' ? '请先确认并关联来源，再重新同步' : row.kind === 'update' ? `补充：${[...new Set(row.fields.map(field => fieldLabels[field] || '作品资料'))].join('、')}` : row.kind === 'new' ? '将以“待体验”加入收藏' : row.retainedHigherMinutes ? '保留更高的本地时长，无需更新' : '当前资料无需更新'}</small></span><span className="steam-connect-row-state">{groupLabels[row.kind]}</span></label>)}{!shown.length && <p className="steam-connect-empty">没有符合当前条件的游戏。</p>}</div>
        </div>}
        {(busy === 'read' || busy === 'enrich') && <div className="steam-connect-progress" role="status" aria-live="polite"><div><strong>{busy === 'enrich' ? `补全资料 ${progress?.completed ?? 0} / ${progress?.total ?? games.length}` : '正在读取 Steam 游戏库'}</strong>{busy === 'enrich' && <span>{progress?.title}</span>}</div><button type="button" className="button button--ghost" disabled={cancelling} onClick={cancelRequest}><Square size={13} />{cancelling ? '正在停止…' : '停止读取'}</button>{busy === 'enrich' && <progress aria-label="Steam 资料补全进度" value={progress?.completed ?? 0} max={Math.max(1, progress?.total ?? games.length)} />}</div>}
      </>}
      {message && <p className="steam-connect-note" role="status" aria-live="polite">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="button button--ghost" onClick={requestClose}>关闭</button><button type="button" className="button button--primary" disabled={!chosen.length || Boolean(busy) || submitted || discard} onClick={saveSelected}>{submitted ? '正在保存…' : `保存选中的 ${chosen.length} 款`}</button></div>
    </section>
  </div>;
}
