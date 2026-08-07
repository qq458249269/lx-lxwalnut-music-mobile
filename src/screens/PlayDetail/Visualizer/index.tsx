import { memo, useCallback, useEffect, useRef } from 'react'
import { View, StatusBar, BackHandler, TouchableOpacity } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { setComponentId, removeComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import { stop, handlePlay } from '@/core/player/player'
import { useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import VisualizerPlayer, { type VisualizerPlayerHandle } from './VisualizerPlayer'

export default memo(({ componentId }: { componentId: string }) => {
  const theme = useTheme()
  const playerRef = useRef<VisualizerPlayerHandle>(null)
  const statusBarHeight = useStatusbarHeight()

  useEffect(() => {
    setComponentId(COMPONENT_IDS.visualizer, componentId)
    return () => { removeComponentId(componentId) }
  }, [componentId])

  // Web 可视化整页接管音频：挂载时停 RN 播放器，卸载恢复播放（不读写进度）
  useEffect(() => {
    void stop()
    return () => {
      // 卸载兜底：若未走 handleExit（如被其他方式关闭），恢复 native 播放
      void handlePlay()
    }
  }, [])

  // 退出律动页：停 Web 音频、恢复 native 播放（不回写进度）
  const handleExit = useCallback(() => {
    playerRef.current?.stop(() => {
      void handlePlay()
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
    <View style={[s.root, { paddingTop: statusBarHeight }]}>
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