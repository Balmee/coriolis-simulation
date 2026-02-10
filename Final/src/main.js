/*
Project: Visualizing Coriolis effects

Overview:
- Simulates particles on a rotating "ocean" with adjustable planetary spin and
  physics parameters. Particles show how rotation, pressure pull, and convection
  create tangential winds and vortices.

Visual filters and why they relate to the Coriolis effect:
- Show Rossby: colors indicate the local Rossby-number regime (low → rotation-
  dominated, high → inertia-dominated). Rossby number Ro = U / (f L), so this
  visualization shows where the Coriolis force (f = 2Ω sinφ) matters.
- Show Eötvös: highlights apparent acceleration changes due to motion in the
  rotating frame (Eötvös effects). These arise because rotation modifies the
  effective gravity felt by moving parcels, especially at high tangential speeds.
- Show Inertial (ghosts): displays inertial-frame trajectories alongside the
  rotating-frame particles so you can directly compare Coriolis deflection
  (rightward in Northern hemisphere, leftward in Southern).
- Show Vectors: draws velocity arrows to reveal tangential deflection from the
  Coriolis term (-2Ω×v) and the role of conserved angular momentum (L = r v_theta).
- Latitude effect & Hemisphere: toggle the sign and magnitude of the Coriolis
  parameter (f = 2Ω sinφ). Deflection direction flips between hemispheres.

Controls mapping:
- `earthRotation`: planetary rotation rate Ω used to compute f
- `coriolisStrength`: multiplier for the Coriolis term
- `lengthScale`: used in Rossby-number visualization (L)
- `showRossby`, `showEotvos`, `showInertial`, `showVectors`, `latitudeEffect`,
  `hemisphere`: toggles described above

Purpose:
This demo makes the abstract Coriolis concepts tangible: how rotation alters
trajectory curvature, when rotation dominates flow (low Ro), how angular
momentum conservation changes tangential speed during radial motion, and how
apparent forces (Eötvös) change with particle velocity in a rotating frame.
*/

import "./style.css"
import * as THREE from "three"
import * as dat from "dat.gui"
import { Howl } from 'howler'
import Stats from "three/examples/jsm/libs/stats.module.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

// Scene Setup
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x02040a)
scene.fog = new THREE.Fog(0x02040a, 20, 180)

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight)
camera.position.set(0, 60, 80)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.enableDamping = true
orbit.maxPolarAngle = Math.PI * 0.48

const stats = new Stats()
document.body.appendChild(stats.dom)

const clock = new THREE.Clock()

// HUD for Rossby and Eötvös readouts
const hud = document.createElement('div')
hud.style.position = 'fixed'
hud.style.left = '12px'
hud.style.bottom = '12px'
hud.style.padding = '8px 10px'
hud.style.background = 'rgba(0,0,0,0.45)'
hud.style.color = '#fff'
hud.style.fontFamily = 'monospace'
hud.style.fontSize = '12px'
hud.style.borderRadius = '6px'
hud.style.zIndex = 999
hud.id = 'physics-hud'
hud.innerHTML = '<div id="hud-text">Rossby: — &nbsp;&nbsp; Eötvös: —</div>'
document.body.appendChild(hud)

// legend for Rossby color scale
const legend = document.createElement('div')
legend.style.width = '160px'
legend.style.marginTop = '8px'
legend.style.display = 'flex'
legend.style.alignItems = 'center'
legend.innerHTML = `
  <div style="width:110px;height:12px;border-radius:6px;margin-right:8px;background:linear-gradient(90deg,#88aaff,#ffff99,#ff5533)"></div>
  <div style="font-size:11px;line-height:12px">Rossby<br><span style='font-size:10px;opacity:0.8'>(low → high)</span></div>
`
hud.appendChild(legend)

// intensity categories for preset (values in kph)
const intensityPresetCategories = [
  { label: 'Tropical Depression', min: 0, max: 62, color: new THREE.Color(0x88ccee) },
  { label: 'Tropical Storm', min: 62, max: 88, color: new THREE.Color(0x99ff66) },
  { label: 'Severe Tropical Storm', min: 88, max: 117, color: new THREE.Color(0xffcc44) },
  { label: 'Typhoon / Hurricane', min: 118, max: 185, color: new THREE.Color(0xff5533) },
  { label: 'Super Typhoon', min: 186, max: Infinity, color: new THREE.Color(0xcc33ff) }
]

function getIntensityCategory(kph) {
  for (let c of intensityPresetCategories) {
    if (kph >= c.min && kph <= c.max) return c
  }
  return intensityPresetCategories[0]
}

