const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/metadata/MetadataManager.java');

try {
  let buf = fs.readFileSync(file);
  let str = buf.toString('utf8');

  if (str.includes('ACTION_REWIND') && str.includes('ACTION_SKIP_TO_PREVIOUS')) {
    // We aim to swap:
    // addAction(previousAction, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS, compact);
    // addAction(rewindAction, PlaybackStateCompat.ACTION_REWIND, compact);

    // With regex to handle any newline (\r, \n, \r\n), any spaces
    let regex = /(addAction\(previousAction,\s*PlaybackStateCompat\.ACTION_SKIP_TO_PREVIOUS,\s*compact\);)([\s\r\n]*)(addAction\(rewindAction,\s*PlaybackStateCompat\.ACTION_REWIND,\s*compact\);)/g;

    if (regex.test(str)) {
      console.log('Found the lines to swap. Doing replacement...');
      str = str.replace(regex, "$3$2$1");
      fs.writeFileSync(file, str, 'utf8');
      console.log('Successfully swapped REWIND and SKIP_TO_PREVIOUS lines in java file.');
    } else {
      console.log('Regex did not match. Let me check if they are already swapped.');
      let regexSwapped = /(addAction\(rewindAction,\s*PlaybackStateCompat\.ACTION_REWIND,\s*compact\);)([\s\r\n]*)(addAction\(previousAction,\s*PlaybackStateCompat\.ACTION_SKIP_TO_PREVIOUS,\s*compact\);)/g;
      if (regexSwapped.test(str)) {
        console.log('They are ALREADY swapped!');
      } else {
        console.log('Could not find the lines at all. Here is a snippet around addAction:');
        let index = str.indexOf('addAction(');
        console.log(str.substring(index - 50, index + 300));
      }
    }
  } else {
    console.log('File does not contain expected ACTION strings.');
  }

  if (!str.includes('setShowWhen(false)')) {
    let target = 'builder = new NotificationCompat.Builder(service, channel);';
    if (str.includes(target)) {
      str = str.replace(target, 'builder = new NotificationCompat.Builder(service, channel).setShowWhen(false);');
      console.log('Successfully removed timestamp from notification.');
      fs.writeFileSync(file, str, 'utf8');
    } else {
      let fallback = 'builder.setSmallIcon(R.drawable.play);';
      if (str.includes(fallback)) {
        str = str.replace(fallback, fallback + '\\n        builder.setShowWhen(false);');
        console.log('Patched via fallback setSmallIcon to remove timestamp');
        fs.writeFileSync(file, str, 'utf8');
      }
    }
  } else {
    console.log('Timestamp already removed!');
  }

} catch (e) {
  console.error("Error patching java file:", e.message);
}

// ---- 原生律动频谱:给 TrackPlayer 暴露 getAudioSessionId（只读） ----
// 不注入 setAudioSessionId（那会干扰播放器音频/audioOffload 导致播放失败）。
// 改为暴露只读的 getAudioSessionId()：从 ExoPlayer 拿真实 session，
// 原生律动用 Visualizer(真实session) attach 捕获频谱（同 uid 无需 RECORD_AUDIO）。
// patch 内容：ExoPlayback.java 加 getAudioSessionId()，MusicModule.java 加 @ReactMethod，
//          lib/trackPlayer.js + .d.ts 暴露同名方法。
const TP_ROOT = path.join(__dirname, 'node_modules/react-native-track-player');
try {
  // 1) ExoPlayback.java: 加 getAudioSessionId()
  const exoFile = path.join(TP_ROOT, 'android/src/main/java/com/guichaguri/trackplayer/service/player/ExoPlayback.java');
  let exo = fs.readFileSync(exoFile, 'utf8');
  const exoGetter = `    public int getAudioSessionId() {
        return ((androidx.media3.exoplayer.ExoPlayer) player).getAudioSessionId();
    }`;
  if (exo.includes('public int getAudioSessionId()')) {
    console.log('ExoPlayback: getAudioSessionId already added.');
  } else {
    const anchor = `    public long getPosition() {
        return player.getCurrentPosition();
    }`;
    if (exo.includes(anchor)) {
      exo = exo.replace(anchor, anchor + '\n\n' + exoGetter);
      fs.writeFileSync(exoFile, exo, 'utf8');
      console.log('ExoPlayback: added getAudioSessionId().');
    } else {
      console.log('ExoPlayback: could not locate getPosition() anchor.');
    }
  }
} catch (e) { console.error('Error patching ExoPlayback.java:', e.message); }

