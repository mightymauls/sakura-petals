import { atom, read } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'

const { theme, problems } = makeColors({
  label: 'Sakura',
  roles: { accent: '#d4537e', danger: '#c0392b', success: '#4f8a4c', warning: '#b07a1e', pro: '#8a5aa8' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f8ecef',
        'surface-1': '#fcf4f6',
        'surface-2': '#fffafb',
        'text-primary': '#2e1f25',
        'text-secondary': '#5a4149',
        'text-muted': '#6e5660',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#1c1418',
        'surface-1': '#241a1f',
        'surface-2': '#2c2026',
        'surface-3': '#32252b',
        'text-primary': '#f6e9ee',
        'text-secondary': '#d6c1c9',
        'text-muted': '#b29ba4',
      },
    },
  },
})

// Seeded pseudo-random so every petal keeps its place from draw to draw.
const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const PETAL = 'M0,-11 C3,-13 5,-12 7,-9 C10,-4 9,4 5,9 C3,11 -3,11 -5,9 C-9,4 -10,-4 -7,-9 C-5,-12 -3,-13 0,-11 Z'
const FILLS = ['#f7b8c8', '#f4a6bb', '#fbd0dc', '#eea0b6', '#fcdde5']

// Petals that land per minute, and the most the pile ever holds (about 36 minutes).
const PER_MINUTE = 20
const MAX_PILE = 720
// How often the pile grows, in ms. Each tick redraws the backdrop.
const TICK_MS = 10_000

// A negative delay that puts a looping animation where it would be after `t` seconds.
const phase = (t: number, duration: number, offset: number) => (-((t + offset) % duration)).toFixed(2)

type Faller = { x: number; scale: number; fall: number; sway: number; spin: number; offset: number; fill: string; opacity: number }

const FALLERS: Faller[] = (() => {
  const rand = seeded(7)
  const list: Faller[] = []
  for (let i = 0; i < 34; i++) {
    // Keep most petals toward the sides, away from the words in the middle.
    const side = rand()
    const x = side < 0.42 ? rand() * 480 : side < 0.84 ? 1120 + rand() * 480 : 480 + rand() * 640
    // Mostly small with the odd large one: smaller petals fall slower and paler, like they are further away.
    const size = rand() ** 2
    const scale = 0.35 + size * 1.95
    list.push({
      x,
      scale,
      fall: 30 - size * 16 + rand() * 6,
      sway: 3 + rand() * 3,
      spin: 5 + rand() * 6,
      offset: rand() * 60,
      fill: (FILLS[i % FILLS.length] ?? '#f7b8c8'),
      opacity: 0.45 + size * 0.35 + rand() * 0.2,
    })
  }
  return list
})()

const fallers = (t: number) =>
  FALLERS.map(
    f =>
      `<g transform="translate(${f.x.toFixed(0)},0)"><g class="fall" style="animation-duration:${f.fall.toFixed(1)}s;animation-delay:${phase(t, f.fall, f.offset)}s">` +
      `<g class="sway" style="animation-duration:${f.sway.toFixed(1)}s;animation-delay:${phase(t, f.sway * 2, f.offset)}s">` +
      `<g transform="scale(${f.scale.toFixed(2)})"><use href="#p" class="spin" fill="${f.fill}" opacity="${f.opacity.toFixed(2)}" style="animation-duration:${f.spin.toFixed(1)}s;animation-delay:${phase(t, f.spin, f.offset)}s"/></g>` +
      `</g></g></g>`,
  ).join('')

// The pile: petal i always lands in the same spot, so it only ever grows.
// It drifts high into the corners and stays low under the message box.
const DRIFT_HEIGHT = 160
const drift = (x: number) => 0.18 + 0.82 * Math.min(1, Math.abs(x - 800) / 800) ** 1.6

// Deepest petals are shaded darker, the top layer catches the light: the drift reads as having depth.
const SHADES = ['#d88aa2', '#e597ae', '#eea3b8', '#f4b1c4', '#f8c2d1', '#fbd3de', '#fde3ea']

// The drift's surface at x when it is `progress` full (0 to 1), as a y in the scene.
const surface = (x: number, progress: number) => 1006 - DRIFT_HEIGHT * drift(x) * progress

// A soft solid heap under the petals, so no background shows through the gaps.
const mound = (progress: number) => {
  if (progress <= 0) {
    return ''
  }
  const rand = seeded(42)
  const points: string[] = []
  for (let x = -40; x <= 1640; x += 20) {
    const y = 1006 - (1006 - surface(x, progress)) * (0.72 + rand() * 0.08)
    points.push(`${x},${y.toFixed(0)}`)
  }
  return `<path d="M-40,1010 L${points.join(' L')} L1640,1010 Z" fill="url(#heap)" filter="url(#soft)"/>`
}

