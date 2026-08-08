import { useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity, BackHandler } from 'react-native'
import { useHorizontalMode } from '@/utils/hooks'
import { useNavigationComponentDidAppear } from '@/navigation/hooks'
import { useSettingValue } from '@/store/setting/hook'

import Vertical from './Vertical'
import Horizontal from './Horizontal'
import LandscapeImmersion from './LandscapeImmersion'
import NativeVisualizerPlayer from './Visualizer/NativeVisualizerPlayer'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { useIsLandscapeImmersion } from '@/store/common/hook'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'

// 原生律动固定 audio session id（patchMediaLayout.js 给 ExoPlayer 注入）
const RHYTHM_SESSION_ID = 1000

export default ({ componentId }: { componentId: string }) => {
  const isHorizontalMode = useHorizontalMode()
  const isLandscapeImmersion = useIsLandscapeImmersion()
  const autoLandscapeVisualizer = useSettingValue('playDetail.visualizer.autoLandscape')
  // 手动退出律动后抑制「横屏自动进律动」：避免退出后因仍处于横屏而立即重进（需再点一次退出）。
  // 新实例（从首页点进播放详情）mount 时重置 latch，因此只有从首页重新评估横屏时才自动进入。
  const [suppressAutoVisualizer, setSuppressAutoVisualizer] = useState(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  }, [])
  useNavigationComponentDidAppear(componentId, () => {
    if (global.lx.visualizerExited) setSuppressAutoVisualizer(true)
  })

  const visualizerAsFullPage = isHorizontalMode && autoLandscapeVisualizer && !suppressAutoVisualizer

  // 退出律动：只停全屏律动覆盖，原生播放继续（原生频谱是旁路只读，不接管音频）
  const exitVisualizer = () => {
    setSuppressAutoVisualizer(true)
    global.lx.visualizerExited = true // 本次详情实例不再自动进律动
  }

  // 全屏律动时，系统返回键 = 退出律动（而非 pop 整个详情页）
  useEffect(() => {
    if (!visualizerAsFullPage) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitVisualizer()
      return true
    })
    return () => sub.remove()
  }, [visualizerAsFullPage])

  if (isLandscapeImmersion) {
    return <LandscapeImmersion componentId={componentId} />
  }

  if (visualizerAsFullPage) {
    return (
      <View style={s.full}>
        <StatusBar />
        <View style={s.playerWrap}>
          <NativeVisualizerPlayer style={s.player} audioSessionId={RHYTHM_SESSION_ID} />
          <TouchableOpacity
            onPress={exitVisualizer}
            style={s.exitBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel="exit visualizer"
          >
            <Icon name="chevron-left" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
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
  playerWrap: {
    flex: 1,
    position: 'relative',
    // 保留系统状态栏：内容从状态栏下方开始
    paddingTop: StatusBar.currentHeight,
  },
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