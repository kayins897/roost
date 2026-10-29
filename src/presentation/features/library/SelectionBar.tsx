import { t } from '../../i18n/index.ts';
import type { ReactNode } from 'react';

export function SelectionBar({ count, canSelectAll, onSelectAll, onClear, onExit, children }: { count: number; canSelectAll: boolean; onSelectAll: () => void; onClear: () => void; onExit: () => void; children: ReactNode }) {
  return <div className="selection-actionbar" aria-label={t("批量操作")}>
    <div className="selection-summary" role="status">{t("已选择")}{" "}<strong>{count}</strong> {" "}{t("件")}</div>
    <div className="selection-management"><button className="button button--secondary" disabled={!canSelectAll} onClick={onSelectAll}>{t("全选当前结果")}</button><button className="button button--secondary" disabled={!count} onClick={onClear}>{t("清空选择")}</button><button className="button button--secondary" onClick={onExit}>{t("退出多选")}</button></div>
    <div className="selection-commands">{children}</div>
  </div>;
}
