package com.luna.music.visualizer;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;
import java.util.HashMap;

/**
 * 把 VisualizerBarView 暴露给 RN：<VisualizerBarView />
 * props: audioSessionId(int, 固定 session, >0 同 uid 捕获无需权限) / mode(int, 0=bar 1=wave) / active(bool) / threeD(bool)
 * events: onRhythmLog(调试日志)
 */
public class VisualizerBarViewManager extends SimpleViewManager<VisualizerBarView> {
  public static final String REACT_CLASS = "VisualizerBarView";

  @NonNull
  @Override
  public String getName() {
    return REACT_CLASS;
  }

  @Override
  public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
    Map<String, Object> map = new HashMap<>();
    Map<String, Object> reg = new HashMap<>();
    reg.put("registrationName", "onRhythmLog");
    map.put("topRhythmLog", reg);
    return map;
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

  @ReactProp(name = "threeD")
  public void setThreeD(VisualizerBarView view, boolean threeD) {
    view.setThreeD(threeD);
  }

  @Override
  public void onDropViewInstance(@NonNull VisualizerBarView view) {
    view.detachAudioSession();
    super.onDropViewInstance(view);
  }
}
