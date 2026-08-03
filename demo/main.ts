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
}
for (const m of Object.keys(modeButtons) as GizmoMode[]) modeButtons[m].onclick = () => setMode(m)

const spaceBtn = document.getElementById('space')! as HTMLButtonElement
spaceBtn.onclick = () => {
  gizmo.setSpace(gizmo.space === 'world' ? 'local' : 'world')
  stock?.setSpace(gizmo.space)
  spaceBtn.textContent = gizmo.space
}

const cycleBtn = document.getElementById('cycle')! as HTMLButtonElement
cycleBtn.onclick = () => {
  current = (current + 1) % objects.length
  if (stock) stock.attach(objects[current]!)
  else gizmo.attach(objects[current]!)
  cycleBtn.textContent = objectNames[current]!
}

const snapBox = document.getElementById('snap') as HTMLInputElement
snapBox.onchange = () => {
  for (const g of [gizmo, stock]) {
    g?.setTranslationSnap(snapBox.checked ? 1 : null)
    g?.setRotationSnap(snapBox.checked ? (15 * Math.PI) / 180 : null)
    g?.setScaleSnap(snapBox.checked ? 0.25 : null)
  }
}

for (const a of ['X', 'Y', 'Z'] as const) {
  const box = document.getElementById(`show${a}`) as HTMLInputElement
  box.onchange = () => {
    gizmo[`show${a}`] = box.checked
  }
}

const themeBox = document.getElementById('theme') as HTMLInputElement
const degreesBox = document.getElementById('degrees') as HTMLInputElement
function applyTheme() {
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
          sizes: { scaleCubeSize: 0.13, ringTube: 0.019, arrowHeadRadius: 0.08 },
          showSectorLabel: degreesBox.checked,
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
          sizes: { scaleCubeSize: 0.1, ringTube: 0.012, arrowHeadRadius: 0.06 },
          showSectorLabel: degreesBox.checked,
        },
  )
}
themeBox.onchange = applyTheme
degreesBox.onchange = applyTheme

// side-by-side compat check: swap in the stock TransformControls with the
// exact same call sites (attach/setMode/setSpace/snaps/events)
const compareBox = document.getElementById('compare') as HTMLInputElement
function stockHelper(controls: object): Object3D {
  const c = controls as { getHelper?: () => Object3D }
  return c.getHelper ? c.getHelper() : (controls as Object3D)
}
let stock: import('three/examples/jsm/controls/TransformControls.js').TransformControls | null = null
compareBox.onchange = async () => {
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
