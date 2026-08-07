import { NativeModules } from 'react-native'
import { getMusicUrl, getLyricInfo } from '@/core/music/online'
import { getListMusicSync } from '@/utils/listManage'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'

const { LocalProxy } = NativeModules

const wb = (tag: string, msg: string, data?: any) => {
  console.log(`###RN_DEBUG_START###{"type":"log","payload":["[Server][${tag}] ${msg}",${JSON.stringify(data ?? '')}]}###RN_DEBUG_END###`)
}

const SOURCE_REFERERS: Record<string, string> = {
  wy: 'https://music.163.com/',
  tx: 'https://y.qq.com/',
  kg: 'https://www.kuwo.cn/',
  mg: 'https://music.migu.cn/',
  bilibili: 'https://www.bilibili.com/',
}

class LxmHeadlessServer {
  private webViewRef: React.RefObject<any> | null = null
  private isReady = false
  private pendingMessages: string[] = []
  private proxyPort = -1

  setWebViewRef(ref: React.RefObject<any>) { this.webViewRef = ref }

  async initProxy() {
    if (this.proxyPort > 0) return this.proxyPort
    if (!LocalProxy) { wb('Proxy', 'LocalProxy 原生模块缺失，回退直连'); return -1 }
    try {
      this.proxyPort = await LocalProxy.start()
      wb('Proxy', '本地代理已启动', { port: this.proxyPort })
      return this.proxyPort
    } catch (e: any) {
      wb('Proxy', '代理启动失败，回退直连', { error: e?.message })
      return -1
    }
  }

  proxyUrl(url: string): string {
    if (this.proxyPort <= 0 || !url.startsWith('http')) return url
    const mi = (playerState.playMusicInfo as any)?.musicInfo
    const source = mi?.source || ''
    let referer = SOURCE_REFERERS[source] || ''
    if (source === 'bilibili') {
      const bvid = (mi?.meta as any)?._bilibiliData?.bvid || (mi?.meta as any)?.albumName || ''
      if (bvid) referer = `https://www.bilibili.com/video/${bvid}`
    }
    return `http://127.0.0.1:${this.proxyPort}/proxy?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`
  }

  stopProxy() {
    if (this.proxyPort > 0 && LocalProxy) {
      LocalProxy.stop()
      this.proxyPort = -1
    }
  }

  setReady(ready: boolean) {
    const pendingCount = this.pendingMessages.length
    wb('Ready', ready ? 'WebView 已就绪' : 'WebView 未就绪', { pendingCount, webViewRefExists: !!this.webViewRef?.current })
    this.isReady = ready
    if (ready) {
      this.initProxy()
      if (pendingCount > 0) { wb('Ready', '刷新待发消息', { count: pendingCount }); this.pendingMessages.forEach(m => this.sendRaw(m)); this.pendingMessages = [] }
    }
  }

  private sendRaw(json: string) {
    try {
      const js = `window.__handleRNMessage && window.__handleRNMessage(${JSON.stringify(json)})`
      if (!this.webViewRef?.current) { wb('Send', 'webViewRef 为空，无法发送'); return }
      this.webViewRef.current.injectJavaScript(js)
      wb('Send', '消息已注入', { type: JSON.parse(json).type, jsLen: js.length })
    } catch (e: any) { wb('Send', '注入失败', { error: e?.message }) }
  }

  send(type: string, data: Record<string, any> = {}) {
    if (type === 'loadAndPlay' && data.url && data.url.includes('bilivideo.com') && !data.url.includes('mcdn.bilivideo')) {
      data.url = this.proxyUrl(data.url)
      wb('Send', 'bilibili非mcdn，通过OkHttp代理', { urlLen: data.url.length })
    }
    const msg = JSON.stringify({ type, ...data })
    if (!this.isReady) { wb('Send', '未就绪，排队', { type, queueLen: this.pendingMessages.length + 1 }); this.pendingMessages.push(msg); return }
    this.sendRaw(msg)
  }

