import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformGizmo } from '../src'
import type { GizmoMode } from '../src/types'

const scene = new Scene()
scene.background = new Color(0x16161a)
const camera = new PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200)
camera.position.set(5, 4, 7)

const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(devicePixelRatio)
document.body.appendChild(renderer.domElement)

scene.add(new GridHelper(20, 20, 0x444444, 0x2a2a2e))
scene.add(new AmbientLight(0xffffff, 0.5))
const dir = new DirectionalLight(0xffffff, 1.5)
dir.position.set(5, 10, 4)
scene.add(dir)

// test objects
const cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0x6688cc }))
cube.position.set(0, 0.5, 0)
scene.add(cube)

// cube inside a rotated + scaled parent (exercises matrix decomposition)
const parent = new Group()
parent.position.set(3, 0.5, -1)
parent.rotation.set(0.3, 0.7, 0.1)
parent.scale.set(1.5, 0.8, 1.2)
scene.add(parent)
const childCube = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xcc8866 }))
parent.add(childCube)

// off-center geometry (exercises the extrude anchor)
const cylGeo = new CylinderGeometry(0.4, 0.4, 2, 24)
cylGeo.translate(0, 1, 0) // pivot at the bottom
const cyl = new Mesh(cylGeo, new MeshStandardMaterial({ color: 0x66cc88 }))
cyl.position.set(-3, 0, 1)
scene.add(cyl)

const objects: Object3D[] = [cube, childCube, cyl]
const objectNames = ['cube', 'child-in-rotated-parent', 'off-center-cylinder']
let current = 0

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.set(0, 0.5, 0)

const gizmo = new TransformGizmo(camera, renderer.domElement)
gizmo.attach(cube)
scene.add(gizmo)

gizmo.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value
})

// event log
const logEl = document.getElementById('log')!
let logCount = 0
function log(msg: string) {
  if (++logCount > 200) {
    logEl.innerHTML = ''
    logCount = 0
  }
  logEl.innerHTML += msg + '<br/>'
  logEl.scrollTop = logEl.scrollHeight
}
for (const type of ['mouseDown', 'mouseUp', 'dragging-changed', 'hoveron'] as const) {
  gizmo.addEventListener(type, (e) => {
    log(`${type} ${JSON.stringify({ ...e, target: undefined, type: undefined })}`)
  })
}

// UI prefs — survive refresh via localStorage
const PREFS_KEY = 'ttg-demo-prefs'
type DemoPrefs = {
  mode: GizmoMode
  space: 'world' | 'local'
  object: number
  snap: boolean
  showX: boolean
  showY: boolean
  showZ: boolean
  theme: boolean
  degrees: boolean
  scalePct: boolean
  scaleMods: boolean
  originDist: boolean
  compare: boolean
  size: number
}
const defaultPrefs: DemoPrefs = {
  mode: 'combined',
  space: 'world',
  object: 0,
  snap: false,
  showX: true,
  showY: true,
  showZ: true,
  theme: false,
  degrees: false,
  scalePct: false,
  scaleMods: false,
  originDist: false,
  compare: false,
  size: 1,
}
function loadPrefs(): DemoPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...defaultPrefs }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...defaultPrefs }
    const obj = parsed as Partial<DemoPrefs> & { gizmoSize?: number }
    const size = typeof obj.size === 'number' ? obj.size : obj.gizmoSize
    return {
      ...defaultPrefs,
      ...obj,
      size: typeof size === 'number' ? size : defaultPrefs.size,
    }
  } catch {
    return { ...defaultPrefs }
  }
}
function savePrefs(patch: Partial<DemoPrefs>) {
  const next = { ...loadPrefs(), ...patch }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
}
function writePrefs(p: DemoPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p))
}
const prefs = loadPrefs()

