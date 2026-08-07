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

// ---- 律动频谱:给 TrackPlayer 的 ExoPlayer 注入固定 audio session id ----
// Android Visualizer 对同 uid 进程的现存 audio session attach 无需 RECORD_AUDIO 权限，
// 用固定 id(1000) 让律动能稳定捕获频谱，规避 Visualizer(0) 全局捕获的权限/error -3 问题。
try {
  const musicManagerFile = path.join(__dirname, 'node_modules/react-native-track-player/android/src/main/java/com/guichaguri/trackplayer/service/MusicManager.java');
  let mm = fs.readFileSync(musicManagerFile, 'utf8');

  if (mm.includes('setAudioSessionId(1000)')) {
    console.log('MusicManager: fixed audio session id already injected.');
  } else {
    // 在 ExoPlayer build 之后、setTrackSelectionParameters 之前注入固定 session id
    const buildAnchor = 'ExoPlayer player = new ExoPlayer.Builder(service, renderersFactory)\n                .setLoadControl(control)\n                .setWakeMode(WAKE_MODE_NONE)\n                .build();';
    if (mm.includes(buildAnchor)) {
      mm = mm.replace(buildAnchor, buildAnchor + '\n\n        // (patch) fixed audio session id for visualizer spectrum capture\n        player.setAudioSessionId(1000);');
      fs.writeFileSync(musicManagerFile, mm, 'utf8');
      console.log('MusicManager: injected fixed audio session id (1000).');
    } else {
      // 兼容不同缩进/换行
      const loose = /(\n\s*\.setWakeMode\(WAKE_MODE_NONE\)\s*\n\s*\.build\(\);\s*)/;
      if (loose.test(mm)) {
        mm = mm.replace(loose, '\n        // (patch) fixed audio session id for visualizer spectrum capture\n        player.setAudioSessionId(1000);$1');
        fs.writeFileSync(musicManagerFile, mm, 'utf8');
        console.log('MusicManager: injected fixed audio session id (loose match).');
      } else {
        console.log('MusicManager: could not locate ExoPlayer build() anchor.');
      }
    }
  }
} catch (e) {
  console.error("Error patching MusicManager.java:", e.message);
}
