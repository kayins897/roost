import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { GameScreenshot } from '../src/domain/types.ts';

export const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
export type DecodeImage = (bytes: Buffer) => { width: number; height: number; thumbnail: Buffer };
export const assetHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function imageMime(bytes: Uint8Array): GameScreenshot['mimeType'] {
  const buffer = Buffer.from(bytes);
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new Error('截图只支持 PNG、JPEG 和 WebP 图片');
}
/** Content-addressed, append-only assets: deleting a reference never breaks old backups. */
export class GameAssetStore {
  readonly directory: string;
  readonly decode: DecodeImage;
  constructor(dataDirectory: string, decode: DecodeImage) { this.directory = path.join(path.resolve(dataDirectory), 'screenshots'); this.decode = decode; }
  file(id: string, thumbnail = false): string {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('截图编号无效');
    return path.join(this.directory, id + (thumbnail ? '.thumb.jpg' : '.original'));
  }
  importFile(filename: string): GameScreenshot {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES || !stat.size) throw new Error('单张截图须小于 40 MB');
    const bytes = fs.readFileSync(filename);
    const { id, mimeType, width, height } = this.install(bytes);
    return { id: randomUUID(), assetId: id, filename: path.basename(filename).slice(-255), mimeType, width, height, addedAt: new Date().toISOString() };
  }
  install(bytes: Buffer, expectedId?: string) {
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('截图大小无效');
    const mimeType = imageMime(bytes), id = assetHash(bytes);
    if (expectedId && id !== expectedId) throw new Error('备份截图校验失败');
    const image = this.decode(bytes);
    if (!image.width || !image.height || image.width > 20000 || image.height > 20000 || image.width * image.height > 60000000) throw new Error('截图尺寸过大或图片无法解析');
    fs.mkdirSync(this.directory, { recursive: true });
    this.writeOnce(this.file(id), bytes);
    this.writeOnce(this.file(id, true), image.thumbnail);
    return { id, mimeType, width: image.width, height: image.height };
  }
  private writeOnce(file: string, bytes: Buffer) {
    if (fs.existsSync(file)) {
      // Never silently reuse corrupt originals. Thumbnails can be regenerated later.
      if (file.endsWith('.original') && assetHash(fs.readFileSync(file)) !== assetHash(bytes)) throw new Error('本机截图文件损坏，请先保留备份后修复');
      return;
    }
    const temporary = path.join(this.directory, `.${randomUUID()}.tmp`);
    try { fs.writeFileSync(temporary, bytes, { flag: 'wx' }); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}
