import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { View, StatusBar, BackHandler, AppState, TouchableOpacity, PermissionsAndroid, Linking, Text, StyleSheet } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { setComponentId, removeComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import TrackPlayer from 'react-native-track-player'
import { playNext, playPrev, togglePlay } from '@/core/player/player'
import { useIsPlay } from '@/store/player/hook'
import { screenkeepAwake, screenUnkeepAwake } from '@/utils/nativeModules/utils'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import VisualizerPlayer, { type VisualizerPlayerHandle } from './VisualizerPlayer'
import Pic from '@/screens/PlayDetail/LandscapeImmersion/Pic'
import Lyric from '@/screens/PlayDetail/LandscapeImmersion/Lyric'

// 律动频谱使用固定 audio session id：TrackPlayer 补丁（patchMediaLayout.js）
// 会给 ExoPlayer 设置该固定 id（见 MusicManager.createLocalPlayback），
// 同 uid 进程用 Visualizer(sessionId) 捕获无需 RECORD_AUDIO 权限。
const FIXED_SESSION_ID = 1000

const getAudioSessionId = async (): Promise<number> => {
  // 优先取 TrackPlayer 真实 session id（fork 若有该方法）
  try {
    // @ts-expect-error fork 未声明该方法
    const getter = TrackPlayer.getAudioSessionId
    if (typeof getter === 'function') {
      const id = await getter()
      if (typeof id === 'number' && id > 0) return id
    }
  } catch {}
  return FIXED_SESSION_ID
}

// 全局 session 频谱需要 RECORD_AUDIO（Android 6+ 危险权限）
const requestRecordPermission = async (): Promise<boolean> => {
  try {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: '律动模式需要麦克风权限',
      message: '用于分析当前播放歌曲的音频频谱以显示律动效果（不会录音/上传）。',
      buttonNeutral: '稍后再说',
      buttonNegative: '取消',
      buttonPositive: '允许',
    })
    return granted === PermissionsAndroid.RESULTS.GRANTED
  } catch {
    return false
  }
}

interface Props {
  componentId: string
  /** 自定义退出行为：若不传，退出时 Navigation.pop(componentId)。
   *  横屏自动进律动时传入，用于「仅停止律动、不 pop 页面」 */
  onExit?: () => void
  /** 横屏自动进律动复用时为 true：本组件不入栈，不注册 COMPONENT_IDS.visualizer */
  embedded?: boolean
}

