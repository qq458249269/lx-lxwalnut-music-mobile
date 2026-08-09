import { httpGet } from '@/utils/request'
import { name, repository } from '../../package.json'
import { downloadFile, stopDownload, temporaryDirectoryPath } from '@/utils/fs'
import { getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'

// 仓库地址唯一来源：package.json 的 repository.url（git+https://github.com/OWNER/REPO.git）
const [, , repo] = (repository.url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/) || []) || []

const abis = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86', 'universal']

// 优先用国内可达的 jsdelivr（raw.githubusercontent.com 在国内常被墙，放最后兜底）。
// jsdelivr 的 gh 路径无 @分支时默认解析 master，本项目默认分支是 main——
// 必须显式写 @main，否则 jsdelivr 三个源全 404（导致更新检查失败）。
// 最后兜底用 GitHub Releases API：直接读最新 release（tag_name→version，body→desc），
// 不依赖 CDN 分支/缓存。
const address = [
  [`https://cdn.jsdelivr.net/gh/${repo}/${name}@main/publish/version.json`, 'direct'],
  [`https://fastly.jsdelivr.net/gh/${repo}/${name}@main/publish/version.json`, 'direct'],
  [`https://gcore.jsdelivr.net/gh/${repo}/${name}@main/publish/version.json`, 'direct'],
  [`https://api.github.com/repos/${repo}/${name}/releases/latest`, 'release'],
  [`https://raw.githubusercontent.com/${repo}/${name}/main/publish/version.json`, 'direct'],
]

const request = async (url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(
      url,
      {
        timeout: 10000,
      },
      (err, resp, body) => {
        if (err || resp.statusCode != 200) {
          ++retryNum >= 3
            ? reject(err || new Error(resp.statusMessage || resp.statusCode))
            : request(url, retryNum).then(resolve).catch(reject)
        } else resolve(body)
      }
    )
  })
}

const getDirectInfo = async (url) => {
  return request(url).then((info) => {
    // fetchData 返回的 body 是字符串，需 JSON.parse 后访问字段
    const parsed = typeof info == 'string' ? JSON.parse(info) : info
    if (parsed.version == null) throw new Error('failed')
    return parsed
  })
}

const getNpmPkgInfo = async (url) => {
  return request(url).then((json) => {
    if (!json.versionInfo) throw new Error('failed')
    const info = JSON.parse(json.versionInfo)
    if (info.version == null) throw new Error('failed')
    return info
  })
}

// GitHub Releases API：直接读最新 release，tag_name→version，body→desc。
const getReleaseInfo = async (url) => {
  return request(url).then((json) => {
    const parsed = typeof json == 'string' ? JSON.parse(json) : json
    const tag = parsed.tag_name
    const body = parsed.body
    if (tag == null) throw new Error('failed')
    return {
      version: String(tag).replace(/^v/, ''),
      desc: body || '',
      history: [],
    }
  })
}

export const getVersionInfo = async (index = 0) => {
  const [url, source] = address[index]
  let promise
  switch (source) {
    case 'direct':
      promise = getDirectInfo(url)
      break
    case 'npm':
      promise = getNpmPkgInfo(url)
      break
    case 'release':
      promise = getReleaseInfo(url)
      break
  }

  return promise.catch(async (err) => {
    index++
    if (index >= address.length) throw err
    return getVersionInfo(index)
  })
}

const getTargetAbi = async () => {
  const supportedAbis = await getSupportedAbis()
  for (const abi of abis) {
    if (supportedAbis.includes(abi)) return abi
  }
  return abis[abis.length - 1]
}
let downloadJobId = null
const noop = (total, download) => {}
let apkSavePath

export const downloadNewVersion = async (version, onDownload = noop) => {
  const abi = await getTargetAbi()
  const url = `https://github.com/${repo}/${name}/releases/download/v${version}/${name}-v${version}-${abi}.apk`
  let savePath = temporaryDirectoryPath + '/lx-netease-music-mobile.apk'

  if (downloadJobId) stopDownload(downloadJobId)

  const { jobId, promise } = downloadFile(url, savePath, {
    progressInterval: 500,
    connectionTimeout: 20000,
    readTimeout: 30000,
    begin({ statusCode, contentLength }) {
      onDownload(contentLength, 0)
      // switch (statusCode) {
      //   case 200:
      //   case 206:
      //     break
      //   default:
      //     onDownload(null, contentLength, 0)
      //     break
      // }
    },
    progress({ contentLength, bytesWritten }) {
      onDownload(contentLength, bytesWritten)
    },
  })
  downloadJobId = jobId
  return promise.then(() => {
    apkSavePath = savePath
    return updateApp()
  })
}

export const updateApp = async () => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  await installApk(apkSavePath, APP_PROVIDER_NAME)
}
