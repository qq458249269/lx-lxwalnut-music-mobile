import { MUSIC_TOGGLE_MODE } from '@/config/constant'
import { updateSetting } from '@/core/common'
import AsyncStorage from '@react-native-async-storage/async-storage'
import playerState from '@/store/player/state'
import { lxmHeadlessServer } from '@/core/visualizer/LxmHeadlessServer'

const wb = (tag: string, msg: string, data?: any) => {
  console.log(`###RN_DEBUG_START###{"type":"log","payload":["[Sync][${tag}] ${msg}",${JSON.stringify(data ?? '')}]}###RN_DEBUG_END###`)
}

export type PlayMode = 'listLoop' | 'singleLoop' | 'random' | 'list' | 'none'
type SyncCallback = (type: string, data: any) => void

export class WebViewSyncManager {
  private syncCallbacks: SyncCallback[] = []
  private isSwitchingTrack = false
  private lastSwitchTime = 0
  private expectedSongId = ''
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private playlist: Array<{ id: string; title: string; artist: string; index: number }> = []
  private currentIndex = -1
  private playMode: PlayMode = 'listLoop'
  private dispatchLock = false
  private lastPosition = 0
  private webViewRef: React.RefObject<any>

  private static SWITCH_DEBOUNCE_MS = 800
  private static POLL_INTERVAL = 150
  private static POLL_TIMEOUT = 8000

  constructor(webViewRef: React.RefObject<any>) {
    this.webViewRef = webViewRef
    lxmHeadlessServer.setWebViewRef(webViewRef)
    this.loadPlayMode()
  }

  /**
   * 注入音频 error 上报：WebView 音频加载/播放失败时 postMessage 通知 RN（原 bundle 无此上报）。
   * 用于诊断「刚切换时播放失败」并驱动重试降级。
   */
  patchAudioErrorReporter() {
    try {
      this.webViewRef.current?.injectJavaScript(`(function(){
        try {
          var __a = document.querySelector('audio');
          if(!__a || __a.__stErrPatched) { return; }
          __a.__stErrPatched = true;
          __a.addEventListener('error', function(){
            try {
              window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
                type:'audioError',
                code: __a.error ? __a.error.code : -1,
                message: __a.error ? __a.error.message : ('network='+(__a.networkState||-1))
              }));
            } catch(e){}
          });
        } catch(e){}
      })()`)
    } catch {}
  }

  addSyncCallback(cb: SyncCallback) { this.syncCallbacks.push(cb) }