// inspector tooltip for hovered particle
const inspect = document.createElement('div')
inspect.style.position = 'fixed'
inspect.style.pointerEvents = 'none'
inspect.style.padding = '6px 8px'
inspect.style.background = 'rgba(0,0,0,0.75)'
inspect.style.color = '#fff'
inspect.style.fontFamily = 'monospace'
inspect.style.fontSize = '12px'
inspect.style.borderRadius = '6px'
inspect.style.zIndex = 1000
inspect.style.display = 'none'
document.body.appendChild(inspect)

window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
  inspect.style.left = (e.clientX + 12) + 'px'
  inspect.style.top = (e.clientY + 12) + 'px'
})

window.addEventListener('mouseleave', () => {
  inspect.style.display = 'none'
})

// GUI Controls
const gui = new dat.GUI()

const params = {
  earthRotation: 1,
  coriolisStrength: 1,
  temperatureContrast: 1,
  convectionStrength: 1,
  pressurePull: 1,
  hemisphere: "Northern",
  showVectors: true,
  spawnRate: 6,
  // physics & UI toggles
  latitudeEffect: true,
  rotatingFrame: true,
  showRossby: true,
  showEotvos: true,
  lengthScale: 10,
  // freeze motion for analysis
  freeze: true,
  showInertial: false,
  // maximum allowed wind speed (scene units)
  maxWind: 12,
  // classification presets
  classificationPreset: 'None',
  kphPerUnit: 50,
  // ship spawn controls
  shipAngle: 0,
  shipDistance: 30,
  spawnShip: () => spawnShip(),
  removeShip: () => removeShip(),
  // start / reset control
  running: false,
  startReset: () => startReset(),
  reset: () => resetParticles()
}

// Save initial slider/button defaults so Start/Reset can restore them exactly.
const initialState = {
  earthRotation: 1,
  coriolisStrength: 1,
  temperatureContrast: 1,
  convectionStrength: 1,
  pressurePull: 1,
  hemisphere: "Northern",
  showVectors: true,
  spawnRate: 6,
  latitudeEffect: true,
  rotatingFrame: true,
  showRossby: true,
  showEotvos: true,
  lengthScale: 10,
  freeze: true,
  showInertial: false,
  maxWind: 12,
  classificationPreset: 'None',
  kphPerUnit: 50,
  shipAngle: 0,
  shipDistance: 30,
  running: false
}

gui.add(params, 'startReset').name('Start/Reset')
gui.add(params, "earthRotation", 0, 5, 0.01)
gui.add(params, "coriolisStrength", 0, 6, 0.01)
gui.add(params, "temperatureContrast", 0, 4, 0.01)
gui.add(params, "convectionStrength", 0, 6, 0.01)
gui.add(params, "pressurePull", 0, 6, 0.01)
gui.add(params, "hemisphere", ["Northern", "Southern"])
gui.add(params, "showVectors")
gui.add(params, "spawnRate", 1, 30, 1)
gui.add(params, "latitudeEffect").name('Latitude effect')
gui.add(params, "rotatingFrame").name('Rotating frame')
gui.add(params, "showRossby").name('Show Rossby')
gui.add(params, "showEotvos").name('Show Eötvös')
gui.add(params, "lengthScale", 1, 200, 1).name('Length scale')
gui.add(params, "freeze").name('Freeze particles')
gui.add(params, "showInertial").name('Show inertial')
gui.add(params, 'classificationPreset', ['None', 'Intensity (Wind Speed)']).name('Classification preset')
gui.add(params, 'kphPerUnit', 1, 500, 1).name('kph per unit')
gui.add(params, 'maxWind', 1, 50, 0.1).name('Max wind')
// Ship controls: set angle/distance then press Spawn Ship
gui.add(params, 'shipAngle', 0, 360, 1).name('Ship angle°')
gui.add(params, 'shipDistance', 0, 45, 0.5).name('Ship distance')
gui.add(params, 'spawnShip').name('Spawn Ship')
gui.add(params, 'removeShip').name('Remove Ship')


// Background sound
let bgSound = null
try {
  bgSound = new Howl({
    src: ['/hurricane-ophelia.wav', 'Final/public/hurricane-ophelia.wav'],
    loop: true,
    volume: 0.35,
    rate: 1.0,
    onload: () => console.log('Background sound loaded'),
    onloaderror: (id, err) => console.warn('Background sound load error', id, err)
  })
  // Autoplay on page open
    try { bgSound.play() } catch (e) { console.warn('Autoplay attempt failed', e) }
    // If autoplay is blocked, resume playback on the first user gesture (click/touch/keydown)
    function resumeAudioOnGesture() {
      function resume() {
        try {
          if (bgSound && bgSound.play) bgSound.play()
          console.log('Audio resumed after user gesture')
        } catch (err) {
          console.warn('Audio resume failed', err)
        }
        window.removeEventListener('click', resume)
        window.removeEventListener('touchstart', resume)
        window.removeEventListener('keydown', resume)
      }
      window.addEventListener('click', resume, { once: true, passive: true })
      window.addEventListener('touchstart', resume, { once: true, passive: true })
      window.addEventListener('keydown', resume, { once: true, passive: true })
    }
    resumeAudioOnGesture()
    // ensure audio mapping respects the current params (pause if frozen)
    try { updateSoundFromParams() } catch (e) { console.warn('updateSoundFromParams failed on init', e) }
} catch (e) {
  console.warn('Howler init failed or sound file missing:', e)
}