try {
  // 2) MusicModule.java: 加 @ReactMethod getAudioSessionId
  const mmFile = path.join(TP_ROOT, 'android/src/main/java/com/guichaguri/trackplayer/module/MusicModule.java');
  let mm = fs.readFileSync(mmFile, 'utf8');
  const mmMethod = `    @ReactMethod
    public void getAudioSessionId(final Promise callback) {
        waitForConnection(() -> {
            int id = binder.getPlayback().getAudioSessionId();
            callback.resolve(id == C.AUDIO_SESSION_ID_UNSET ? 0 : id);
        });
    }`;
  if (mm.includes('public void getAudioSessionId(final Promise callback)')) {
    console.log('MusicModule: getAudioSessionId already added.');
  } else {
    // 插到 getPosition 方法后
    const anchor = `        });
    }

    @ReactMethod
    public void getState(final Promise callback) {`;
    if (mm.includes(anchor)) {
      mm = mm.replace(anchor, `        });
    }

${mmMethod}

    @ReactMethod
    public void getState(final Promise callback) {`);
      fs.writeFileSync(mmFile, mm, 'utf8');
      console.log('MusicModule: added getAudioSessionId @ReactMethod.');
    } else {
      console.log('MusicModule: could not locate getState() anchor.');
    }
  }
} catch (e) { console.error('Error patching MusicModule.java:', e.message); }

try {
  // 3) lib/trackPlayer.js: 定义 getAudioSessionId 函数（编译产物，async 模式同 getPosition）+ 暴露 getter
  const libFile = path.join(TP_ROOT, 'lib/trackPlayer.js');
  let lib = fs.readFileSync(libFile, 'utf8');
  const fnDef = `function getAudioSessionId() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!isSetupedPlayer)
                        return [2 /*return*/, Promise.resolve(0)];
                    return [4 /*yield*/, TrackPlayer.getAudioSessionId()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}`;
  if (lib.includes('function getAudioSessionId()')) {
    console.log('lib/trackPlayer.js: getAudioSessionId function already added.');
  } else {
    // 在 getState 函数前插入（getPosition 之后）
    const anchor = 'function getState() {';
    if (lib.includes(anchor)) {
      lib = lib.replace(anchor, fnDef + '\n' + anchor);
      fs.writeFileSync(libFile, lib, 'utf8');
      console.log('lib/trackPlayer.js: added getAudioSessionId function.');
    } else {
      console.log('lib/trackPlayer.js: could not locate getState() anchor.');
    }
  }
  // 暴露 getter：getPosition: getPosition, 后加
  if (lib.includes('getAudioSessionId: getAudioSessionId')) {
    console.log('lib/trackPlayer.js: getter already exposed.');
  } else {
    const getterAnchor = 'getPosition: getPosition,';
    if (lib.includes(getterAnchor)) {
      lib = lib.replace(getterAnchor, getterAnchor + '\n    getAudioSessionId: getAudioSessionId,');
      fs.writeFileSync(libFile, lib, 'utf8');
      console.log('lib/trackPlayer.js: exposed getAudioSessionId getter.');
    } else {
      console.log('lib/trackPlayer.js: could not locate getPosition getter.');
    }
  }
} catch (e) { console.error('Error patching lib/trackPlayer.js:', e.message); }

try {
  // 4) lib/trackPlayer.d.ts: 加 getAudioSessionId 声明
  const dtsFile = path.join(TP_ROOT, 'lib/trackPlayer.d.ts');
  let dts = fs.readFileSync(dtsFile, 'utf8');
  if (dts.includes('declare function getAudioSessionId')) {
    console.log('lib/trackPlayer.d.ts: getAudioSessionId already declared.');
  } else {
    // declare function + interface 里的 getter
    const fnAnchor = 'declare function getPosition(): Promise<number>;';
    if (dts.includes(fnAnchor)) {
      dts = dts.replace(fnAnchor, fnAnchor + '\ndeclare function getAudioSessionId(): Promise<number>;');
    }
    const ifaceAnchor = 'getPosition: typeof getPosition;';
    if (dts.includes(ifaceAnchor)) {
      dts = dts.replace(ifaceAnchor, ifaceAnchor + '\n    getAudioSessionId: typeof getAudioSessionId;');
    }
    fs.writeFileSync(dtsFile, dts, 'utf8');
    console.log('lib/trackPlayer.d.ts: added getAudioSessionId declarations.');
  }
} catch (e) { console.error('Error patching lib/trackPlayer.d.ts:', e.message); }

