import { Alert } from 'react-native'
// import { exitApp } from '@/utils/common'
import { setJSExceptionHandler, setNativeExceptionHandler } from 'react-native-exception-handler'
import Clipboard from '@react-native-clipboard/clipboard'
import { log } from '@/utils/log'
import { toast } from './tools'

const errorHandler = (e: Error, isFatal: boolean) => {
  const excludedErrors = [
    'Failed to construct \'Response\'',
  ]
  if (isFatal) {
    if (excludedErrors.some((excludedError) => e.message.includes(excludedError))) {
      toast('应用遇到了错误，如果你有固定的重现方式，请截图并在 GitHub 反馈（并附上刚才你进行了什么操作，以及“设置-错误日志”的内容）')
    } else {
      // 完整错误信息（含堆栈），用于展示/复制
      const errorText = `${isFatal ? 'Fatal: ' : ''}${e.name}: ${e.message}${e.stack ? `\n\n${e.stack}` : ''}`
      // 自动复制到剪贴板，便于反馈
      try { Clipboard.setString(errorText) } catch {}
      Alert.alert(
        '💥Unexpected error occurred💥',
        `
  应用出 bug 了😭，错误信息已自动复制到剪贴板。请粘贴并反馈到 GitHub（附上刚才你进行了什么操作，以及“设置-错误日志”的内容）。现在应用可能会出现异常，若出现异常请尝试强制结束应用后重新启动！

  Error:
  ${errorText}
  `,
        [
          {
            text: '复制 (Copy)',
            onPress: () => {
              try { Clipboard.setString(errorText) } catch {}
              toast('错误信息已复制到剪贴板')
            },
          },
          {
            text: '关闭 (Close)',
            onPress: () => {
              // exitApp()
            },
          },
        ],
      )
    }
  }
  log.error(e.stack)
}

if (process.env.NODE_ENV !== 'development') {
  setJSExceptionHandler(errorHandler)

  setNativeExceptionHandler((errorString) => {
    log.error(errorString)
    console.log('+++++', errorString, '+++++')
  }, false)
}
