import { useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity, BackHandler } from 'react-native'
import { useHorizontalMode } from '@/utils/hooks'
import { useNavigationComponentDidAppear } from '@/navigation/hooks'
import { useSettingValue } from '@/store/setting/hook'

import Vertical from './Vertical'
import Horizontal from './Horizontal'
import LandscapeImmersion from './LandscapeImmersion'
import VisualizerPlayer, { type VisualizerPlayerHandle } from './Visualizer/VisualizerPlayer'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { useIsLandscapeImmersion } from '@/store/common/hook'
import { lxmHeadlessServer } from '@/core/visualizer/LxmHeadlessServer'
import playerState from '@/store/player/state'
import { stop, handlePlay } from '@/core/player/player'
import { getPosition } from '@/plugins/player/utils'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'

export default ({ componentId }: { componentId: string }) => {
  const isHorizontalMode = useHorizontalMode()
  const isLandscapeImmersion = useIsLandscapeImmersion()
  const autoLandscapeVisualizer = useSettingValue('playDetail.visualizer.autoLandscape')
  // 手动退出律动后抑制「横屏自动进律动」：避免退出后因仍处于横屏而立即重进（需再点一次退出）。
  // 新实例（从首页点进播放详情）mount 时重置 latch，因此只有从首页重新评估横屏时才自动进入。
  // 每次新实例（从首页进入）默认允许 auto 横屏进律动；退出律动（chevron / 系统返回 / 独立律动页退回）后置位抑制
  const [suppressAutoVisualizer, setSuppressAutoVisualizer] = useState(false)
  const playerRef = useRef<VisualizerPlayerHandle>(null)
  // 手动退出开关：退出逻辑走 stop 异步拿真实进度，卸载兜底不再重复恢复
  const manualExitRef = useRef(false)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  }, [])
  useNavigationComponentDidAppear(componentId, () => {
    if (global.lx.visualizerExited) setSuppressAutoVisualizer(true)
  })

  const visualizerAsFullPage = isHorizontalMode && autoLandscapeVisualizer && !suppressAutoVisualizer
  // 横屏整页 Web 可视化时接管播放：挂载时记录 native 当前进度与歌曲并停 RN 播放器
  useEffect(() => {
    if (!visualizerAsFullPage) return
    void lxmHeadlessServer.prewarm() // 预取 URL，避免首帧无缓冲
    manualExitRef.current = false
    void (async () => {
      try {
        global.lx.visualizerResumePos = await getPosition()
      } catch {
        global.lx.visualizerResumePos = 0
      }
      // 记录进入律动时的歌曲，退出时只对同歌曲恢复进度
      global.lx.visualizerEnterSongId = playerState.playMusicInfo?.musicInfo?.id ?? ''
      void stop()
    })()
    return () => {
      // 卸载兜底：仅当未走手动退出（如被其他方式关闭）时恢复 native 续播
      if (manualExitRef.current) return
      const curSongId = global.lx.visualizerWebSongId || global.lx.visualizerEnterSongId
      const pos = global.lx.visualizerLastPos || global.lx.visualizerResumePos || 0
      global.lx.visualizerResumePos = 0
      global.lx.visualizerLastPos = 0
      global.lx.visualizerEnterSongId = ''
      global.lx.visualizerWebSongId = ''
      playerState.progress.nowPlayTime = curSongId && playerState.playMusicInfo?.musicInfo?.id === curSongId && pos > 0 ? pos : 0
      void handlePlay()
    }
  }, [visualizerAsFullPage])

  // 退出律动：停 Web 流 → 拿回 Web 实时进度 → 同曲则 seek 续播 → 回到详情（Horizontal/Vertical）。
  // 不 pop 页面——PlayDetail 就是详情页，退出律动只应停掉全屏律动覆盖。
  const exitVisualizer = () => {
    // 律动内最后播的歌：切过歌则切歌该歌 + 进度；未切则回退进入时的歌
    const curSongId = global.lx.visualizerWebSongId || global.lx.visualizerEnterSongId
    const resumeBase = global.lx.visualizerResumePos
    playerRef.current?.stop((resumePos) => {
      const pos = resumePos || resumeBase || 0
      global.lx.visualizerResumePos = 0
      global.lx.visualizerLastPos = 0
      global.lx.visualizerEnterSongId = ''
      global.lx.visualizerWebSongId = ''
      // 普通模式续播律动最后播的歌：先设播放起点，再 handlePlay 让其加载该曲并 seek 续播
      // （不可在歌曲未加载时 setCurrentTime——TrackPlayer 尚未就绪会丢进度）
      playerState.progress.nowPlayTime = curSongId && playerState.playMusicInfo?.musicInfo?.id === curSongId && pos > 0 ? pos : 0
      void handlePlay()
    })
    manualExitRef.current = true
    setSuppressAutoVisualizer(true)
    global.lx.visualizerExited = true // 本次详情实例不再自动进律动
  }

  // 全屏律动时，系统返回键 = 退出律动（而非 pop 整个详情页）。
  // 否则退回后又在横屏 auto 触发律动，需再退一次；此处让退出一次即回详情。
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
          <VisualizerPlayer ref={playerRef} style={s.player} />
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