// ---- 律动 error -3:运行时切换 audioOffload ----
// audioOffload 开启时 ExoPlayer 走 DSP 硬解，Visualizer 无法 attach(error -3)。
// 暴露 setAudioOffload(boolean)：运行时改 TrackSelectionParameters 关闭 offload + seek 重解。
// 律动 active 时 JS 调 TrackPlayer.setAudioOffload(false)，失活恢复 true。
try {
  // 1) ExoPlayback.java 加 setAudioOffload
  const exoFile = path.join(TP_ROOT, 'android/src/main/java/com/guichaguri/trackplayer/service/player/ExoPlayback.java');
  let exo = fs.readFileSync(exoFile, 'utf8');
  if (exo.includes('public void setAudioOffload(boolean enable)')) {
    console.log('ExoPlayback: setAudioOffload already added.');
  } else {
    const anchor = `    public int getAudioSessionId() {
        return ((androidx.media3.exoplayer.ExoPlayer) player).getAudioSessionId();
    }`;
    const add = `
    /** 运行时切换 audioOffload（关闭后 Visualizer 才能捕获频谱；seek 触发重新解码） */
    public void setAudioOffload(boolean enable) {
        try {
            androidx.media3.exoplayer.ExoPlayer exo = (androidx.media3.exoplayer.ExoPlayer) player;
            androidx.media3.common.TrackSelectionParameters params = exo.getTrackSelectionParameters().buildUpon()
                .setAudioOffloadPreferences(new androidx.media3.common.TrackSelectionParameters.AudioOffloadPreferences.Builder()
                    .setAudioOffloadMode(enable
                        ? androidx.media3.common.TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_ENABLED
                        : androidx.media3.common.TrackSelectionParameters.AudioOffloadPreferences.AUDIO_OFFLOAD_MODE_DISABLED)
                    .build())
                .build();
            exo.setTrackSelectionParameters(params);
            exo.seekTo(0); // 触发重新解码以应用 offload 切换
        } catch (Exception ignore) {}
    }`;
    if (exo.includes(anchor)) {
      exo = exo.replace(anchor, anchor + add);
      fs.writeFileSync(exoFile, exo, 'utf8');
      console.log('ExoPlayback: added setAudioOffload().');
    } else {
      console.log('ExoPlayback: could not locate getAudioSessionId() anchor.');
    }
  }
} catch (e) { console.error('Error patching ExoPlayback setAudioOffload:', e.message); }

try {
  // 2) MusicModule.java 加 @ReactMethod setAudioOffload
  const mmFile = path.join(TP_ROOT, 'android/src/main/java/com/guichaguri/trackplayer/module/MusicModule.java');
  let mm = fs.readFileSync(mmFile, 'utf8');
  if (mm.includes('public void setAudioOffload')) {
    console.log('MusicModule: setAudioOffload already added.');
  } else {
    const anchor = `    public void getAudioSessionId(final Promise callback) {
        waitForConnection(() -> {
            int id = binder.getPlayback().getAudioSessionId();
            callback.resolve(id == C.AUDIO_SESSION_ID_UNSET ? 0 : id);
        });
    }`;
    const add = `
    @ReactMethod
    public void setAudioOffload(final boolean enable, final Promise callback) {
        waitForConnection(() -> {
            binder.getPlayback().setAudioOffload(enable);
            callback.resolve(null);
        });
    }`;
    if (mm.includes(anchor)) {
      mm = mm.replace(anchor, anchor + add);
      fs.writeFileSync(mmFile, mm, 'utf8');
      console.log('MusicModule: added setAudioOffload @ReactMethod.');
    } else {
      console.log('MusicModule: could not locate getAudioSessionId() anchor.');
    }
  }
} catch (e) { console.error('Error patching MusicModule setAudioOffload:', e.message); }

