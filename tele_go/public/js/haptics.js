// Haptics — tactile feedback via Vibration API and Telegram WebApp
const Haptics = (() => {
  let enabled = true;
  const tg = window.Telegram?.WebApp;

  function canVibrate() {
    return enabled && (navigator.vibrate || tg?.HapticFeedback);
  }

  // Stone placement — solid thunk
  function stonePlace() {
    if (!enabled) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('heavy');
    } else if (navigator.vibrate) {
      navigator.vibrate(25);
    }
  }

  // Capture — satisfying double tap
  function capture(count) {
    if (!enabled) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('medium');
      setTimeout(() => tg.HapticFeedback.notificationOccurred('success'), 80);
    } else if (navigator.vibrate) {
      if (count > 3) {
        navigator.vibrate([15, 30, 15, 30, 25]);
      } else {
        navigator.vibrate([15, 40, 20]);
      }
    }
  }

  // Hover / preview — light tap
  function hover() {
    if (!enabled) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.selectionChanged();
    } else if (navigator.vibrate) {
      navigator.vibrate(5);
    }
  }

  // Error — wrong move
  function error() {
    if (!enabled) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('error');
    } else if (navigator.vibrate) {
      navigator.vibrate([30, 50, 30]);
    }
  }

  // Button press
  function buttonTap() {
    if (!enabled) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    } else if (navigator.vibrate) {
      navigator.vibrate(8);
    }
  }

  // Game over
  function gameOver(won) {
    if (!enabled) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred(won ? 'success' : 'warning');
    } else if (navigator.vibrate) {
      if (won) {
        navigator.vibrate([20, 60, 20, 60, 40]);
      } else {
        navigator.vibrate([50, 100, 50]);
      }
    }
  }

  // Pass
  function pass() {
    if (!enabled) return;
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('soft');
    } else if (navigator.vibrate) {
      navigator.vibrate(12);
    }
  }

  function toggle() {
    enabled = !enabled;
    return enabled;
  }

  function isEnabled() {
    return enabled;
  }

  return { stonePlace, capture, hover, error, buttonTap, gameOver, pass, toggle, isEnabled };
})();
