import { memo, useCallback, useEffect, useRef } from 'react'
import { View, StatusBar, BackHandler, AppState, TouchableOpacity } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { setComponentId, removeComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import { stop, handlePlay } from '@/core/player/player'
import { getPosition, setCurrentTime } from '@/plugins/player/utils'
import { screenkeepAwake, screenUnkeepAwake } from '@/utils/nativeModules/utils'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import VisualizerPlayer, { type VisualizerPlayerHandle } from './VisualizerPlayer'

export default memo(({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const playerRef = useRef<VisualizerPlayerHandle>(null)
  const resumePosRef = useRef(0)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.visualizer, componentId)
    return () => { removeComponentId(componentId) }
  }, [componentId])

  // Web 可视化页保持屏幕常亮，退出时恢复
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

  // Web 可视化整页接管音频：挂载时记录 native 进度并停 RN 播放器
  useEffect(() => {
    void (async () => {
      try {
        global.lx.visualizerResumePos = await getPosition()
        resumePosRef.current = global.lx.visualizerResumePos
      } catch {
        global.lx.visualizerResumePos = 0
        resumePosRef.current = 0
      }
      void stop()
    })()
    return () => {
      // 卸载兜底：若未走 onBackPress（如被其他方式关闭），恢复 native 续播
      const pos = global.lx.visualizerLastPos
      global.lx.visualizerResumePos = 0
      global.lx.visualizerLastPos = 0
      void (async () => {
        if (pos > 0 && pos !== resumePosRef.current) {
          try { await setCurrentTime(pos) } catch {}
        }
        void handlePlay()
      })()
    }
  }, [])

  // 退出律动页：停 Web 音频、回传进度、恢复 native 续播，再 pop
  const handleExit = useCallback(() => {
    playerRef.current?.stop((resumePos) => {
      global.lx.visualizerResumePos = 0
      global.lx.visualizerLastPos = 0
      void (async () => {
        if (resumePos > 0 && resumePos !== resumePosRef.current) {
          try { await setCurrentTime(resumePos) } catch {}
        }
        void handlePlay()
      })()
    })
    // 稍后触发 pop，确保组件卸载前 Web 音频已停
    setTimeout(() => {
      Navigation.pop(componentId)
    }, 350)
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
      <VisualizerPlayer ref={playerRef} />
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
