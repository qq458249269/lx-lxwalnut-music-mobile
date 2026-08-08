import { useEffect, useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
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
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'

export default ({ componentId }: { componentId: string }) => {
  const isHorizontalMode = useHorizontalMode()
  const isLandscapeImmersion = useIsLandscapeImmersion()
  const autoLandscapeVisualizer = useSettingValue('playDetail.visualizer.autoLandscape')
  // 手动退出律动后抑制「横屏自动进律动」：避免退出后因仍处于横屏而立即重进（需再点一次退出）。
  // 组件随页面卸载后重置，因此只有「从首页点进播放详情」重新评估横屏时才自动进入。
  const [suppressAutoVisualizer, setSuppressAutoVisualizer] = useState(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  }, [])

  const visualizerAsFullPage = isHorizontalMode && autoLandscapeVisualizer && !suppressAutoVisualizer
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

  // 退出律动：临时禁用「横屏自动进律动」，回到详情（Horizontal/Vertical）。
  // 不 pop 页面——PlayDetail 就是详情页，退出律动只应停掉全屏律动覆盖。
  const exitVisualizer = () => {
    setSuppressAutoVisualizer(true)
  }

  if (isLandscapeImmersion) {
    return <LandscapeImmersion componentId={componentId} />
  }

  if (visualizerAsFullPage) {
    return (
      <View style={s.full}>
        <VisualizerPlayer style={s.player} />
        <TouchableOpacity
          onPress={exitVisualizer}
          style={s.exitBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="exit visualizer"
        >
          <Icon name="chevron-left" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    )
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

const s = createStyle({
  full: { flex: 1, backgroundColor: '#000' },
  player: { flex: 1 },
  exitBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
})