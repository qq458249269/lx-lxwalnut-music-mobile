import { forwardRef, memo, useImperativeHandle, useRef, useState } from 'react'
import { View } from 'react-native'
import { requireNativeComponent } from 'react-native'
import { createStyle } from '@/utils/tools'

// Native 律动 View：<VisualizerBarView />
// props: audioSessionId(int) / mode(int: 0=bar 1=wave) / active(bool)
const VisualizerBarView = requireNativeComponent('VisualizerBarView')

export interface VisualizerPlayerHandle {
  /** 退出律动：释放频谱采样（native 播放继续） */
  exit: () => void
  /** 切换律动形态，0=柱状 1=波形 */
  setMode: (mode: 0 | 1) => void
}

const VisualizerPlayer = memo(forwardRef<VisualizerPlayerHandle, {
  style?: object
  audioSessionId: number
}>(({ style, audioSessionId }, ref) => {
  const [mode, setMode] = useState<0 | 1>(0)
  const [active, setActive] = useState(true)

  const togglerRef = useRef<0 | 1>(0)
  togglerRef.current = mode

  useImperativeHandle(ref, () => ({
    exit: () => setActive(false),
    setMode: (m) => { setMode(m); togglerRef.current = m },
  }), [])

  // 未进入时无数采；退出即释放（native 在 audioSessionId/active 为 false 时 detach Visualizer）
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
  root: { flex: 1, backgroundColor: '#000' },
  view: { flex: 1 },
})

export default VisualizerPlayer