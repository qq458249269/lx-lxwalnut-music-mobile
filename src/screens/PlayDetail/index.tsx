import { useEffect } from 'react'
import { View } from 'react-native'
import { useHorizontalMode } from '@/utils/hooks'
import { useSettingValue } from '@/store/setting/hook'

import Vertical from './Vertical'
import Horizontal from './Horizontal'
import LandscapeImmersion from './LandscapeImmersion'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { useIsLandscapeImmersion } from '@/store/common/hook'

export default ({ componentId }: { componentId: string }) => {
  const isHorizontalMode = useHorizontalMode()
  const isLandscapeImmersion = useIsLandscapeImmersion()
  const autoLandscapeVisualizer = useSettingValue('playDetail.visualizer.autoLandscape')

  useEffect(() => {
    setComponentId(COMPONENT_IDS.playDetail, componentId)
  }, [])

  if (isLandscapeImmersion) {
    return <LandscapeImmersion componentId={componentId} />
  }

  return (
    <PageContent>
      <StatusBar />
      {isHorizontalMode ? (
        <Horizontal componentId={componentId} rhythmEnabled={autoLandscapeVisualizer} />
      ) : (
        <Vertical componentId={componentId} />
      )}
    </PageContent>
  )
}