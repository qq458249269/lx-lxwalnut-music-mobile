package com.luna.music.visualizer;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.media.AudioManager;
import android.media.audiofx.Visualizer;
import android.os.HandlerThread;
import android.util.AttributeSet;
import android.util.Log;
import android.view.View;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;

/**
 * 原生律动可视化 View：音频频谱柱状图/波形
 *
 * 用 android.media.audiofx.Visualizer 挂到同 uid 进程的 audioSession（TrackPlayer 固定 session 1000），
 * 周期回调 FFT 数据，onDraw 直接画 bar(柱状)/wave(波形) 两种形态。
 * 数据到绘制全在 native，不经过 RN bridge，性能优先。
 *
 * 不依赖任何权限：只 attach 同 uid 的现存 session（固定 session 1000 / 反射 getAudioSessions 兜底），
 * 不触碰 Visualizer(0) 全局捕获（那才需要 RECORD_AUDIO）。attach 失败时画空闲柱子而非报错。
 */
public class VisualizerBarView extends View {
  // 律动形态
  public static final int MODE_BARS = 0;
  public static final int MODE_WAVE = 1;
  private static final int BUCKETS = 64;

  private Visualizer mVisualizer = null;
  private int mMode = MODE_BARS;
  private final int mBarColor = 0xFF00D4FF; // 青蓝
  private final int mBarColor2 = 0xFFFF3D8E; // 品红（渐变尾）
  private int mAudioSessionId = -1;
  private boolean mAttached = false;
  /** 是否收到过有效数据 */
  private volatile boolean mGotData = false;

  private final Paint mPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

  // FFT 采样 rate：getMaxCaptureRate() 部分设备返回 0，需下限兜底
  private static final int MAX_CAPTURE_RATE = Visualizer.getMaxCaptureRate() > 0
      ? Visualizer.getMaxCaptureRate() : 20000;
  private final int mCaptureRate = Math.min(MAX_CAPTURE_RATE, 30000); // Hz，取 min(系统上限, 30fps)
  private final float[] mLevels = new float[BUCKETS];
  private final float[] mSmoothed = new float[BUCKETS];
  private final float[] mWave = new float[BUCKETS];

  // 平滑
  private final float mSmoothFactor = 0.65f;
  private final float mDecay = 0.9f;

