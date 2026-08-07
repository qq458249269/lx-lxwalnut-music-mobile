package com.luna.music.visualizer;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.media.audiofx.Visualizer;
import android.os.HandlerThread;
import android.util.AttributeSet;
import android.view.View;

import java.util.Arrays;

/**
 * 律动可视化 View：native 播放器音频频谱柱状图/波形
 *
 * 用 android.media.audiofx.Visualizer 挂到正在播放的 audioSession，
 * 周期回调 FFT 数据，onDraw 直接画 bar(柱状)/wave(波形) 两种形态。
 * 数据到绘制全在 native，不经过 RN bridge，性能优先。
 */
public class VisualizerBarView extends View {
  // 律动形态
  public static final int MODE_BARS = 0;
  public static final int MODE_WAVE = 1;

  private Visualizer mVisualizer = null;
  private int mMode = MODE_BARS;
  private final int mBarColor = 0xFF00D4FF; // 青蓝
  private final int mBarColor2 = 0xFFFF3D8E; // 品红（渐变尾）
  private int mAudioSessionId = -1;
  private boolean mAttached = false;

  private final Paint mPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

  // FFT 采样
  private final int mCaptureRate = Visualizer.getMaxCaptureRate() > 0
      ? Math.min(Visualizer.getMaxCaptureRate(), 30000) : 30000; // Hz，限制 30fps
  private final float[] mLevels = new float[64];
  private final float[] mSmoothed = new float[64];
  private final float[] mWave = new float[64];

  // 平滑
  private final float mSmoothFactor = 0.65f;
  private final float mDecay = 0.9f;

  private HandlerThread mCaptureThread = null;

  private final Visualizer.OnDataCaptureListener mDataListener =
      new Visualizer.OnDataCaptureListener() {
        @Override
        public void onWaveFormDataCapture(Visualizer visualizer, byte[] waveform, int samplingRate) {
          // 波形模式：直接画 waveform
          if (mMode == MODE_WAVE) {
            int n = waveform.length;
            if (n == 0) return;
            int step = Math.max(1, n / mWave.length);
            for (int i = 0; i < mWave.length; i++) {
              int idx = Math.min(n - 1, i * step);
              mWave[i] = ((float) (waveform[idx] & 0xFF) - 128f) / 128f;
            }
            postInvalidate();
          }
        }

        @Override
        public void onFftDataCapture(Visualizer visualizer, byte[] fft, int samplingRate) {
          // 柱状模式：FFT 幅值
          if (mMode != MODE_BARS) return;
          int n = Math.min(fft.length, 256);
          if (n < 8) return; // 数据太少不绘制，防越界
          for (int i = 0; i < mLevels.length; i++) {
            // 每桶取多个 FFT bin 的幅度（平方和开根，对应能量）
            int idx0 = Math.min(n - 2, i * 4 + 2);
            int idx1 = Math.min(n - 2, idx0 + 3);
            int real = fft[idx0];
            int imag = fft[idx0 + 1];
            int real2 = fft[idx1];
            int imag2 = fft[idx1 + 1];
            float mag = (float) Math.sqrt(real * real + imag * imag + real2 * real2 + imag2 * imag2);
            mLevels[i] = Math.min(1f, mag / 120f);
          }
          postInvalidate();
        }
      };

  public VisualizerBarView(Context context) {
    super(context);
    init();
  }

  public VisualizerBarView(Context context, AttributeSet attrs) {
    super(context, attrs);
    init();
  }

  private void init() {
    mPaint.setStyle(Paint.Style.FILL);
    setWillNotDraw(false);
  }

  private boolean mActive = false;

  /** active 开关：为 false 立即释放频谱采样（性能：未进律动不采） */
  public void setActive(boolean active) {
    mActive = active;
    if (active) {
      attachAudioSession(mAudioSessionId);
    } else {
      detachAudioSession();
    }
  }

  /** 更新 sessionId：幂等（重复 set 同 id 不重复 attach） */
  public void updateSessionId(int audioSessionId) {
    if (audioSessionId == mAudioSessionId && mAttached) return;
    mAudioSessionId = audioSessionId;
    if (mActive) {
      attachAudioSession(audioSessionId);
    } else {
      detachAudioSession();
    }
  }

