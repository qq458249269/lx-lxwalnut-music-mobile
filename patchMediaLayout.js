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

// 注意：不再注入固定 audio session id 到 ExoPlayer。
// 之前注入 setAudioSessionId(1000) 会干扰播放器音频（audioOffload 下尤其明显），
// 导致播放失败/多次换源。原生律动改用反射 AudioManager.getAudioSessions()
// 动态发现真实 session（同 uid 捕获无需 RECORD_AUDIO 权限），不触碰播放器。
