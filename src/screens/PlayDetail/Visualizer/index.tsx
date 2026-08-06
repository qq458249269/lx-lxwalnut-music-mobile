import { memo, useEffect } from 'react'
import { View, StatusBar, BackHandler } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { setComponentId, removeComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import { stop, handlePlay } from '@/core/player/player'
import { getPosition, setCurrentTime } from '@/plugins/player/utils'
import VisualizerPlayer from './VisualizerPlayer'

export default memo(({ componentId }: { componentId: string }) => {
  useEffect(() => {
    setComponentId(COMPONENT_IDS.visualizer, componentId)
    return () => { removeComponentId(componentId) }
  }, [componentId])

  // Web 可视化整页接管音频：挂载时记录 native 进度并停 RN 播放器，卸载时续播
  useEffect(() => {
    void (async () => {
      try {
        global.lx.visualizerResumePos = await getPosition()
      } catch {
        global.lx.visualizerResumePos = 0
      }
      void stop()
    })()
    return () => {
      const pos = global.lx.visualizerLastPos
      global.lx.visualizerResumePos = 0
      global.lx.visualizerLastPos = 0
      void (async () => {
        if (pos > 0) {
          try { await setCurrentTime(pos) } catch {}
        }
        void handlePlay()
      })()
    }
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
