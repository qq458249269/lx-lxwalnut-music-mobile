/**
 * 版本号递增规则（唯一来源）
 * 格式：YY.MM.DD（首日） / YY.MM.DD.N（同日递增末位）
 * 同日已有非 draft 的发布 → 末位 .N 递增；新日期 → 回到裸日期。
 */
const pad = (n) => String(n).padStart(2, '0')

/** 当前日期基版本：new Date() -> '26.08.08' */
const todayVersion = (date = new Date()) => {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  return `${yy}.${mm}.${dd}`
}

/** 提取版本前三位日期段：'26.08.08.1' -> '26.08.08'；不合法返回 null */
const datePart = (ver) => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})/.exec(String(ver || ''))
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

/** 纯数字段比较：1 a>b / -1 a<b / 0 equal（语义与 app 内 compareVer 一致） */
const compareVer = (a, b) => {
  const fa = String(a).split('.').map((s) => parseInt(s, 10))
  const fb = String(b).split('.').map((s) => parseInt(s, 10))
  const c = Math.max(fa.length, fb.length)
  for (let i = 0; i < c; i++) {
    const x = fa[i] || 0
    const y = fb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

/**
 * versionCode 由四位版本号线性编码，保证不随日期跳变发生反转（拼接会造成 >10 号日降级）。
 * YY.MM.DD.N -> (((YY*100 + MM)*100 + DD)*100 + N)
 * 26.08.08  -> 260808 0x; 26.08.08.1 -> 26080801; 26.08.09 -> 26080900;
 * 26.08.09.1 -> 26080901 > 26.08.08.1(26080801) 单调。上限约 99123199，*abi 后缀(×10+idx)仍 int 安全。
 * 此值即 build.gradle 的 defaultConfig.versionCode，abi 拆分在 override 里 ×10 + idx。
 */
const versionCodeOf = (ver) => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})(?:\.(\d+))?$/.exec(String(ver || ''))
  if (!m) return 0
  const [, y, mo, d, n] = m
  return ((parseInt(y, 10) * 100 + parseInt(mo, 10)) * 100 + parseInt(d, 10)) * 100 + parseInt(n || 0, 10)
}

/**
 * 计算下一次发布版本号。
 * 恒为四段 YY.MM.DD.N，日期 + 小号双递增：「同日或新日期」末位 N 递增，新日期从 .1 起。
 * @param {string} current 当前 package.json version
 * @param {Array<{tagName:string,isDraft?:boolean}>} tags 已存在的 Release tag（GhAPI 输出）
 * @param {string} today 日期基版本，默认当天
 * @returns {string} 下次版本：新日期首发 .1；同日 .N 递增
 */
const computeNextVersion = (current, tags = [], today = todayVersion()) => {
  const base = datePart(current) === today ? today : today
  let maxN = 0
  for (const t of tags) {
    const tv = String(t.tagName || t).replace(/^v/, '')
    if (t.isDraft) continue
    const m = new RegExp(`^${base.replace(/\./g, '\\.')}(?:\\.(\\d+))?$`).exec(tv)
    if (!m) continue
    const n = m[1] != null ? parseInt(m[1], 10) : 0
    if (n > maxN) maxN = n
  }
  return `${base}.${maxN + 1}`
}

const selfTest = () => {
  const assert = (cond, msg) => {
    if (!cond) throw new Error('bump-version self-test failed: ' + msg)
  }
  const t = '26.08.08'
  assert(todayVersion(new Date(2026, 7, 8)) === '26.08.08', 'todayVersion')
  assert(datePart('26.08.08.1') === '26.08.08', 'datePart')
  assert(datePart('bad') === null, 'datePart bad')
  assert(compareVer('26.08.08', '26.08.08.1') === -1, 'compare lt')
  assert(compareVer('26.08.08.3', '26.08.08.1') === 1, 'compare gt')
  assert(compareVer('26.08.08.1', '26.08.8.1') === 0, 'compare pad eq (08==8)')
  assert(versionCodeOf('26.08.08.1') === 26080801, 'versionCode 4seg')
  assert(versionCodeOf('26.08.08') === 26080800, 'versionCode bare day')
  assert(versionCodeOf('26.08.09') === 26080900, 'versionCode day roll')
  assert(versionCodeOf('27.01.01') === 27010100, 'versionCode year roll')
  // 未发布过的新日期：从 .1 起
  assert(computeNextVersion('26.08.07', [], t) === '26.08.08.1', 'day rollover -> .1')
  // 同一天首个（无小号 tag 时）：.1
  assert(computeNextVersion('26.08.08', [], t) === '26.08.08.1', 'first of day -> .1')
  // 同日已有裸版：-> .1
  assert(computeNextVersion('26.08.08', [{ tagName: 'v26.08.08' }], t) === '26.08.08.1', 'bare base -> .1')
  // 同日已有 .1：-> .2
  assert(computeNextVersion('26.08.08.1', [{ tagName: 'v26.08.08.1', isDraft: false }], t) === '26.08.08.2', 'increment')
  // draft 忽略：只看非 draft，maxN=1 -> .2
  assert(computeNextVersion('26.08.08.2', [{ tagName: 'v26.08.08.1' }, { tagName: 'v26.08.08.2', isDraft: true }], t) === '26.08.08.2', 'draft ignored')
  // pre-release 计入：maxN=7 -> .8
  assert(
    computeNextVersion('26.08.08.7', [{ tagName: 'v26.08.08.7', isPrerelease: true }], t) === '26.08.08.8',
    'prerelease counts'
  )
  console.log('bump-version self-test OK')
}

/**
 * 本地发布用：无 GitHub API 场景（npm run publish）。
 * 恒四段：同日或新日期 → 末位 N+1（新日期从 .1 起）。
 */
const computeNextVersionLocal = (current, today = todayVersion()) => {
  const base = datePart(current)
  const n = base === today ? (datePartWidthIncrement(current) || 0) : 0
  return `${today}.${n + 1}`
}

const datePartWidthIncrement = (current) => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})\.(\d+)$/.exec(String(current || ''))
  return m ? parseInt(m[4], 10) : 0
}

module.exports = { todayVersion, datePart, compareVer, versionCodeOf, computeNextVersion, computeNextVersionLocal }

if (require.main === module && process.argv.includes('--self-test')) selfTest()