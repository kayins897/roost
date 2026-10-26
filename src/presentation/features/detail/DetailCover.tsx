import { useState } from 'react';
import type { MediaItem } from '../../../domain/types.ts';
import { Poster } from '../../components/MediaPrimitives.tsx';

export function DetailCover({ item }: { item: MediaItem }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const hasCover = Boolean(item.coverUrl && item.coverUrl !== failedUrl);
  return <div className="detail-bento-card bento-cover" aria-label="游戏封面" onErrorCapture={() => setFailedUrl(item.coverUrl)}>
    {hasCover ? <Poster item={item} large /> : <div className="bento-cover-placeholder"><span aria-hidden="true">{item.title.slice(0, 1)}</span><small>暂无封面</small></div>}
  </div>;
}
