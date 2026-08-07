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
  // 横屏自动进律动：进入时锁横屏，退出时锁回竖屏（设备会旋回竖屏）。用 state 而非 ref 驱动抑制，
  // 这样退出后立即 re-render 會生效（ref 不會觸發 re-render，會導致横屏仍在時 showVisualizer 即刻為 true 重進）。
  const [visualizerActive, setVisualizerActive] = useState(false)
  // 用户手动退出后抑制自动进入，直到旋回竖屏清除
  const [visualizerSuppressed, setVisualizerSuppressed] = useState(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  }, [])

  // 横屏且开启自动律动时进入全屏律动，并锁横屏
  const showVisualizer = isHorizontalMode && autoLandscapeVisualizer && !visualizerActive && !visualizerSuppressed

  useEffect(() => {
    if (showVisualizer) {
      setVisualizerActive(true)
      Navigation.mergeOptions(componentId, {
        layout: { orientation: ['landscape'] },
      } as any)
    }
  }, [showVisualizer, componentId])

  // 设备旋回竖屏：自動退出律動 + 清除抑制，允許下次橫屏自動進入
  const wasLandscape = useRef(false)
  useEffect(() => {
    if (isHorizontalMode) {
      wasLandscape.current = true
    } else if (wasLandscape.current) {
      wasLandscape.current = false
      setVisualizerActive(false)
      setVisualizerSuppressed(false)
    }
  }, [isHorizontalMode])

  // 退出律动：释放频谱由 Visualizer 内部处理，这里锁回竖屏回到详情；並抑制橫屏時立刻重进
  const exitVisualizer = useCallback(() => {
    setVisualizerSuppressed(true)
    setVisualizerActive(false)
    Navigation.mergeOptions(componentId, {
      layout: { orientation: ['portrait'] },
    } as any)
  }, [componentId])

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
