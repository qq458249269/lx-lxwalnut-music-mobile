import { importUserApi } from '@/core/userApi'
import { readFile, readDir } from '@/utils/fs'
import { USER_API_SOURCE_FILE_EXT_RXP } from '@/config/constant'
import { log } from '@/utils/log'
import { toast } from '@/utils/tools'

export const handleImportScript = async (script: string) => {
  await importUserApi(script)
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
  let success = 0
  let failed = 0
  for (const f of jsFiles) {
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
  if (failed) {
    toast(global.i18n.t('user_api_import_batch_tip', { success, failed }), 'long')
  } else {
    toast(global.i18n.t('user_api_import_success_tip'))
  }
}
