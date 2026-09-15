import { httpFetch } from '../../request'

// ponytail: 酷我播放URL，参考 lx-music-source。token 机制复杂度较高，升级建议对接 lx-music-source
let kwToken = ''
let kwCookie = ''

const encrypt = (str, pwd) => {
  if (!pwd || !pwd.length) return null
  let prand = ''
  for (let i = 0; i < pwd.length; i++) prand += pwd.charCodeAt(i).toString()
  const sPos = Math.floor(prand.length / 5)
  const mult = parseInt(prand.charAt(sPos) + prand.charAt(sPos * 2) + prand.charAt(sPos * 3) + prand.charAt(sPos * 4) + prand.charAt(sPos * 5))
  const incr = Math.ceil(pwd.length / 2)
  const modu = Math.pow(2, 31) - 1
  if (mult < 2) return null
  let salt = Math.round(Math.random() * 1e9) % 1e8
  prand += salt
  while (prand.length > 10) prand = (parseInt(prand.substring(0, 10)) + parseInt(prand.substring(10))).toString()
  prand = (mult * prand + incr) % modu
  let encStr = ''
  for (let i = 0; i < str.length; i++) {
    const c = parseInt(str.charCodeAt(i) ^ Math.floor((prand / modu) * 255))
    encStr += (c < 16 ? '0' : '') + c.toString(16)
    prand = (mult * prand + incr) % modu
  }
  salt = salt.toString(16)
  while (salt.length < 8) salt = '0' + salt
  return encStr + salt
}

const parseCookieToken = (headers) => {
  const setCookie = headers['set-cookie'] || ''
  const match = setCookie.match(/Hm_Iuvt_(\w+)=(\w+)/)
  if (!match) return ''
  kwCookie = match[0]
  return match[2]
}

const getToken = async () => {
  if (kwToken) return kwToken
  const resp = await httpFetch('http://www.kuwo.cn/', {
    headers: { Referer: 'http://www.kuwo.cn/' },
  }).promise
  const cookieToken = parseCookieToken(resp.headers)
  if (!cookieToken) throw new Error('获取酷我token失败')
  kwToken = encrypt(cookieToken, 'Hm_Iuvt_cdb524f42f0ce19b169a8071123a4700')
  return kwToken
}

const qualityMap = {
  '128k': '128kmp3',
  '320k': '320kmp3',
  flac: 'flac',
  hires: 'hires',
}

export default {
  getMusicUrl(songInfo, type) {
    const br = qualityMap[type] || '128kmp3'
    const requestObj = { promise: null, cancelHttp() {} }

    requestObj.promise = getToken().then((token) => {
      const req = httpFetch(
        `http://www.kuwo.cn/api/v1/www/music/playUrl?mid=${songInfo.songmid}&type=music&br=${br}`,
        {
          headers: {
            Referer: 'http://kuwo.cn/',
            Secret: token,
            cookie: kwCookie,
          },
        }
      )
      requestObj.cancelHttp = () => req.cancelHttp()
      return req.promise
    }).then(({ body }) => {
      if (body.code !== 200 || !body.data?.url) {
        throw new Error(body.msg || '获取酷我播放地址失败')
      }
      return { url: body.data.url, type }
    })

    return requestObj
  },
}
