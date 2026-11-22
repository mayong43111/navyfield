function tickRing(count: number, radius: number, majorLength: number, minorLength: number, color: string, start = 0, sweep = 360): string {
  return Array.from({ length: count }, (_, index) => {
    const angle = start + index * sweep / (sweep === 360 ? count : count - 1);
    const length = index % 5 === 0 ? majorLength : minorLength;
    return `<path d="M50 ${50 - radius}v${length}" transform="rotate(${angle} 50 50)" stroke="${color}" stroke-width="${index % 5 === 0 ? 1.6 : .8}"/>`;
  }).join('');
}

export function gaugeArtwork(kind: 'reload' | 'angle' | 'power', id: string): string {
  const reload = kind === 'reload';
  const power = kind === 'power';
  const warm = reload || power;
  return `<svg class="instrument-art" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}-rim" x2=".25" y2="1">
        <stop stop-color="#f1eee0"/><stop offset=".2" stop-color="#7b817c"/>
        <stop offset=".46" stop-color="#202727"/><stop offset=".75" stop-color="#afb1a3"/>
        <stop offset="1" stop-color="#353b36"/>
      </linearGradient>
      <radialGradient id="${id}-case" cx=".35" cy=".25">
        <stop stop-color="#424741"/><stop offset=".7" stop-color="#151916"/><stop offset="1" stop-color="#060a09"/>
      </radialGradient>
      <radialGradient id="${id}-face" cx=".4" cy=".3">
        <stop stop-color="${warm ? '#fff1b7' : '#242b28'}"/>
        <stop offset=".7" stop-color="${warm ? '#e4d18b' : '#111716'}"/>
        <stop offset="1" stop-color="${warm ? '#a39153' : '#070d0c'}"/>
      </radialGradient>
    </defs>
    <circle cx="51" cy="53" r="47" fill="#060a09" opacity=".8"/>
    <circle cx="50" cy="50" r="47" fill="url(#${id}-rim)" stroke="#0c1312" stroke-width="2"/>
    <circle cx="50" cy="50" r="43" fill="url(#${id}-case)" stroke="#c4c5af" stroke-width=".7"/>
    <path d="M13 39a39 39 0 0 1 68-15" fill="none" stroke="#dddccc" stroke-width="1" opacity=".45"/>
    <circle cx="50" cy="50" r="${warm ? 33 : 36}" fill="url(#${id}-face)" stroke="${warm ? '#d8c99b' : '#060a09'}" stroke-width="2"/>
    ${reload ? tickRing(60, 31, 8, 4, '#3e3825') : power ? tickRing(41, 31, 7, 3, '#413a29', -130, 260) : tickRing(46, 34, 9, 4, '#e8e5ce', -130, 260)}
    ${power ? `<path d="M72.2 68.6a29 29 0 0 1-12.3 8.7" fill="none" stroke="#b83c22" stroke-width="7"/>
      ` : reload ? `<path d="M47 22h6l-3 5Z" fill="#8e2e20"/>
      `
      : `<path d="M20 75a39 39 0 0 1-6-42" fill="none" stroke="#edead7" stroke-width="3"/>
      <path d="M23 71l6-5" stroke="#bf3226" stroke-width="4"/>
      `}
    <path d="M30 80a37 37 0 0 0 43-4" fill="none" stroke="#060a09" stroke-width="2" opacity=".5"/>
  </svg>`;
}

