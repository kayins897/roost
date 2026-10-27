import { useState } from 'react';
import { isPersonalScore } from '../../../domain/gameAssets.ts';
import type { MediaItem } from '../../../domain/types.ts';
import { ScorePicker } from '../../components/ScorePicker.tsx';
export function BulkScoreBar({ games, summary, onApply }: { games: MediaItem[]; summary: string; onApply: (score: number | undefined) => boolean }) {
  const [draft, setDraft] = useState(''), [clear, setClear] = useState(false);
  const score = clear ? undefined : Number(draft), valid = clear || (draft !== '' && isPersonalScore(score));
  const changes = valid ? games.filter(game => game.personalScore !== score).length : 0;
  return <div className="bulk-grade-bar bulk-score-bar"><div className="bulk-score-field"><span>统一通关评分</span><ScorePicker value={draft} label="统一通关评分" disabled={clear} onChange={setDraft} /></div><label><input type="checkbox" checked={clear} onChange={event => setClear(event.target.checked)} />清除评分</label><small>{summary}{valid ? `；将更新 ${changes} 款` : ''}</small><button className="button button--secondary" disabled={!valid || !changes} onClick={() => { if (onApply(score)) { setDraft(''); setClear(false); } }}>应用评分</button></div>;
}
