import { t } from '../../i18n/index.ts';
import { useState, type ReactNode } from 'react';
import { Archive, Download, Droplets, FolderOpen, Info, Link2, Palette, Search, SlidersHorizontal, Trash2, Upload } from 'lucide-react';
import { desktopBridge, desktopInfo } from '../../../infrastructure/repository.ts';
import { Modal } from '../../components/MediaPrimitives.tsx';
import { BackgroundSettings, GlassSettings, ActionGlassSettings, type AmbientControls, type GlassControls } from './VisualSettings.tsx';
import './settings.css';
import { CoverMaterialSettings } from './CoverMaterialSettings.tsx';
import { LanguageSettings } from './LanguageSettings.tsx';
import { TypographySettings } from './TypographySettings.tsx';

const pages = [
  { id: 'interface', label: '语言与字体', icon: Info, search: '中文 英文 语言 字体 黑体 宋体 系统 language font typography Chinese English sans serif' },
  { id: 'covers', label: '卡面材质', icon: Palette, search: '反光 镭射 多彩 纹理 滤镜 流速 三角 切面' },
  { id: 'background', label: '背景与配色', icon: Palette, search: '动态 流体 星河 粒子 密度 视差 幅度 明暗 环境光 色相 香槟金 深海蓝 极光绿 紫罗兰 绛红 色深 流速 涡旋 扭曲 笔刷 半径' },
  { id: 'glass', label: '导航玻璃', icon: Droplets, search: '玻璃材质 液态 磨砂 模糊 折射 色散 透镜 深度 弹性 Dock 搜索框' },
  { id: 'buttons', label: '操作按钮', icon: SlidersHorizontal, search: '按钮 毛玻璃 模糊 透明 不透明度' },
  { id: 'data', label: '数据与备份', icon: Archive, search: 'Steam 游戏库 同步 连接 隐藏 恢复 导出 导入 收藏 JSON 备份 本机 目录 清除 演示' },
] as const;
type PageId = typeof pages[number]['id'];
type Props = { ambient: AmbientControls; glass: GlassControls; hasDemos: boolean; onClose: () => void; onSteam: () => void; onHidden: () => void; onExport: () => void; onImport: () => void; onClearDemo: () => void; onNotice: (text: string) => void };
function DataRow({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return <div className="settings-card settings-choice"><div className="settings-row-icon">{icon}</div><div><h4>{title}</h4><p>{description}</p></div>{children}</div>;
}
export function SettingsDialog({ ambient, glass, hasDemos, onClose, onSteam, onExport, onImport, onClearDemo, onNotice, onHidden }: Props) {
  const [section, setSection] = useState<PageId>('background');
  const [search, setSearch] = useState(''), [resetDone, setResetDone] = useState(false);
  const term = search.trim().toLocaleLowerCase();
  const visible = pages.filter(page => term ? `${page.label} ${t(page.label)} ${page.search} ${page.id}`.toLocaleLowerCase().includes(term) : page.id === section);
  const headingActions = <label className="settings-search"><Search size={17} /><input aria-label={t("搜索设置")} value={search} onChange={event => setSearch(event.target.value)} placeholder={t("搜索设置")} />{search && <button type="button" onClick={() => setSearch('')} aria-label={t("清除设置搜索")}>×</button>}</label>;
  return <Modal title={t("数据与设置")} className="settings-dialog" headingActions={headingActions} onClose={onClose}>
    <div className="settings-layout"><nav className="settings-nav" aria-label={t("设置分类")}>{pages.map(page => <button type="button" key={page.id} aria-label={t(page.label)} className={!term && section === page.id ? 'is-selected' : ''} aria-current={!term && section === page.id ? 'page' : undefined} onClick={() => { setSection(page.id); setSearch(''); }}><page.icon size={19} /><span>{t(page.label)}</span></button>)}</nav>
      <div className="settings-content" key={term ? 'search' : section}>
        {visible.map(page => <section className="settings-section" key={page.id} aria-label={t(page.label)}><header><page.icon size={22} /><div><h3>{t(page.label)}</h3><p>{page.id === 'interface' ? t('选择界面语言与字体，离线使用。') : page.id === 'background' ? t('让流动与景深适合你的节奏') : page.id === 'glass' ? t('调整侧边导航与搜索框的通透质感') : page.id === 'buttons' ? t('为操作按钮设置柔和的毛玻璃') : t('连接资料来源，保留每一次收藏与记录')}</p></div></header>
          {page.id === 'interface' && <><LanguageSettings /><TypographySettings /></>}
          {page.id === 'background' && <BackgroundSettings ambient={ambient} searching={!!term} />}
          {page.id === 'glass' && <GlassSettings glass={glass} searching={!!term} />}
          {page.id === 'buttons' && <ActionGlassSettings glass={glass} />}
          {page.id === 'covers' && <CoverMaterialSettings />}
          {page.id === 'data' && <>
            <DataRow title={t("Steam 游戏库")} description={t("读取库存与时长，预览后同步，保留个人记录。")} icon={<Link2 size={19} />}><button className="button button--secondary" onClick={onSteam}>{t("连接 Steam")}</button></DataRow>
            <DataRow title={t("已隐藏作品")} description={t("查看和恢复以前隐藏的作品，保留全部个人记录。")} icon={<Archive size={19} />}><button className="button button--secondary" onClick={onHidden}>{t("查看")}</button></DataRow>
            <DataRow title={t("导出完整备份")} description={t("一个 .roost 文件，含收藏、评分、感受及全部截图原图。")} icon={<Download size={19} />}><button className="button button--secondary" onClick={onExport}>{t("导出")}</button></DataRow>
            <DataRow title={t("恢复收藏备份")} description={t("支持完整 .roost 及旧 JSON；确认后替换收藏，保留恢复前备份。")} icon={<Upload size={19} />}><button className="button button--secondary" onClick={onImport}>{t("导入")}</button></DataRow>
            {desktopInfo && desktopBridge && <DataRow title={t("本机数据目录")} description={t("查看收藏数据与本机备份文件。")} icon={<FolderOpen size={19} />}><button className="button button--secondary" onClick={() => { try { desktopBridge?.openDataDirectory(); } catch (error) { onNotice(`打开目录失败：${error instanceof Error ? error.message : '请稍后重试'}`); } }}>{t("打开目录")}</button></DataRow>}
            {hasDemos && <DataRow title={t("清除演示作品")} description={t("只移除预置示例，保留你添加的作品。")} icon={<Trash2 size={19} />}><button className="button button--secondary" onClick={onClearDemo}>{t("清除")}</button></DataRow>}
            <p className="settings-data-notice"><Info size={17} />{desktopInfo ? t('收藏与截图仅保存在这台电脑。请定期导出完整备份。') : t('收藏保存在当前浏览器。清除站点数据可能丢失收藏，请定期导出。')}</p>
          </>}
        </section>)}
        {!visible.length && <div className="settings-no-results"><Search size={26} /><h3>{t("没有找到相关设置")}</h3><p>{t("试试“色相”“玻璃”或“备份”。")}</p><button className="button button--secondary" onClick={() => setSearch('')}>{t("清除搜索")}</button></div>}
      </div>
    </div><footer className="settings-footer"><span role="status">{resetDone ? t('已恢复示例默认背景与玻璃参数') : t('调整即时生效，退出后保留')}</span><button className="button button--secondary" onClick={() => { ambient.reset(); glass.reset(); setResetDone(true); }}>{t("重置背景与玻璃")}</button></footer>
  </Modal>;
}
