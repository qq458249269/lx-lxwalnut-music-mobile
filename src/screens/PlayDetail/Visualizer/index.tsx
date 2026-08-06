import { memo, useEffect } from 'react'
import { View, StatusBar, BackHandler } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { setComponentId, removeComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import { stop, handlePlay } from '@/core/player/player'
import VisualizerPlayer from './VisualizerPlayer'

export default memo(({ componentId }: { componentId: string }) => {
  useEffect(() => {
    setComponentId(COMPONENT_IDS.visualizer, componentId)
    return () => { removeComponentId(componentId) }
  }, [componentId])

  // Web 可视化整页接管音频：挂载时停 RN 播放器，卸载时恢复
  useEffect(() => {
    void stop()
    return () => { void handlePlay() }
  }, [])

  useEffect(() => {
    const onBackPress = () => {
      setTimeout(() => {
        Navigation.pop(componentId)
      }, 150)
      return true
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => sub.remove()
  }, [componentId])

  return (
    <View style={s.root}>
      <StatusBar hidden />
      <VisualizerPlayer />
    </View>
  )
})

const s = createStyle({ root: { flex: 1, backgroundColor: '#000' }, wv: { flex: 1 } })
