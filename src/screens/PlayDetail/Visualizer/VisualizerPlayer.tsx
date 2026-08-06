import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { usePlayMusicInfo } from '@/store/player/hook'
import { createStyle } from '@/utils/tools'
import { WebViewSyncManager } from './WebViewSyncManager'

const WEBVIEW_ASSETS = 'file:///android_asset/sonic-topography/index.html'

export interface VisualizerPlayerHandle {
  /** 立即停掉 WebView 音频并上报进度 */
  stop: () => void
}

const VisualizerPlayer = memo(forwardRef<VisualizerPlayerHandle, { style?: object }>(({ style }, ref) => {
  const webViewRef = useRef<WebView>(null)
  const syncRef = useRef<WebViewSyncManager | null>(null)
  const [ready, setReady] = useState(false)
  const [jsReady, setJsReady] = useState(false)
  const playMusicInfo = usePlayMusicInfo()
  const lastTrackRef = useRef('')

  useImperativeHandle(ref, () => ({
    stop: () => {
      try {
        webViewRef.current?.injectJavaScript('window.pauseAudio&&window.pauseAudio()')
        syncRef.current?.reportPosition()
      } catch {}
    },
  }), [])

  useEffect(() => {
    syncRef.current = new WebViewSyncManager(webViewRef)
    return () => {
      try {
        webViewRef.current?.injectJavaScript('window.pauseAudio&&window.pauseAudio()')
        // 卸载前上报 WebView 当前进度,供 native 续播
        syncRef.current?.reportPosition()
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