export function magazineArtwork(id: string): string {
  return `<svg class="instrument-art" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}-body" x2=".05" y2="1">
        <stop stop-color="#e5e1d5"/><stop offset=".15" stop-color="#c2beb2"/>
        <stop offset=".3" stop-color="#7e7f75"/><stop offset=".7" stop-color="#77756a"/>
        <stop offset="1" stop-color="#303830"/>
      </linearGradient>
      <linearGradient id="${id}-edge" x2="1" y2="1">
        <stop stop-color="#ffffea"/><stop offset=".4" stop-color="#9e9f94"/><stop offset="1" stop-color="#252b25"/>
      </linearGradient>
    </defs>
    <path d="M2 8 7 2h88l3 4v51H2Z" fill="url(#${id}-body)" stroke="#111b17" stroke-width="2"/>
    <path d="M5 11V7l3-2h85l2 3v46H5Z" fill="none" stroke="url(#${id}-edge)" stroke-width="2"/>
    <path d="M8 15h27M9 17h25M8 48h26" stroke="#e0ddc6" stroke-width=".5" opacity=".7"/>
    <path d="M38 19h54v30H38Z" fill="#151c15" stroke="#d0cbb1" stroke-width="1.3"/>
    <path d="M39 34h52" stroke="#7c7e69"/>
    <circle cx="90" cy="9" r="4" fill="#182723" stroke="#ccc8ae"/>
    <circle cx="90" cy="9" r="2" fill="#6fc2e1"/>
    <g fill="#363d31" stroke="#abae9c" stroke-width=".7">
      <circle cx="9" cy="8" r="1.5"/><circle cx="91" cy="53" r="1.5"/>
    </g>
    <path d="M8 8h2M90 53h2" stroke="#151c16" stroke-width=".6"/>
  </svg>`;
}

export function selectorArtwork(): string {
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <circle cx="16" cy="16" r="14" fill="#101a14" stroke="#eee5bd" stroke-width="2"/>
    <circle cx="16" cy="16" r="11" fill="#53604a" stroke="#8d9679"/>
    <path class="selector-pointer" d="m9 23 5-10 8-6-4 11Z" fill="#e7e3c7" stroke="#2d392c"/>
    <circle cx="16" cy="16" r="2.5" fill="#bbbfa4" stroke="#343f2f"/>
  </svg>`;
}

export function mapFrameArtwork(): string {
  return `<svg class="navigation-art map-frame-art" viewBox="0 0 220 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d="M2 148V2h216v146Z" fill="none" stroke="#0a1519" stroke-width="4" vector-effect="non-scaling-stroke"/>
    <path d="M4 146V4h212v142" fill="none" stroke="#4d6267" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <path d="M7 143V7h206" fill="none" stroke="#152a32" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <path d="M215 8v136H9" fill="none" stroke="#60726b" stroke-width=".6" vector-effect="non-scaling-stroke"/>
    <path d="M11 3h16M193 3h16" stroke="#6f7d74" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

export function enginePanelArtwork(): string {
  return `<svg class="navigation-art engine-panel-art" viewBox="0 0 220 58" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="engine-panel-steel" x2=".1" y2="1">
        <stop stop-color="#dddcd1"/><stop offset=".1" stop-color="#999d96"/>
        <stop offset=".25" stop-color="#525a54"/><stop offset=".7" stop-color="#3a423d"/>
        <stop offset="1" stop-color="#9c9e8e"/>
      </linearGradient>
    </defs>
    <path d="M3 2h214v52H3Z" fill="url(#engine-panel-steel)" stroke="#17231d" stroke-width="2"/>
    <path d="M5 52V4h210" fill="none" stroke="#efebd5"/>
    <path d="M214 5v47H7" fill="none" stroke="#202f25" stroke-width="2"/>
    <path d="M61 16h104M61 43h104" stroke="#b2b5a3" stroke-width=".5" opacity=".5"/>
    <g fill="#303a32" stroke="#bbc0aa" stroke-width=".8">
      <circle cx="210" cy="8" r="2"/><circle cx="210" cy="48" r="2"/>
    </g>
    <path d="M209 8h2M209 48h2" stroke="#18251b"/>
  </svg>`;
}

export function tdaLampArtwork(): string {
  return `<svg class="tda-lamp-art" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <circle cx="16" cy="16" r="14" fill="#17251a" stroke="#b9c1a1" stroke-width="2"/>
    <circle cx="16" cy="16" r="11" fill="currentColor" stroke="#687950"/>
    <path d="M8 15a9 9 0 0 1 13-7" fill="none" stroke="#f1f6cd" stroke-width="2" opacity=".5"/>
    <path d="M12 25a10 10 0 0 0 12-9" fill="none" stroke="#19271b" opacity=".4"/>
  </svg>`;
}
