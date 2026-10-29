import { useEffect, useRef, useState } from 'react';
import type { SteamImportGame } from '../../../domain/steamImport.ts';
import { fillIntakeMetadata, intakeSubject } from '../../../domain/intakeMetadata.ts';
import { desktopBridge } from '../../../infrastructure/repository.ts';

export interface IntakeJob { key: string; game: SteamImportGame }
export function useIntakeEnrichment(apply: (key: string, value: SteamImportGame) => void) {
  const [progress, setProgress] = useState({ busy: false, stopping: false, done: 0, total: 0 });
  const [messages, setMessages] = useState<Record<string, string>>({});
  const running = useRef<{ stopped: boolean } | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (running.current) running.current.stopped = true; }; }, []);
  function stop() {
    if (running.current) running.current.stopped = true;
    setProgress(value => ({ ...value, stopping: true }));
  }
  function reset() { setMessages({}); }
  function clear(key: string) { setMessages(current => { const next = { ...current }; delete next[key]; return next; }); }
  async function run(jobs: IntakeJob[]) {
    const eligible = jobs.filter(job => intakeSubject(job.game));
    if (!desktopBridge || running.current || !eligible.length) return;
    const token = { stopped: false }; running.current = token;
    setProgress({ busy: true, stopping: false, done: 0, total: eligible.length });
    try {
      for (const [index, job] of eligible.entries()) {
        if (token.stopped || !alive.current) break;
        setMessages(current => ({ ...current, [job.key]: '正在读取豆瓣资料…' }));
        try {
          const result = await desktopBridge.lookupMetadata(intakeSubject(job.game)!);
          if (!alive.current || token.stopped) break;
          if (!result.ok || result.value?.length !== 1) throw new Error(result.error || '没有取得唯一的作品资料');
          apply(job.key, fillIntakeMetadata(job.game, result.value[0]));
          setMessages(current => ({ ...current, [job.key]: '资料已补入预览，尚未导入' }));
          setProgress(value => ({ ...value, done: index + 1 }));
        } catch (error) {
          if (!alive.current || token.stopped) break;
          setMessages(current => ({ ...current, [job.key]: error instanceof Error ? error.message : '读取失败，请稍后重试' }));
          // Stop on any failure: do not hammer a blocked/rate-limited source or skip unnoticed.
          break;
        }
        if (index + 1 < eligible.length) await new Promise(resolve => setTimeout(resolve, 800));
      }
    } finally {
      if (alive.current) {
        if (token.stopped) setMessages(current => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value === '正在读取豆瓣资料…' ? '已停止，保留原有清单资料' : value])));
        setProgress(value => ({ ...value, busy: false, stopping: false }));
      }
      running.current = null;
    }
  }
  return { ...progress, messages, run, stop, reset, clear, available: Boolean(desktopBridge) };
}