function updateSoundFromParams() {
  if (!bgSound) return
  // Normalize sliders to 0..1 according to expected ranges
  const norm = v => Math.max(0, Math.min(1, v))
  const earthN = norm(params.earthRotation / 5)
  const coriolisN = norm(params.coriolisStrength / 6)
  const tempN = norm(params.temperatureContrast / 4)
  const convN = norm(params.convectionStrength / 6)
  const pressN = norm(params.pressurePull / 6)
  const spawnN = norm((params.spawnRate - 1) / (30 - 1))
  const windN = norm((params.maxWind - 1) / (50 - 1))
  const lengthN = norm((params.lengthScale - 1) / (200 - 1))

  // combine into an intensity metric (weights tuned for pleasant audio behavior)
  const intensity = Math.min(1, (0.18 * earthN + 0.25 * coriolisN + 0.12 * tempN + 0.12 * convN + 0.18 * pressN + 0.08 * spawnN + 0.05 * windN + 0.02 * lengthN))

  // map intensity to volume (0.05..0.95) and playback rate (0.8..1.8)
  const volume = Math.max(0.02, Math.min(1, 0.05 + intensity * 0.9))
  const rate = Math.max(0.5, Math.min(2.5, 0.8 + intensity * 1.6))

  bgSound.volume(volume)
  bgSound.rate(rate)

  // pause when frozen
  if (params.freeze) {
    if (bgSound.playing()) bgSound.pause()
  } else {
    // resume if not playing
    if (!bgSound.playing()) bgSound.play()
  }
}



// Lighting

scene.add(new THREE.AmbientLight(0x88aaff, 0.7))

const sun = new THREE.DirectionalLight(0xffffff, 2.5)
sun.position.set(40, 60, 40)
sun.castShadow = true
scene.add(sun)

const rim = new THREE.DirectionalLight(0x3366ff, 1.5)
rim.position.set(-40, 30, -40)
scene.add(rim)

// Ocean & Grid
const ocean = new THREE.Mesh(
  new THREE.CircleGeometry(40, 128),
  new THREE.MeshStandardMaterial({
    color: 0x0d2b52,
    roughness: 0.5
  })
)
ocean.rotation.x = -Math.PI / 2
ocean.receiveShadow = true
scene.add(ocean)

const grid = new THREE.GridHelper(80, 80, 0x224466, 0x112233)
grid.position.y = 0.01
scene.add(grid)

// Pressure Isobars
const isobars = []
for (let i = 1; i <= 5; i++) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(i * 4 - 0.2, i * 4 + 0.2, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08
    })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.05
  scene.add(ring)
  isobars.push(ring)
}

// Particles
const particles = []
const arrows = []
const ghosts = []
// raycasting / hover inspector state
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()
let hovered = null
let prevHovered = null

const hotMat = new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0xff2200 })
const coldMat = new THREE.MeshStandardMaterial({ color: 0x3388ff, emissive: 0x1133aa })
const geo = new THREE.SphereGeometry(0.14, 10, 10)
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x333333, transparent: true, opacity: 0.35, roughness: 0.8 })

