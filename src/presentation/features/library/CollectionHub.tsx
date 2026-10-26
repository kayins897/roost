import { FolderPlus, ListPlus, Pencil, Search, Tags } from 'lucide-react';
import { Modal } from '../../components/MediaPrimitives.tsx';

export function CollectionHub({ onClose, onManual, onSearch, onBatch, onTags }: {
  onClose: () => void; onManual: () => void; onSearch: () => void; onBatch: () => void; onTags: () => void;
}) {
  return <Modal title="收录作品" className="collection-hub" onClose={onClose}>
    <p className="feature-help">选择适合这次收录的方式</p>
    <div className="collection-hub-actions">
      <button autoFocus aria-label="手动收录" onClick={onManual}><Pencil size={22} /><strong>手动收录</strong><small>直接填写作品与个人记录</small></button>
      <button aria-label="检索与导入" onClick={onSearch}><Search size={22} /><strong>检索与导入</strong><small>搜索作品或粘贴资料链接</small></button>
      <button aria-label="批量收录" onClick={onBatch}><ListPlus size={22} /><strong>批量收录</strong><small>从作品清单一次导入多件</small></button>
    </div>
    <footer className="collection-hub-footer"><FolderPlus size={17} /><span>游戏、书籍、影视与音乐</span><button className="text-button" onClick={onTags}><Tags size={16} />整理标签</button></footer>
  </Modal>;
}
