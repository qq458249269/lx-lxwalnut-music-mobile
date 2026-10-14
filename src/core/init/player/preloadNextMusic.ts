import { getMusicUrl } from '@/core/music'
import { LOWEST_QUALITY, getNextPlayMusicInfo, resetRandomNextMusicInfo } from '@/core/player/player'
import { checkUrl } from '@/utils/request'
import playerState from '@/store/player/state'
import { isCached } from '@/plugins/player/utils'

const preloadMusicInfo = {
  isLoading: false,
  preProgress: 0,
  info: null as LX.Player.PlayMusicInfo | null,
}
const resetPreloadInfo = () => {
  preloadMusicInfo.preProgress = 0
  preloadMusicInfo.info = null
  preloadMusicInfo.isLoading = false
}
const preloadNextMusicUrl = async (curTime: number, force = false) => {
  if (preloadMusicInfo.isLoading || (!force && curTime - preloadMusicInfo.preProgress < 3)) return
  preloadMusicInfo.isLoading = true
  console.log('preload next music url')
  const info = await getNextPlayMusicInfo()
  if (info) {
    preloadMusicInfo.info = info
    // 与播放侧同一策略：首选音质失败就降 128k 预热，让下一首开唱时直接命中缓存
    const url =
      (await getMusicUrl({ musicInfo: info.musicInfo }).catch(() => '')) ||
      (await getMusicUrl({ musicInfo: info.musicInfo, quality: LOWEST_QUALITY }).catch(() => ''))
    if (url) {
      console.log('preload url', url)
      const [cached, available] = await Promise.all([
        isCached(url),
        checkUrl(url)
          .then(() => true)
          .catch(() => false),
      ])
      if (!cached && !available) {
        const url = await getMusicUrl({ musicInfo: info.musicInfo, isRefresh: true }).catch(
          () => ''
        )
        console.log('preload url refresh', url)
      }
    }
  }
  preloadMusicInfo.isLoading = false
}

export default () => {
  const setProgress = (time: number) => {
    if (!playerState.musicInfo.id) return
    preloadMusicInfo.preProgress = time
  }

  const handleSetPlayInfo = () => {
    resetPreloadInfo()
  }

  const handleConfigUpdated: typeof global.state_event.configUpdated = (keys, settings) => {
    if (!keys.includes('player.togglePlayMethod')) return
    if (!preloadMusicInfo.info || preloadMusicInfo.info.isTempPlay) return
    resetRandomNextMusicInfo()
    preloadMusicInfo.info = null
    preloadMusicInfo.preProgress = playerState.progress.nowPlayTime
  }

  const handlePlaying = () => {
    // 当前歌曲开始播放即预加载下一首，不必等最后 10 秒
    if (!playerState.musicInfo.id || preloadMusicInfo.info) return
    void preloadNextMusicUrl(playerState.progress.nowPlayTime, true)
  }

  const handlePlayProgressChanged: typeof global.state_event.playProgressChanged = (progress) => {
    const duration = progress.maxPlayTime
    if (duration > 10 && duration - progress.nowPlayTime < 10 && !preloadMusicInfo.info) {
      void preloadNextMusicUrl(progress.nowPlayTime)
    }
  }

  global.app_event.on('setProgress', setProgress)
  global.app_event.on('musicToggled', handleSetPlayInfo)
  global.app_event.on('playerPlaying', handlePlaying)
  global.state_event.on('configUpdated', handleConfigUpdated)
  global.state_event.on('playProgressChanged', handlePlayProgressChanged)
}