try {
  // 3) lib/trackPlayer.js + .d.ts 暴露 setAudioOffload
  const libFile = path.join(TP_ROOT, 'lib/trackPlayer.js');
  let lib = fs.readFileSync(libFile, 'utf8');
  if (lib.includes('function setAudioOffload')) {
    console.log('lib: setAudioOffload already added.');
  } else {
    const fnAnchor = 'function getState() {';
    const fn = `function setAudioOffload(enable) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!isSetupedPlayer)
                        return [2 /*return*/, Promise.resolve()];
                    return [4 /*yield*/, TrackPlayer.setAudioOffload(enable)];
                case 1: return [2 /*return*/];
            }
        });
    });
}
function getState() {`;
    if (lib.includes(fnAnchor)) {
      lib = lib.replace(fnAnchor, fn, 1);
      const g = 'getAudioSessionId: getAudioSessionId,';
      if (lib.includes(g)) lib = lib.replace(g, g + '\n    setAudioOffload: setAudioOffload,');
      fs.writeFileSync(libFile, lib, 'utf8');
      console.log('lib/trackPlayer.js: added setAudioOffload fn + getter.');
    } else {
      console.log('lib: could not locate getState() anchor.');
    }
  }
  // d.ts
  const dtsFile = path.join(TP_ROOT, 'lib/trackPlayer.d.ts');
  let dts = fs.readFileSync(dtsFile, 'utf8');
  if (!dts.includes('setAudioOffload')) {
    dts = dts.replace('declare function getAudioSessionId(): Promise<number>;',
      'declare function getAudioSessionId(): Promise<number>;\ndeclare function setAudioOffload(enable: boolean): Promise<void>;');
    dts = dts.replace('    getAudioSessionId: typeof getAudioSessionId;',
      '    getAudioSessionId: typeof getAudioSessionId;\n    setAudioOffload: typeof setAudioOffload;');
    fs.writeFileSync(dtsFile, dts, 'utf8');
    console.log('lib/trackPlayer.d.ts: added setAudioOffload declarations.');
  }
} catch (e) { console.error('Error patching lib setAudioOffload:', e.message); }

