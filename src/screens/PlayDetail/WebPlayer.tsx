import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { StyleSheet, View, BackHandler } from 'react-native'
import WebView, { type WebViewMessageEvent } from 'react-native-webview'
import { useIsPlay, usePlayMusicInfo, usePlayerMusicInfo, useProgress } from '@/store/player/hook'
import { useSettingValue } from '@/store/setting/hook'
import { playNext, playPrev, togglePlay } from '@/core/player/player'
import { setIsPlay } from '@/core/player/playStatus'
import { setNowPlayTime, setMaxplayTime } from '@/core/player/progress'
import { getMusicUrl } from '@/core/music'
import { WEB_PLAYER_HTML } from './WebPlayerHtml'
import { useHorizontalMode } from '@/utils/hooks'
import { Navigation } from 'react-native-navigation'

/**
 * Web 播放器 + 律动：全屏 WebView 承载 HTML 播放器，
 * 音频用 Web Audio(AnalyserNode) 分析频谱（不依赖系统 Visualizer）。
 * RN 侧保留状态/切歌/URL 逻辑作为控制层。
 */
export default memo(({ componentId }: { componentId: string }) => {
  const webViewRef = useRef<WebView>(null)
  const isPlay = useIsPlay()
  const playMusicInfo = usePlayMusicInfo()
  const playerMusicInfo = usePlayerMusicInfo()
  const progress = useProgress()
  const [webReady, setWebReady] = useState(false)

  const mode = useSettingValue('playDetail.visualizer.mode')
  const enabled = useSettingValue('playDetail.visualizer.enable')

  const send = useCallback((msg: object) => {
    webViewRef.current?.postMessage(JSON.stringify(msg))
  }, [])

  // 投递当前歌曲信息到 Web（封面/歌词/名称/音频 URL）
  const lastTrackKey = useRef('')
  useEffect(() => {
    if (!webReady) return
    const m = playMusicInfo.musicInfo
    const info = m && 'progress' in m ? m.metadata.musicInfo : m
    const pm = playerMusicInfo
    const key = `${info?.id ?? ''}_${info?.name ?? ''}`
    if (key === lastTrackKey.current) return // 同曲不重复投递
    lastTrackKey.current = key
    let cancelled = false
    void (async () => {
      // 获取音频 URL（带 referer/UA 处理，供 Web <audio> 播放）
      let url = ''
      if (info && !('progress' in m!)) {
        try {
          url = await getMusicUrl({ musicInfo: info as any, isRefresh: false, allowToggleSource: false })
        } catch {}
      }
      if (cancelled) return
      send({
        type: 'setTrack',
        payload: {
          id: info?.id ?? null,
          name: info?.name ?? '',
          singer: info?.singer ?? '',
          lrc: pm?.lrc ?? null,
          tlrc: pm?.tlrc ?? null,
          rlrc: pm?.rlrc ?? null,
          picUrl: pm?.pic ?? info?.meta?.picUrl ?? null,
          url,
        },
      })
    })()
    return () => { cancelled = true }
  }, [webReady, playMusicInfo, playerMusicInfo, send])

  // 投递播放状态（isPlay）
  useEffect(() => {
    if (!webReady) return
    send({ type: 'setState', payload: { isPlay } })
  }, [webReady, isPlay, send])

  // 投递律动设置
  useEffect(() => {
    if (!webReady) return
    send({ type: 'setSettings', payload: { mode, enabled } })
  }, [webReady, mode, enabled, send])

  // 投递进度（供 Web 显示/seek 同步）
  useEffect(() => {
    if (!webReady) return
    send({ type: 'setState', payload: { nowPlayTime: progress.nowPlayTime, maxPlayTime: progress.maxPlayTime } })
  }, [webReady, progress.nowPlayTime, progress.maxPlayTime, send])

  // 系统返回：退出详情页
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Navigation.pop(componentId)
      return true
    })
    return () => sub.remove()
  }, [componentId])

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: any
    try { msg = JSON.parse(e.nativeEvent.data) } catch { return }
    if (!msg?.type) return
    switch (msg.type) {
      case 'ready':
        setWebReady(true)
        break
      case 'state': {
        const p = msg.payload || {}
        if (typeof p.isPlay === 'boolean') setIsPlay(p.isPlay)
        if (typeof p.nowPlayTime === 'number') setNowPlayTime(p.nowPlayTime)
        if (typeof p.maxPlayTime === 'number') setMaxplayTime(p.maxPlayTime)
        break
      }
      case 'ended':
        void playNext(true)
        break
      case 'command': {
        const c = msg.payload?.cmd
        if (c === 'next') void playNext()
        else if (c === 'prev') void playPrev()
        else if (c === 'togglePlay') togglePlay()
        else if (c === 'exit') Navigation.pop(componentId)
        break
      }
    }
  }, [])

  return (
    <View style={styles.root}>
      <WebView
        ref={webViewRef}
        source={{ html: WEB_PLAYER_HTML }}
        style={styles.web}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="always"
        originWhitelist={['*']}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  web: { flex: 1 },
})
