import { memo, forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import { requireNativeComponent } from 'react-native'
import { createStyle } from '@/utils/tools'

// Native 律动 View：<VisualizerBarView />
// props: audioSessionId(int, 固定 session>0 同 uid 捕获无需权限) / mode(int, 0=bar 1=wave) / active(bool)
const VisualizerBarView = requireNativeComponent('VisualizerBarView') as any

export interface NativeVisualizerPlayerHandle {
  /** 退出律动：释放频谱采样（native 播放继续） */
  exit: () => void
  /** 切换律动形态，0=柱状 1=波形 */
  setMode: (mode: 0 | 1) => void
}

const NativeVisualizerPlayer = memo(forwardRef<NativeVisualizerPlayerHandle, {
  style?: object
  audioSessionId: number
  active?: boolean
}>(({ style, audioSessionId, active = true }, ref) => {
  const [mode, setMode] = useState<0 | 1>(0)
  const togglerRef = useRef<0 | 1>(0)
  togglerRef.current = mode

  useImperativeHandle(ref, () => ({
    exit: () => { /* native 在 active=false / sessionId<=0 时自动 detach */ },
    setMode: (m) => { setMode(m); togglerRef.current = m },
  }), [])

  // 未进入时无数采；退出时 active=false，native detach Visualizer
  return (
    <View style={[s.root, style]}>
      {audioSessionId != null && audioSessionId >= 0 && (
        <VisualizerBarView
          style={s.view}
          audioSessionId={audioSessionId}
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
