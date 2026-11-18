// 11-18 微信小游戏 (用户：「现在有声音了，但是声音出来的很慢」): settles once the track the first touch plays is in (at most 3 s after
// the sound starts — audio.ts prepare; 15 s after boot if it never does). The body fonts' subpackage waits for it (ui3d/bodyFont.ts),
// so at boot the two downloads don't split the bandwidth and the sound comes first. A module of its own (no imports): the fonts
// shouldn't pull in the audio engine.
let open: () => void = () => {};
export const firstSounds = new Promise<void>(r => { open = r; setTimeout(r, 15000); });
export function firstSoundsIn() { open(); }