const pile = (count: number) => {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const rand = seeded(1000 + i * 7919)
    // Land more petals where the drift is deep, so it stays dense all the way up.
    let x = rand() * 1640 - 20
    for (let tries = 0; tries < 20 && rand() > drift(x); tries++) {
      x = rand() * 1640 - 20
    }
    // Later petals settle on top of earlier ones.
    const height = DRIFT_HEIGHT * drift(x) * ((i + 1) / MAX_PILE)
    const depth = 0.15 + 0.85 * Math.sqrt(rand())
    const y = 1008 - height * depth
    const scale = 0.8 + rand() ** 2 * 1.8
    const angle = rand() * 360
    // Petals near the surface are lighter; jitter keeps the bands from showing.
    const shade = Math.max(0, Math.min(SHADES.length - 1, Math.round(depth * (SHADES.length - 1) + (rand() - 0.5) * 2.2)))
    out.push(
      `<use href="#p" transform="translate(${x.toFixed(0)},${y.toFixed(0)}) rotate(${angle.toFixed(0)}) scale(${scale.toFixed(2)},${(scale * 0.65).toFixed(2)})" fill="${SHADES[shade] ?? '#f4b1c4'}" opacity="${(0.85 + rand() * 0.15).toFixed(2)}"/>`,
    )
  }
  return out.join('')
}

const scene = (elapsedSeconds: number) => {
  const count = Math.min(MAX_PILE, Math.floor((elapsedSeconds / 60) * PER_MINUTE))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice">
<style>
.bg-top{stop-color:#fbeff2}.bg-bot{stop-color:#f4dfe5}
@media (prefers-color-scheme: dark){.bg-top{stop-color:#221820}.bg-bot{stop-color:#160f13}}
.fall{animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}
.sway{animation-name:sway;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
.spin{transform-box:fill-box;transform-origin:center;animation-name:spin;animation-timing-function:linear;animation-iteration-count:infinite}
@keyframes fall{from{transform:translateY(-60px)}to{transform:translateY(1060px)}}
@keyframes sway{from{transform:translateX(-40px)}to{transform:translateX(40px)}}
@keyframes spin{from{transform:rotate(0deg) scaleX(1)}50%{transform:rotate(180deg) scaleX(0.4)}to{transform:rotate(360deg) scaleX(1)}}
@media (prefers-reduced-motion: reduce){.fall,.sway,.spin{animation-play-state:paused}}
</style>
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bg-top"/><stop offset="1" class="bg-bot"/></linearGradient>
<path id="p" d="${PETAL}"/>
<linearGradient id="heap" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c6d3" stop-opacity="0.75"/><stop offset="0.35" stop-color="#efb0c2"/><stop offset="1" stop-color="#e199ae"/></linearGradient>
<filter id="soft" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
</defs>
<rect width="1600" height="1000" fill="url(#bg)"/>
${fallers(elapsedSeconds)}
${mound(count / MAX_PILE)}
<g>${pile(count)}</g>
</svg>`
}

const startedAt = { plugin: 'sakura-petals', key: 'startedAt' } as const
const elapsedRef = { plugin: 'sakura-petals', key: 'elapsed' } as const
const elapsed = atom(elapsedRef, 0)

const LOOK: ThemeSetArgs = { colors: theme, backdrop: { scene: 'sakura', glass: false } }

// The pile's size comes from the time since startedAt, read fresh each tick so a sweep takes hold.
const tick = async ($: EngineInterface) => {
  const { value: began } = await $.state.get(startedAt)
  const now = await $.clock.now()
  await $.state.set(elapsedRef, Math.max(0, Math.floor((now - (began ?? now)) / 1000)))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await $.command.register({ name: 'sakura-sweep', description: 'Sweep away the pile of cherry blossom petals and start it again' })

    // Keep the session's start across reloads, then tick the pile along.
    const { value: began } = await $.state.get(startedAt)
    if (began === undefined) {
      await $.state.set(startedAt, await $.clock.now())
    }
    await tick($)
    $.clock.every(TICK_MS, () => tick($))

    const set = await $.theme.set(LOOK)
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    return next(e)
  })

  on('command.run', { command: 'sakura-sweep' }, async $ => {
    await $.state.set(startedAt, await $.clock.now())
    await tick($)
    return { text: 'Swept the petals away. A new pile starts now.' }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    const seconds = await read($, elapsed)
    return <Svg source={scene(seconds)} alt="Cherry blossom petals slowly falling and piling up at the bottom" />
  })
}
