import { useState, type ReactNode } from 'react';
import { Archive, Download, Droplets, FolderOpen, Info, Link2, Palette, Search, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { desktopBridge, desktopInfo } from '../../../infrastructure/repository.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { BackgroundSettings, GlassSettings, ActionGlassSettings, type AmbientControls, type GlassControls } from './VisualSettings.tsx';
import './settings.css';

const pages = [
  { id: 'background', label: '背景与配色', icon: Palette, search: '动态 流体 星河 粒子 密度 视差 幅度 明暗 环境光 色相 香槟金 深海蓝 极光绿 紫罗兰 绛红 色深 流速 涡旋 扭曲 笔刷 半径' },
  { id: 'glass', label: '导航玻璃', icon: Droplets, search: '玻璃材质 液态 磨砂 模糊 折射 色散 透镜 深度 弹性 Dock 搜索框' },
  { id: 'buttons', label: '操作按钮', icon: SlidersHorizontal, search: '按钮 毛玻璃 模糊 透明 不透明度' },
  { id: 'data', label: '数据与备份', icon: Archive, search: 'Steam 游戏库 同步 连接 导出 导入 收藏 JSON 备份 本机 目录 清除 演示' },
] as const;
type PageId = typeof pages[number]['id'];
type Props = { ambient: AmbientControls; glass: GlassControls; hasDemos: boolean; onClose: () => void; onSteam: () => void; onExport: () => void; onImport: () => void; onClearDemo: () => void; onNotice: (text: string) => void };
function DataRow({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return <div className="settings-card settings-choice"><div className="settings-row-icon">{icon}</div><div><h4>{title}</h4><p>{description}</p></div>{children}</div>;
}
export function SettingsDialog({ ambient, glass, hasDemos, onClose, onSteam, onExport, onImport, onClearDemo, onNotice }: Props) {
  const [section, setSection] = useState<PageId>('background');
  const [search, setSearch] = useState(''), [resetDone, setResetDone] = useState(false);
  const term = search.trim().toLocaleLowerCase();
  const visible = pages.filter(page => term ? `${page.label} ${page.search}`.toLocaleLowerCase().includes(term) : page.id === section);
  const headingActions = <label className="settings-search"><Search size={17} /><input aria-label="搜索设置" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索设置" />{search && <button type="button" onClick={() => setSearch('')} aria-label="清除设置搜索">×</button>}</label>;
  return <Modal title="数据与设置" className="settings-dialog" headingActions={headingActions} onClose={onClose}>
    <div className="settings-layout"><nav className="settings-nav" aria-label="设置分类">{pages.map(page => <button type="button" key={page.id} aria-label={page.label} className={!term && section === page.id ? 'is-selected' : ''} aria-current={!term && section === page.id ? 'page' : undefined} onClick={() => { setSection(page.id); setSearch(''); }}><page.icon size={19} /><span>{page.label}</span></button>)}</nav>
      <div className="settings-content" key={term ? 'search' : section}>
        {visible.map(page => <section className="settings-section" key={page.id} aria-label={page.label}><header><page.icon size={22} /><div><h3>{page.label}</h3><p>{page.id === 'background' ? '让流动与景深适合你的节奏' : page.id === 'glass' ? '调整侧边导航与搜索框的通透质感' : page.id === 'buttons' ? '为操作按钮设置柔和的毛玻璃' : '连接资料来源，保留每一次收藏与记录'}</p></div></header>
          {page.id === 'background' && <BackgroundSettings ambient={ambient} searching={!!term} />}
          {page.id === 'glass' && <GlassSettings glass={glass} searching={!!term} />}
          {page.id === 'buttons' && <ActionGlassSettings glass={glass} />}
          {page.id === 'data' && <>
            <DataRow title="Steam 游戏库" description="读取库存与时长，预览后同步，保留个人记录。" icon={<Link2 size={19} />}><button className="button button--secondary" onClick={onSteam}>连接 Steam</button></DataRow>
            <DataRow title="导出收藏备份" description="包括作品、标签、印象、测评和已上传封面。" icon={<Download size={19} />}><button className="button button--secondary" onClick={onExport}>导出</button></DataRow>
            <DataRow title="导入收藏备份" description="从栖域 v1 JSON 恢复，替换当前收藏。" icon={<Upload size={19} />}><button className="button button--secondary" onClick={onImport}>导入</button></DataRow>
            {desktopInfo && desktopBridge && <DataRow title="本机数据目录" description="查看收藏数据与本机备份文件。" icon={<FolderOpen size={19} />}><button className="button button--secondary" onClick={() => { try { desktopBridge?.openDataDirectory(); } catch (error) { onNotice(`打开目录失败：${error instanceof Error ? error.message : '请稍后重试'}`); } }}>打开目录</button></DataRow>}
            {hasDemos && <DataRow title="清除演示作品" description="只移除预置示例，保留你添加的作品。" icon={<Trash2 size={19} />}><button className="button button--secondary" onClick={onClearDemo}>清除</button></DataRow>}
            <p className="settings-data-notice"><Info size={17} />{desktopInfo ? '收藏仅保存在这台电脑。请定期导出 JSON，用于迁移或恢复。' : '收藏保存在当前浏览器。清除站点数据可能丢失收藏，请定期导出。'}</p>
          </>}
        </section>)}
        {!visible.length && <div className="settings-no-results"><Search size={26} /><h3>没有找到相关设置</h3><p>试试“色相”“玻璃”或“备份”。</p><button className="button button--secondary" onClick={() => setSearch('')}>清除搜索</button></div>}
      </div>
    </div><footer className="settings-footer"><span role="status">{resetDone ? '已恢复示例默认背景与玻璃参数' : '调整即时生效，退出后保留'}</span><button className="button button--secondary" onClick={() => { ambient.reset(); glass.reset(); setResetDone(true); }}>重置背景与玻璃</button></footer>
  </Modal>;
}
