import { httpFetch } from '../request'

// ponytail: QQ音乐播放URL，参考 lx-music-source

const fileConfig = {
  '128k': { s: 'M500', e: '.mp3' },
  '320k': { s: 'M800', e: '.mp3' },
  flac: { s: 'F000', e: '.flac' },
  hires: { s: 'RS02', e: '.flac' },
}

export default {
  getMusicUrl(songInfo, type) {
    const mediaMid = songInfo.strMediaMid || songInfo.songmid
    const fileInfo = fileConfig[type] || fileConfig['128k']
    const file = `${fileInfo.s}${mediaMid}${fileInfo.e}`

    const reqData = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          filename: [file],
          guid: '10000',
          songmid: [mediaMid],
          songtype: [0],
          uin: '0',
          loginflag: 1,
          platform: '20',
        },
      },
      loginUin: '0',
      comm: {
        uin: '0',
        format: 'json',
        ct: 24,
        cv: 0,
      },
    }

    const requestObj = httpFetch(
      `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(reqData))}`,
      {
        method: 'get',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
          channel: '0146951',
          uid: '1234',
        },
      }
    )

    requestObj.promise = requestObj.promise.then(({ body }) => {
      const purl = body.req_0?.data?.midurlinfo?.[0]?.purl
      if (!purl) throw new Error('获取QQ播放地址失败')
      const sip = body.req_0?.data?.sip?.[0] || ''
      const url = sip + purl
      if (!url) throw new Error('获取QQ播放地址失败')
      return { url, type }
    })

    return requestObj
  },
}
