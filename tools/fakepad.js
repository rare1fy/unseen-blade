// A fake gamepad for captures (tools/cap.mjs): eval this file's text in the page, then __padTap(i) / __padSet(i, on) / __padAxis(a, v, ms) drive it,
// __pad.id picks the maker (Xbox / DualSense / Pro Controller), window.__rumble collects the rumble effects asked for.
(() => {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0],
    vibrationActuator: { type: 'dual-rumble', playEffect: (t, o) => { (window.__rumble = window.__rumble || []).push(o); return Promise.resolve('complete'); } } };
  window.__pad = pad; window.__rumble = [];
  navigator.getGamepads = () => [pad, null, null, null];
  window.__padSet = (i, on) => { pad.buttons[i].pressed = on; pad.buttons[i].value = on ? 1 : 0; };
  window.__padTap = (i, ms = 120) => { window.__padSet(i, true); setTimeout(() => window.__padSet(i, false), ms); };
  window.__padAxis = (a, v, ms) => { pad.axes[a] = v; if (ms) setTimeout(() => { pad.axes[a] = 0; }, ms); };
  return 'pad ok';
})()
