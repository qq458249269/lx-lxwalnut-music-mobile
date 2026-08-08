import { memo, useCallback, useEffect, useRef } from 'react'
import { View, StatusBar, BackHandler, AppState, TouchableOpacity } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { setComponentId, removeComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import playerState from '@/store/player/state'
import { lxmHeadlessServer } from '@/core/visualizer/LxmHeadlessServer'
import { stop, handlePlay } from '@/core/player/player'
import { getPosition, setCurrentTime } from '@/plugins/player/utils'
import { Icon } from '@/components/common/Icon'
import { screenkeepAwake, screenUnkeepAwake } from '@/utils/nativeModules/utils'
import VisualizerPlayer, { type VisualizerPlayerHandle } from './VisualizerPlayer'

export default memo(({ componentId }: { componentId: string }) => {
  const playerRef = useRef<VisualizerPlayerHandle>(null)
  const resumePosRef = useRef(0)

  useEffect(() => {
    setComponentId(COMPONENT_IDS.visualizer, componentId)
    return () => {
      removeComponentId(componentId)
      // 退出过律动：回到详情后不再自动进入（横屏 auto 场景），下次从首页进详情才重新评估
      global.lx.visualizerExited = true
    }
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
    void lxmHeadlessServer.prewarm() // 预取 URL，避免首帧无缓冲
    void (async () => {
      try {
        global.lx.visualizerResumePos = await getPosition()
        resumePosRef.current = global.lx.visualizerResumePos
      } catch {
        global.lx.visualizerResumePos = 0
        resumePosRef.current = 0
      }
      // 记录进入律动时的歌曲，退出时只对同歌曲恢复进度
      global.lx.visualizerEnterSongId = playerState.playMusicInfo?.musicInfo?.id ?? ''
      void stop()
    })()
    return () => {
      // 卸载兜底：若未走 onBackPress（如被其他方式关闭），恢复 native 续播
      const pos = global.lx.visualizerLastPos
      const enterSongId = global.lx.visualizerEnterSongId
      global.lx.visualizerResumePos = 0
      global.lx.visualizerLastPos = 0
      global.lx.visualizerEnterSongId = ''
      void (async () => {
        // 仅当退出时仍在播进入律动时的同一首歌才恢复进度，避免误解到别的歌的进度
        if (pos > 0 && pos !== resumePosRef.current && playerState.playMusicInfo?.musicInfo?.id === enterSongId) {
          try { await setCurrentTime(pos) } catch {}
        }
        void handlePlay()
      })()
    }
  }, [])

  // 退出律动：停 Web 音频 → 拿回进度 → 同曲则续播 → pop 律动页
  const exitVisualizer = useCallback(() => {
    playerRef.current?.stop((resumePos) => {
      const enterSongId = global.lx.visualizerEnterSongId
      global.lx.visualizerResumePos = 0
      global.lx.visualizerLastPos = 0
      void (async () => {
        // 仅当退出时仍在播进入律动时的同一首歌才恢复进度
        if (resumePos > 0 && resumePos !== resumePosRef.current && playerState.playMusicInfo?.musicInfo?.id === enterSongId) {
          try { await setCurrentTime(resumePos) } catch {}
        }
        void handlePlay()
      })()
    })
    setTimeout(() => {
      Navigation.pop(componentId)
    }, 350)
  }, [componentId])

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitVisualizer()
      return true
    })
    return () => sub.remove()
  }, [exitVisualizer])

  return (
    <View style={s.root}>
      <StatusBar hidden />
      <VisualizerPlayer ref={playerRef} />
      {/* 左上角退出按钮：与系统返回同一逻辑（停流/续进度/离开律动） */}
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
  },
})
