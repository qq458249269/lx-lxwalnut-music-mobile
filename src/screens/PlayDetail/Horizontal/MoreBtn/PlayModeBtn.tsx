import { memo, useMemo } from 'react'
import { toast } from '@/utils/tools'
import { MUSIC_TOGGLE_MODE_LIST, MUSIC_TOGGLE_MODE } from '@/config/constant'
import { useSettingValue } from '@/store/setting/hook'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import Btn from './Btn'
import userState from '@/store/user/state'
import playerState from '@/store/player/state'
import wyApi from '@/utils/musicSdk/wy'
import { playOnlineList } from '@/core/list'
import { getList } from '@/core/player/playInfo'
import settingState from '@/store/setting/state'

export default memo(() => {
  const togglePlayMethod = useSettingValue('player.togglePlayMethod')
  const t = useI18n()

  const toggleNextPlayMode = async () => {
    let list = [...MUSIC_TOGGLE_MODE_LIST] as any[]

    const playMusicInfo = playerState.playMusicInfo.musicInfo
    const musicInfo = playMusicInfo 
      ? ('progress' in playMusicInfo ? playMusicInfo.metadata.musicInfo : playMusicInfo) 
      : null
    const isWy = musicInfo?.source === 'wy'
    const songId = (musicInfo as any)?.meta?.songId || (musicInfo as any)?.songmid || musicInfo?.id
    const playlistId = userState.wy_subscribed_playlists[0]?.id

    if (musicInfo) {
      // 全平台可开启：cookie 失效也可强制（wy 用推荐接口，其余以当前列表环序续播）
      list.splice(list.length - 1, 0, MUSIC_TOGGLE_MODE.heartbeat)
    }

    let index = list.indexOf(togglePlayMethod)
    if (++index >= list.length) index = 0
    const mode = list[index]
    updateSetting({ 'player.togglePlayMethod': mode })

    if (mode === MUSIC_TOGGLE_MODE.heartbeat) {
      toast(t('play_heartbeat') || '心动模式已开启')
      try {
        const cookie = settingState.setting['common.wy_cookie']
        let res: { list: any[]; degraded?: boolean }
        if (musicInfo?.source === 'wy') {
          res = await wyApi.dailyRec.getHeartbeatModeList(cookie, playlistId, songId)
        } else {
          // 非网易平台：以当前播放列表环序续播，强制开启心跳序列
          const curListId = playerState.playMusicInfo.listId
          const curIdx = playerState.playInfo.playIndex
          let curList: any[] = []
          try {
            curList = (await getList(curListId)) as any[]
          } catch { /* 列表获取失败则跳过 */ }
          const fallback: any[] = []
          if (curIdx >= 0 && curList.length) {
            for (let i = 1; i < curList.length && fallback.length < 80; i++) {
              const m = curList[(curIdx + i) % curList.length]
              if (m && !fallback.some(x => x.id === m.id)) fallback.push(m)
            }
            res = { list: fallback, degraded: true }
          } else {
            res = { list: [] }
          }
        }
        if (res?.list?.length) {
          if (res.degraded && musicInfo?.source !== 'wy') toast('非网易平台，已用当前列表续播模式')
          else if (res.degraded) toast('Cookie 失效，已降级为相似歌曲模式')
          const mInfo = playMusicInfo 
            ? ('progress' in playMusicInfo ? playMusicInfo.metadata.musicInfo : playMusicInfo) 
            : musicInfo
          const heartbeatList = [mInfo, ...res.list].filter(Boolean) as any[]
          const isCurrent = mInfo?.id === musicInfo?.id
          playOnlineList('heartbeat', heartbeatList, 0, isCurrent)
        } else {
          toast('心动模式获取歌曲为空')
        }
      } catch (err: any) {
        toast('心动模式加载失败')
      }
      return
    }

    let modeName:
      | 'play_list_loop'
      | 'play_list_random'
      | 'play_list_order'
      | 'play_single_loop'
      | 'play_single'
      | 'play_heartbeat'
    switch (mode) {
      case MUSIC_TOGGLE_MODE.listLoop:
        modeName = 'play_list_loop'
        break
      case MUSIC_TOGGLE_MODE.random:
        modeName = 'play_list_random'
        break
      case MUSIC_TOGGLE_MODE.list:
        modeName = 'play_list_order'
        break
      case MUSIC_TOGGLE_MODE.singleLoop:
        modeName = 'play_single_loop'
        break
      case MUSIC_TOGGLE_MODE.heartbeat:
        modeName = 'play_heartbeat'
        break
      default:
        modeName = 'play_single'
        break
    }
    toast(t(modeName))
  }

  const playModeIcon = useMemo(() => {
    let playModeIcon = null
    switch (togglePlayMethod) {
      case MUSIC_TOGGLE_MODE.listLoop:
        playModeIcon = 'list-loop'
        break
      case MUSIC_TOGGLE_MODE.random:
        playModeIcon = 'list-random'
        break
      case MUSIC_TOGGLE_MODE.list:
        playModeIcon = 'list-order'
        break
      case MUSIC_TOGGLE_MODE.singleLoop:
        playModeIcon = 'single-loop'
        break
      case MUSIC_TOGGLE_MODE.heartbeat:
        playModeIcon = 'svg:heartbeat'
        break
      default:
        playModeIcon = 'single'
        break
    }
    return playModeIcon
  }, [togglePlayMethod])

  return <Btn icon={playModeIcon} onPress={toggleNextPlayMode} />
})
