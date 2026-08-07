import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { View, StatusBar, BackHandler, AppState, TouchableOpacity, PermissionsAndroid } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { setComponentId, removeComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import TrackPlayer from 'react-native-track-player'
import { screenkeepAwake, screenUnkeepAwake } from '@/utils/nativeModules/utils'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import VisualizerPlayer, { type VisualizerPlayerHandle } from './VisualizerPlayer'

// Native 音乐播放器的 audio session id。
// fork 无 getAudioSessionId 时返回 0，native 侧用系统全局 session(Visualizer(0)) 捕获本 app 输出频谱。
const getAudioSessionId = async (): Promise<number> => {
  try {
    // @ts-expect-error fork 未声明该方法
    const getter = TrackPlayer.getAudioSessionId
    if (typeof getter === 'function') {
      const id = await getter()
      return typeof id === 'number' ? id : 0
    }
  } catch {}
  return 0
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

export default memo(({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const playerRef = useRef<VisualizerPlayerHandle>(null)
  const [sessionId, setSessionId] = useState(-1)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.visualizer, componentId)
    return () => { removeComponentId(componentId) }
  }, [componentId])

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
  // 未授权则 sessionId 保持 -1，频谱静默（组件不渲染，native 不采）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ok = await requestRecordPermission()
      if (cancelled) return
      if (!ok) return // 保持 -1
      const id = await getAudioSessionId()
      if (cancelled) return
      setSessionId(id)
    })()
    return () => { cancelled = true }
  }, [])

  // 退出律动页：释放频谱采样（native 播放继续，无人为 stop）
  const handleExit = useCallback(() => {
    playerRef.current?.exit()
    setSessionId(-1)
    setTimeout(() => {
      Navigation.pop(componentId)
    }, 150)
  }, [componentId])

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
      <VisualizerPlayer ref={playerRef} audioSessionId={sessionId} />
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
  },
})