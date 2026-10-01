import { useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import ConfirmAlert, { type ConfirmAlertType } from '@/components/common/ConfirmAlert'
import Text from '@/components/common/Text'
import { View, type LayoutChangeEvent } from 'react-native'
import Input, { type InputType } from '@/components/common/Input'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { handleImportOnlineScripts, parseImportUrls } from './action'

interface UrlInputType {
  setText: (text: string) => void
  getText: () => string
  focus: () => void
}
const UrlInput = forwardRef<UrlInputType, {}>((props, ref) => {
  const theme = useTheme()
  const [text, setText] = useState('')
  const [height, setHeight] = useState(90)
  const inputRef = useRef<InputType>(null)

  useImperativeHandle(ref, () => ({
    getText() {
      return text.trim()
    },
    setText(text) {
      setText(text)
    },
    focus() {
      inputRef.current?.focus()
    },
  }))

  const handleLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    setHeight(nativeEvent.layout.height)
  }, [])

  return (
    <View style={styles.inputContent} onLayout={handleLayout}>
      <Input
        ref={inputRef}
        placeholder={global.i18n.t('user_api_btn_import_online_input_tip')}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        size={13}
        style={{ ...styles.input, height, backgroundColor: theme['c-primary-input-background'] }}
      />
    </View>
  )
})

export interface ScriptImportOnlineType {
  show: () => void
}

export default forwardRef<ScriptImportOnlineType, {}>((props, ref) => {
  const t = useI18n()
  const alertRef = useRef<ConfirmAlertType>(null)
  const urlInputRef = useRef<UrlInputType>(null)
  const [visible, setVisible] = useState(false)
  const [btn, setBtn] = useState({
    disabled: false,
    text: t('user_api_btn_import_online_input_confirm'),
  })

  const handleShow = () => {
    alertRef.current?.setVisible(true)
    setBtn({ disabled: false, text: t('user_api_btn_import_online_input_confirm') })
    requestAnimationFrame(() => {
      urlInputRef.current?.setText('')
      setTimeout(() => {
        urlInputRef.current?.focus()
      }, 300)
    })
  }
  useImperativeHandle(ref, () => ({
    show() {
      if (visible) handleShow()
      else {
        setVisible(true)
        requestAnimationFrame(() => {
          handleShow()
        })
      }
    },
  }))

  const handleImport = async () => {
    const urls = parseImportUrls(urlInputRef.current?.getText() ?? '')
    if (!urls.length) {
      toast(t('user_api_import_no_url_tip'))
      return
    }
    setBtn({ disabled: true, text: t('user_api_btn_import_online_input_loading') })
    try {
      await handleImportOnlineScripts(urls, {
        onUrlProgress: (current, total) => {
          setBtn({
            disabled: true,
            text: t('user_api_btn_import_online_input_progress', { current, total }),
          })
        },
        onMirrorProgress: (current, total) => {
          setBtn({
            disabled: true,
            text: t('user_api_btn_import_online_input_mirror', { current, total }),
          })
        },
      })
      alertRef.current?.setVisible(false)
    } finally {
      setBtn({ disabled: false, text: t('user_api_btn_import_online_input_confirm') })
    }
  }

  return visible ? (
    <ConfirmAlert
      ref={alertRef}
      onConfirm={handleImport}
      disabledConfirm={btn.disabled}
      confirmText={btn.text}
    >
      <View style={styles.reurlContent}>
        <Text style={{ marginBottom: 5 }}>{t('user_api_btn_import_online')}</Text>
        <UrlInput ref={urlInputRef} />
      </View>
    </ConfirmAlert>
  ) : null
})

const styles = createStyle({
  reurlContent: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
  },
  inputContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 290,
    borderRadius: 4,
    paddingTop: 5,
    paddingBottom: 5,
  },
})