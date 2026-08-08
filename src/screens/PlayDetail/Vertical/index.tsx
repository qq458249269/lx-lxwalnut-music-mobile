import {memo, useState, useRef, useEffect, useCallback} from 'react'
import { View, AppState } from 'react-native'

import Header from './components/Header'
// import Aside from './components/Aside'
// import Main from './components/Main'
import MiniLyric from '../components/MiniLyric';
import Player from './Player'
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view'
import Lyric from './Lyric'
import Pic from './Pic'
import NativeVisualizerPlayer from '../Visualizer/NativeVisualizerPlayer'
import { useIsPlay } from '@/store/player/hook'
import { useSettingValue } from '@/store/setting/hook'
import { screenkeepAwake, screenUnkeepAwake } from '@/utils/nativeModules/utils'
import commonState, { type InitState as CommonState } from '@/store/common/state'
import { createStyle } from '@/utils/tools'
// import { useTheme } from '@/store/theme/hook'

const LyricPage = ({ activeIndex }: { activeIndex: number }) => {
  const initedRef = useRef(false)
  if (activeIndex === 1) initedRef.current = true
  if (!initedRef.current) return null
  return <Lyric />
  // return activeIndex == 0 || activeIndex == 1 ? setting : null
}

// global.iskeep = false
export default memo(({ componentId }: { componentId: string }) => {
  // const theme = useTheme()
  const [pageIndex, setPageIndex] = useState(0)
  const pagerViewRef = useRef<PagerView>(null);
  const showLyricRef = useRef(false)
  // 律动只在播放时激活：暂停/停止时 native detach，避免频谱挂载干扰音频
  const isPlay = useIsPlay()
  // 竖屏律动受「横屏自动律动」开关控制（诊断用：关掉开关可对比是否律动导致音频报错）
  const rhythmEnabled = useSettingValue('playDetail.visualizer.autoLandscape')
  const rhythmMode = useSettingValue('playDetail.visualizer.mode')
  const rhythmOpacity = useSettingValue('playDetail.visualizer.opacity')
  const rhythmThreeD = useSettingValue('playDetail.visualizer.threeD')
  const showRhythm = rhythmEnabled && isPlay

  const onPageSelected = ({ nativeEvent }: PagerViewOnPageSelectedEvent) => {
    setPageIndex(nativeEvent.position)
    showLyricRef.current = nativeEvent.position == 1
    if (showLyricRef.current) {
      screenkeepAwake()
    } else {
      screenUnkeepAwake()
    }
  }

  const handleSwitchToLyricPage = useCallback(() => {
    pagerViewRef.current?.setPage(1);
  }, []);

  useEffect(() => {
    let appstateListener = AppState.addEventListener('change', (state) => {
      switch (state) {
        case 'active':
          if (showLyricRef.current && !commonState.componentIds.comment) screenkeepAwake()
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
    <>
      <Header />
      <View style={styles.container}>
        {/* 竖屏原生律动背景：封面/歌词叠在频谱之上；仅开关开启且播放时激活 */}
        {showRhythm && (
          <NativeVisualizerPlayer
            style={styles.rhythmBg}
            mode={rhythmMode as 0 | 1}
            opacity={rhythmOpacity}
            threeD={rhythmThreeD}
            active={isPlay}
          />
        )}
        <PagerView
          onPageSelected={onPageSelected}
          // onPageScrollStateChanged={onPageScrollStateChanged}
          style={styles.pagerView}
          ref={pagerViewRef}
        >
          <View collapsable={false}>
            <View collapsable={false} style={styles.picPageContainer}>
              <Pic componentId={componentId} />
              <MiniLyric
                onPress={handleSwitchToLyricPage}
                style={styles.miniLyricContainer}
              />
            </View>
          </View>
          <View collapsable={false}>
            <LyricPage activeIndex={pageIndex} />
          </View>
        </PagerView>
        {/* <View style={styles.pageIndicator} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_pageIndicator}>
          <View style={{ ...styles.pageIndicatorItem, backgroundColor: pageIndex == 0 ? theme['c-primary-light-100-alpha-700'] : theme['c-primary-alpha-900'] }}></View>
          <View style={{ ...styles.pageIndicatorItem, backgroundColor: pageIndex == 1 ? theme['c-primary-light-100-alpha-700'] : theme['c-primary-alpha-900'] }}></View>
        </View> */}
        <Player componentId={componentId} />
      </View>
    </>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  rhythmBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.35,
  },
  pagerView: {
    flex: 1,
  },
  picPageContainer: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  miniLyricContainer: {
    position: 'absolute',
    bottom: '6%',
    left: '10%',
    right: '10%',
    alignItems: 'flex-start',
  },
  // pageIndicator: {
  //   flex: 0,
  //   flexDirection: 'row',
  //   justifyContent: 'center',
  //   paddingTop: 10,
  //   // backgroundColor: 'rgba(0,0,0,0.1)',
  // },
  // pageIndicatorItem: {
  //   height: 3,
  //   width: '5%',
  //   marginLeft: 2,
  //   marginRight: 2,
  //   borderRadius: 2,
  // },
})