  activate() {}
  deactivate() { this.isSwitchingTrack = false; this.expectedSongId = ''; if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null } }

  private canSwitchTrack() {
    if (this.isSwitchingTrack) return false
    if (Date.now() - this.lastSwitchTime < WebViewSyncManager.SWITCH_DEBOUNCE_MS) return false
    return true
  }

  private getCurrentUIId() { return (playerState.playMusicInfo as any)?.musicInfo?.id || '' }

  getCurrentPosition() { return this.lastPosition }

  /** 让 WebView 立即回报当前进度到 global.lx.visualizerLastPos */
  reportPosition() {
    try {
      this.webViewRef.current?.injectJavaScript(
        `var __a=document.querySelector('audio');window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'reportedPosition',currentTime:__a?__a.currentTime:0}))`
      )
    } catch {}
  }

  private markSwitchStart(id: string) { this.isSwitchingTrack = true; this.lastSwitchTime = Date.now(); this.expectedSongId = id }
  private markSwitchEnd() { this.isSwitchingTrack = false; this.expectedSongId = ''; if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null } }

  private async switchToTrack(newIndex: number) {
    const listId = playerState.playMusicInfo?.listId
    const item = this.playlist[newIndex]
    if (!listId || !item) return
    // 切歌后一律从头播放：清掉进入时的续播进度，避免「上一首」回到进入时那首又续播其进度
    global.lx.visualizerResumePos = 0
    this.lastDispatchedId = ''
    this.markSwitchStart(item.id)
    try {
      const { playListHeadlessServer } = await import('@/core/player/player')
      await playListHeadlessServer(listId, newIndex)
      this.pollDataReady(item.id)
    } catch (e: any) {
      wb('Control', 'switchToTrack 失败', e?.message)
      this.markSwitchEnd()
    }
  }

  private lastDispatchedId = ''

  private pollDataReady(expectedId: string) {
    if (this.lastDispatchedId === expectedId) return
    if (this.pollTimer) clearTimeout(this.pollTimer)
    const t0 = Date.now()
    const poll = () => {
      const uiId = this.getCurrentUIId()
      if (uiId === expectedId) { this.markSwitchEnd(); this.lastDispatchedId = expectedId; setTimeout(() => this.dispatch(), 100); return }
      if (Date.now() - t0 > WebViewSyncManager.POLL_TIMEOUT) { this.markSwitchEnd(); this.lastDispatchedId = expectedId; this.dispatch(); return }
      this.pollTimer = setTimeout(poll, WebViewSyncManager.POLL_INTERVAL)
    }
    this.pollTimer = setTimeout(poll, WebViewSyncManager.POLL_INTERVAL)
  }

  onTrackChanged() {
    if (this.isSwitchingTrack) return
    const id = this.getCurrentUIId()
    if (id) this.pollDataReady(id)
  }

  setReady(ready: boolean) {
    lxmHeadlessServer.setReady(ready)
    if (ready) {
      this.patchAudioErrorReporter()
      this.syncCallbacks.forEach(cb => cb('ready', {}))
    }
  }

  private getNextIndex(direction: 'next' | 'prev'): number {
    if (this.playlist.length === 0) return -1
    if (direction === 'prev') return (this.currentIndex - 1 + this.playlist.length) % this.playlist.length
    switch (this.playMode) {
      case 'singleLoop': return this.currentIndex
      case 'random': {
        if (this.playlist.length <= 1) return 0
        let next: number
        do { next = Math.floor(Math.random() * this.playlist.length) } while (next === this.currentIndex)
        return next
      }
      case 'list': return this.currentIndex + 1 < this.playlist.length ? this.currentIndex + 1 : -1
      case 'listLoop':
      default: return (this.currentIndex + 1) % this.playlist.length
    }
  }

  handleWebViewMessage(event: any) {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      switch (data.type) {
        case 'ready': wb('Msg', 'WebView ready'); this.setReady(true); break
        case 'log': wb('WebView', data.message, data.data); break
        case 'playbackState':
          this.lastPosition = Number(data.currentTime) || this.lastPosition
          if (!this.isSwitchingTrack && data.ended) this.handleEnded()
          break
        case 'reportedPosition':
          global.lx.visualizerLastPos = Number(data.currentTime) || 0
          break
        case 'prev': { if (this.canSwitchTrack()) { const i = this.getNextIndex('prev'); if (i >= 0) this.switchToTrack(i) } break }
        case 'next': { if (this.canSwitchTrack()) { const i = this.getNextIndex('next'); if (i >= 0) this.switchToTrack(i) } break }
        case 'playFromList': if (data.index != null && this.canSwitchTrack()) this.switchToTrack(data.index); break
        case 'playMode': this.setPlayMode(data.mode || 'listLoop'); break
        case 'needTrackData': wb('Msg', 'WebView needTrackData'); if (!this.isSwitchingTrack) this.dispatch(); break
        case 'exitSync': this.deactivate(); break
        case 'audioError': wb('AudioError', 'WebView 音频播放失败', { code: data.code, message: data.message }); break
        default: wb('Msg', '未知消息', { type: data.type })
      }
      this.syncCallbacks.forEach(cb => cb(data.type, data))
    } catch (e: any) { wb('Msg', '解析消息失败', e?.message) }
  }

  private handleEnded() {
    if (!this.canSwitchTrack()) return
    const i = this.getNextIndex('next')
    if (i >= 0) this.switchToTrack(i)
  }

  private async dispatch() {
    if (this.dispatchLock) { wb('Dispatch', '被锁，跳过'); return }
    this.dispatchLock = true
    try {
      const pMusicInfo = (playerState.playMusicInfo as any)?.musicInfo
      if (!pMusicInfo) { wb('Dispatch', 'pMusicInfo 为空，跳过'); return }
      const uiId = pMusicInfo.id || ''
      if (this.expectedSongId && uiId !== this.expectedSongId) { wb('Dispatch', 'songId 不匹配', { expected: this.expectedSongId, actual: uiId }); return }
      // 记录律动内当前播的歌，退出时以它为准同步回普通模式
      global.lx.visualizerWebSongId = uiId

      // 续播进度只对进入律动时的那首歌生效：歌未变才用，否则 0（新歌从头）
      let startTime = 0
      if (global.lx.visualizerResumePos > 0 && uiId === global.lx.visualizerEnterSongId) {
        startTime = global.lx.visualizerResumePos
      }
      wb('Dispatch', '计算 startTime', { startTime, songId: uiId, enterSongId: global.lx.visualizerEnterSongId })

      wb('Dispatch', '获取数据', { id: uiId, name: pMusicInfo.name })
      const [url, lrc] = await Promise.all([
        // 优先用进入律动时预取的 URL（已缓存），仅当缓存对应同一首时有效；切歌后回退现拉
        lxmHeadlessServer.getPrewarmedUrl(uiId) || lxmHeadlessServer.getSongUrl(),
        lxmHeadlessServer.getLrc(),
      ])
      wb('Dispatch', '数据获取完成', { urlLen: url?.length || 0, lrcLen: lrc?.length || 0, isReady: (lxmHeadlessServer as any).isReady })
      if (!url) { wb('Dispatch', 'URL 为空，跳过'); return }

      const list = await lxmHeadlessServer.getPlaylist()
      this.playlist = list
      this.currentIndex = list.findIndex(i => i.title === (pMusicInfo.name || ''))
      if (this.currentIndex < 0) this.currentIndex = 0

      wb('Dispatch', '发送 loadAndPlay', { title: pMusicInfo.name, urlLen: url.length })
      lxmHeadlessServer.send('loadAndPlay', {
        id: uiId, title: pMusicInfo.name || '', singer: pMusicInfo.singer || '',
        url, pic: pMusicInfo.meta?.picUrl || '',
        duration: this.parseInterval(pMusicInfo.interval), album: pMusicInfo.meta?.albumName || '',
        startTime,
        volume: playerState.volume || 1,
        lrc: lrc || '',
      })
      if (list.length > 0) {
        wb('Dispatch', '发送 loadPlaylist', { len: list.length, currentIndex: this.currentIndex })
        lxmHeadlessServer.send('loadPlaylist', { list, currentIndex: this.currentIndex })
      }
      lxmHeadlessServer.send('playMode', { mode: this.playMode })
      // loadAndPlay 已创建 audio，此时注入 error 上报补丁
      this.patchAudioErrorReporter()
      wb('Dispatch', '所有消息已发送')
    } finally {
      this.dispatchLock = false
    }
  }

  async setPlayMode(mode: PlayMode) {
    this.playMode = mode
    try {
      await AsyncStorage.setItem('viz_play_mode', mode)
      const map = { singleLoop: MUSIC_TOGGLE_MODE.singleLoop, random: MUSIC_TOGGLE_MODE.random, list: MUSIC_TOGGLE_MODE.list } as const
      await updateSetting({ 'player.togglePlayMethod': map[mode as keyof typeof map] || MUSIC_TOGGLE_MODE.listLoop })
      lxmHeadlessServer.send('playMode', { mode })
    } catch {}
  }

  private async loadPlayMode() {
    try { const s = await AsyncStorage.getItem('viz_play_mode'); if (s && ['listLoop', 'singleLoop', 'random', 'list'].includes(s)) this.playMode = s as PlayMode } catch {}
  }

  private parseInterval(s: string | null | undefined): number {
    if (!s || typeof s !== 'string') return 0
    const p = s.split(':')
    return p.length === 2 ? (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0) : 0
  }

  destroy() {
    this.deactivate()
    try {
      lxmHeadlessServer.send('exitSync', {})
      this.webViewRef.current?.injectJavaScript('window.pauseAudio()')
    } catch {}
    this.syncCallbacks = []
    this.playlist = []
    this.lastDispatchedId = ''
  }
}