  private static QUALITY_FALLBACK = ['320k', '128k'] as const

  async getSongUrl(): Promise<string> {
    const pMusicInfo = (playerState.playMusicInfo as any)?.musicInfo
    wb('URL', '开始获取', { hasMusicInfo: !!pMusicInfo })
    if (!pMusicInfo) { wb('URL', '无 musicInfo，返回空'); return '' }

    const available = Object.keys((pMusicInfo.meta as any)?._qualitys ?? {}) as string[]
    const qualitiesToTry = LxmHeadlessServer.QUALITY_FALLBACK.filter(q => available.includes(q) || q === '128k')
    wb('URL', '音质降级链', { qualitiesToTry, available })

    for (const q of qualitiesToTry) {
      try {
        wb('URL', '尝试音质', { quality: q, id: pMusicInfo.id })
        const url = await getMusicUrl({ musicInfo: pMusicInfo, quality: q as any, isRefresh: false, allowToggleSource: false })
        wb('URL', '获取结果', { quality: q, ok: !!url, urlLen: url?.length || 0 })
        if (url && url.length > 10) {
          wb('URL', '音质成功', { quality: q, urlLen: url.length })
          return url
        }
        wb('URL', 'URL 无效，尝试下一音质', { quality: q })
      } catch (e: any) {
        wb('URL', '音质失败', { quality: q, error: e?.message })
      }
    }

    wb('URL', '所有音质均失败')
    return ''
  }

  async getPlaylist() {
    wb('Playlist', '开始获取')
    try {
      const listId = playerState.playMusicInfo?.listId
      wb('Playlist', 'listId', { listId })
      if (!listId) { wb('Playlist', '无 listId，返回空'); return [] }
      const list = getListMusicSync(listId)
      wb('Playlist', '列表长度', { len: list?.length || 0, firstSong: list?.[0]?.name })
      if (!list?.length) { wb('Playlist', '列表为空'); return [] }
      return list.map((t: any, i: number) => ({ id: String(t.id || ''), title: t.name || t.title || '', artist: t.singer || t.artist || '', index: i }))
    } catch (e: any) {
      wb('Playlist', '获取失败', { error: e?.message })
      return []
    }
  }

  async getLrc(): Promise<string> {
    const pMusicInfo = (playerState.playMusicInfo as any)?.musicInfo
    wb('LRC', '开始获取', { hasMusicInfo: !!pMusicInfo, id: pMusicInfo?.id, name: pMusicInfo?.name })
    if (!pMusicInfo) { wb('LRC', '无 musicInfo，返回空'); return '' }

    // 优先从 playerState 读取（如果主应用已加载过歌词）
    const cached = (playerState as any).musicInfo?.lrc
    wb('LRC', '检查缓存', { hasCached: !!cached, cachedLen: cached?.length })
    if (cached && cached.length > 10) {
      wb('LRC', '从缓存读取歌词', { len: cached.length })
      return cached
    }

    // 缓存没有则主动请求
    wb('LRC', '缓存无，调用 API')
    try {
      const info = await getLyricInfo({ musicInfo: pMusicInfo as any, isRefresh: false, allowToggleSource: false })
      wb('LRC', 'API 返回', { hasInfo: !!info, infoKeys: info ? Object.keys(info) : null, lyricLen: info?.lyric?.length })
      // API 返回的字段是 lyric，不是 lrc
      const lrcText = info?.lyric || ''
      if (lrcText && lrcText.length > 10) {
        wb('LRC', 'API 获取歌词成功', { len: lrcText.length })
        return lrcText
      }
    } catch (e: any) {
      wb('LRC', 'API 获取歌词失败', { error: e?.message, stack: e?.stack?.substring(0, 200) })
    }

    wb('LRC', '最终无歌词')
    return ''
  }

}

export const lxmHeadlessServer = new LxmHeadlessServer()