// UI
const modeButtons: Record<GizmoMode, HTMLElement> = {
  translate: document.getElementById('mode-translate')!,
  rotate: document.getElementById('mode-rotate')!,
  scale: document.getElementById('mode-scale')!,
  combined: document.getElementById('mode-combined')!,
}
function setMode(m: GizmoMode) {
  gizmo.setMode(m)
  // stock TransformControls has no combined mode
  if (stock && m !== 'combined') stock.setMode(m)
  for (const [k, el] of Object.entries(modeButtons)) el.classList.toggle('active', k === m)
  savePrefs({ mode: m })
}
for (const m of Object.keys(modeButtons) as GizmoMode[]) modeButtons[m].onclick = () => setMode(m)

const spaceBtn = document.getElementById('space')! as HTMLButtonElement
spaceBtn.onclick = () => {
  gizmo.setSpace(gizmo.space === 'world' ? 'local' : 'world')
  stock?.setSpace(gizmo.space)
  spaceBtn.textContent = gizmo.space
  savePrefs({ space: gizmo.space })
}

const cycleBtn = document.getElementById('cycle')! as HTMLButtonElement
cycleBtn.onclick = () => {
  current = (current + 1) % objects.length
  if (stock) stock.attach(objects[current]!)
  else gizmo.attach(objects[current]!)
  cycleBtn.textContent = objectNames[current]!
  savePrefs({ object: current })
}

const snapBox = document.getElementById('snap') as HTMLInputElement
function applySnap() {
  for (const g of [gizmo, stock]) {
    g?.setTranslationSnap(snapBox.checked ? 1 : null)
    g?.setRotationSnap(snapBox.checked ? (15 * Math.PI) / 180 : null)
    g?.setScaleSnap(snapBox.checked ? 0.25 : null)
  }
  savePrefs({ snap: snapBox.checked })
}
snapBox.onchange = applySnap

for (const a of ['X', 'Y', 'Z'] as const) {
  const box = document.getElementById(`show${a}`) as HTMLInputElement
  box.onchange = () => {
    gizmo[`show${a}`] = box.checked
    savePrefs({ [`show${a}`]: box.checked })
  }
}

const themeBox = document.getElementById('theme') as HTMLInputElement
const degreesBox = document.getElementById('degrees') as HTMLInputElement
const scalePctBox = document.getElementById('scalePct') as HTMLInputElement
const scaleModsBox = document.getElementById('scaleMods') as HTMLInputElement
const originDistBox = document.getElementById('originDist') as HTMLInputElement
const sizeSlider = document.getElementById('size') as HTMLInputElement
const sizeVal = document.getElementById('sizeVal')!
function applySize() {
  const size = Number(sizeSlider.value)
  sizeVal.textContent = size.toFixed(2)
  gizmo.setSize(size)
  stock?.setSize(size)
  savePrefs({ size })
}
function applyTheme() {
  const labelFlags = {
    showSectorLabel: degreesBox.checked,
    showScaleLabel: scalePctBox.checked,
    showScaleModifiers: scaleModsBox.checked,
    showOriginDistanceLabel: originDistBox.checked,
  }
  gizmo.setTheme(
    themeBox.checked
      ? {
          colors: {
            x: 0xff6b9d,
            y: 0xa8e063,
            z: 0x56ccf2,
            hover: 0xffffff,
            active: 0xffffff,
            sector: 0x56ccf2,
            sectorLabel: 0x56ccf2,
          },
          sizes: {
            gripSize: 0.0585,
            ringTube: 0.004875,
            axisLineRadius: 0.0026,
            arrowHeadRadius: 0.0325,
          },
          ...labelFlags,
        }
      : {
          colors: {
            x: 0xe5484d,
            y: 0x30a46c,
            z: 0x0091ff,
            hover: 0xffd60a,
            active: 0xffd60a,
            sector: 0xffd60a,
            sectorLabel: 0xffd60a,
          },
          sizes: {
            gripSize: 0.065,
            ringTube: 0.0078,
            arrowHeadRadius: 0.039,
          },
          ...labelFlags,
        },
  )
  savePrefs({
    theme: themeBox.checked,
    degrees: degreesBox.checked,
    scalePct: scalePctBox.checked,
    scaleMods: scaleModsBox.checked,
    originDist: originDistBox.checked,
  })
}
themeBox.onchange = applyTheme
degreesBox.onchange = applyTheme
scalePctBox.onchange = applyTheme
scaleModsBox.onchange = applyTheme
originDistBox.onchange = applyTheme
sizeSlider.oninput = applySize

