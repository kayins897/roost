import { Pencil, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../../i18n/index.ts';

export function BentoDetailCard({ className, tone, edit, children }: {
  className: string;
  tone?: string;
  edit?: () => void;
  children: ReactNode;
}) {
  return <section className={['bento-widget', tone && 'bento-widget--' + tone, className].filter(Boolean).join(' ')}
    onContextMenu={edit && (event => { event.preventDefault(); edit(); })}
    onKeyDown={edit && (event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        edit();
      }
    })}>
    <div className="bento-widget-body">{children}</div>
  </section>;
}

export function BentoCardAction({ label, onClick, add = false, className }: {
  label: string;
  onClick: () => void;
  add?: boolean;
  className?: string;
}) {
  const title = t(label);
  return <button type="button" className={className ? 'bento-card-action ' + className : 'bento-card-action'}
    aria-label={title} title={title} onClick={onClick}>
    {add ? <Plus size={16} /> : <Pencil size={14} />}
  </button>;
}
