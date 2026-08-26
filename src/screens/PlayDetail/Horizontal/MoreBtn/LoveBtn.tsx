import { memo, useCallback, useMemo } from 'react'
import { toast } from '@/utils/tools'
import Btn from './Btn'
import playerState from '@/store/player/state'
import { useIsWyLiked } from '@/store/user/hook'
import { handleLikeMusic } from '@/components/OnlineList/listAction'
import { useTheme } from '@/store/theme/hook'

export default memo(() => {
  const theme = useTheme()
  const playMusicInfo = playerState.playMusicInfo.musicInfo
  const musicInfo = playMusicInfo
    ? ('progress' in playMusicInfo ? playMusicInfo.metadata.musicInfo : playMusicInfo)
    : null
  const songId = (musicInfo as any)?.meta?.songId ?? ''
  const isWy = musicInfo?.source === 'wy'
  const isLiked = useIsWyLiked(songId)

  const handlePress = useCallback(() => {
    if (!musicInfo) return
    if (!isWy) {
      toast('非网易云音源暂不支持收藏')
      return
    }
    handleLikeMusic(musicInfo as LX.Music.MusicInfoOnline)
  }, [musicInfo, isWy])

  const icon = useMemo(() => isLiked ? 'love-filled' : 'love', [isLiked])
  const color = isLiked ? theme['c-primary'] : undefined

  return <Btn icon={icon} color={color} onPress={handlePress} />
})
