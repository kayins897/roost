import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertDemoProfile, resolveLaunchMode } from './launchMode.ts';

test('normal/test/demo 明确分离，参数缺失不会回退正式目录', () => {
  const controlled = path.join(os.tmpdir(), 'qiyu-controlled-appdata');
  const demo = path.join(controlled, 'independent-demo');
  assert.deepEqual(resolveLaunchMode([], {}, controlled), { mode: 'normal', dataDirectory: path.join(controlled, 'QIYU') });
  assert.equal(resolveLaunchMode([], { QIYU_E2E: '1', QIYU_TEST_DATA_DIR: demo }, controlled).mode, 'test');
  assert.equal(resolveLaunchMode(['--demo', `--demo-profile=${demo}`], {}, controlled).dataDirectory, demo);
  for (const [args, env] of [
    [[], { QIYU_TEST_DATA_DIR: demo }], [[], { QIYU_E2E: '1' }],
    [['--demo'], {}], [[`--demo-profile=${demo}`], {}], [['--demo-profile', demo], {}], [['--demo=true'], {}],
    [['--demo', `--demo-profile=${demo}`, '--demo-profile'], {}],
    [['--demo', '--demo-profile=relative'], {}],
    [['--demo', `--demo-profile=${path.join(controlled, 'QIYU')}`], {}],
    [['--demo', `--demo-profile=${demo}`], { QIYU_E2E: '1', QIYU_TEST_DATA_DIR: demo }],
  ] as [string[], Record<string, string>][]) assert.throws(() => resolveLaunchMode(args, env, controlled));
});

test('演示启动只读验证：修改复开保留；缺失/损坏失败且不播种、不创建目录', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'qiyu-demo-unit-'));
  try {
    const directory = path.join(parent, 'profile');
    assert.throws(() => assertDemoProfile(directory));
    assert.equal(fs.existsSync(directory), false);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, 'qiyu-demo.json'), JSON.stringify({ format: 'qiyu.demo.v1' }));
    assert.throws(() => assertDemoProfile(directory));
    assert.equal(fs.existsSync(path.join(directory, 'library.json')), false);
    const file = path.join(directory, 'library.json');
    fs.writeFileSync(file, '{damaged');
    assert.throws(() => assertDemoProfile(directory));
    assert.equal(fs.readFileSync(file, 'utf8'), '{damaged');
    const raw = '{ "schemaVersion": 1, "items": [], "futureRoot": "keep" }';
    fs.writeFileSync(file, raw);
    assertDemoProfile(directory); assertDemoProfile(directory);
    assert.equal(fs.readFileSync(file, 'utf8'), raw);
  } finally { fs.rmSync(parent, { recursive: true, force: true }); }
});
