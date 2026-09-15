import { httpFetch } from '../request'

// ponytail: 酷狗播放URL，参考 lx-music-source
export default {
  getMusicUrl(songInfo, type) {
    const hash = songInfo._types?.[type]?.hash || songInfo.hash
    if (!hash) return { promise: Promise.reject(new Error('无该音质hash')), cancelHttp() {} }

    const albumId = songInfo.albumId || ''
    const url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&platid=4&album_id=${albumId}&mid=00000000000000000000000000000000`

    const requestObj = httpFetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
      },
    })

    requestObj.promise = requestObj.promise.then(({ body }) => {
      if (body.status !== 1) {
        throw new Error(body.err_code || '获取酷狗播放地址失败')
      }
      const playUrl = body.data?.play_backup_url || body.data?.play_url
      if (!playUrl) throw new Error('获取酷狗播放地址失败')
      return { url: playUrl, type }
    })

    return requestObj
  },
}
