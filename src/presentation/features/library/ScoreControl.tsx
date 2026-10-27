import { useEffect, useState } from 'react';
import { isPersonalScore } from '../../../domain/gameAssets.ts';
import { ScorePicker } from '../../components/ScorePicker.tsx';
/** Draft is distinct from an explicit zero; failed saves leave it available for retry. */
export function ScoreControl({ value, onSave, label = '通关评分' }: { value?: number; onSave: (value: number | undefined) => boolean; label?: string }) {
  const [draft, setDraft] = useState(value === undefined ? '' : value.toFixed(1)), [error, setError] = useState('');
  useEffect(() => { setDraft(value === undefined ? '' : value.toFixed(1)); }, [value]);
  const next = draft.trim() === '' ? undefined : Number(draft), valid = next === undefined || isPersonalScore(next);
  return <form className="score-control" onSubmit={event => { event.preventDefault(); if (!valid) return; setError(onSave(next) ? '' : '未能保存，请重试'); }} onKeyDown={event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.stopPropagation(); }}>
    <ScorePicker value={draft} label={label} onChange={value => { setDraft(value); setError(''); }} />
    <button type="submit" className="button button--secondary" disabled={!valid || next === value}>保存</button>
    {value !== undefined && <button type="button" className="text-button" onClick={() => { if (!onSave(undefined)) setError('未能保存，请重试'); }}>清除</button>}
    {!valid && <small role="alert">0–10 分，最多一位小数</small>}{error && <small role="alert">{error}</small>}
  </form>;
}
