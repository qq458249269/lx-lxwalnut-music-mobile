import { memo, useEffect } from 'react'
import { View, AppState } from 'react-native'
import { screenkeepAwake, screenUnkeepAwake } from '@/utils/nativeModules/utils'
import StatusBar from '@/components/common/StatusBar'
import MoreBtn from './MoreBtn'
import Header from './components/Header'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import PageContent from '@/components/PageContent'
import commonState, { type InitState as CommonState } from '@/store/common/state'

import Pic from './Pic'
// import ControlBtn from './ControlBtn'
import Lyric from './Lyric'
import Player from './Player'
import NativeVisualizerPlayer from '../Visualizer/NativeVisualizerPlayer'
import { useIsPlay } from '@/store/player/hook'
import { createStyle } from '@/utils/tools'
import { marginLeftRaw } from './constant'
import { useStatusbarHeight } from '@/store/common/hook'
// import MoreBtn from './MoreBtn2'

export default memo(({ componentId, rhythmSessionId = 0, rhythmEnabled = false }: {
  componentId: string
  /** 原生律动固定 audio session id（>0 启用，0 关闭） */
  rhythmSessionId?: number
  /** 横屏是否显示原生律动背景 */
  rhythmEnabled?: boolean
}) => {
  const statusBarHeight = useStatusbarHeight()
  // 律动只在播放时激活：暂停/停止时 native detach，避免频谱挂载干扰音频
  const isPlay = useIsPlay()
  const showRhythm = rhythmEnabled && rhythmSessionId > 0 && isPlay

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
    screenkeepAwake()
    let appstateListener = AppState.addEventListener('change', (state) => {
      switch (state) {
        case 'active':
          if (!commonState.componentIds.comment) screenkeepAwake()
          break
        case 'background':
          screenUnkeepAwake()
          break
      }
    })

    const handleComponentIdsChange = (ids: CommonState['componentIds']) => {
      if (ids.comment) screenUnkeepAwake()
      else if (AppState.currentState == 'active') screenkeepAwake()
    }

    global.state_event.on('componentIdsUpdated', handleComponentIdsChange)

    return () => {
      global.state_event.off('componentIdsUpdated', handleComponentIdsChange)
      appstateListener.remove()
      screenUnkeepAwake()
    }
  }, [])

  return (
    <PageContent>
      <StatusBar />
      <View style={{ ...styles.container, paddingTop: statusBarHeight }}>
        {/* 横屏原生律动背景：封面/歌词叠在频谱之上；不全屏替换，保留状态栏 */}
        {showRhythm && (
          <NativeVisualizerPlayer
            style={styles.rhythmBg}
            audioSessionId={rhythmSessionId}
            active={isPlay}
          />
        )}
        <View style={styles.left}>
          <Header />
          <View style={styles.leftContent}>
            <MoreBtn />
            <Pic componentId={componentId} />
          </View>
          <Player />
          {/* <View style={styles.controlBtn} nativeID="pageIndicator">
            <MoreBtn />
            <ControlBtn />
          </View> */}
        </View>
        <View style={styles.right}>
          <Lyric />
        </View>
      </View>
    </PageContent>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  rhythmBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.3,
  },
  left: {
    flex: 1,
    width: '45%',
    paddingBottom: 10,
    // backgroundColor: 'rgba(0,0,0,0.1)',
  },
  leftContent: {
    flex: 1,
    marginLeft: marginLeftRaw,
    justifyContent: 'center',
    position: 'relative',
  },
  miniLyricContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  right: {
    width: '55%',
    flexGrow: 0,
    flexShrink: 0,
  },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // backgroundColor: '#eee',
  },
})
