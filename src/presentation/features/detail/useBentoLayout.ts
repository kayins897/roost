import { useRef, useState } from 'react';
import { defaultDetailLayout, loadDetailLayout, saveDetailLayout, type DetailLayoutPreferences, type DetailWidgetId, type DetailWidgetPreference } from '../../../infrastructure/detailLayout.ts';

export function useBentoLayout() {
  const [layout, setLayout] = useState(loadDetailLayout);
  const [editing, setEditing] = useState(false);
  const [manager, setManager] = useState(false);
  const [error, setError] = useState('');
  const before = useRef<DetailLayoutPreferences | null>(null);
  function change(next: DetailLayoutPreferences) {
    try { if (!editing) saveDetailLayout(next); setLayout(next); setError(''); return true; }
    catch { setError('布局未能保存，请重试。收藏内容没有改变。'); return false; }
  }
  function updateCard(id: DetailWidgetId, patch: Partial<DetailWidgetPreference>) {
    return change({ ...layout, cards: layout.cards.map(card => card.id === id ? { ...card, ...patch } : card) });
  }
  function move(id: DetailWidgetId, target: DetailWidgetId, after = false) {
    if (!editing || id === target) return;
    const card = layout.cards.find(value => value.id === id)!;
    const cards = layout.cards.filter(value => value.id !== id);
    cards.splice(cards.findIndex(value => value.id === target) + Number(after), 0, card);
    change({ ...layout, cards });
  }
  function step(id: DetailWidgetId, direction: number) {
    const visible = layout.cards.filter(card => card.visible), index = visible.findIndex(card => card.id === id);
    const target = visible[index + direction]; if (target) move(id, target.id, direction > 0);
  }
  function begin(showManager = false) {
    if (!editing) before.current = structuredClone(layout);
    setEditing(true); setManager(showManager);
  }
  function cancel() {
    if (before.current) setLayout(before.current);
    setEditing(false); setManager(false); setError('');
  }
  function finish() {
    try { saveDetailLayout(layout); before.current = null; setEditing(false); setManager(false); setError(''); return true; }
    catch { setError('布局未能保存，请重试，当前调整仍保留。'); return false; }
  }
  return { layout, editing, manager, error, updateCard, move, step, begin, cancel, finish,
    showManager: () => setManager(value => !value),
    setField: (key: string, visible: boolean) => change({ ...layout, fields: { ...layout.fields, [key]: visible } }),
    setGalleryMode: (galleryMode: 1 | 4 | 9) => change({ ...layout, galleryMode }),
    reset: () => change(defaultDetailLayout()),
  };
}
export type BentoLayoutController = ReturnType<typeof useBentoLayout>;
