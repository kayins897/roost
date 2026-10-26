import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { availableTags, emptyGameTags, flattenGameTags, GAME_TAG_KEYS, GAME_TAG_LABELS, gameTagCounts, gameTagsFor, isExperienceDate, normalizeTags } from '../domain/library.ts';
import type { ExperienceEntry, ExperienceKind, GameTagGroupKey, GameTagGroups, MediaItem } from '../domain/types.ts';
import { useDialogKeyboard } from './useDialogKeyboard.ts';
import { TagPickerGroup } from './features/tags/TagPickerGroup.tsx';

export const EXPERIENCE_LABELS: Record<ExperienceKind, string> = { started: '开始体验', progress: '体验进展', completed: '完成体验', note: '随记' };

export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
}

function SmallDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  useDialogKeyboard(panel, onClose, {
    initialFocus: element => element.querySelector<HTMLElement>('input, textarea, select') ?? element.querySelector<HTMLElement>('button'),
  });
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={panel} className="modal" data-glass="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></div>{children}</section></div>;
}

export function QuickEditor({ item, mode, availableItems = [], onClose, onSave }: { item: MediaItem; mode: 'time' | 'tags'; availableItems?: MediaItem[]; onClose: () => void; onSave: (patch: Partial<MediaItem>) => boolean }) {
  const [hours, setHours] = useState(item.playtimeMinutes === undefined ? '' : String(item.playtimeMinutes / 60));
  const [tags, setTags] = useState(item.tags.join('、'));
  const [groups, setGroups] = useState<Record<GameTagGroupKey, string>>(() => Object.fromEntries(GAME_TAG_KEYS.map(key => [key, gameTagsFor(item)[key].join('、')])) as Record<GameTagGroupKey, string>);
  const [dirty, setDirty] = useState(false);
  const choices = availableItems.filter(candidate => candidate.category === item.category && !candidate.hiddenAt && !candidate.removedAt);
  const groupedChoices = gameTagCounts(choices);
  useUnsavedChanges(dirty);
  function close() { if (!dirty || window.confirm('放弃这次尚未保存的修改？')) onClose(); }
  function submit(event: FormEvent) {
    event.preventDefault();
    let patch: Partial<MediaItem>;
    if (mode === 'time') {
      const value = hours.trim() === '' ? undefined : Number(hours);
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100000)) return;
      patch = { playtimeMinutes: value === undefined ? undefined : Math.round(value * 60) };
    } else if (item.category === 'game') {
      const gameTags = { ...emptyGameTags(), ...item.gameTags, ...Object.fromEntries(GAME_TAG_KEYS.map(key => [key, normalizeTags(groups[key].split(/[,，、\n]+/))])) } as GameTagGroups;
      patch = { gameTags, tags: flattenGameTags(gameTags) };
    } else patch = { tags: normalizeTags(tags.split(/[,，、\n]+/)) };
    if (onSave(patch)) onClose();
  }
  return <SmallDialog title={mode === 'time' ? '修改累计游玩时长' : '编辑标签'} onClose={close}><form className="editor-form" onSubmit={submit} onChangeCapture={() => setDirty(true)}>
    {mode === 'time' ? <><label className="form-field">累计时长（小时）<input autoFocus type="number" min="0" max="100000" step="any" value={hours} placeholder="留空表示未记录" onChange={event => setHours(event.target.value)} /></label><p className="feature-help">支持小数；留空表示未记录，与 0 小时不同。体验记录中的单次时长不会自动计入这里。</p></> : item.category === 'game' ? GAME_TAG_KEYS.map(key => <TagPickerGroup key={key} label={GAME_TAG_LABELS[key]} value={groups[key]} available={groupedChoices[key]} onChange={value => { setDirty(true); setGroups(current => ({ ...current, [key]: value })); }} />) : <TagPickerGroup label="标签" value={tags} available={availableTags(choices)} onChange={value => { setDirty(true); setTags(value); }} />}
    <div className="modal-actions"><button className="button button--ghost" type="button" onClick={close}>取消</button><button className="button button--primary" type="submit"><Check size={16} />保存</button></div>
  </form></SmallDialog>;
}

function localToday() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

