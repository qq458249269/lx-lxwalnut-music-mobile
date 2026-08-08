const fs = require('fs')
const { jp, formatTime } = require('./index')
const pkgDir = '../../package.json'
const pkg = require(pkgDir)
const version = require('../version.json')
const chalk = require('chalk')
const { computeNextVersionLocal, todayVersion } = require('./bump-version.cjs')
const pkg_bak = JSON.stringify(pkg, null, 2)
const version_bak = JSON.stringify(version, null, 2)
const parseChangelog = require('changelog-parser')
const changelogPath = jp('../../CHANGELOG.md')

const getPrevVer = () =>
  parseChangelog(changelogPath).then((res) => {
    if (!res.versions.length) throw new Error('CHANGELOG 无法解析到版本号')
    return res.versions[0].version
  })

const updateChangeLog = async (newVerNum, newChangeLog) => {
  let changeLog = fs.readFileSync(changelogPath, 'utf-8')
  const prevVer = await getPrevVer()
  const log = `## [${newVerNum}](${pkg.repository.url.replace(/^git\+(http.+)\.git$/, '$1')}/compare/v${prevVer}...v${newVerNum}) - ${formatTime()}\n\n${newChangeLog}`
  fs.writeFileSync(changelogPath, changeLog.replace(/(## [?0.1.1]?)/, log + '\n$1'), 'utf-8')
}

module.exports = async (newVerNum) => {
  if (!newVerNum) {
    let { pkgVersion, version } = require('../version.json')
    newVerNum = computeNextVersionLocal(pkg?.version || pkgVersion, todayVersion())
  }
  const newMDChangeLog = fs.readFileSync(jp('../changeLog.md'), 'utf-8')
  version.history.unshift({
    version: version.version,
    desc: version.desc,
  })
  version.version = newVerNum
  version.desc = newMDChangeLog.replace(/(?:^|(\n))#{1,6} (.+)\n/g, '$1$2').trim()
  pkg.version = newVerNum
  // versionCode 由 version（YY.MM.DD[.N]）推导，单一来源；带 .N 时 code 也递增，同日多包互不覆盖
  pkg.versionCode = parseInt(newVerNum.replace(/\./g, ''))

  console.log(chalk.blue('new version: ') + chalk.green(newVerNum))

  fs.writeFileSync(jp('../version.json'), JSON.stringify(version) + '\n', 'utf-8')

  fs.writeFileSync(jp(pkgDir), JSON.stringify(pkg, null, 2) + '\n', 'utf-8')

  await updateChangeLog(newVerNum, newMDChangeLog)

  return {
    pkg_bak,
    version_bak,
  }
}