function spawnParticle() {
  const hot = Math.random() > 0.5
  // create an individual material per particle so we can fade/color it
  const mat = (hot ? hotMat : coldMat).clone()
  mat.transparent = true
  mat.opacity = 1.0
  const p = new THREE.Mesh(geo, mat)

  const r = Math.random() * 35
  const a = Math.random() * Math.PI * 2

  p.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r)
  // initialize velocity and store angular momentum for tangential wind
  const velocity = new THREE.Vector3()
  // give a small initial tangential velocity (background rotation + randomness)
  const vThetaInit = (params.earthRotation * 0.02 + Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1)
  const uTheta = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a))
  velocity.add(uTheta.multiplyScalar(vThetaInit))

  // store particle data. Note: L represents angular momentum per unit mass (L = r * v_theta),
  // which demonstrates conservation of angular momentum as parcels move radially.
  p.userData = {
    velocity,
    temp: hot ? 1 : -1,
    // conserved angular momentum: L = r * v_theta
    L: Math.max(r, 0.001) * vThetaInit,
    // lifetime fading data
    age: 0,
    life: 4 + Math.random() * 6,
    baseColor: new THREE.Color(hot ? 0xff5533 : 0x3388ff),
    baseEmissive: new THREE.Color(hot ? 0xff2200 : 0x1133aa)
  }

  scene.add(p)
  particles.push(p)

  // create inertial-frame ghost particle (for comparison)
  const gmat = ghostMat.clone()
  const g = new THREE.Mesh(geo, gmat)
  g.position.copy(p.position)
  g.visible = false
  scene.add(g)
  ghosts.push(g)

  // store inertial velocity and ghost reference
  p.userData.inertialVelocity = velocity.clone()
  p.userData.ghost = g
  // store original visuals for hover restore
  p.userData._origScale = p.scale.clone()
  p.userData._origEmissive = p.material && p.material.emissive ? p.material.emissive.getHex() : 0x000000

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(),
    p.position,
    1,
    0xffff00
  )
  // make arrow materials transparent so we can fade them
  if (arrow.line && arrow.line.material) {
    arrow.line.material = arrow.line.material.clone()
    arrow.line.material.transparent = true
  }
  if (arrow.cone && arrow.cone.material) {
    arrow.cone.material = arrow.cone.material.clone()
    arrow.cone.material.transparent = true
  }
  scene.add(arrow)
  arrows.push(arrow)
}

// NIW spawn: subsurface parcels representing near-inertial waves 
function spawnNIWParticle() {
  const radius = 60
  const a = Math.random() * Math.PI * 2
  const r = Math.random() * radius
  const x = Math.cos(a) * r
  const z = Math.sin(a) * r
  const depth = Math.random() * params.niwDepth + 5 // meters (sim units)

  const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x113355, transparent: true, opacity: 0.9 }))
  m.position.set(x, -depth, z)

  // compute local latitude phi from z
  const clampedZ = Math.max(-40, Math.min(40, z))
  const phi = (clampedZ / 40) * (Math.PI / 2)
  const OmegaSim = Math.abs(params.earthRotation * 0.03)
  const f = 2 * OmegaSim * Math.abs(Math.sin(phi)) || 0.001

  const amp = (0.5 + Math.random() * 1.2) * params.niwStrength
  const phase = Math.random() * Math.PI * 2

  // rightward bias: boost eastward motion for Northern hemisphere
  const hemisphereSign = params.hemisphere === 'Northern' ? 1 : -1
  const rightBias = 0.3 * hemisphereSign * (x / radius)

  m.userData = {
    depth,
    amp,
    phase,
    f,
    age: 0,
    decay: params.niwDecay,
    rightBias
  }

  scene.add(m)
  niwParticles.push(m)
}

function resetParticles() {
  particles.forEach(p => scene.remove(p))
  arrows.forEach(a => scene.remove(a))
  ghosts.forEach(g => scene.remove(g))
  particles.length = 0
  arrows.length = 0
  ghosts.length = 0
}

// SHIP (spawnable test object)

const ships = []

function createShipMesh() {
  // simple ship: low box hull + tiny mast
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.26, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x662200, metalness: 0.1, roughness: 0.6 })
  )
  hull.position.y = 0.18

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  )
  mast.position.y = 0.6
  hull.add(mast)

  // small flag
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xff3333, side: THREE.DoubleSide })
  )
  flag.position.set(0.15, 0.8, 0)
  flag.rotation.y = Math.PI / 2
  hull.add(flag)

  hull.castShadow = true
  return hull
}

function spawnShip() {
  const angleRad = (params.shipAngle || 0) * (Math.PI / 180)
  const dist = Math.max(0, Math.min(45, params.shipDistance || 30))
  const x = Math.cos(angleRad) * dist
  const z = Math.sin(angleRad) * dist

  const ship = createShipMesh()
  ship.position.set(x, 0.18, z)
  // choose a bright neon color for visibility
  const neonColors = [0xff44ff, 0xffee33, 0x33ffcc, 0xff66aa, 0x99ff33]
  const c = neonColors[Math.floor(Math.random() * neonColors.length)]
  if (ship.material) {
    ship.material.color.setHex(c)
    if (ship.material.emissive) ship.material.emissive.setHex(c)
  }
  ship.userData = {
    velocity: new THREE.Vector3(0, 0, 0),
    mass: 1.0,
    _origScale: ship.scale.clone(),
    _origEmissive: ship.material && ship.material.emissive ? ship.material.emissive.getHex() : 0x000000
  }
  scene.add(ship)
  ships.push(ship)
  return ship
}

