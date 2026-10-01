import { USER_API_MAX_SCRIPT_SIZE } from '@/config/constant'
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

/** 下载脚本内容 */
export const fetchUserApiScript = async (url: string) => {
  const resp = (await httpFetch(url, {
    method: 'get',
    timeout: 15_000,
    headers: { Accept: 'text/plain, */*' },
  }).promise) as { statusCode: number, body: any }
  if (resp.statusCode < 200 || resp.statusCode > 299) throw new Error(`HTTP ${resp.statusCode}`)
  const script = typeof resp.body == 'string' ? resp.body : JSON.stringify(resp.body ?? '')
  if (!script.length) throw new Error(global.i18n.t('user_api_update_empty_script_tip'))
  if (script.length > USER_API_MAX_SCRIPT_SIZE) throw new Error('Too large script')
  return script
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

/** 检查单个音源是否存在新版本，无新版本时返回 null */
export const checkUserApiUpdate = async (
  info: LX.UserApi.UserApiInfo
): Promise<UserApiUpdateInfo | null> => {
  const url = getUserApiUpdateUrl(info)
  if (!url) throw new Error(global.i18n.t('user_api_update_no_url_tip'))
  const script = await fetchUserApiScript(url)
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
      updateUrl: url,
    },
    script,
    version,
    log: scriptInfo.description || '',
  }
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