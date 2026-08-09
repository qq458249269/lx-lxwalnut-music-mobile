import ChoosePath, { type ChoosePathType } from '@/components/common/ChoosePath'
import { USER_API_SOURCE_FILE_EXT_RXP } from '@/config/constant'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { handleImportLocalDir } from './action'

export interface SelectInfo {
  // listInfo: LX.List.MyListInfo
  // selectedList: LX.Music.MusicInfo[]
  // index: number
  // listId: string
  // single: boolean
  action: 'import'
}
const initSelectInfo = {}

// export interface ScriptImportExportProps {
//   // onRename: (listInfo: LX.List.UserListInfo) => void
//   // onImport: (index: number) => void
//   // onExport: (listInfo: LX.List.MyListInfo) => void
//   // onSync: (listInfo: LX.List.UserListInfo) => void
//   // onRemove: (listInfo: LX.List.MyListInfo) => void
// }
export interface ScriptImportExportType {
  import: () => void
  // export: (listInfo: LX.List.MyListInfo, index: number) => void
}

export default forwardRef<ScriptImportExportType, {}>((props, ref) => {
  const [visible, setVisible] = useState(false)
  const choosePathRef = useRef<ChoosePathType>(null)
  const selectInfoRef = useRef<SelectInfo>(initSelectInfo as SelectInfo)
  // console.log('render import export')

  useImperativeHandle(ref, () => ({
    import() {
      selectInfoRef.current = {
        action: 'import',
      }
      // 批量导入：选择文件夹，导入其中所有 .js 音源
      const opts = {
        title: global.i18n.t('user_api_import_desc'),
        dirOnly: true,
        filter: USER_API_SOURCE_FILE_EXT_RXP,
      }
      if (visible) {
        choosePathRef.current?.show(opts)
      } else {
        setVisible(true)
        requestAnimationFrame(() => {
          choosePathRef.current?.show(opts)
        })
      }
    },
    // export(listInfo, index) {
    //   selectInfoRef.current = {
    //     action: 'export',
    //     listInfo,
    //     index,
    //   }
    //   if (visible) {
    //     choosePathRef.current?.show({
    //       title: global.i18n.t('list_export_part_desc'),
    //       dirOnly: true,
    //       filter: LXM_FILE_EXT_RXP,
    //     })
    //   } else {
    //     setVisible(true)
    //     requestAnimationFrame(() => {
    //       choosePathRef.current?.show({
    //         title: global.i18n.t('list_export_part_desc'),
    //         dirOnly: true,
    //         filter: LXM_FILE_EXT_RXP,
    //       })
    //     })
    //   }
    // },
  }))

  const onConfirmPath = (path: string) => {
    switch (selectInfoRef.current.action) {
      case 'import':
        void handleImportLocalDir(path)
        break
      // case 'export':
      //   handleExport(selectInfoRef.current.listInfo, path)
      //   break
    }
  }

  return visible ? <ChoosePath ref={choosePathRef} onConfirm={onConfirmPath} /> : null
})