// side-by-side compat check: swap in the stock TransformControls with the
// exact same call sites (attach/setMode/setSpace/snaps/events)
const compareBox = document.getElementById('compare') as HTMLInputElement
function stockHelper(controls: object): Object3D {
  const c = controls as { getHelper?: () => Object3D }
  return c.getHelper ? c.getHelper() : (controls as Object3D)
}
let stock: import('three/examples/jsm/controls/TransformControls.js').TransformControls | null = null
async function applyCompare() {
  savePrefs({ compare: compareBox.checked })
  if (compareBox.checked) {
    const { TransformControls } = await import('three/examples/jsm/controls/TransformControls.js')
    stock = new TransformControls(camera, renderer.domElement)
    stock.attach(objects[current]!)
    if (gizmo.mode !== 'combined') stock.setMode(gizmo.mode)
    else stock.setMode('translate')
    stock.setSpace(gizmo.space)
    stock.setTranslationSnap(gizmo.translationSnap)
    stock.setRotationSnap(gizmo.rotationSnap)
    stock.setScaleSnap(gizmo.scaleSnap)
    stock.setSize(gizmo.size)
    stock.addEventListener('dragging-changed', ((e: { value: boolean }) => {
      orbit.enabled = !e.value
    }) as never)
    // three >=r169 exposes the visual via getHelper(); before that the
    // controls object is itself the helper Object3D
    scene.add(stockHelper(stock))
    gizmo.detach()
  } else if (stock) {
    scene.remove(stockHelper(stock))
    stock.detach()
    stock.dispose()
    stock = null
    gizmo.attach(objects[current]!)
  }
}
compareBox.onchange = () => {
  void applyCompare()
}

/** Push a prefs snapshot into the UI + gizmo (does not write localStorage). */
function applyPrefsToUi(p: DemoPrefs) {
  snapBox.checked = p.snap
  themeBox.checked = p.theme
  degreesBox.checked = p.degrees
  scalePctBox.checked = p.scalePct
  scaleModsBox.checked = p.scaleMods
  originDistBox.checked = p.originDist
  sizeSlider.value = String(p.size)
  for (const a of ['X', 'Y', 'Z'] as const) {
    const box = document.getElementById(`show${a}`) as HTMLInputElement
    box.checked = p[`show${a}`]
    gizmo[`show${a}`] = p[`show${a}`]
  }

  current = p.object >= 0 && p.object < objects.length ? p.object : 0
  cycleBtn.textContent = objectNames[current]!
  if (!compareBox.checked) gizmo.attach(objects[current]!)
  else stock?.attach(objects[current]!)

  gizmo.setSpace(p.space)
  stock?.setSpace(p.space)
  spaceBtn.textContent = p.space

  setMode(p.mode)
  applySnap()
  applyTheme()
  applySize()

  const wantCompare = p.compare
  if (compareBox.checked !== wantCompare) {
    compareBox.checked = wantCompare
    void applyCompare()
  }
}

document.getElementById('reset')!.onclick = () => {
  const p = { ...defaultPrefs }
  writePrefs(p)
  applyPrefsToUi(p)
  log('reset to defaults')
}

// restore persisted UI state
applyPrefsToUi(prefs)

window.addEventListener('keydown', (e) => {
  if (e.key === 't') setMode('translate')
  if (e.key === 'r') setMode('rotate')
  if (e.key === 's') setMode('scale')
  if (e.key === 'a') setMode('combined')
  if (e.key === 'q') spaceBtn.click()
  if (e.key === 'Tab') {
    e.preventDefault()
    cycleBtn.click()
  }
})

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// debug/testing hooks
Object.assign(window as never, {
  __gizmo: gizmo,
  __objects: objects,
  __camera: camera,
  __THREE: { Vector3: cube.position.constructor as unknown, Quaternion: cube.quaternion.constructor as unknown },
})

renderer.setAnimationLoop(() => {
  orbit.update()
  renderer.render(scene, camera)
})