export default memo(({ componentId, onExit, embedded = false }: Props) => {
  const theme = useTheme()
  const playerRef = useRef<VisualizerPlayerHandle>(null)
  const [sessionId, setSessionId] = useState(-1)
  const [mode, setMode] = useState<0 | 1>(0)
  const isPlay = useIsPlay()

  const toggleMode = useCallback(() => {
    const next: 0 | 1 = mode === 0 ? 1 : 0
    setMode(next)
    playerRef.current?.setMode(next)
  }, [mode])

  const handlePrev = useCallback(() => { void playPrev() }, [])
  const handleNext = useCallback(() => { void playNext() }, [])
  const handleTogglePlay = useCallback(() => { togglePlay() }, [])

  useEffect(() => {
    if (embedded) return
    setComponentId(COMPONENT_IDS.visualizer, componentId)
    return () => { removeComponentId(componentId) }
  }, [componentId, embedded])

  // 律动页保持屏幕常亮，退出时恢复
  useEffect(() => {
    screenkeepAwake()
    const appstateListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') screenkeepAwake()
      else if (state === 'background') screenUnkeepAwake()
    })
    return () => {
      appstateListener.remove()
      screenUnkeepAwake()
    }
  }, [])

  // 挂载：请求频谱权限，拿到 native 播放器的 audioSessionId（native 播放不中断，律动是只读旁路）。
  // 未授权（native 侧 Visualizer(0) 无法采）→ sessionId 保持 -1，频谱静默，显示去设置引导
  const [permissionDenied, setPermissionDenied] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ok = await requestRecordPermission()
      if (cancelled) return
      if (!ok) { setPermissionDenied(true); return } // 未授权
      const id = await getAudioSessionId()
      if (cancelled) return
      setSessionId(id)
    })()
    return () => { cancelled = true }
  }, [])

  // 退出律动页：释放频谱采样（native 播放继续，无人为 stop）。
  // 幂等：首次退出即置位，防止返回键/退出按钮/系统事件叠加导致需点两次才退出。
  const exitedRef = useRef(false)
  const handleExit = useCallback(() => {
    if (exitedRef.current) return
    exitedRef.current = true
    playerRef.current?.exit()
    setSessionId(-1)
    if (onExit) {
      onExit()
    } else {
      setTimeout(() => {
        Navigation.pop(componentId)
      }, 150)
    }
  }, [componentId, onExit])

  useEffect(() => {
    const onBackPress = () => {
      handleExit()
      return true
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => sub.remove()
  }, [handleExit])

  return (
    <View style={s.root}>
      <StatusBar hidden />
      {/* 频谱背景层（全屏） */}
      <VisualizerPlayer ref={playerRef} audioSessionId={sessionId} />
      {/* 半透明遮罩：保证歌词/封面可读 */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={s.overlay} />
      </View>
      {/* 内容层：左封面 右歌词 */}
      <View style={s.content} pointerEvents="box-none">
        <View style={s.left}>
          <Pic />
        </View>
        <View style={s.right}>
          <Lyric />
        </View>
      </View>
      {permissionDenied && (
        <View style={s.permDenied}>
          <Text style={s.permDeniedText}>律动模式需要麦克风权限来分析音频频谱</Text>
          <TouchableOpacity
            onPress={() => { Linking.openSettings() }}
            style={s.permDeniedBtn}
          >
            <Text style={s.permDeniedBtnText}>去开启权限</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* 底部控制条：上一首 / 播放暂停 / 下一首（小尺寸，不遮挡律动画面） */}
      <View style={s.controls} pointerEvents="box-none">
        <TouchableOpacity
          onPress={handlePrev}
          style={s.ctrlBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="previous"
        >
          <Icon name="prevMusic" size={26} color={theme['c-primary-font']} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleTogglePlay}
          style={[s.ctrlBtn, s.ctrlBtnCenter]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={isPlay ? 'pause' : 'play'}
        >
          <Icon name={isPlay ? 'pause' : 'play'} size={28} color={theme['c-primary-font']} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleNext}
          style={s.ctrlBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="next"
        >
          <Icon name="nextMusic" size={26} color={theme['c-primary-font']} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={toggleMode}
        style={s.modeBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="toggle visualizer mode"
      >
        <Icon name={mode === 0 ? 'slider' : 'lyric-on'} size={24} color={theme['c-primary-font']} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleExit}
        style={s.exitBtn}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="exit visualizer"
      >
        <Icon name="chevron-left" size={24} color={theme['c-primary-font']} />
      </TouchableOpacity>
    </View>
  )
})

const s = createStyle({
  root: { flex: 1, backgroundColor: '#000' },
  exitBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 10,
  },
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
    zIndex: 10,
  },
  controls: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  ctrlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    marginHorizontal: 12,
  },
  ctrlBtnCenter: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  overlay: {
    flex: 1,
    // 背景频谱仍应可见：仅轻微压暗（封面/歌词区自身有半透明背景）
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    // 整体缩小到中部：封面/歌词不占满屏幕
    paddingHorizontal: '8%',
    paddingVertical: '12%',
  },
  left: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    // 靠左 + 半透明背景
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    padding: 8,
  },
  right: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    // 靠右 + 半透明背景
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    padding: 8,
  },
  permDenied: {
    position: 'absolute',
    top: '50%',
    left: 24,
    right: 24,
    marginTop: -40,
    alignItems: 'center',
  },
  permDeniedText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  permDeniedBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#00D4FF',
  },
  permDeniedBtnText: {
    color: '#000',
    fontSize: 14,
  },
})
