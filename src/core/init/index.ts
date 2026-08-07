import { initSetting, showPactModal } from '@/core/common'
import registerPlaybackService from '@/plugins/player/service'
import initTheme from './theme'
import initI18n from './i18n'
import initUserApi from './userApi'
import initPlayer from './player'
import dataInit from './dataInit'
import initSync from './sync'
import initCommonState from './common'
import initUiMode from './uiMode'
import { initDeeplink } from './deeplink'
import { setApiSource } from '@/core/apiSource'
import commonActions from '@/store/common/action'
import settingState from '@/store/setting/state'
import { checkUpdate } from '@/core/version'
import { bootLog } from '@/utils/bootLog'
import { cheatTip } from '@/utils/tools'
import { getAppVersionName } from '@/utils/nativeModules/utils'
import * as networkLyric from '@/core/networkLyric'

let isFirstPush = true
const handlePushedHomeScreen = async () => {
  await cheatTip()
  // 用 APK 真实 versionName（含 -N 后缀）覆盖 package.json 版本，
  // 让设置页版本显示、更新比较与下载 URL 与实际安装版本一致
  try {
    const appVersionName = await getAppVersionName()
    if (appVersionName) process.versions.app = appVersionName
  } catch {}
  if (settingState.setting['common.isAgreePact']) {
    if (isFirstPush) {
      isFirstPush = false
      // void checkUpdate()
      void initDeeplink()
    }
  } else {
    if (isFirstPush) isFirstPush = false
    showPactModal()
  }

  setTimeout(() => {
    void initSync(settingState.setting);
    bootLog('Sync service started with a delay.');
  }, 3000)
  if (settingState.setting['version.autoCheckUpdate']) {
    void checkUpdate(false)
  } else {
    void checkUpdate(true)
  }
  networkLyric.init()
}

let isInited = false
export default async () => {
  if (isInited) return handlePushedHomeScreen
  bootLog('Initing...')
  commonActions.setFontSize(global.lx.fontSize)
  bootLog('Font size changed.')
  const setting = await initSetting()
  bootLog('Setting inited.')
  // console.log(setting)

  // 将没有相互依赖的初始化任务并行化
  await Promise.all([
    initTheme(setting),
    initI18n(setting),
    initUserApi(setting),
    initUiMode(),
  ])
  bootLog('Theme, I18n, UserApi inited.')

  setApiSource(setting['common.apiSource'])
  bootLog('Api inited.')

  registerPlaybackService()
  bootLog('Playback Service Registered.')
  await initPlayer(setting)
  bootLog('Player inited.')
  await dataInit(setting)
  bootLog('Data inited.')
  await initCommonState(setting)
  bootLog('Common State inited.')

  isInited ||= true

  return handlePushedHomeScreen
}
