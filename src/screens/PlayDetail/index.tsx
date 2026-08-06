import { useEffect } from 'react'
import { View } from 'react-native'
import { useHorizontalMode } from '@/utils/hooks'
import { useSettingValue } from '@/store/setting/hook'

import Vertical from './Vertical'
import Horizontal from './Horizontal'
import LandscapeImmersion from './LandscapeImmersion'
import VisualizerPlayer from './Visualizer/VisualizerPlayer'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { useIsLandscapeImmersion } from '@/store/common/hook'
import { stop, handlePlay } from '@/core/player/player'
import { getPosition, setCurrentTime } from '@/plugins/player/utils'

export default ({ componentId }: { componentId: string }) => {
  const isHorizontalMode = useHorizontalMode()
  const isLandscapeImmersion = useIsLandscapeImmersion()
  const autoLandscapeVisualizer = useSettingValue('playDetail.visualizer.autoLandscape')

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  }, [])

  const visualizerAsFullPage = isHorizontalMode && autoLandscapeVisualizer
  // 横屏整页 Web 可视化时接管音频：挂载记录 native 进度并停 RN 播放器，卸载续播
  useEffect(() => {
    if (!visualizerAsFullPage) return
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
  }, [visualizerAsFullPage])

  if (isLandscapeImmersion) {
    return <LandscapeImmersion componentId={componentId} />
  }

  if (visualizerAsFullPage) {
    return <VisualizerPlayer />
  }

  return (
    <PageContent>
      <StatusBar />
      {isHorizontalMode ? (
        <Horizontal componentId={componentId} />
      ) : (
        <Vertical componentId={componentId} />
      )}
    </PageContent>
  )
}
