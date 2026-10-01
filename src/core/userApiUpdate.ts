import {
  USER_API_FETCH_TIMEOUT,
  USER_API_FETCH_VERIFY_TIMEOUT,
  USER_API_MAX_SCRIPT_SIZE,
  USER_API_SCRIPT_MIRRORS,
  USER_API_SCRIPT_PROXY_MIRRORS,
} from '@/config/constant'
import settingState from '@/store/setting/state'
import { action, state } from '@/store/userApi'
import { compareVer } from '@/utils'
import { parseUserApiScriptInfo, updateUserApiScript } from '@/utils/data'
import { log } from '@/utils/log'
import { httpFetch } from '@/utils/request'
import { confirmDialog, tipDialog, toast } from '@/utils/tools'
import { setUserApi } from './userApi'

const SCRIPT_URL_RXP = /^https?:\/\/\S+$/i
const isScriptUrl = (url: string) => {
  const path = url.split(/[?#]/)[0]
  return /\.js$/i.test(path)
}

/** 获取音源的更新地址：优先使用导入时记录的地址，其次尝试脚本头部的 homepage */
export const getUserApiUpdateUrl = (info: LX.UserApi.UserApiInfo) => {
  const updateUrl = info.updateUrl?.trim()
  if (updateUrl && SCRIPT_URL_RXP.test(updateUrl)) return updateUrl
  const homepage = info.homepage?.trim()
  if (homepage && SCRIPT_URL_RXP.test(homepage) && isScriptUrl(homepage)) return homepage
  return ''
}

/** github 仓库文件地址 → jsDelivr 路径：owner/repo@ref/dir/file.js */
const parseGithubScriptPath = (url: string) => {
  let result = /^https?:\/\/raw\.githubusercontent\.com\/([^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(.+)$/i.exec(
    url
  )
  if (result) {
    const [, owner, repo, ref, path] = result
    if (path) return `${owner}/${repo}@${ref}/${path}`
  }
  result = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)\/raw\/(.+)$/i.exec(url)
  if (!result) return ''
  const [, owner, repo, rest] = result
  const parts = rest.split('/')
  // 兼容 github.com/owner/repo/raw/refs/heads/branch/file.js 形式
  if (parts[0] == 'refs' && parts[1] == 'heads' && parts.length > 3) {
    return `${owner}/${repo}@${parts[2]}/${parts.slice(3).join('/')}`
  }
  if (parts.length < 2) return ''
  return `${owner}/${repo}@${parts[0]}/${parts.slice(1).join('/')}`
}

/** 已是 jsDelivr 地址时，提取 owner/repo@ref/path 以便切换其他节点 */
const JSDELIVR_RXP = /^https?:\/\/[a-z0-9.-]*jsdelivr\.net\/(?:gh|github)\/(.+)$/i
const parseJsdelivrPath = (url: string) => {
  const result = JSDELIVR_RXP.exec(url)
  return result ? result[1] : ''
}

/**
 * 构建音源脚本下载地址列表：国内镜像优先，按顺序逐级尝试，全部失败时降级到原地址
 */
export const buildUserApiScriptUrls = (url: string) => {
  const originUrl = url.trim()
  const urls: string[] = []
  const add = (u: string) => {
    if (!u.length || urls.includes(u)) return
    urls.push(u)
  }

  const githubPath = parseGithubScriptPath(originUrl)
  if (githubPath) {
    for (const mirror of USER_API_SCRIPT_MIRRORS) add(mirror.replace('{path}', githubPath))
  }
  const jsdelivrPath = parseJsdelivrPath(originUrl)
  if (jsdelivrPath) {
    for (const mirror of USER_API_SCRIPT_MIRRORS) add(mirror.replace('{path}', jsdelivrPath))
  }
  // 通用代理镜像，适用于任意地址（含 github release 下载地址）
  for (const mirror of USER_API_SCRIPT_PROXY_MIRRORS) add(mirror.replace('{url}', originUrl))
  add(originUrl)
  return urls
}

const fetchScriptFromUrl = async (url: string, timeout: number) => {
  const resp = (await httpFetch(url, {
    method: 'get',
    timeout,
    headers: { Accept: 'text/plain, */*' },
  }).promise) as { statusCode: number, body: any }
  if (resp.statusCode < 200 || resp.statusCode > 299) throw new Error(`HTTP ${resp.statusCode}`)
  const script = typeof resp.body == 'string' ? resp.body : JSON.stringify(resp.body ?? '')
  if (!script.trim().length) throw new Error(global.i18n.t('user_api_update_empty_script_tip'))
  if (script.length > USER_API_MAX_SCRIPT_SIZE) throw new Error('Too large script')
  return script
}

export interface FetchUserApiScriptOptions {
  /** 仅使用原地址，不走镜像 */
  originOnly?: boolean
  /** 每个候选地址尝试时回调（用于展示当前尝试的镜像） */
  onCandidate?: (info: { url: string, index: number, total: number, isMirror: boolean }) => void
}

/** 按候选列表逐级尝试，返回首个成功的脚本内容及其来源地址 */
export const fetchUserApiScriptByUrls = async (
  urls: string[],
  originUrl: string,
  options: FetchUserApiScriptOptions = {}
): Promise<{ script: string, url: string }> => {
  let lastError: Error | null = null
  for (const [index, url] of urls.entries()) {
    options.onCandidate?.({
      url,
      index: index + 1,
      total: urls.length,
      isMirror: url != originUrl,
    })
    try {
      return { script: await fetchScriptFromUrl(url, USER_API_FETCH_TIMEOUT), url }
    } catch (err: any) {
      lastError = err
      log.warn(`fetch user api script failed (${url}): ${err.message}`)
    }
  }
  throw lastError ?? new Error(global.i18n.t('user_api_update_fetch_failed_tip'))
}

/**
 * 下载音源脚本（检查更新与导入共用）
 * 国内镜像优先，逐级尝试，失败自动降级到下一个镜像，最后尝试原地址
 */
export const fetchUserApiScript = async (
  url: string,
  options: FetchUserApiScriptOptions = {}
) => {
  const urls = options.originOnly ? [url] : buildUserApiScriptUrls(url)
  return (await fetchUserApiScriptByUrls(urls, url, options)).script
}

export interface UserApiUpdateInfo {
  /** 更新后的源信息 */
  info: LX.UserApi.UserApiInfo
  /** 新版脚本内容 */
  script: string
  /** 新版本号 */
  version: string
  /** 更新日志（取自脚本头部描述） */
  log: string
}

/** 根据脚本内容生成更新信息，无新版本时返回 null */
const createUpdateInfo = (
  info: LX.UserApi.UserApiInfo,
  script: string,
  updateUrl: string
): UserApiUpdateInfo | null => {
  const scriptInfo = parseUserApiScriptInfo(script)
  const version = scriptInfo.version || ''
  // 无版本号无法比较版本，视为无可用更新
  if (!version) return null
  if (compareVer(info.version || '0.0.0', version) !== -1) return null
  return {
    info: {
      ...info,
      ...scriptInfo,
      id: info.id,
      allowShowUpdateAlert: info.allowShowUpdateAlert,
      updateUrl,
    },
    script,
    version,
    log: scriptInfo.description || '',
  }
}

/**
 * 检查单个音源是否存在新版本，无新版本时返回 null
 * 下载优先走国内镜像；若镜像返回的版本无更新，则用原地址复核一次，避免 CDN 缓存导致的漏更新
 */
export const checkUserApiUpdate = async (
  info: LX.UserApi.UserApiInfo,
  options: FetchUserApiScriptOptions = {}
): Promise<UserApiUpdateInfo | null> => {
  const url = getUserApiUpdateUrl(info)
  if (!url) throw new Error(global.i18n.t('user_api_update_no_url_tip'))
  const urls = options.originOnly ? [url] : buildUserApiScriptUrls(url)
  const result = await fetchUserApiScriptByUrls(urls, url, options)
  let update = createUpdateInfo(info, result.script, result.url)
  // 镜像命中但无更新时，用原地址复核一次（CDN 可能存在缓存）
  if (!update && result.url != url) {
    try {
      const script = await fetchScriptFromUrl(url, USER_API_FETCH_VERIFY_TIMEOUT)
      update = createUpdateInfo(info, script, url)
    } catch (err: any) {
      log.warn(`verify user api ${info.name} update from origin failed: ${err.message}`)
    }
  }
  return update
}

export interface UserApiUpdateCheckResult {
  info: LX.UserApi.UserApiInfo
  update: UserApiUpdateInfo | null
  error: string | null
}

/** 批量检查音源更新 */
export const checkUserApiUpdates = async (
  targets: LX.UserApi.UserApiInfo[]
): Promise<UserApiUpdateCheckResult[]> => {
  return await Promise.all(
    targets.map(async (info): Promise<UserApiUpdateCheckResult> => {
      try {
        return { info, update: await checkUserApiUpdate(info), error: null }
      } catch (err: any) {
        log.warn(`check user api ${info.name} update failed: ${err.message}`)
        return { info, update: null, error: err.message }
      }
    })
  )
}

/** 应用更新，保留源 id，若正在使用该源则重新加载脚本 */
export const applyUserApiUpdate = async (update: UserApiUpdateInfo) => {
  const newInfo = await updateUserApiScript(update.info.id, update.script, update.info.updateUrl)
  action.setUserApiList(state.list.map((info) => (info.id == newInfo.id ? newInfo : info)))
  if (settingState.setting['common.apiSource'] == newInfo.id) {
    try {
      await setUserApi(newInfo.id)
    } catch (err: any) {
      log.error(`reload user api ${newInfo.name} failed: ${err.message}`)
    }
  }
  return newInfo
}

const applyUserApiUpdates = async (updates: UserApiUpdateInfo[]) => {
  let success = 0
  const failed: string[] = []
  for (const update of updates) {
    try {
      await applyUserApiUpdate(update)
      success++
    } catch (err: any) {
      failed.push(update.info.name)
      log.error(`update user api ${update.info.name} failed: ${err.message}`)
    }
  }
  if (failed.length) {
    toast(
      global.i18n.t('user_api_update_batch_result_tip', {
        success,
        failed: failed.length,
        names: failed.join('、'),
      }),
      'long'
    )
  } else {
    toast(global.i18n.t('user_api_update_success_tip'))
  }
  return success
}

const formatUpdateNames = (results: UserApiUpdateCheckResult[]) => {
  return results
    .map(({ info, update }) => `· ${info.name}  ${info.version || '-'} → ${update!.version}`)
    .join('\n')
}

let isChecking = false
let lastCheckTime = 0
/** 检查间隔：1 小时 */
const CHECK_INTERVAL = 3600_000

/** 检查并更新单个音源 */
export const checkAndUpdateUserApi = async (info: LX.UserApi.UserApiInfo) => {
  if (isChecking) return false
  isChecking = true
  try {
    const result = await checkUserApiUpdates([info]).then((results) => results[0])
    if (result.error) {
      void tipDialog({
        message: global.i18n.t('user_api_update_failed_tip', { message: result.error }),
        btnText: global.i18n.t('ok'),
      })
      return false
    }
    if (!result.update) {
      void tipDialog({
        message: global.i18n.t('user_api_check_update_no_update_tip'),
        btnText: global.i18n.t('ok'),
      })
      return false
    }
    const confirm = await confirmDialog({
      message:
        `${global.i18n.t('user_api_update_confirm_tip', {
          name: info.name,
          version: result.update.version,
        })}\n${result.update.log}`,
      cancelButtonText: global.i18n.t('cancel_button_text_2'),
      confirmButtonText: global.i18n.t('user_api_update_btn'),
    })
    if (!confirm) return false
    await applyUserApiUpdates([result.update])
    return true
  } finally {
    isChecking = false
    lastCheckTime = Date.now()
  }
}

const checkAndUpdateAllUserApis = async (manual: boolean) => {
  const targets = state.list.filter(
    (info) => getUserApiUpdateUrl(info) && (manual || info.allowShowUpdateAlert)
  )
  if (!targets.length) {
    if (manual) {
      void tipDialog({
        message: global.i18n.t('user_api_check_update_no_source_tip'),
        btnText: global.i18n.t('ok'),
      })
    }
    return
  }
  const results = await checkUserApiUpdates(targets)
  const updates = results.map((r) => r.update).filter((u): u is UserApiUpdateInfo => u != null)
  if (!updates.length) {
    if (manual) {
      const failedCount = results.filter((r) => r.error).length
      void tipDialog({
        message: failedCount
          ? global.i18n.t('user_api_check_update_failed_tip', { count: failedCount })
          : global.i18n.t('user_api_check_update_no_update_tip'),
        btnText: global.i18n.t('ok'),
      })
    }
    return
  }
  const confirm = await confirmDialog({
    message: `${global.i18n.t('user_api_update_confirm_all_tip', {
      count: updates.length,
    })}\n${formatUpdateNames(results.filter((r) => r.update))}`,
    cancelButtonText: global.i18n.t('cancel_button_text_2'),
    confirmButtonText: global.i18n.t('user_api_update_all_btn'),
  })
  if (!confirm) return
  await applyUserApiUpdates(updates)
}

/** 手动检查所有音源更新 */
export const checkAndUpdateUserApis = async () => {
  if (isChecking) return
  isChecking = true
  try {
await checkAndUpdateAllUserApis(true)
  } finally {
    isChecking = false
    lastCheckTime = Date.now()
  }
}

/** 自动检查音源更新（应用启动时调用，静默失败） */
export const autoCheckAndUpdateUserApis = async () => {
  if (isChecking) return
  if (Date.now() - lastCheckTime < CHECK_INTERVAL) return
  isChecking = true
  try {
await checkAndUpdateAllUserApis(false)
  } catch (err: any) {
    log.warn(`auto check user api update failed: ${err.message}`)
  } finally {
    isChecking = false
    lastCheckTime = Date.now()
  }
}