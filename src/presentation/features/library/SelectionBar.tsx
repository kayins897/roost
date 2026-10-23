import type { ReactNode } from 'react';

export function SelectionBar({ count, assignment, canSelectAll, onSelectAll, onClear, onExit, children }: { count: number; assignment?: string; canSelectAll: boolean; onSelectAll: () => void; onClear: () => void; onExit: () => void; children: ReactNode }) {
  return <div className="selection-actionbar" aria-label="批量操作">
    <div className="selection-summary" role="status">已选择 <strong>{count}</strong> 件{assignment && <small>标签：{assignment}</small>}</div>
    <div className="selection-management"><button className="button button--secondary" disabled={!canSelectAll} onClick={onSelectAll}>全选当前结果</button><button className="button button--secondary" disabled={!count} onClick={onClear}>清空选择</button><button className="button button--secondary" onClick={onExit}>退出多选</button></div>
    <div className="selection-commands">{children}</div>
  </div>;
}
