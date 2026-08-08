import { memo, forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import { View } from 'react-native'
import { requireNativeComponent } from 'react-native'
import { createStyle } from '@/utils/tools'
import TrackPlayer from 'react-native-track-player'

// Native 律动 View：<VisualizerBarView />
// props: audioSessionId(int, 真实 session>0 同 uid 捕获无需权限) / mode(int, 0=bar 1=wave) / active(bool)
const VisualizerBarView = requireNativeComponent('VisualizerBarView') as any

export interface NativeVisualizerPlayerHandle {
  /** 退出律动：释放频谱采样（native 播放继续） */
  exit: () => void
  /** 切换律动形态，0=柱状 1=波形 */
  setMode: (mode: 0 | 1) => void
}

const NativeVisualizerPlayer = memo(forwardRef<NativeVisualizerPlayerHandle, {
  style?: object
  /** 可选：外部指定 session id（>0）。不传则内部从 TrackPlayer 获取真实 session */
  audioSessionId?: number
  active?: boolean
}>(({ style, audioSessionId, active = true }, ref) => {
  const [mode, setMode] = useState<0 | 1>(0)
  // 真实 session id：优先外部传入，否则挂载时从 TrackPlayer 获取
  const [sessionId, setSessionId] = useState(audioSessionId ?? -1)
  const togglerRef = useRef<0 | 1>(0)
  togglerRef.current = mode

  useImperativeHandle(ref, () => ({
    exit: () => { /* native 在 active=false / sessionId<=0 时自动 detach */ },
    setMode: (m) => { setMode(m); togglerRef.current = m },
  }), [])

  useEffect(() => {
    // 外部未指定 session 时，从 TrackPlayer 拿真实 audio session id（patch 暴露，只读）
    if (audioSessionId == null) {
      let cancelled = false
      void (async () => {
        try {
          const id = await TrackPlayer.getAudioSessionId()
          if (!cancelled && typeof id === 'number') setSessionId(id)
        } catch {
          // 获取失败：sessionId 保持 -1，native 走反射 getAudioSessions 兜底
        }
      })()
      return () => { cancelled = true }
    } else {
      setSessionId(audioSessionId)
    }
  }, [audioSessionId])

  // 未进入时无数采；退出时 active=false，native detach Visualizer
  return (
    <View style={[s.root, style]}>
      {sessionId >= 0 && (
        <VisualizerBarView
          style={s.view}
          audioSessionId={sessionId}
          mode={mode}
          active={active}
        />
      )}
    </View>
  )
}))

const s = createStyle({
  root: { flex: 1, backgroundColor: 'transparent' },
  view: { flex: 1 },
})

export default NativeVisualizerPlayer