  // 3D 透视 + 粒子
  private boolean mThreeD = true;
  private final Paint mParticlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);

  // 粒子
  private static class Particle {
    float x, y, vx, vy, size, alpha, decay;
    float r, g, b;
  }
  private final List<Particle> mParticles = new ArrayList<>(256);
  private static final int MAX_PARTICLES = 256;
  private long mLastFrameTime = System.currentTimeMillis();

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
            float maxAmp = 0f;
            for (int i = 0; i < mWave.length; i++) {
              int idx = Math.min(n - 1, i * step);
              float v = ((float) (waveform[idx] & 0xFF) - 128f) / 128f;
              mWave[i] = v;
              if (Math.abs(v) > maxAmp) maxAmp = Math.abs(v);
            }
            if (maxAmp > 0.02f) mGotData = true;
            postInvalidate();
          }
        }

        @Override
        public void onFftDataCapture(Visualizer visualizer, byte[] fft, int samplingRate) {
          // 柱状模式：FFT 幅值
          if (mMode != MODE_BARS) return;
          int n = Math.min(fft.length, 256);
          if (n < 4) return; // 数据太少不绘制，防越界
          // fft 格式：fft[0]=DC(实)，fft[1]=Nyquist(实)，之后每格 [real, imag]
          // bin k (k>=1) 的实部在 fft[2k]，虚部在 fft[2k+1]
          int bins = Math.max(1, n / 2 - 1); // 可用 bin 数（不含 DC 与 Nyquist）
          float maxMag = 0f;
          for (int i = 0; i < BUCKETS; i++) {
            // 每个桶覆盖 bins/BUCKETS 个 bin，取能量和
            int start = 1 + i * bins / BUCKETS;
            int end = Math.min(bins, 1 + (i + 1) * bins / BUCKETS);
            double sumSq = 0;
            for (int k = start; k < end; k++) {
              int real = fft[2 * k];
              int imag = fft[2 * k + 1];
              sumSq += real * real + imag * imag;
            }
            float mag = (float) Math.sqrt(sumSq);
            mLevels[i] = Math.min(1f, mag / 100f);
            if (mag > maxMag) maxMag = mag;
          }
          if (maxMag > 2f) mGotData = true;
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
    Log.d("RhythmDebug", "setActive active=" + active + " (was " + mActive + ")");
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

  /** 尝试挂载指定 audio session 的频谱；成功返回 true */
  private boolean tryAttach(int sessionId) {
    try {
      if (mVisualizer != null) {
        try { mVisualizer.release(); } catch (Exception ignore) {}
        mVisualizer = null;
      }
      mVisualizer = new Visualizer(sessionId);
      mVisualizer.setCaptureSize(Visualizer.getCaptureSizeRange()[1]);
      mVisualizer.setDataCaptureListener(
          mDataListener,
          mCaptureRate,
          true, // wave
          true  // fft
      );
      mVisualizer.setEnabled(true);
      mAttached = true;
      mAudioSessionId = sessionId;
      Log.d("RhythmDebug", "attach OK session=" + sessionId + " captureRate=" + mCaptureRate);
      return true;
    } catch (Exception e) {
      if (mVisualizer != null) {
        try { mVisualizer.release(); } catch (Exception ignore) {}
        mVisualizer = null;
      }
      mAttached = false;
      Log.e("RhythmDebug", "attach FAIL session=" + sessionId + " err=" + e.getClass().getSimpleName() + ": " + e.getMessage());
      return false;
    }
  }

  /** 遍历系统当前活跃的 audio session（同 uid 无需 RECORD_AUDIO），尝试捕获。
   *  getAudioSessions 是隐藏 API（@hide），需反射调用，避免编译报 cannot find symbol。 */
  private boolean tryAttachActiveSessions(AudioManager am) {
    try {
      java.lang.reflect.Method m = AudioManager.class.getMethod("getAudioSessions");
      m.setAccessible(true);
      int[] sessions = (int[]) m.invoke(am);
      if (sessions == null) return false;
      for (int sid : sessions) {
        if (sid <= 0) continue;
        if (tryAttach(sid)) return true;
      }
    } catch (Exception ignore) {}
    return false;
  }

  /** 设置 audioSessionId 并挂载频谱采样（幂等：已 attach 相同 session 则忽略）
   *  只 attach 同 uid 的现存 session（固定 session / 反射兜底），不触碰全局 session(0)。
   *  全部失败时画空闲柱子（mAttached=false），不请求任何权限。 */
  public void attachAudioSession(int audioSessionId) {
    if (audioSessionId == mAudioSessionId && mAttached) return;
    detachAudioSession(); // 换 session 前先释放旧的
    mAudioSessionId = audioSessionId;
    mGotData = false;
    Log.d("RhythmDebug", "attachAudioSession target=" + audioSessionId + " active=" + mActive);
    // 后台线程采，避免卡 UI
    mCaptureThread = new HandlerThread("visualizer-capture");
    mCaptureThread.start();

    AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    int target = audioSessionId;

    // 1) 固定/指定 session（>0 同 uid 捕获无需权限）
    if (target > 0) {
      if (tryAttach(target)) { postInvalidate(); return; }
    }

    // 2) 遍历系统活跃 session 兜底（如 audioOffload 覆盖了固定 id）
    if (am != null && tryAttachActiveSessions(am)) {
      postInvalidate();
      return;
    }

    // 全部失败：不报错，画空闲柱子（等下次 updateSessionId 重试）
    mAttached = false;
    postInvalidate();
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
    mParticles.clear();
    postInvalidate();
  }

  public void setMode(int mode) {
    mMode = mode;
    Arrays.fill(mSmoothed, 0f);
    postInvalidate();
  }

  /** 3D 透视 + 粒子开关：关则回退平面柱状 */
  public void setThreeD(boolean threeD) {
    mThreeD = threeD;
    if (!threeD) mParticles.clear();
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
    // 未 attach 或未拿到数据：画空闲柱子（低矮静态），不显示错误/权限提示
    if (!mAttached || !mGotData) {
      drawIdleBars(canvas);
      return;
    }
    if (mMode == MODE_WAVE) {
      drawWave(canvas);
    } else if (mThreeD) {
      drawBars3D(canvas);
      // 粒子叠加在 3D 柱状之上
      updateParticles();
      drawParticles(canvas);
    } else {
      drawBars(canvas);
    }
  }

  /** 空闲/未获取数据时：画一排低矮静态柱子，避免空白或报错文案 */
  private void drawIdleBars(Canvas canvas) {
    int w = getWidth();
    int h = getHeight();
    if (w <= 0 || h <= 0) return;

    float gap = w * 0.006f;
    float barW = (w - gap * (BUCKETS - 1)) / BUCKETS;
    float midY = h * 0.5f;
    Shader shader = new LinearGradient(0, h, 0, 0, mBarColor, mBarColor2, Shader.TileMode.CLAMP);
    mPaint.setShader(shader);
    for (int i = 0; i < BUCKETS; i++) {
      // 轻微起伏模拟待机态
      float v = 0.06f + 0.03f * ((i * 7) % 5) / 4f;
      float barH = Math.max(2f, v * h * 0.9f);
      float left = i * (barW + gap);
      canvas.drawRect(left, midY - barH / 2f, left + barW, midY + barH / 2f, mPaint);
    }
    mPaint.setShader(null);
  }

  private void drawBars(Canvas canvas) {
    int w = getWidth();
    int h = getHeight();
    if (w <= 0 || h <= 0) return;

    float gap = w * 0.006f;
    float barW = (w - gap * (BUCKETS - 1)) / BUCKETS;
    float midY = h * 0.5f;

    // 线性渐变：青蓝 -> 品红
    Shader shader = new LinearGradient(0, h, 0, 0,
        mBarColor, mBarColor2, Shader.TileMode.CLAMP);
    mPaint.setShader(shader);

    for (int i = 0; i < BUCKETS; i++) {
      // 平滑上升、慢衰减，形成律动拖尾
      float target = mLevels[i];
      if (target > mSmoothed[i]) mSmoothed[i] = target;
      else mSmoothed[i] *= mDecay;
      float v = mSmoothed[i];
      float barH = Math.max(v > 0.001f ? h * 0.04f : 1f, v * h * 0.9f);
      float left = i * (barW + gap);
      canvas.drawRect(left, midY - barH / 2f, left + barW, midY + barH / 2f, mPaint);
    }
    mPaint.setShader(null);
  }

  /** 透视 3D 柱状：中间近两侧远，近大远小 + 底部汇聚，柱顶高光 */
  private void drawBars3D(Canvas canvas) {
    int w = getWidth();
    int h = getHeight();
    if (w <= 0 || h <= 0) return;

    float gap = w * 0.006f;
    float baseBarW = (w - gap * (BUCKETS - 1)) / BUCKETS;
    // 地平线：底部汇聚线（略高于底边，留出纵深空间）
    float horizonY = h * 0.78f;

    // 深度映射：中间(近)深度 1.0，两侧(远)深度 0.55，形成弧面隧道
    float[] depth = new float[BUCKETS];
    for (int i = 0; i < BUCKETS; i++) {
      float t = 2f * i / (BUCKETS - 1) - 1f; // -1..1
      depth[i] = 0.55f + 0.45f * (1f - Math.abs(t));
    }

    for (int i = 0; i < BUCKETS; i++) {
      // 平滑上升、慢衰减
      float target = mLevels[i];
      if (target > mSmoothed[i]) mSmoothed[i] = target;
      else mSmoothed[i] *= mDecay;
      float v = mSmoothed[i];
      if (v < 0.001f) continue;

      float d = depth[i];
      float scale = 0.6f + 0.4f * d; // 近大远小
      float barW = Math.max(1f, baseBarW * scale);
      // 柱子中心 X：两侧向中轴略微收拢（透视汇聚感）
      float cx = w * 0.5f + (i - (BUCKETS - 1) / 2f) * (baseBarW + gap) * d;
      float left = cx - barW / 2f;
      float right = cx + barW / 2f;

      float barH = Math.max(h * 0.03f, v * h * 0.68f * scale);
      float topY = horizonY - barH;
      float bottomY = horizonY;

      // 渐变：青蓝(顶) -> 品红(底)，按柱高取色
      Shader shader = new LinearGradient(0, topY, 0, bottomY, mBarColor, mBarColor2, Shader.TileMode.CLAMP);
      mPaint.setShader(shader);
      // 透视四边形：柱体（近端宽、远端窄通过 cx 缩放体现；这里画成矩形模拟 3D 柱面）
      canvas.drawRect(left, topY, right, bottomY, mPaint);

      // 柱顶高光小面：亮色横条模拟受光
      mPaint.setShader(null);
      mPaint.setColor(0x66FFFFFF);
      float topFaceH = Math.max(2f, barH * 0.06f);
      canvas.drawRect(left, topY, right, topY + topFaceH, mPaint);

      // 峰值迸发粒子（超过阈值才生成，控制数量）
      if (v > 0.35f && mParticles.size() < MAX_PARTICLES) {
        spawnParticles(cx, topY, v);
      }
    }
    mPaint.setShader(null);
    mPaint.setColor(0xFF000000);
  }

  // ---- 粒子系统 ----
  private void spawnParticles(float cx, float topY, float strength) {
    int count = 1 + (int) (strength * 3f);
    for (int k = 0; k < count && mParticles.size() < MAX_PARTICLES; k++) {
      Particle p = new Particle();
      p.x = cx + (float) (Math.random() * 6 - 3);
      p.y = topY;
      p.vx = (float) (Math.random() * 60 - 30);
      p.vy = (float) (Math.random() * 80 - 40); // 向上为主
      p.size = 2f + (float) Math.random() * 3f;
      p.alpha = 0.9f;
      p.decay = 0.85f + (float) Math.random() * 0.1f;
      // 粒子色：青蓝/品红 混合
      float mix = (float) Math.random();
      p.r = (1f - mix) * 0f + mix * 1f;
      p.g = (1f - mix) * 0.83f + mix * 0.24f;
      p.b = (1f - mix) * 1f + mix * 0.56f;
      mParticles.add(p);
    }
  }

  private void updateParticles() {
    long now = System.currentTimeMillis();
    float dt = Math.min(0.05f, (now - mLastFrameTime) / 1000f);
    mLastFrameTime = now;
    if (dt <= 0) return;
    Iterator<Particle> it = mParticles.iterator();
    while (it.hasNext()) {
      Particle p = it.next();
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180f * dt; // 重力下坠
      p.alpha *= (float) Math.pow(p.decay, dt * 60f);
      if (p.alpha < 0.02f || p.y > getHeight() + 20f) it.remove();
    }
  }

  private void drawParticles(Canvas canvas) {
    if (mParticles.isEmpty()) return;
    for (Particle p : mParticles) {
      mParticlePaint.setColor(Color.argb((int) (p.alpha * 255), (int) (p.r * 255), (int) (p.g * 255), (int) (p.b * 255)));
      canvas.drawCircle(p.x, p.y, p.size, mParticlePaint);
    }
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
    for (int i = 0; i < mWave.length; i++) {
      float target = mWave[i];
      mSmoothed[i] = mSmoothed[i] * mSmoothFactor + target * (1 - mSmoothFactor);
    }

    float step = w / (float) (mWave.length - 1);
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
