/**
 * 更新日志生成（唯一来源）：由最近 N 次提交自动生成，无需手写文件。
 * 前缀映射：feat→新增 / fix→修复 / 其余（perf|refactor|style…）→优化；无前缀的提交也当优化。
 * 噪声提交（ci|chore|build|release|docs|test|bump version.json…）直接丢弃，不进日志。
 * 本地 npm run publish 与 CI 共用本模块，保证 App 更新窗口、Release Notes 三处内容一致。
 */
const { execFileSync } = require('child_process')
const path = require('path')

const ORDER = ['新增', '优化', '修复']
const CATEGORY = { feat: '新增', fix: '修复', revert: '修复', perf: '优化', refactor: '优化', style: '优化' }
const NOISE = /^(ci|chore|build|release|docs|test|version|bump|merge)(\(.+\))?!?:/i

/** 单条提交主题 -> {category, text}；噪声/空主题返回 null */
const commitToLine = (subject) => {
  const s = String(subject || '').trim()
  if (!s || NOISE.test(s)) return null
  const m = /^(\w+)(\([^)]*\))?!?:\s*(.+)$/.exec(s)
  if (!m) return { category: '优化', text: s }
  return { category: CATEGORY[m[1].toLowerCase()] || '优化', text: m[3].trim() }
}

/** 分组去重并输出 App 更新窗口用的 md；顺序固定：新增 → 优化 → 修复 */
const formatChangelog = (lines) =>
  ORDER.filter((c) => lines.some((l) => l.category === c))
    .map((c) => {
      const texts = [...new Set(lines.filter((l) => l.category === c).map((l) => l.text))]
      return `### ${c}\n${texts.map((t) => `- ${t}`).join('\n')}`
    })
    .join('\n')

/**
 * 取最近 count 条提交（不含 merge）生成 md。
 * 提交数不足会告警：CI 浅克隆（fetch-depth 默认 1）会导致只剩 1 条。
 */
const changelogFromGit = (count = 10, cwd = path.join(__dirname, '../..')) => {
  let out = ''
  try {
    out = execFileSync('git', ['log', `-${count}`, '--no-merges', '--pretty=format:%s'], { cwd, encoding: 'utf8' })
  } catch (e) {
    console.warn(`[changelog] 读取 git 提交失败：${e.message}`)
    return ''
  }
  const subjects = out.split('\n')
  if (subjects.length < count) console.warn(`[changelog] 仅取到 ${subjects.length}/${count} 次提交（CI 需 fetch-depth: 0）`)
  return formatChangelog(subjects.map(commitToLine).filter(Boolean))
}

const selfTest = () => {
  const assert = (cond, msg) => {
    if (!cond) throw new Error('changelog self-test failed: ' + msg)
  }
  assert(commitToLine('feat: 新增批量导入')?.category === '新增', 'feat -> 新增')
  assert(commitToLine('fix(ui): 修复换源失败')?.text === '修复换源失败', '去掉 scope')
  assert(commitToLine('perf: 优化歌词滚动')?.category === '优化', 'perf -> 优化')
  assert(commitToLine('直接手写的中文说明')?.category === '优化', '无前缀 -> 优化')
  assert(commitToLine('chore: bump version.json to 26.10.13.1') === null, 'chore 噪声')
  assert(commitToLine('ci: 修复 action 中 Gradle daemon 消失') === null, 'ci 噪声')
  assert(commitToLine('') === null, '空主题')
  const md = formatChangelog([
    { category: '优化', text: 'A' },
    { category: '新增', text: 'B' },
    { category: '新增', text: 'B' },
    { category: '修复', text: 'C' },
  ])
  assert(md === '### 新增\n- B\n### 优化\n- A\n### 修复\n- C', '分组顺序 + 去重: ' + JSON.stringify(md))
  assert(changelogFromGit(3).includes('### '), '真实仓库生成非空')
  console.log('changelog self-test OK')
}

module.exports = { commitToLine, formatChangelog, changelogFromGit }

if (require.main === module && process.argv.includes('--self-test')) selfTest()