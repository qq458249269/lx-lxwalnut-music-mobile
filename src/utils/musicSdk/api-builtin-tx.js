import { httpFetch } from '../request'
import settingState from '../../store/setting/state'
import { buildQualityChain, parseUin, parsePurls } from './tx/utils/vkey-url'

// ponytail: QQ音乐播放URL，参考 lx-music-source
// cookie(common.tx_cookie) 为 y.qq.com 网页登录态：uin + qqmusic_key；无则匿名(已封，多半空 purl)

const fileConfig = {
  '128k': { s: 'M500', e: '.mp3' },
  '320k': { s: 'M800', e: '.mp3' },
  flac: { s: 'F000', e: '.flac' },
  hires: { s: 'RS02', e: '.flac' },
}

const getCookie = () => settingState.setting['common.tx_cookie'] || ''

export default {
  getMusicUrl(songInfo, type) {
    const mediaMid = songInfo.strMediaMid || songInfo.songmid
    // 一次请求携带全部音质文件，取第一个可用的 purl（如 VIP 歌无 cookie 时自动落到 128k）
    const chain = buildQualityChain(type)
    const files = chain.map((q) => `${fileConfig[q].s}${mediaMid}${fileConfig[q].e}`)

    const cookie = getCookie()
    const uin = parseUin(cookie)

    const reqData = {
      req_0: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          filename: files,
          guid: '10000',
          songmid: [mediaMid],
          songtype: [0],
          uin,
          loginflag: 1,
          platform: '20',
        },
      },
      loginUin: uin,
      comm: {
        uin,
        format: 'json',
        ct: 24,
        cv: 0,
      },
    }

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
      channel: '0146951',
      uid: '1234',
    }
    if (cookie) headers.Cookie = cookie

    const requestObj = httpFetch(
      `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=${encodeURIComponent(JSON.stringify(reqData))}`,
      {
        method: 'get',
        headers,
      }
    )

    requestObj.promise = requestObj.promise.then(({ body }) => {
      const urls = parsePurls(body)
      const hit = urls.find((u) => chain.includes(u.type))
      if (!hit) throw new Error('获取QQ播放地址失败')
      return { url: hit.url, type: hit.type }
    })

    return requestObj
  },
}