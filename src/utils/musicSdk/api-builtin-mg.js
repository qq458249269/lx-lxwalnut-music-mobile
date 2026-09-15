import { httpFetch } from '../request'

// ponytail: 咪咕播放URL，参考 lx-music-source

const toneMap = {
  '128k': 'PQ',
  '320k': 'HQ',
  flac: 'SQ',
  hires: 'ZQ',
}

export default {
  getMusicUrl(songInfo, type) {
    const songId = songInfo.copyrightId || songInfo.songmid
    if (!songId) return { promise: Promise.reject(new Error('无copyrightId')), cancelHttp() {} }

    const tone = toneMap[type] || 'PQ'

    const requestObj = httpFetch(
      `https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.2?netType=01&resourceType=E&songId=${songId}&toneFlag=${tone}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
          channel: '0146951',
          uid: '0',
        },
      }
    )

    requestObj.promise = requestObj.promise.then(({ body }) => {
      let playUrl = body.data?.url
      if (!playUrl) throw new Error(body.msg || '获取咪咕播放地址失败')

      if (playUrl.startsWith('//')) playUrl = `https:${playUrl}`
      playUrl = playUrl.replace(/\+/g, '%2B').split('?')[0]
      return { url: playUrl, type }
    })

    return requestObj
  },
}