// 解析随发行包一起提供的验收说明，避免打包脚本回落旧版本文件。
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function acceptanceDocFor(version) {
  const file = path.join(root, 'docs', 'release', `验收步骤-${version}.md`);
  if (!fs.existsSync(file)) {
    throw new Error(`缺少验收说明：docs/release/验收步骤-${version}.md——发布前必须补齐，不能复用旧版本说明`);
  }
  return file;
}

module.exports = { acceptanceDocFor };
