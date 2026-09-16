// 纯函数：QQ vkey 响应解析与音质链。零依赖，供 api-builtin-tx.js 与 node 自检共用。

export const QUALITY_RANK = ['hires', 'flac', '320k', '128k']

const filePrefix = {
  '128k': 'M500',
  '320k': 'M800',
  flac: 'F000',
  hires: 'RS02',
}

// 从请求音质向下生成回退链；未知音质则全链
export const buildQualityChain = (type) => {
  const start = QUALITY_RANK.indexOf(type)
  return start === -1 ? [...QUALITY_RANK] : QUALITY_RANK.slice(start)
}

// 从 cookie 中解析 uin（兼容 o 前缀与裸数字），无效返回 '0'
export const parseUin = (cookie) => {
  const m = /(?:^|;\s*)uin=([^;]+)/.exec(cookie || '')
  if (!m) return '0'
  const uin = String(m[1]).trim()
  return /^o?\d+$/.test(uin) ? uin.replace(/^o/, '') : '0'
}

// purl 可能是绝对URL（http://...），否则需拼 sip
export const joinPlayUrl = (sip, purl) =>
  /^https?:\/\//.test(purl) ? purl : sip + purl

// 从 vkey 响应中提取各音质可用 URL，返回按请求顺序的结果数组
export const parsePurls = (body) => {
  if (body?.req_0?.code !== 0) return []
  const data = body.req_0?.data
  if (!data) return []
  const sip = Array.isArray(data.sip) && data.sip.length ? data.sip[0] : ''
  const list = []
  for (const m of data.midurlinfo || []) {
    const purl = m && m.purl
    if (!purl) continue
    const file = m.filename || ''
    const type = Object.keys(filePrefix).find((q) => file.startsWith(filePrefix[q]))
    list.push({ type: type || '128k', url: joinPlayUrl(sip, purl) })
  }
  return list
}