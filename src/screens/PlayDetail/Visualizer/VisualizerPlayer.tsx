import { forwardRef, memo, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { requireNativeComponent } from 'react-native'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'

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
  const theme = useTheme()
  const [mode, setMode] = useState<0 | 1>(0)
  const [active, setActive] = useState(true)

  const togglerRef = useRef<0 | 1>(0)
  togglerRef.current = mode

  useImperativeHandle(ref, () => ({
    exit: () => setActive(false),
    setMode: (m) => { setMode(m); togglerRef.current = m },
  }), [])

  const toggleMode = useCallback(() => {
    const next: 0 | 1 = togglerRef.current === 0 ? 1 : 0
    setMode(next)
  }, [])

  // 未进入时无数采；退出立即释放（native 在 audioSessionId/active 为 false 时 detach Visualizer）
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
      <TouchableOpacity
        onPress={toggleMode}
        style={s.modeBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="toggle visualizer mode"
      >
        <Icon name={mode === 0 ? 'slider' : 'lyric-on'} size={24} color={theme['c-primary-font']} />
      </TouchableOpacity>
    </View>
  )
}))

const s = createStyle({
  root: { flex: 1, backgroundColor: '#000' },
  view: { flex: 1 },
  modeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
})

export default VisualizerPlayer