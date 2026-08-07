import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { usePlayMusicInfo } from '@/store/player/hook'
import { createStyle } from '@/utils/tools'
import { WebViewSyncManager } from './WebViewSyncManager'

const WEBVIEW_ASSETS = 'file:///android_asset/sonic-topography/index.html'

export interface VisualizerPlayerHandle {
  /** 立即停掉 WebView 音频，onStop 回调随后触发（不再回传进度） */
  stop: (onStop?: () => void) => void
}

const VisualizerPlayer = memo(forwardRef<VisualizerPlayerHandle, { style?: object }>(({ style }, ref) => {
  const webViewRef = useRef<WebView>(null)
  const syncRef = useRef<WebViewSyncManager | null>(null)
  const [ready, setReady] = useState(false)
  const [jsReady, setJsReady] = useState(false)
  const playMusicInfo = usePlayMusicInfo()
  const lastTrackRef = useRef('')

  useImperativeHandle(ref, () => ({
    stop: (onStop?: () => void) => {
      try {
        webViewRef.current?.injectJavaScript('window.pauseAudio&&window.pauseAudio()')
      } catch {}
      // 稍等 Web 音频停掉，再触发回调（用于恢复 native 播放）
      setTimeout(() => { onStop?.() }, 200)
    },
  }), [])

  useEffect(() => {
    syncRef.current = new WebViewSyncManager(webViewRef)
    return () => {
      try {
        webViewRef.current?.injectJavaScript('window.pauseAudio&&window.pauseAudio()')
      } catch {}
      syncRef.current?.destroy()
      syncRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || !jsReady) return
    syncRef.current?.setReady(true)
    syncRef.current?.activate()
    const t1 = setTimeout(() => syncRef.current?.onTrackChanged(), 500)
    return () => { clearTimeout(t1) }
  }, [ready, jsReady])

  useEffect(() => {
    if (!ready || !jsReady || !playMusicInfo) return
    const m = playMusicInfo.musicInfo ? ('progress' in playMusicInfo.musicInfo ? playMusicInfo.musicInfo.metadata.musicInfo : playMusicInfo.musicInfo) : null
    const key = `${m?.name || ''}_${m?.singer || ''}`
    if (key !== lastTrackRef.current && key !== '_') {
      lastTrackRef.current = key
      setTimeout(() => syncRef.current?.onTrackChanged(), 100)
    }
  }, [playMusicInfo, ready, jsReady])

  const onMsg = useCallback((e: WebViewMessageEvent) => { syncRef.current?.handleWebViewMessage(e) }, [])
  const onLoadEnd = useCallback(() => setReady(true), [])
  const onReady = useCallback(() => setJsReady(true), [])

  useEffect(() => { syncRef.current?.addSyncCallback((t) => { if (t === 'ready') onReady() }) }, [onReady])

  return (
    <View style={[s.root, style]}>
      <WebView
        ref={webViewRef}
        source={{ uri: WEBVIEW_ASSETS, headers: { 'Cache-Control': 'no-cache' } }}
        style={s.wv}
        onMessage={onMsg}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        automaticallyAdjustContentInsets={false}
        mixedContentMode="always"
        originWhitelist={['*']}
        allowFileAccess
        allowUniversalAccessFromFileURLs
        onLoadEnd={onLoadEnd}
        webviewDebuggingEnabled
        androidLayerType="hardware"
      />
    </View>
  )
}))

const s = createStyle({ root: { flex: 1, backgroundColor: '#000' }, wv: { flex: 1 } })

export default VisualizerPlayer