import { Grid2X2, List } from 'lucide-react';
import type { Layout } from './types';

export function ViewToggle({ label, value, onChange }: { label: string; value: Layout; onChange: (layout: Layout) => void }) {
  return <div className="rd-view-toggle" role="group" aria-label={`${label}视图`}>
    <button aria-label={`${label}封面网格`} title="封面网格" aria-pressed={value === 'grid'} onClick={() => onChange('grid')}><Grid2X2 size={16}/></button>
    <button aria-label={`${label}横向列表`} title="横向列表" aria-pressed={value === 'list'} onClick={() => onChange('list')}><List size={17}/></button>
  </div>;
}
