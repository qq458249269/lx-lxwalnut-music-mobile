package com.luna.music.visualizer;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

/**
 * 把 VisualizerBarView 暴露给 RN：<VisualizerBarView />
 * props: audioSessionId(int, 挂载频谱, <=0 用系统全局 session) / mode(int, 0=bar 1=wave) / active(bool)
 */
public class VisualizerBarViewManager extends SimpleViewManager<VisualizerBarView> {
  public static final String REACT_CLASS = "VisualizerBarView";

  @NonNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @NonNull
  @Override
  protected VisualizerBarView createViewInstance(@NonNull ThemedReactContext reactContext) {
    return new VisualizerBarView(reactContext);
  }

  @ReactProp(name = "audioSessionId")
  public void setAudioSessionId(VisualizerBarView view, int sessionId) {
    view.updateSessionId(sessionId);
  }

  @ReactProp(name = "mode")
  public void setMode(VisualizerBarView view, int mode) {
    view.setMode(mode);
  }

  @ReactProp(name = "active")
  public void setActive(VisualizerBarView view, boolean active) {
    view.setActive(active);
  }

  @Override
  public void onDropViewInstance(@NonNull VisualizerBarView view) {
    view.detachAudioSession();
    super.onDropViewInstance(view);
  }
}