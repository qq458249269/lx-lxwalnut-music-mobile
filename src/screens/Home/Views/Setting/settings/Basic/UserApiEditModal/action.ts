import { USER_API_MAX_COUNT, USER_API_SOURCE_FILE_EXT_RXP } from '@/config/constant'
import { importUserApi } from '@/core/userApi'
import { fetchUserApiScript } from '@/core/userApiUpdate'
import { state } from '@/store/userApi'
import { readFile, readDir } from '@/utils/fs'
import { log } from '@/utils/log'
import { toast } from '@/utils/tools'

export const handleImportScript = async (script: string, updateUrl?: string) => {
  await importUserApi(script, updateUrl)
    .then(() => {
      toast(global.i18n.t('user_api_import_success_tip'))
    })
    .catch((error: any) => {
      log.error(error.stack)
      toast(global.i18n.t('user_api_import_failed_tip', { message: error.message }), 'long')
    })
}

export const handleImportLocalFile = (path: string) => {
  // toast(global.i18n.t('setting_backup_part_import_list_tip_unzip'))
  void readFile(path)
    .then(async (script) => {
      if (script == null) throw new Error('Read file failed')
      void handleImportScript(script)
    })
    .catch((error: any) => {
      toast(global.i18n.t('user_api_import_failed_tip', { message: error.message }), 'long')
    })
}

/** 解析输入框内容，支持一次输入多个链接（回车、逗号、空格分隔），并自动去重、忽略无效行 */
export const parseImportUrls = (text: string) => {
  const urls: string[] = []
  for (const item of text.split(/[\s,，;；]+/)) {
    const url = item.trim()
    if (!url.length) continue
    if (!/^https?:\/\//i.test(url)) continue
    if (urls.includes(url)) continue
    urls.push(url)
  }
  return urls
}

const showImportResult = (success: number, failed: number) => {
  if (failed) {
    toast(global.i18n.t('user_api_import_batch_tip', { success, failed }), 'long')
  } else {
    toast(global.i18n.t('user_api_import_success_tip'))
  }
}

/** 批量导入在线音源（多个链接回车分隔），下载优先走国内镜像并逐级降级 */
export const handleImportOnlineScripts = async (
  urls: string[],
  handlers: {
    onUrlProgress?: (current: number, total: number) => void
    onMirrorProgress?: (current: number, total: number) => void
  } = {}
) => {
  const canImportCount = USER_API_MAX_COUNT - state.list.length
  if (canImportCount <= 0) {
    toast(global.i18n.t('user_api_max_tip'), 'long')
    return { success: 0, failed: 0 }
  }
  const targets = urls.slice(0, canImportCount)
  let success = 0
  let failed = 0
  for (const [index, url] of targets.entries()) {
    handlers.onUrlProgress?.(index + 1, targets.length)
    try {
      const script = await fetchUserApiScript(url, {
        onCandidate: ({ index: mirrorIndex, total, isMirror }) => {
          if (isMirror) handlers.onMirrorProgress?.(mirrorIndex, total)
        },
      })
      await importUserApi(script, url)
      success++
    } catch (error: any) {
      failed++
      log.error(`import user api from ${url} failed: ${error.message}`)
    }
  }
  if (targets.length < urls.length) toast(global.i18n.t('user_api_max_tip'), 'long')
  showImportResult(success, failed)
  return { success, failed }
}

/** 批量导入文件夹下所有音源 .js 文件 */
export const handleImportLocalDir = async (dirPath: string) => {
  let files
  try {
    files = await readDir(dirPath)
  } catch (error: any) {
    toast(global.i18n.t('user_api_import_failed_tip', { message: error.message }), 'long')
    return
  }
  const jsFiles = files.filter(
    (f: any) => !f.isDirectory && USER_API_SOURCE_FILE_EXT_RXP.some((ext) => f.name.endsWith(ext))
  )
  if (!jsFiles.length) {
    toast(global.i18n.t('user_api_import_no_file_tip'), 'long')
    return
  }
  const canImportCount = USER_API_MAX_COUNT - state.list.length
  if (canImportCount <= 0) {
    toast(global.i18n.t('user_api_max_tip'), 'long')
    return
  }
  const targets = jsFiles.slice(0, canImportCount)
  let success = 0
  let failed = 0
  for (const f of targets) {
    try {
      const script = await readFile(f.path)
      if (script == null) throw new Error('Read file failed')
      await importUserApi(script)
      success++
    } catch (error: any) {
      failed++
      log.error(error.stack ?? error.message)
    }
  }
  if (targets.length < jsFiles.length) toast(global.i18n.t('user_api_max_tip'), 'long')
  showImportResult(success, failed)
}