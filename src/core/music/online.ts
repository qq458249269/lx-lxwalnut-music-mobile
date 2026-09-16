import { saveLyric, saveMusicUrl, getMusicUrl as getStoreMusicUrl } from '@/utils/data'
import { updateListMusics } from '@/core/list'
import settingState from '@/store/setting/state'

import {
  buildLyricInfo,
  getPlayQuality,
  handleGetOnlineLyricInfo,
  handleGetOnlineMusicUrl,
  handleGetOnlinePicUrl,
  getCachedLyricInfo, QUALITY_RANK,
} from './utils'
import {fetchAndApplyDetailedQuality} from "@/utils/musicSdk/wy/musicDetail.js"

/* export const setMusicUrl = ({ musicInfo, type, url }: {
  musicInfo: LX.Music.MusicInfo
  type: LX.Quality
  url: string
}) => {
  saveMusicUrl(musicInfo, type, url)
}

export const setPic = (datas: {
  listId: string
  musicInfo: LX.Music.MusicInfo
  url: string
}) => {
  datas.musicInfo.img = datas.url
  updateMusicInfo({
    listId: datas.listId,
    id: datas.musicInfo.songmid,
    data: { img: datas.url },
    musicInfo: datas.musicInfo,
  })
}
 */

export const getMusicUrl = async ({
  musicInfo,
  quality,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  // if (!musicInfo._types[type]) {
  //   // 兼容旧版酷我源搜索列表过滤128k音质的bug
  //   if (!(musicInfo.source == 'kw' && type == '128k')) throw new Error('该歌曲没有可播放的音频')

  //   // return Promise.reject(new Error('该歌曲没有可播放的音频'))
  // }

  let currentMusicInfo = musicInfo;
  const preferredQuality = settingState.setting['player.playQuality'] as LX.Quality;

  // 检查是否需要获取详细音质
  const isWySource = currentMusicInfo.source === 'wy';
  const hasFullDetails = currentMusicInfo.meta._full;
  console.log("播放：currentMusicInfo:", currentMusicInfo);

  if (isWySource && !hasFullDetails) {
    const availableQualities = Object.keys(currentMusicInfo.meta._qualitys);
    const preferredQualityIndex = QUALITY_RANK.indexOf(preferredQuality);
    const qualityIndexes = (availableQualities as LX.Quality[])
      .map(q => QUALITY_RANK.indexOf(q))
      .filter(i => i > -1);

    // 用户想要的音质比当前已知的最好音质还高时，阻塞获取详情；否则后台异步
    if (preferredQualityIndex !== -1 && qualityIndexes.length && preferredQualityIndex < Math.min(...qualityIndexes)) {
      console.log('用户想要的音质比当前已知的最好音质还要高，获取音质详情');
      // 阻塞式获取
      currentMusicInfo = await fetchAndApplyDetailedQuality(currentMusicInfo);
    } else {
      console.log('用户想要的音质比当前已知的最好音质还要低，无需获取音质详情');
      // 默认情况：不阻塞播放，在后台异步获取
      void fetchAndApplyDetailedQuality(currentMusicInfo);
    }
  }

  const targetQuality = quality ?? getPlayQuality(preferredQuality, currentMusicInfo);
  const cachedUrl = await getStoreMusicUrl(currentMusicInfo, targetQuality)
  if (cachedUrl && !isRefresh) return cachedUrl

  return handleGetOnlineMusicUrl({
    musicInfo: currentMusicInfo,
    quality: targetQuality,
    onToggleSource,
    isRefresh,
    allowToggleSource,
  }).then(({ url, quality: resultQuality, musicInfo: targetMusicInfo, isFromCache }) => {
    if (targetMusicInfo.id != currentMusicInfo.id && !isFromCache)
      void saveMusicUrl(targetMusicInfo, resultQuality, url)
    void saveMusicUrl(currentMusicInfo, resultQuality, url)
    if (currentMusicInfo.id !== musicInfo.id) void saveMusicUrl(musicInfo, resultQuality, url)
    return url
  })
}

export const getPicUrl = async ({
  musicInfo,
  listId,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoOnline
  listId?: string | null
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (musicInfo.meta.picUrl && !isRefresh) return musicInfo.meta.picUrl
  return handleGetOnlinePicUrl({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(
    ({ url, musicInfo: targetMusicInfo, isFromCache }) => {
      // picRequest = null
      if (listId) {
        musicInfo.meta.picUrl = url
        void updateListMusics([{ id: listId, musicInfo }])
      }
      // savePic({ musicInfo, url, listId })
      return url
    }
  )
}
export const getLyricInfo = async ({
  musicInfo,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoOnline
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  // lrcRequest = music[musicInfo.source].getLyric(musicInfo)
  return handleGetOnlineLyricInfo({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(
    async ({ lyricInfo, musicInfo: targetMusicInfo, isFromCache }) => {
      // lrcRequest = null
      if (isFromCache) return buildLyricInfo(lyricInfo)
      if (targetMusicInfo.id == musicInfo.id) void saveLyric(musicInfo, lyricInfo)
      else void saveLyric(targetMusicInfo, lyricInfo)

      return buildLyricInfo(lyricInfo)
    }
  )
}
