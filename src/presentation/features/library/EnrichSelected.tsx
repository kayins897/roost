import { t } from '../../i18n/index.ts';
import { RefreshCw, Square, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { desktopBridge } from '../../../infrastructure/repository.ts';
import { planSteamSync } from '../../../domain/steamSync.ts';
import type { SteamLibraryGame, SteamSyncRow } from '../../../domain/steamSync.ts';
import type { ExternalId, MediaItem } from '../../../domain/types.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { useDialogKeyboard } from '../../useDialogKeyboard.ts';

const FIELD_LABELS: Record<string, string> = { coverUrl: '封面', creator: '开发商', year: '发行年份', originalTitle: '原名', platforms: '平台', playtimeMinutes: '时长' };
const appIdOf = (item: MediaItem) => (item.externalIds ?? []).filter(id => id.provider === 'steam' && /^\d{1,10}$/.test(id.id)).map(id => id.id);

// 多选「补齐 Steam 资料」对话框：仅处理唯一确切 AppID 的所选游戏；只补缺失字段
// （现有值预填入请求，来源不覆盖个人内容）；不读账号库存、不更新时长、不新增作品；
// 预览确认后才保存，保存按最新快照重建补丁。取消与 Steam 连接共享通道，二者串行互斥。
export function EnrichSelected({ selectedGames, items, exclusions, onClose, onSync }: {
  selectedGames: MediaItem[]; items: MediaItem[]; exclusions?: readonly ExternalId[];
  onClose: () => void; onSync: (games: SteamLibraryGame[], appIds: ReadonlySet<string>) => boolean;
}) {
  const [phase, setPhase] = useState<'idle' | 'enriching' | 'preview'>('idle');
  const [games, setGames] = useState<SteamLibraryGame[] | null>(null);
  const [choice, setChoice] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ completed: number; total: number; title: string } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const alive = useRef(true);
  const panel = useRef<HTMLElement>(null);
  useDialogKeyboard(panel, requestClose, { initialFocus: () => null });
  const busyRef = useRef(false); busyRef.current = busy;
  // 仅卸载时取消自身进行中的请求；busy 翻转不触发 cleanup（依赖空数组 + ref 读取）。
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (busyRef.current) desktopBridge?.cancelSteamRequest(); }; }, []);
  function requestClose() { if (busy) desktopBridge?.cancelSteamRequest(); onClose(); }
  // 候选与跳过：按唯一确切 Steam AppID 划分；同名、模糊或多 ID 冲突一律跳过并说明，不猜匹配。
  const { candidates, skipped } = useMemo(() => {
    const candidates: { item: MediaItem; appId: string }[] = []; const skipped: { item: MediaItem; reason: string }[] = [];
    // 全库身份歧义预检查：同一 AppID 关联多件作品时无法唯一补齐，明确跳过（保存端仍会再约束）。
    const appIdOwners = new Map<string, number>();
    for (const item of items) if (item.category === 'game' && !item.removedAt) for (const id of appIdOf(item)) appIdOwners.set(id, (appIdOwners.get(id) ?? 0) + 1);
    for (const item of selectedGames) {
      const ids = appIdOf(item);
      if (item.removedAt) skipped.push({ item, reason: '已移入回收站' });
      else if (item.hiddenAt) skipped.push({ item, reason: '已隐藏（本入口仅处理正常收藏）' });
      else if (ids.length === 0) skipped.push({ item, reason: '没有确切 Steam AppID' });
      else if (ids.length > 1) skipped.push({ item, reason: '关联多个 Steam AppID，需先在资料中确认' });
      else if ((appIdOwners.get(ids[0]) ?? 0) > 1) skipped.push({ item, reason: `Steam ${ids[0]} 在收藏中关联多件作品，无法唯一补齐` });
      else candidates.push({ item, appId: ids[0] });
    }
    return { candidates, skipped };
  }, [selectedGames, items]);
  const rows: SteamSyncRow[] = useMemo(() => (games && phase === 'preview') ? planSteamSync(games, items, { updatePlaytime: false, exclusions }) : [], [games, items, exclusions, phase]);
  const updateRows = rows.filter(row => row.existingId && candidates.some(candidate => candidate.appId === row.appId));
  const chosen = updateRows.filter(row => row.kind === 'update' && choice.has(row.appId));
  useEffect(() => {
    if (!desktopBridge) return;
    const release = desktopBridge.onSteamProgress(value => { if (alive.current && busy) setProgress(value); });
    return release;
  }, [busy]);
  async function start() {
    if (busy || !candidates.length || !desktopBridge) return;
    setBusy(true); setError(''); setMessage('正在读取所选游戏的 Steam 资料…'); setPhase('enriching');
    setProgress({ completed: 0, total: candidates.length, title: '' });
    try {
      // 现有值预填：用户已补字段不会请求覆盖，封面/开发商等只在缺失处补齐。
      const seeded = candidates.map(({ item, appId }) => {
        const game: SteamLibraryGame = { appId, title: item.title };
        for (const field of ['coverUrl', 'creator', 'year', 'originalTitle'] as const) {
          const value = item[field];
          if (typeof value === 'string' && value.trim()) (game as unknown as Record<string, unknown>)[field] = value;
        }
        return game;
      });
      const response = await desktopBridge.enrichSteamLibrary(seeded);
      if (!alive.current) return;
      if (!response.ok || !response.value) throw new Error(response.error || '资料读取失败，请稍后重试');
      const incoming = response.value.games.map(game => ({ ...game, appId: game.appId })) as SteamLibraryGame[];
      setGames(incoming); setPhase('preview');
      setChoice(new Set(incoming.map(game => game.appId)));
      setMessage(`${response.value.cancelled ? '已停止读取，已取得的资料保留在预览。' : '资料读取完成。'}${response.value.missingCovers ? ` ${response.value.missingCovers} 款封面暂不可用。` : ''}${response.value.missingDetails ? ` ${response.value.missingDetails} 款详细资料暂不可用。` : ''}${response.value.detailsRateLimited ? ' Steam 暂时限制了资料请求，可稍后重试。' : ''}确认后才会写入收藏库。`);
    } catch (failure) { if (alive.current) { setError(failure instanceof Error ? failure.message : '资料读取失败'); setMessage(''); setPhase('idle'); } }
    finally { if (alive.current) { setBusy(false); setProgress(null); } }
  }
  function apply() {
    if (busy || submitted || !games || !chosen.length) return;
    setSubmitted(true); setError('');
    try {
      if (onSync(games, new Set(chosen.map(row => row.appId)))) onClose();
      else { setSubmitted(false); setError('保存未完成，预览和选择已保留。请处理收藏库提示后重试'); }
    } catch (failure) { setSubmitted(false); setError(failure instanceof Error ? failure.message : '未能保存，预览和选择已保留'); }
  }
  return <Modal title={t("补齐 Steam 资料")} description={t("对选中的 {0} 款游戏读取 Steam 公开资料，只补缺失字段；不读取账号库存，不更新时长，不新增作品。", [selectedGames.length])} onClose={onClose} wide>
    <div ref={panel as React.RefObject<HTMLDivElement>}>
      {skipped.length > 0 && <details className="steam-import-warnings" open><summary>{skipped.length} {" "}{t("款将跳过")}</summary><ul>{skipped.map(({ item, reason }) => <li key={item.id}>{item.title}：{reason}</li>)}</ul></details>}
      {phase === 'idle' && <div className="modal-actions"><span className="feature-help">{candidates.length ? t("可补齐 {0} 款。", [candidates.length]) : t('没有可补齐的游戏。')}</span>{candidates.length > 0 && <button className="button button--primary" onClick={() => { void start(); }} disabled={busy}><Sparkles size={15} />{t("开始读取")}</button>}</div>}
      {phase === 'enriching' && <div className="enrich-progress" role="status"><progress value={progress?.completed ?? 0} max={progress?.total ?? candidates.length} /><span>{progress ? `${progress.completed} / ${progress.total}${progress.title ? ' · ' + progress.title : ''}` : t('准备中…')}</span><button className="button button--ghost" onClick={() => desktopBridge?.cancelSteamRequest()}><Square size={14} />{t("停止")}</button></div>}
      {phase === 'preview' && <><div className="steam-import-summary" role="status"><span><strong>{chosen.length}</strong> {" "}{t("款将补齐资料")}</span>{updateRows.length - updateRows.filter(row => row.kind === 'update').length > 0 && <span><strong>{updateRows.length - updateRows.filter(row => row.kind === 'update').length}</strong> {" "}{t("款已齐全，无需更新")}</span>}</div>
        <div className="steam-import-rows" aria-label={t("资料补齐预览")}>{updateRows.map(row => <label key={row.appId} className="steam-import-row"><input type="checkbox" aria-label={t("补齐 {0}", [row.game.title])} disabled={row.kind !== 'update' || submitted} checked={row.kind === 'update' && choice.has(row.appId)} onChange={event => setChoice(current => { const next = new Set(current); event.target.checked ? next.add(row.appId) : next.delete(row.appId); return next; })} /><span className="steam-import-game"><strong>{row.game.title}</strong><small>{row.kind === 'update' ? t("将补：{0}", [row.fields.map(field => FIELD_LABELS[field] ?? field).join('、')]) : t('资料已齐全')}</small></span></label>)}</div>
        <div className="modal-actions"><button className="button button--ghost" onClick={() => { setPhase('idle'); setGames(null); }} disabled={busy || submitted}><RefreshCw size={14} />{t("重新读取")}</button><button className="button button--primary" onClick={apply} disabled={!chosen.length || submitted || busy}>{submitted ? t('正在保存…') : t("补齐选中的 {0} 款", [chosen.length])}</button></div></>}
      {message && <p className="metadata-note" role="status">{t(message)}</p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {phase === 'preview' && <p className="steam-import-hint">{t("已有封面、开发商、年份与原名不会被覆盖；状态、时长、两个等级、标签、印象与记录均不变。")}<button type="button" className="text-button" onClick={onClose}><X size={13} />{t("取消不写入")}</button></p>}
    </div>
  </Modal>;
}