// ---- 律动数据源:ExoPlayer AudioProcessor(替代系统 Visualizer) ----
// 小米 HyperOS 2 上系统 Visualizer 引擎初始化失败(error -3)无法取频谱。
// 改用 ExoPlayer AudioProcessor:在音频解码后 tap PCM 数据,自算 FFT 得频谱,
// 不依赖系统 Visualizer、不需要任何权限。audioOffload 必须为 false 才生效。
try {
  // 1) 生成 VisualizerAudioProcessor.java(同包,BaseAudioProcessor + 2048 FFT + volatile 快照)
  const vizFile = path.join(TP_ROOT, 'android/src/main/java/com/guichaguri/trackplayer/service/VisualizerAudioProcessor.java');
  if (fs.existsSync(vizFile)) {
    console.log('VisualizerAudioProcessor.java already exists.');
  } else {
    const code = `package com.guichaguri.trackplayer.service;

import android.content.Context;

import androidx.media3.common.audio.AudioFormat;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.common.audio.BaseAudioProcessor;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.audio.DefaultAudioSink;
import androidx.media3.exoplayer.audio.AudioSink;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * 音频频谱数据源(替代系统 Visualizer)。
 * 挂在 ExoPlayer AudioSink 链上,在解码后 tap PCM 16bit 数据,
 * 用迭代 radix-2 FFT 算频谱,volatile 静态快照供 UI 线程(VirtualizerBarView)读取。
 * 不依赖 android.media.audiofx.Visualizer(HyperOS 2 上初始化失败 error -3),无需权限。
 * 仅对 ENCODING_PCM_16BIT 生效;audioOffload 开启时被旁路(须保持关闭)。
 */
public class VisualizerAudioProcessor extends BaseAudioProcessor {
  public static final int BUCKETS = 64;
  public static final int FFT_SIZE = 2048;

  private static volatile float[] sLevels = new float[BUCKETS];
  private static volatile float[] sWave = new float[BUCKETS];
  private static volatile boolean sHasData = false;
  private static volatile boolean sEnabled = false;
  private static volatile int sSampleRate = 44100;

  // 输入累积缓冲
  private final short[] mSamples = new short[FFT_SIZE];
  private int mSampleCount = 0;

  /** 供律动 View 读取当前频谱快照 */
  public static float[] levels() { return sLevels; }
  public static float[] wave() { return sWave; }
  public static boolean hasData() { return sHasData; }

  /** 律动启用开关:关闭时透传但跳过 FFT */
  public static void setEnabled(boolean enabled) {
    sEnabled = enabled;
    if (!enabled) { sHasData = false; }
  }

  @Override
  public AudioFormat onConfigure(AudioFormat inputAudioFormat) {
    if (inputAudioFormat.encoding == AudioFormat.ENCODING_PCM_16BIT) {
      sSampleRate = inputAudioFormat.sampleRate;
      return inputAudioFormat;
    }
    return AudioFormat.NOT_SET;
  }

  @Override
  public void queueInput(ByteBuffer inputData) {
    if (!sEnabled) return; // 关时不累积,直接透传(由父类)
    ByteBuffer data = inputData.order(ByteOrder.LITTLE_ENDIAN);
    while (data.remaining() >= 2) {
      mSamples[mSampleCount++] = data.getShort();
      if (mSampleCount >= FFT_SIZE) {
        processWindow();
        mSampleCount = 0;
      }
    }
  }

  private void processWindow() {
    // 1) 波形:2048 -> 64 点抽稀,short/32768 归一
    float[] wave = new float[BUCKETS];
    for (int i = 0; i < BUCKETS; i++) {
      int idx = Math.min(FFT_SIZE - 1, i * FFT_SIZE / BUCKETS);
      wave[i] = mSamples[idx] / 32768f;
    }
    // 2) FFT:迭代 radix-2
    float[] re = new float[FFT_SIZE];
    float[] im = new float[FFT_SIZE];
    System.arraycopy(mSamples, 0, re, 0, FFT_SIZE);
    fft(re, im);
    // 3) 64 桶能量归一:1024 bin 分 64 桶,每桶 sqrt(能量和),同系统 Visualizer 归一
    float[] levels = new float[BUCKETS];
    int bins = FFT_SIZE / 2 - 1;
    float maxMag = 0;
    for (int i = 0; i < BUCKETS; i++) {
      int start = 1 + i * bins / BUCKETS;
      int end = Math.min(bins, 1 + (i + 1) * bins / BUCKETS);
      double sumSq = 0;
      for (int k = start; k < end; k++) {
        sumSq += re[k] * re[k] + im[k] * im[k];
      }
      float mag = (float) Math.sqrt(sumSq);
      levels[i] = Math.min(1f, mag / 100f);
      if (mag > maxMag) maxMag = mag;
    }
    if (maxMag > 2f) {
      sLevels = levels;
      sWave = wave;
      sHasData = true;
    }
  }

  private static void fft(float[] re, float[] im) {
    int n = re.length;
    // bit-reversal
    for (int i = 1, j = 0; i < n; i++) {
      int bit = n >> 1;
      for (; (j & bit) != 0; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        float tr = re[i]; re[i] = re[j]; re[j] = tr;
        float ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (int len = 2; len <= n; len <<= 1) {
      float ang = (float) (-2 * Math.PI / len);
      float wRe = (float) Math.cos(ang);
      float wIm = (float) Math.sin(ang);
      for (int i = 0; i < n; i += len) {
        float curRe = 1f, curIm = 0f;
        for (int k = 0; k < len / 2; k++) {
          int a = i + k;
          int b = i + k + len / 2;
          float tRe = curRe * re[b] - curIm * im[b];
          float tIm = curRe * im[b] + curIm * re[b];
          re[b] = re[a] - tRe;
          im[b] = im[a] - tIm;
          re[a] += tRe;
          im[a] += tIm;
          float nRe = curRe * wRe - curIm * wIm;
          curIm = curRe * wIm + curIm * wRe;
          curRe = nRe;
        }
      }
    }
  }

  /** 供 MusicManager 使用:创建挂载本 AudioProcessor 的 renderers factory */
  public static DefaultRenderersFactory createFactory(Context context) {
    return new DefaultRenderersFactory(context) {
      @Override
      protected AudioSink buildAudioSink(Context ctx, boolean enableFloatOutput, boolean enableAudioOutputPlaybackParams) {
        return new DefaultAudioSink.Builder(ctx)
            .setEnableFloatOutput(enableFloatOutput)
            .setEnableAudioOutputPlaybackParameters(enableAudioOutputPlaybackParams)
            .setAudioProcessors(new AudioProcessor[]{ new VisualizerAudioProcessor() })
            .build();
      }
    };
  }
}
`;
    fs.writeFileSync(vizFile, code, 'utf8');
    console.log('VisualizerAudioProcessor.java created.');
  }
} catch (e) { console.error('Error creating VisualizerAudioProcessor:', e.message); }

try {
  // 2) MusicManager.java:renderersFactory 改用 AudioProcessor factory
  const mmFile = path.join(TP_ROOT, 'android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java');
  let mm = fs.readFileSync(mmFile, 'utf8');
  if (mm.includes('VisualizerAudioProcessor.createFactory')) {
    console.log('MusicManager: AudioProcessor factory already applied.');
  } else {
    const anchor = 'DefaultRenderersFactory renderersFactory = new DefaultRenderersFactory(service);';
    if (mm.includes(anchor)) {
      mm = mm.replace(anchor, 'DefaultRenderersFactory renderersFactory = VisualizerAudioProcessor.createFactory(service);');
      fs.writeFileSync(mmFile, mm, 'utf8');
      console.log('MusicManager: renderersFactory -> VisualizerAudioProcessor.createFactory.');
    } else {
      console.log('MusicManager: could not locate renderersFactory line.');
    }
  }
} catch (e) { console.error('Error patching MusicManager factory:', e.message); }
