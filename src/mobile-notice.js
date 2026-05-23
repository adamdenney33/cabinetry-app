// ProCabinet — touch-device detection.
// The old once-per-session "Best viewed on a computer" advisory was removed when
// the app went mobile-native (the layout now adapts to phones). `_pcIsTouchDevice`
// stays — it's still used by the guided walkthrough to skip the desktop tour on
// touch devices.

/** True for phones and tablets — a touch-primary device with no hover. */
function _pcIsTouchDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

window._pcIsTouchDevice = _pcIsTouchDevice;