function removeShip() {
  if (ships.length === 0) return
  const s = ships.pop()
  scene.remove(s)
}

function startReset() {
  // restore parameter defaults and restart simulation state
  Object.assign(params, initialState)
  params.running = true
  params.freeze = false

  // refresh GUI displays to match restored params
  try {
    if (gui && gui.__controllers && Array.isArray(gui.__controllers)) {
      gui.__controllers.forEach(c => c.updateDisplay && c.updateDisplay())
    }
  } catch (e) {
    console.warn('Failed to update GUI display after reset', e)
  }

  // clear particles and visuals
  resetParticles()

  // remove ships
  while (ships.length) {
    const s = ships.pop()
    scene.remove(s)
  }

  // remove NIW-like objects (those with userData.f or userData.depth)
  scene.children.slice().forEach(obj => {
    if (obj.userData && (obj.userData.f !== undefined || obj.userData.depth !== undefined)) {
      scene.remove(obj)
    }
  })

  // Attempt to play background sound (Howl)
  try {
    if (bgSound && bgSound.play) bgSound.play()
    // reset audio mapping to the restored parameter defaults
    try { updateSoundFromParams() } catch (e) { console.warn('updateSoundFromParams failed', e) }
  } catch (e) {
    console.warn('bgSound play failed on startReset', e)
  }
}

/* =========================
   CORIOLIS FORCE
   ========================= */
// Mathematical form implemented here:
// Coriolis acceleration a_c = -2 (Omega x v)
// We approximate Earth's angular velocity by a tunable `params.earthRotation` scale.
// Latitude dependence enters via the sin(phi) factor in the Coriolis parameter f = 2 Omega sin(phi).
// This function now accepts particle position to compute a local latitude factor.
function coriolis(v, pos) {
  // allow disabling the rotating-frame behavior
  if (params.earthRotation === 0 || !params.rotatingFrame) return new THREE.Vector3()

  const hemisphereSign = params.hemisphere === "Northern" ? 1 : -1
  // effective rotation magnitude (tunable for visualization)
  const omegaBase = params.earthRotation * 0.03 * hemisphereSign

  // compute latitude phi from z-position: map z in [-40,40] -> phi in [-pi/2, pi/2]
  let sinPhi = 1
  if (pos) {
    const clamped = Math.max(-40, Math.min(40, pos.z))
    const phi = (clamped / 40) * (Math.PI / 2)
    sinPhi = Math.sin(phi)
  }

  // build omega vector (pointing along +Y axis), scale by sinPhi if latitudeEffect is on
  const omegaY = omegaBase
  const omega = new THREE.Vector3(0, omegaY, 0)

  // compute omega x v (cross product) then multiply by -2 (we use sign convention via hemisphere)
  // multiplyScalar includes the Coriolis strength and optionally the sinPhi latitude factor
  const cor = new THREE.Vector3().copy(omega).cross(v).multiplyScalar(2 * params.coriolisStrength * (params.latitudeEffect ? Math.abs(sinPhi) : 1))
  return cor
}

/* =========================
   UPDATE LOOP
   ========================= */
