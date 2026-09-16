// 自检：QQ vkey 音质链/解析逻辑（加载真实的 src/utils/musicSdk/tx/utils/vkey-url.js）
// 运行：node test-tx-url.js
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const assert = require('assert')

const real = path.join(__dirname, 'src/utils/musicSdk/tx/utils/vkey-url.js')
const tmp = path.join(os.tmpdir(), `vkey-url-${Date.now()}.mjs`)
fs.copyFileSync(real, tmp)

import(pathToFileURL(tmp).href)
  .then((m) => {
    const { buildQualityChain, parseUin, joinPlayUrl, parsePurls } = m

    // uin 解析
    assert.strictEqual(parseUin(''), '0')
    assert.strictEqual(parseUin('uin=o12345; qqmusic_key=x'), '12345')
    assert.strictEqual(parseUin('foo=1; uin=777'), '777')
    assert.strictEqual(parseUin('uin=abc'), '0')

    // 音质链
    assert.deepStrictEqual(buildQualityChain('flac'), ['flac', '320k', '128k'])
    assert.deepStrictEqual(buildQualityChain('hires'), ['hires', 'flac', '320k', '128k'])
    assert.deepStrictEqual(buildQualityChain('128k'), ['128k'])
    assert.deepStrictEqual(buildQualityChain('master'), ['hires', 'flac', '320k', '128k'])
    assert.deepStrictEqual(buildQualityChain('nonsense'), ['hires', 'flac', '320k', '128k'])

    // purl 拼接：相对拼 sip，绝对不拼
    assert.strictEqual(joinPlayUrl('http://aqq.com/', '/M500x.mp3'), 'http://aqq.com//M500x.mp3')
    assert.strictEqual(joinPlayUrl('http://aqq.com/', 'http://cdn.qq.com/M800y.mp3'), 'http://cdn.qq.com/M800y.mp3')

    // 响应解析：按请求顺序返回，忽略空 purl，未知前缀兜底 128k
    const body = {
      req_0: {
        code: 0,
        data: {
          sip: ['http://s1.qq.com/'],
          midurlinfo: [
            { filename: 'F000m.flac', purl: '' },
            { filename: 'M800m.mp3', purl: '/M800m.mp3?vkey=abc' },
            { filename: 'M500m.mp3', purl: 'https://cdn.qq.com/M500m.mp3?vkey=abc' },
            { filename: 'RS02m.flac', purl: '/RS02m.flac' },
          ],
        },
      },
    }
    const urls = parsePurls(body)
    assert.deepStrictEqual(urls, [
      { type: '320k', url: 'http://s1.qq.com//M800m.mp3?vkey=abc' },
      { type: '128k', url: 'https://cdn.qq.com/M500m.mp3?vkey=abc' },
      { type: 'hires', url: 'http://s1.qq.com//RS02m.flac' },
    ])

    // 错误 code / 缺 data / 全空
    assert.deepStrictEqual(parsePurls({ req_0: { code: 1 } }), [])
    assert.deepStrictEqual(parsePurls({}), [])
    assert.deepStrictEqual(parsePurls({ req_0: { code: 0, data: { midurlinfo: [{ filename: 'M500m.mp3', purl: '' }] } } }), [])

    console.log('tx vkey-url self-check: OK')
  })
  .catch((err) => {
    console.error('tx vkey-url self-check: FAILED', err)
    process.exit(1)
  })
  .finally(() => {
    try {
      fs.unlinkSync(tmp)
    } catch {}
  })