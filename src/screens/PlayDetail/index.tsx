import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { useHorizontalMode } from '@/utils/hooks'
import { useSettingValue } from '@/store/setting/hook'

import Vertical from './Vertical'
import Horizontal from './Horizontal'
import LandscapeImmersion from './LandscapeImmersion'
import Visualizer from './Visualizer'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { useIsLandscapeImmersion } from '@/store/common/hook'

export default ({ componentId }: { componentId: string }) => {
  const isHorizontalMode = useHorizontalMode()
  const isLandscapeImmersion = useIsLandscapeImmersion()
  const autoLandscapeVisualizer = useSettingValue('playDetail.visualizer.autoLandscape')
  // 横屏自动进律动：进入时锁横屏，退出时锁回竖屏（设备会旋回竖屏）
  const [visualizerActive, setVisualizerActive] = useState(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  }, [])

  // 横屏且开启自动律动时进入全屏律动，并锁横屏
  const showVisualizer = isHorizontalMode && autoLandscapeVisualizer && !visualizerActive

  useEffect(() => {
    if (showVisualizer) {
      setVisualizerActive(true)
      Navigation.mergeOptions(componentId, {
        layout: { orientation: ['landscape'] },
      } as any)
    }
  }, [showVisualizer, componentId])

  // 设备转回竖屏时自动退出律动（不需要点退出按钮）
  const wasLandscape = useRef(false)
  useEffect(() => {
    if (isHorizontalMode) {
      wasLandscape.current = true
    } else if (wasLandscape.current) {
      wasLandscape.current = false
      setVisualizerActive(false)
    }
  }, [isHorizontalMode])

  // 退出律动：释放频谱由 Visualizer 内部处理，这里锁回竖屏回到详情
  const exitVisualizer = () => {
    setVisualizerActive(false)
    Navigation.mergeOptions(componentId, {
      layout: { orientation: ['portrait'] },
    } as any)
  }

  if (isLandscapeImmersion) {
    return <LandscapeImmersion componentId={componentId} />
  }

  if (visualizerActive) {
    return <Visualizer componentId={componentId} onExit={exitVisualizer} embedded />
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
