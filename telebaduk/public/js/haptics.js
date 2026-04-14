// Haptics - Telegram HapticFeedback + fallback
const Haptics = (() => {
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback;

  function impact(style) {
    if (tg) { try { tg.impactOccurred(style); } catch(e){} return; }
    if (navigator.vibrate) {
      const ms = style === 'heavy' ? 25 : style === 'medium' ? 15 : 8;
      navigator.vibrate(ms);
    }
  }

  function notify(type) {
    if (tg) { try { tg.notificationOccurred(type); } catch(e){} return; }
    if (navigator.vibrate) {
      if (type === 'success') navigator.vibrate([10, 30, 10]);
      else if (type === 'warning') navigator.vibrate([15, 20, 15]);
      else navigator.vibrate([20, 10, 20, 10, 20]);
    }
  }

  function selection() {
    if (tg) { try { tg.selectionChanged(); } catch(e){} return; }
    if (navigator.vibrate) navigator.vibrate(5);
  }

  return {
    stonePlace() { impact('heavy'); },
    capture(count) {
      notify('success');
      if (count > 3) setTimeout(() => impact('medium'), 100);
    },
    hover() { selection(); },
    error() { notify('error'); },
    buttonTap() { impact('light'); },
    gameOver(won) {
      if (won) { notify('success'); setTimeout(() => notify('success'), 200); }
      else { notify('warning'); }
    },
    pass() { impact('light'); },
    redo() { impact('medium'); }
  };
})();
