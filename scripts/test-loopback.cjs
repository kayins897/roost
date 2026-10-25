const { randomInt } = require('node:crypto');

// Windows may allocate port 4045 for listen(0); Chromium and fetch deliberately block it.
// Reserve a high unprivileged loopback port without weakening browser port protections.
exports.listenLoopback = async function listenLoopback(server) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const listening = await new Promise((resolve, reject) => {
      const failed = error => error.code === 'EADDRINUSE' ? resolve(false) : reject(error);
      server.once('error', failed);
      server.listen(randomInt(20000, 60000), '127.0.0.1', () => { server.removeListener('error', failed); resolve(true); });
    });
    if (listening) return server.address().port;
  }
  throw new Error('未能为隔离验收找到可用的本机端口');
};
