import { View } from 'react-native';
import { useSettingValue } from '@/store/setting/hook';
import { updateSetting } from '@/core/common';
import { useI18n } from '@/lang';
import CheckBox from '@/components/common/CheckBox';
import Slider from '@/components/common/Slider';
import Text from '@/components/common/Text';
import { useTheme } from '@/store/theme/hook';
import styles from './style';

/** 律动特效设置：开关 + 形态(柱状/波形) + 透明度 */
export default () => {
  const t = useI18n();
  const theme = useTheme();
  const enabled = useSettingValue('playDetail.visualizer.enable');
  const mode = useSettingValue('playDetail.visualizer.mode');
  const opacity = useSettingValue('playDetail.visualizer.opacity');
  const threeD = useSettingValue('playDetail.visualizer.threeD');
  const debugLog = useSettingValue('playDetail.visualizer.debugLog');

  const setEnabled = (v: boolean) => updateSetting({ 'playDetail.visualizer.enable': v });
  const setMode = (m: number) => updateSetting({ 'playDetail.visualizer.mode': m });
  const setOpacity = (v: number) => updateSetting({ 'playDetail.visualizer.opacity': v });
  const setThreeD = (v: boolean) => updateSetting({ 'playDetail.visualizer.threeD': v });
  const setDebugLog = (v: boolean) => updateSetting({ 'playDetail.visualizer.debugLog': v });

  return (
    <>
      <View style={styles.container}>
        <View style={styles.content}>
          <CheckBox
            check={enabled}
            label={t('play_detail_setting_visualizer_enable')}
            onChange={setEnabled}
          />
        </View>
      </View>
      {enabled ? (
        <>
          <View style={styles.container}>
            <View style={styles.content}>
              <CheckBox
                check={mode === 0}
                label={`${t('play_detail_setting_visualizer_mode')} · ${t('play_detail_setting_visualizer_mode_bar')}`}
                onChange={() => setMode(0)}
                marginRight={20}
              />
              <CheckBox
                check={mode === 1}
                label={t('play_detail_setting_visualizer_mode_wave')}
                onChange={() => setMode(1)}
              />
            </View>
          </View>
          <View style={styles.container}>
            <View style={styles.content}>
              <CheckBox
                check={mode === 2}
                label={t('play_detail_setting_visualizer_mode_ring_bars')}
                onChange={() => setMode(2)}
                marginRight={20}
              />
              <CheckBox
                check={mode === 3}
                label={t('play_detail_setting_visualizer_mode_ring_wave')}
                onChange={() => setMode(3)}
              />
            </View>
          </View>
          <View style={styles.container}>
            <View style={styles.content}>
              <CheckBox
                check={mode === 4}
                label={t('play_detail_setting_visualizer_mode_mirror')}
                onChange={() => setMode(4)}
                marginRight={20}
              />
              <CheckBox
                check={mode === 5}
                label={t('play_detail_setting_visualizer_mode_radial')}
                onChange={() => setMode(5)}
              />
            </View>
          </View>
          <View style={styles.container}>
            <View style={styles.content}>
              <CheckBox
                check={threeD}
                label={t('play_detail_setting_visualizer_3d')}
                onChange={setThreeD}
              />
            </View>
          </View>
          <View style={styles.container}>
            <View style={styles.content}>
              <CheckBox
                check={debugLog}
                label={t('play_detail_setting_visualizer_debug_log')}
                onChange={setDebugLog}
              />
            </View>
          </View>
          <View style={styles.container}>
            <View style={styles.content}>
              <Text style={styles.label} color={theme['c-font']}>{t('play_detail_setting_visualizer_opacity')}</Text>
              <Slider
                minimumValue={0.1}
                maximumValue={0.8}
                step={0.05}
                value={opacity}
                onValueChange={setOpacity}
              />
            </View>
          </View>
        </>
      ) : null}
    </>
  );
};