function animate() {
  const dt = clock.getDelta()
  // Only advance particle spawning/physics when simulation is running
  if (params.running) {
    for (let i = 0; i < params.spawnRate; i++) {
      if (particles.length < 1000) spawnParticle()
    }
  }

  // diagnostics accumulators
  let roSum = 0
  let eotSum = 0
  let roCount = 0

  particles.forEach((p, i) => {
    const v = p.userData.velocity
    const base = p.userData.baseColor
    const baseEm = p.userData.baseEmissive
    const white = new THREE.Color(0xffffff)
    // use scene-wide max wind from params

    let t = Math.min(1, p.userData.age / p.userData.life)

    if (!params.freeze) {
      // advance age
      p.userData.age += dt
      t = Math.min(1, p.userData.age / p.userData.life)

      /* Thermal lift */
      if (p.userData.temp > 0) {
        v.y += 0.02 * params.convectionStrength * params.temperatureContrast
      } else {
        v.y -= 0.015 * params.convectionStrength
      }

      /* Pressure-gradient (inverse-radius) pull towards the eye */
      const rVec = new THREE.Vector3(p.position.x, 0, p.position.z)
      const rMag = rVec.length()
      if (rMag > 0.001) {
        const uR = rVec.clone().normalize()
        const toCenter = uR.clone().negate()
        const pressureStrength = 0.25 * params.pressurePull / (rMag + 0.5)
        v.add(toCenter.multiplyScalar(pressureStrength))

        const uTheta = new THREE.Vector3(-uR.z, 0, uR.x).normalize()
        const targetVTheta = p.userData.L / Math.max(rMag, 0.001)
        const currentVTheta = v.dot(uTheta)
        const adjust = (targetVTheta - currentVTheta) * 0.18
        v.add(uTheta.multiplyScalar(adjust))
      }

      /* Coriolis */
      const cor = coriolis(v, p.position)
      v.add(cor)

      /* Move */
      p.position.add(v)
      v.multiplyScalar(0.985)

      if (v.length() > params.maxWind) v.setLength(params.maxWind)

      // --- Inertial-frame (ghost) update: same forces but without Coriolis ---
      if (p.userData.ghost) {
        const g = p.userData.ghost
        g.visible = !!params.showInertial
        const gv = p.userData.inertialVelocity
        if (p.userData.temp > 0) gv.y += 0.02 * params.convectionStrength * params.temperatureContrast
        else gv.y -= 0.015 * params.convectionStrength

        const rVecG = new THREE.Vector3(g.position.x, 0, g.position.z)
        const rMagG = rVecG.length()
        if (rMagG > 0.001) {
          const uRG = rVecG.clone().normalize()
          const toCenterG = uRG.clone().negate()
          const pressureStrengthG = 0.25 * params.pressurePull / (rMagG + 0.5)
          gv.add(toCenterG.multiplyScalar(pressureStrengthG))

          const uThetaG = new THREE.Vector3(-uRG.z, 0, uRG.x).normalize()
          const targetVThetaG = p.userData.L / Math.max(rMagG, 0.001)
          const currentVThetaG = gv.dot(uThetaG)
          const adjustG = (targetVThetaG - currentVThetaG) * 0.18
          gv.add(uThetaG.multiplyScalar(adjustG))
        }

        g.position.add(gv)
        gv.multiplyScalar(0.985)
        if (gv.length() > params.maxWind) gv.setLength(params.maxWind)
      }

      if (p.position.length() > 45 || p.position.y > 30 || p.position.y < -3) {
        p.position.y = 0.2
        p.userData.velocity.set(0, 0, 0)
      }

      // if particle aged out, respawn it in-place (reuse mesh)
      if (p.userData.age >= p.userData.life) {
        const rr = Math.random() * 35
        const aa = Math.random() * Math.PI * 2
        p.position.set(Math.cos(aa) * rr, 0.2, Math.sin(aa) * rr)
        p.userData.age = 0
        p.userData.life = 4 + Math.random() * 6
        p.userData.temp = Math.random() > 0.5 ? 1 : -1
        p.userData.velocity.set(0, 0, 0)
        const vThetaInit2 = (params.earthRotation * 0.02 + Math.random() * 0.02) * (Math.random() > 0.5 ? 1 : -1)
        p.userData.L = Math.max(rr, 0.001) * vThetaInit2
        p.userData.baseColor = new THREE.Color(p.userData.temp > 0 ? 0xff5533 : 0x3388ff)
        p.userData.baseEmissive = new THREE.Color(p.userData.temp > 0 ? 0xff2200 : 0x1133aa)
        if (p.material) {
          p.material.color.copy(p.userData.baseColor)
          if (p.material.emissive) p.material.emissive.copy(p.userData.baseEmissive)
          p.material.opacity = 1.0
        }
        if (p.userData && p.userData.ghost) {
          p.userData.ghost.position.copy(p.position)
          p.userData.ghost.material.opacity = 0.35
          p.userData.ghost.visible = params.showInertial
          p.userData.inertialVelocity.set(0, 0, 0)
        }
      }
    } // end not frozen

    // --- Vector arrows: always update so inspector can read vectors while frozen ---
    const arrow = arrows[i]
    if (params.showVectors) {
      arrow.visible = true
      arrow.position.copy(p.position)
      const totalWind = v.clone()
      if (totalWind.length() < 0.0001) totalWind.set(0, 0, 1)
      arrow.setDirection(totalWind.clone().normalize())
      const mag = totalWind.length()
      const tCol = Math.min(1, mag / params.maxWind)
      const lowColor = new THREE.Color(0x88aaff)
      const midColor = new THREE.Color(0xffff99)
      const highColor = new THREE.Color(0xff5533)
      let col = new THREE.Color()
      if (tCol <= 0.5) {
        col.copy(lowColor).lerp(midColor, tCol * 2)
      } else {
        col.copy(midColor).lerp(highColor, (tCol - 0.5) * 2)
      }
      if (arrow.cone && arrow.cone.material && arrow.cone.material.color) arrow.cone.material.color.copy(col)
      if (arrow.line && arrow.line.material && arrow.line.material.color) arrow.line.material.color.copy(col)
      const arrowAlpha = (p.material && typeof p.material.opacity === 'number') ? p.material.opacity : Math.max(0, 1 - (p.userData.age / p.userData.life))
      if (arrow.cone && arrow.cone.material) arrow.cone.material.opacity = arrowAlpha
      if (arrow.line && arrow.line.material) arrow.line.material.opacity = arrowAlpha
      arrow.setLength(1.2)
    } else {
      arrow.visible = false
    }

    // --- Rossby number & Eötvös effect (per-particle diagnostics) ---
    const clampedZ = Math.max(-40, Math.min(40, p.position.z))
    const phi = (clampedZ / 40) * (Math.PI / 2)
    const OmegaSim = Math.abs(params.earthRotation * 0.03)
    const f = (params.latitudeEffect ? 2 * OmegaSim * Math.sin(phi) : 2 * OmegaSim)
    const U = v.length()
    let Ro = Infinity
    if (Math.abs(f) > 1e-6) {
      Ro = U / (Math.abs(f) * Math.max(1, params.lengthScale))
      roSum += Ro
      roCount += 1
    }
    const V_east = v.x
    const delta_g = 2 * OmegaSim * V_east * Math.cos(phi)
    eotSum += delta_g

    // --- Color overlay: either intensity classification (wind speed) or Rossby fallback ---
    if (p.material && p.material.color) {
      if (params.classificationPreset === 'Intensity (Wind Speed)') {
        // convert particle speed to kph for classification
        const kph = v.length() * params.kphPerUnit
        const cat = getIntensityCategory(kph)
        // blend category color toward white by age
        p.material.color.copy(cat.color).lerp(white, t)
        if (p.material.emissive) p.material.emissive.copy(cat.color).lerp(white, t * 0.6)
      } else if (params.showRossby && isFinite(Ro)) {
        const roNorm = Math.min(1, Ro / 2)
        const low = new THREE.Color(0x88aaff)
        const mid = new THREE.Color(0xffff99)
        const high = new THREE.Color(0xff5533)
        const roCol = new THREE.Color()
        if (roNorm <= 0.5) roCol.copy(low).lerp(mid, roNorm * 2)
        else roCol.copy(mid).lerp(high, (roNorm - 0.5) * 2)
        p.material.color.copy(roCol).lerp(white, t)
        if (p.material.emissive) p.material.emissive.copy(roCol).lerp(white, t * 0.6)
      } else {
        p.material.color.copy(base).lerp(white, t)
        if (p.material.emissive) p.material.emissive.copy(baseEm).lerp(white, t * 0.6)
      }
      p.material.opacity = Math.max(0, 1 - t)
    }
  })

  // --- Ship updates: apply pressure & Coriolis so they can be sucked into storm ---
  ships.forEach(s => {
    const v = s.userData.velocity
    if (!params.freeze) {
      // pressure pull toward eye
      const rVec = new THREE.Vector3(s.position.x, 0, s.position.z)
      const rMag = rVec.length()
      if (rMag > 0.001) {
        const uR = rVec.clone().normalize()
        const toCenter = uR.clone().negate()
        const pressureStrength = 0.35 * params.pressurePull / (rMag + 0.5)
        v.add(toCenter.multiplyScalar(pressureStrength))
        // Coriolis on the ship
        const cor = coriolis(v, s.position)
        v.add(cor)
      }
      // drag and integrate
      v.multiplyScalar(0.98)
      // limit ship top speed to a fraction of maxWind
      const maxShip = Math.max(1, params.maxWind * 0.6)
      if (v.length() > maxShip) v.setLength(maxShip)
      s.position.add(v)
      // keep ship floating at ocean surface
      s.position.y = 0.18
      // orient ship toward motion if moving
      if (v.length() > 0.05) {
        const heading = Math.atan2(v.z, v.x)
        s.rotation.y = -heading + Math.PI / 2
      }
    }
  })

  // update HUD with diagnostics
  // raycast for hover inspection (include ships)
  raycaster.setFromCamera(mouse, camera)
  const allPickables = particles.concat(ships)
  const intersects = raycaster.intersectObjects(allPickables, true)
  // climb up from child (flag/mast) to parent mesh if needed
  let picked = intersects.length ? intersects[0].object : null
  while (picked && !particles.includes(picked) && !ships.includes(picked)) picked = picked.parent
  hovered = picked || null
  if (hovered !== prevHovered) {
    if (prevHovered) {
      // restore previous
      prevHovered.scale.copy(prevHovered.userData._origScale)
      if (prevHovered.material && prevHovered.userData._origEmissive !== undefined && prevHovered.material.emissive) prevHovered.material.emissive.setHex(prevHovered.userData._origEmissive)
    }
    if (hovered) {
      hovered.scale.set(1.6, 1.6, 1.6)
      if (hovered.material && hovered.material.emissive) hovered.material.emissive.setHex(0xffffff)
    }
    prevHovered = hovered
  }

  // update inspector tooltip
  if (hovered) {
    const pv = hovered.position
    const vv = hovered.userData.velocity
    const speed = vv.length()

    // recompute Ro & Eötvös for hovered
    const clampedZ = Math.max(-40, Math.min(40, pv.z))
    const phi = (clampedZ / 40) * (Math.PI / 2)
    const OmegaSim = Math.abs(params.earthRotation * 0.03)
    const f = (params.latitudeEffect ? 2 * OmegaSim * Math.sin(phi) : 2 * OmegaSim)
    const Ro_hover = (Math.abs(f) > 1e-6) ? (speed / (Math.abs(f) * Math.max(1, params.lengthScale))) : Infinity
    const delta_g_hover = 2 * OmegaSim * vv.x * Math.cos(phi)

    // If this is a ship, show additional ship-specific diagnostics
    if (ships.includes(hovered)) {
      const rVec = new THREE.Vector3(pv.x, 0, pv.z)
      const rMag = rVec.length()
      let pressureStrength = 0
      let inwardVel = 0
      let eta = 'N/A'
      if (rMag > 0.001) {
        const uR = rVec.clone().normalize()
        pressureStrength = 0.35 * params.pressurePull / (rMag + 0.5)
        inwardVel = -vv.dot(uR)
        if (inwardVel > 0.02) eta = (rMag / inwardVel).toFixed(2) + ' s'
        else eta = '—'
      }
      const corVec = coriolis(vv.clone(), pv)
      const corMag = corVec.length()

      inspect.style.display = 'block'
      inspect.innerHTML = `Ship pos: (${pv.x.toFixed(1)}, ${pv.y.toFixed(2)}, ${pv.z.toFixed(1)})<br>Speed: ${speed.toFixed(2)} units/s<br>Pressure pull: ${pressureStrength.toFixed(3)}<br>Coriolis accel: ${corMag.toFixed(3)}<br>Inward vel: ${inwardVel.toFixed(3)} → ETA: ${eta}`
    } else {
      inspect.style.display = 'block'
      inspect.innerHTML = `Pos: (${pv.x.toFixed(2)}, ${pv.y.toFixed(2)}, ${pv.z.toFixed(2)})<br>Vel: (${vv.x.toFixed(2)}, ${vv.y.toFixed(2)}, ${vv.z.toFixed(2)}) speed=${speed.toFixed(2)}<br>Ro=${isFinite(Ro_hover)?Ro_hover.toFixed(2):'∞'} &nbsp; Δg=${delta_g_hover.toExponential(2)}`
    }
  } else {
    inspect.style.display = 'none'
  }
  if (hud) {
    const avgRo = roCount > 0 ? (roSum / roCount) : 0
    const avgEot = roCount > 0 ? (eotSum / Math.max(1, roCount)) : 0
    const roText = params.showRossby ? `Rossby (avg): ${avgRo.toFixed(2)}` : ''
    const eText = params.showEotvos ? `Eötvös (avg Δa): ${avgEot.toExponential(2)}` : ''
    const hudText = hud.querySelector('#hud-text')
    if (hudText) hudText.innerHTML = `${roText} &nbsp; ${eText}`

    // update legend for classification preset
    if (params.classificationPreset === 'Intensity (Wind Speed)') {
      // build legend list of categories with colors and kph ranges
      let html = ''
      for (let c of intensityPresetCategories) {
        const range = c.max === Infinity ? `${c.min}+ kph` : `${c.min}–${c.max} kph`
        html += `<div style="display:flex;align-items:center;margin-bottom:4px"><div style="width:18px;height:12px;background:${'#' + c.color.getHexString()};margin-right:8px;border-radius:3px"></div><div style="font-size:11px">${c.label}<br><span style='font-size:10px;opacity:0.85'>${range}</span></div></div>`
      }
      legend.innerHTML = html
    } else {
      // restore Rossby gradient legend
      legend.innerHTML = `
        <div style="width:110px;height:12px;border-radius:6px;margin-right:8px;background:linear-gradient(90deg,#88aaff,#ffff99,#ff5533)"></div>
        <div style="font-size:11px;line-height:12px">Rossby<br><span style='font-size:10px;opacity:0.8'>(low → high)</span></div>
      `
    }
  }

  // update background sound parameters from GUI every frame
  updateSoundFromParams()

  renderer.render(scene, camera)
  orbit.update()
  stats.update()
}

renderer.setAnimationLoop(animate)

// Resize
window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
})