export function ExperienceEditor({ initial, onClose, onSave }: { initial?: ExperienceEntry; onClose: () => void; onSave: (entry: ExperienceEntry) => boolean }) {
  const [monthOnly, setMonthOnly] = useState(initial?.date.length === 7);
  const [date, setDate] = useState(initial?.date ?? localToday());
  const dateDrafts = useRef({ day: initial?.date.length === 7 ? '' : initial?.date ?? localToday(), month: initial?.date.slice(0, 7) ?? localToday().slice(0, 7) });
  const [kind, setKind] = useState<ExperienceKind>(initial?.kind ?? 'note');
  const [note, setNote] = useState(initial?.note ?? '');
  const [minutes, setMinutes] = useState(initial?.minutes === undefined ? '' : String(initial.minutes));
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [error, setError] = useState('');
  function close() { if (!dirty || window.confirm('放弃这条尚未保存的体验记录？')) onClose(); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const duration = minutes.trim() === '' ? undefined : Number(minutes);
    if (!isExperienceDate(date)) { setError('请填写有效的年月或日期。'); return; }
    if (duration !== undefined && (!Number.isInteger(duration) || duration < 0 || duration > 6000000)) { setError('时长应为 0 至 6000000 的整数分钟。'); return; }
    if (onSave({ ...initial, id: initial?.id ?? crypto.randomUUID(), date, kind, note: note.trim(), minutes: duration })) onClose();
  }
  return <SmallDialog title={initial ? '编辑体验记录' : '添加体验记录'} onClose={close}><form className="editor-form" onSubmit={submit} onChangeCapture={() => setDirty(true)}>
    <div className="two-fields"><label className="form-field">日期精度<select value={monthOnly ? 'month' : 'day'} onChange={event => { const month = event.target.value === 'month'; dateDrafts.current[monthOnly ? 'month' : 'day'] = date; setDate(month ? date.slice(0, 7) || dateDrafts.current.month : dateDrafts.current.day.startsWith(date) ? dateDrafts.current.day : ''); setMonthOnly(month); }}><option value="day">具体日期</option><option value="month">只记得月份</option></select></label><label className="form-field">实际体验日期<input required type={monthOnly ? 'month' : 'date'} value={date} onChange={event => setDate(event.target.value)} /></label></div>
    <label className="form-field">记录类型<select value={kind} onChange={event => setKind(event.target.value as ExperienceKind)}>{Object.entries(EXPERIENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label className="form-field">体验内容<textarea autoFocus rows={4} maxLength={20000} value={note} onChange={event => setNote(event.target.value)} placeholder="留下这次体验的片段或感受……" /></label>
    <label className="form-field">本次时长（分钟，可留空）<input type="number" min="0" max="6000000" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} /></label><p className="feature-help">记录实际发生的体验时间。这里不会自动更改作品状态或累计游玩时长。</p>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button--ghost" type="button" onClick={close}>取消</button><button className="button button--primary" type="submit"><Check size={16} />保存记录</button></div>
  </form></SmallDialog>;
}

export function ExperienceList({ item, onAdd, onEdit, onDelete, compact = false, readOnly = false }: { item: MediaItem; onAdd: () => void; onEdit: (entry: ExperienceEntry) => void; onDelete: (entry: ExperienceEntry) => void; compact?: boolean; readOnly?: boolean }) {
  const entries = [...(item.experienceEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  return <section className="detail-section"><div className="section-heading"><h3>{compact ? '体验足迹' : '体验记录'}</h3>{!readOnly && <button className="time-edit-link" onClick={onAdd}><Plus size={13} />添加记录</button>}</div>{entries.length ? <div className="experience-list">{entries.map(entry => <article className="experience-entry" key={entry.id}><div><time>{entry.date}</time><strong>{EXPERIENCE_LABELS[entry.kind]}</strong>{entry.minutes !== undefined && <span>{entry.minutes} 分钟</span>}{!readOnly && <><button className="icon-button" aria-label={`编辑${entry.date}体验记录`} onClick={() => onEdit(entry)}><Pencil size={13} /></button><button className="icon-button icon-button--danger" aria-label={`删除${entry.date}体验记录`} onClick={() => onDelete(entry)}><Trash2 size={13} /></button></>}</div>{entry.note && <p>{entry.note}</p>}</article>)}</div> : <p className="detail-placeholder">{compact ? '还没有体验记录。' : '记录一次开始、完成或回味。可以只填写月份。'}</p>}</section>;
}