  /** 设置 audioSessionId 并挂载频谱采样（幂等：已 attach 相同 session 则忽略）
   *  sessionId<=0 时用 0（系统全局 session）兜底：ExoPlayer 播放时即本 app 输出 */
  public void attachAudioSession(int audioSessionId) {
    if (audioSessionId == mAudioSessionId && mAttached) return;
    detachAudioSession(); // 换 session 前先释放旧的
    mAudioSessionId = audioSessionId;
    try {
      // 后台线程采，避免卡 UI
      mCaptureThread = new HandlerThread("visualizer-capture");
      mCaptureThread.start();

      mVisualizer = new Visualizer(audioSessionId <= 0 ? 0 : audioSessionId);
      mVisualizer.setCaptureSize(Visualizer.getCaptureSizeRange()[1]);
      mVisualizer.setDataCaptureListener(
          mDataListener,
          mCaptureRate,
          true, // wave
          true  // fft
      );
      mVisualizer.setEnabled(true);
      mAttached = true;
    } catch (Exception e) {
      mAttached = false;
      if (mVisualizer != null) {
        try { mVisualizer.release(); } catch (Exception ignore) {}
        mVisualizer = null;
      }
    }
  }

  public void detachAudioSession() {
    mAttached = false;
    if (mCaptureThread != null) {
      mCaptureThread.quitSafely();
      mCaptureThread = null;
    }
    if (mVisualizer != null) {
      try {
        mVisualizer.setEnabled(false);
        mVisualizer.release();
      } catch (Exception ignore) {}
      mVisualizer = null;
    }
    Arrays.fill(mLevels, 0f);
    Arrays.fill(mSmoothed, 0f);
    Arrays.fill(mWave, 0f);
    postInvalidate();
  }

  public void setMode(int mode) {
    mMode = mode;
    Arrays.fill(mSmoothed, 0f);
    postInvalidate();
  }

  @Override
  protected void onDetachedFromWindow() {
    super.onDetachedFromWindow();
    detachAudioSession();
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    if (mMode == MODE_WAVE) {
      drawWave(canvas);
    } else {
      drawBars(canvas);
    }
  }

  private void drawBars(Canvas canvas) {
    int w = getWidth();
    int h = getHeight();
    if (w <= 0 || h <= 0) return;

    int n = mLevels.length;
    float gap = w * 0.006f;
    float barW = (w - gap * (n - 1)) / n;
    float midY = h * 0.5f;

    // 线性渐变：青蓝 -> 品红
    Shader shader = new LinearGradient(0, h, 0, 0,
        mBarColor, mBarColor2, Shader.TileMode.CLAMP);
    mPaint.setShader(shader);

    for (int i = 0; i < n; i++) {
      // 平滑上升、慢衰减，形成律动拖尾
      float target = mLevels[i];
      if (target > mSmoothed[i]) mSmoothed[i] = target;
      else mSmoothed[i] *= mDecay;
      float v = mSmoothed[i];
      float barH = Math.max(2f, v * h * 0.9f);
      float left = i * (barW + gap);
      canvas.drawRect(left, midY - barH / 2f, left + barW, midY + barH / 2f, mPaint);
    }
    mPaint.setShader(null);
  }

  private void drawWave(Canvas canvas) {
    int w = getWidth();
    int h = getHeight();
    if (w <= 0 || h <= 0) return;

    int n = mWave.length;
    if (n < 2) return;

    float midY = h * 0.5f;
    mPaint.setShader(null);
    mPaint.setStyle(Paint.Style.STROKE);
    mPaint.setStrokeWidth(Math.max(2f, h * 0.02f));
    mPaint.setStrokeCap(Paint.Cap.ROUND);
    mPaint.setStrokeJoin(Paint.Join.ROUND);
    mPaint.setColor(mBarColor);

    // 平滑
    for (int i = 0; i < n; i++) {
      float target = mWave[i];
      mSmoothed[i] = mSmoothed[i] * mSmoothFactor + target * (1 - mSmoothFactor);
    }

    float step = w / (float) (n - 1);
    android.graphics.Path path = new android.graphics.Path();
    path.moveTo(0, midY + mSmoothed[0] * h * 0.4f);
    for (int i = 1; i < n; i++) {
      float x = i * step;
      float y = midY + mSmoothed[i] * h * 0.4f;
      path.lineTo(x, y);
    }
    canvas.drawPath(path, mPaint);
    mPaint.setStyle(Paint.Style.FILL);
  }
}
