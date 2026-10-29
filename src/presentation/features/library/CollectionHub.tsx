import { t } from '../../i18n/index.ts';
import { FolderPlus, ListPlus, Pencil, Search, Tags } from 'lucide-react';
import { Modal } from '../../components/MediaPrimitives.tsx';

export function CollectionHub({ onClose, onManual, onSearch, onBatch, onTags }: {
  onClose: () => void; onManual: () => void; onSearch: () => void; onBatch: () => void; onTags: () => void;
}) {
  return <Modal title={t("收录作品")} className="collection-hub" onClose={onClose}>
    <p className="feature-help">{t("选择适合这次收录的方式")}</p>
    <div className="collection-hub-actions">
      <button autoFocus aria-label={t("手动收录")} onClick={onManual}><Pencil size={22} /><strong>{t("手动收录")}</strong><small>{t("直接填写作品与个人记录")}</small></button>
      <button aria-label={t("检索与导入")} onClick={onSearch}><Search size={22} /><strong>{t("检索与导入")}</strong><small>{t("搜索作品或粘贴资料链接")}</small></button>
      <button aria-label={t("批量收录")} onClick={onBatch}><ListPlus size={22} /><strong>{t("批量收录")}</strong><small>{t("从作品清单一次导入多件")}</small></button>
    </div>
    <footer className="collection-hub-footer"><FolderPlus size={17} /><span>{t("游戏、书籍与影视")}</span><button className="text-button" onClick={onTags}><Tags size={16} />{t("整理标签")}</button></footer>
  </Modal>;
}
