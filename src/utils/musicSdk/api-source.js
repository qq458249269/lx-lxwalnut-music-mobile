import settingState from '../../store/setting/state'
import sources from './api-source-info'
import api_builtin_kw from './api-builtin-kw'
import api_builtin_kg from './api-builtin-kg'
import api_builtin_tx from './api-builtin-tx'
import api_builtin_mg from './api-builtin-mg'

/** 获取当前音源api源id */
const getSourceId = (sourceId) => {
  if (sourceId == null) sourceId = settingState.setting['common.apiSource']
  if (!sourceId) sourceId = 'builtin'
  return sourceId
}

// 内置 API 注册表，key: `${apiSourceId}_api_${musicSource}`
const apiList = {
  builtin_api_kw: api_builtin_kw,
  builtin_api_kg: api_builtin_kg,
  builtin_api_tx: api_builtin_tx,
  builtin_api_mg: api_builtin_mg,
}

/**
 * 获取api
 * @param {string} source 音源id
 * @returns {LX.MusicApi} api
 */
const getAPI = (source) => apiList[`${getSourceId()}_api_${source}`]

/**
 * 获取当前音源api
 * @param {string} source 音源id
 * @returns {LX.MusicApi} api
 */
export const apis = (source) => {
  if (/^user_api/.test(settingState.setting['common.apiSource'])) {
    return global.lx.apis[source]
  }

  const api = getAPI(source)
  if (api) return api

  throw new Error('Api is not found')
}

/**
 * 初始化设置
 */
export const init = () => {}

/**
 * 获取当前支持的api源信息列表
 * @returns {Array<LX.ApiSourceInfo>} api源信息列表
 */
export const getSourceList = () => {
  const list = sources.map((s) => ({
    id: s.id,
    name: s.name,
    disabled: s.disabled,
    supportQualitys: s.supportQualitys,
  }))

  return list
}

/**
 * 各api源对每个音源的支持音质
 */
export const supportQuality = Object.fromEntries(
  sources.map((s) => [s.id, s.supportQualitys])
)
