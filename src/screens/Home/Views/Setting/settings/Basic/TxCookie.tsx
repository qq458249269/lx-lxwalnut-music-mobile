import { memo, useEffect } from 'react';
import { View } from 'react-native';
import InputItem, { type InputItemProps } from '../../components/InputItem';
import { useI18n } from '@/lang';
import { useSettingValue } from '@/store/setting/hook';
import { updateSetting } from '@/core/common';
import { createStyle } from '@/utils/tools';
import Button from '../../components/Button';
import CookieManager from '@react-native-cookies/cookies';

const syncCookieToNative = async (cookie: string) => {
  const domain = 'https://y.qq.com';
  try {
    await CookieManager.clearAll(true);

    if (cookie) {
      const cookiePairs = cookie.split(';').map(pair => pair.trim());
      for (const pair of cookiePairs) {
        const [name, ...valueParts] = pair.split('=');
        if (name && valueParts.length > 0) {
          await CookieManager.set(domain, {
            name: name.trim(),
            value: valueParts.join('=').trim(),
            domain: '.qq.com',
            path: '/',
          });
        }
      }
    }
    console.log('QQ cookie synchronized successfully.');
  } catch (error) {
    console.error('Failed to sync QQ cookie:', error);
  }
};

export default memo(() => {
  const t = useI18n();
  const cookie = useSettingValue('common.tx_cookie');

  const setCookie = (val: string) => {
    void syncCookieToNative(val).then(() => {
      updateSetting({ 'common.tx_cookie': val });
    });
  };

  const handleChanged: InputItemProps['onChanged'] = (text, callback) => {
    callback(text);
    setCookie(text);
  };

  const handleShowLoginModal = () => {
    global.app_event.emit('showTxWebLogin');
  };

  useEffect(() => {
    const handleCookieSet = (cookie: string) => {
      setCookie(cookie);
    };

    global.app_event.on('tx-cookie-set', handleCookieSet);
    return () => {
      global.app_event.off('tx-cookie-set', handleCookieSet);
    };
  }, []);

  return (
    <View style={styles.content}>
      <InputItem
        value={cookie}
        label={t('setting_basic_tx_cookie')}
        onChanged={handleChanged}
        placeholder={t('setting_basic_tx_cookie_placeholder')}
      />
      <View style={styles.btnContainer}>
        <Button onPress={handleShowLoginModal}>QQ网页登录</Button>
      </View>
    </View>
  );
});

const styles = createStyle({
  content: {
    // marginTop: 10,
  },
  btnContainer: {
    marginBottom: 5,
    paddingLeft: 20,
    flexDirection: 'row',
  },
});