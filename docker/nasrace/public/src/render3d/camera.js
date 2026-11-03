// Câmera aérea levemente inclinada, olhando da infield para a reta dos boxes. A roda do mouse
// aproxima em direção ao ponteiro, arrastar move, duplo clique volta para a vista geral. Ao se
// aproximar, a câmera inclina mais: de perto, é o ângulo baixo que mostra o relevo.

import { CIRCUIT, P, PIT } from '../circuit.js'
import { THREE } from './common.js'

const AZIMUTH = Math.PI + 0.03 // olha para oeste: a reta dos boxes fica no alto da tela
const PITCH_FAR = THREE.MathUtils.degToRad(61)
const PITCH_NEAR = THREE.MathUtils.degToRad(27)
const FOV = 22
const MIN_DISTANCE = 42

const damp = (current, goal, rate, dt) => goal + (current - goal) * Math.exp(-rate * dt)

export function createCameraRig(canvas, heightAt) {
  // Altitude média da pista: é o plano da vista geral.
  const focusHeight = P.reduce((sum, p) => sum + p.z, 0) / P.length
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 50, 12000)
  const state = {
    target: new THREE.Vector3(0, focusHeight, 0),
    goal: new THREE.Vector3(0, focusHeight, 0),
    distance: 2400,
    goalDistance: 2400,
    fitDistance: 2400,
    fitTarget: new THREE.Vector3(0, focusHeight, 0),
    follow: null,
    interacted: false,
    azimuth: AZIMUTH,
  }
  const ray = new THREE.Raycaster()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -focusHeight)
  const hit = new THREE.Vector3()

  // De perto, a câmera mira o chão de verdade: a reta dos boxes fica 25 m acima do miolo do
  // circuito, e mirar a altitude média jogaria o carro seguido para fora do quadro.
  const goalHeight = (x, z, distance) => {
    const near = 1 - THREE.MathUtils.smoothstep(distance, state.fitDistance * 0.35, state.fitDistance * 0.9)
    return focusHeight + (heightAt(x, -z) - focusHeight) * near
  }

  const pitchFor = (distance) => {
    const t = THREE.MathUtils.smoothstep(Math.log(distance), Math.log(MIN_DISTANCE * 1.5), Math.log(state.fitDistance * 0.85))
    return PITCH_NEAR + (PITCH_FAR - PITCH_NEAR) * t
  }

  const place = (cam, target, distance, pitch, azimuth = AZIMUTH) => {
    const cp = Math.cos(pitch), sp = Math.sin(pitch)
    cam.position.set(target.x - Math.cos(azimuth) * cp * distance, target.y + sp * distance, target.z - Math.sin(azimuth) * cp * distance)
    cam.up.set(0, 1, 0)
    cam.lookAt(target)
    cam.near = Math.max(1, distance * 0.08)
    cam.far = distance * 3 + 7000
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
  }

  /** Distância e alvo para o traçado inteiro caber, longe dos painéis. */
  function fit(aspect, pad) {
    const points = []
    for (let i = 0; i < P.length; i += 6) points.push(new THREE.Vector3(P[i].x, P[i].z, -P[i].y))
    for (let i = 0; i < PIT.length; i += 12) points.push(new THREE.Vector3(PIT[i].x, PIT[i].z, -PIT[i].y))
    const b = CIRCUIT.bounds
    const target = new THREE.Vector3((b[0] + b[2]) / 2, focusHeight, -(b[1] + b[3]) / 2)
    let distance = 2600
    const test = camera.clone()
    test.aspect = aspect
    const v = new THREE.Vector3()
    const right = new THREE.Vector3()
    const forward = new THREE.Vector3()
    for (let iter = 0; iter < 14; iter++) {
      place(test, target, distance, PITCH_FAR)
      let minX = 9, maxX = -9, minY = 9, maxY = -9
      for (const p of points) {
        v.copy(p).project(test)
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x)
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y)
      }
      const availX = 2 - pad.left - pad.right
      const availY = 2 - pad.top - pad.bottom
      const scale = Math.max((maxX - minX) / availX, (maxY - minY) / availY)
      distance *= scale
      // recentra na área livre da tela
      const cx = (minX + maxX) / 2 - (pad.left - pad.right) / 2
      const cy = (minY + maxY) / 2 - (pad.bottom - pad.top) / 2
      const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * distance
      test.getWorldDirection(forward)
      right.crossVectors(forward, test.up).normalize()
      forward.y = 0
      forward.normalize()
      target.addScaledVector(right, cx * halfH * aspect)
      target.addScaledVector(forward, (cy * halfH) / Math.sin(PITCH_FAR))
    }
    state.fitDistance = distance
    state.fitTarget.copy(target)
    if (!state.interacted) {
      state.distance = state.goalDistance = distance
      state.target.copy(target)
      state.goal.copy(target)
    }
  }

  const pointer = new THREE.Vector2()
  const toNdc = (event) => {
    const rect = canvas.getBoundingClientRect()
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    return pointer
  }
  const groundUnder = (ndc, cam) => {
    ray.setFromCamera(ndc, cam)
    return ray.ray.intersectPlane(ground, hit) ? hit.clone() : null
  }

  // Câmera de cálculo: posicionada no estado-meta, não na animação em curso.
  const probe = new THREE.PerspectiveCamera(FOV, 1, 1, 12000)
  const placeProbe = (target, distance) => {
    probe.aspect = camera.aspect
    place(probe, target, distance, pitchFor(distance))
  }

  const clampGoal = () => {
    const limit = 1500
    const area = state.fitTarget
    state.goal.x = THREE.MathUtils.clamp(state.goal.x, area.x - limit, area.x + limit)
    state.goal.z = THREE.MathUtils.clamp(state.goal.z, area.z - limit, area.z + limit)
    // quanto mais longe, menos se pode afastar do centro: não deixa ver o fim do terreno
    const room = THREE.MathUtils.clamp(1 - state.goalDistance / state.fitDistance, 0, 1) * 1500 + 40
    state.goal.x = THREE.MathUtils.clamp(state.goal.x, area.x - room, area.x + room)
    state.goal.z = THREE.MathUtils.clamp(state.goal.z, area.z - room, area.z + room)
  }

  /** Aproxima em volta de um ponto da tela, para ele ficar parado sob o mouse ou os dedos. */
  const zoomAt = (ndc, factor) => {
    state.interacted = true
    state.follow = null
    state.goal.y = goalHeight(state.goal.x, state.goal.z, state.goalDistance)
    ground.constant = -state.goal.y
    placeProbe(state.goal, state.goalDistance)
    const before = groundUnder(ndc, probe)
    state.goalDistance = THREE.MathUtils.clamp(state.goalDistance * factor, MIN_DISTANCE, state.fitDistance)
    placeProbe(state.goal, state.goalDistance)
    const after = groundUnder(ndc, probe)
    if (before && after) state.goal.add(before.sub(after))
    if (state.goalDistance >= state.fitDistance * 0.999) state.goal.copy(state.fitTarget)
    clampGoal()
  }

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault()
    zoomAt(toNdc(event), Math.exp(THREE.MathUtils.clamp(event.deltaY, -240, 240) * 0.0018))
  }, { passive: false })

  let dragging = null
  const startDrag = (at) => {
    ground.constant = -state.goal.y
    placeProbe(state.goal, state.goalDistance)
    dragging = { start: groundUnder(toNdc(at), probe), moved: false, x: at.clientX, y: at.clientY }
  }
  // Dedos na tela: com dois, a distância entre eles comanda a aproximação.
  const fingers = new Map()
  const fingerGap = () => {
    const [a, b] = fingers.values()
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }
  let pinch = 0
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    canvas.setPointerCapture(event.pointerId)
    fingers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    if (fingers.size === 2) {
      dragging = null
      pinch = fingerGap()
    } else if (fingers.size === 1) {
      startDrag(event)
    }
  })
  canvas.addEventListener('pointermove', (event) => {
    if (fingers.has(event.pointerId)) fingers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    if (fingers.size >= 2) {
      const [a, b] = fingers.values()
      const gap = fingerGap()
      if (gap > 0 && pinch > 0) zoomAt(toNdc({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }), pinch / gap)
      pinch = gap
      return
    }
    if (!dragging?.start) return
    if (!dragging.moved && Math.hypot(event.clientX - dragging.x, event.clientY - dragging.y) < 4) return
    dragging.moved = true
    state.interacted = true
    state.follow = null
    placeProbe(state.goal, state.goalDistance)
    const now = groundUnder(toNdc(event), probe)
    if (now) {
      state.goal.add(dragging.start.clone().sub(now))
      clampGoal()
    }
  })
  const release = (event) => {
    fingers.delete(event.pointerId)
    dragging = null
    // o dedo que ficou continua arrastando de onde está
    if (fingers.size === 1) startDrag([...fingers.values()][0])
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('dblclick', () => reset())

  function reset() {
    state.follow = null
    state.goalDistance = state.fitDistance
    state.goal.copy(state.fitTarget)
  }

  return {
    camera,
    state,
    fit,
    reset,
    /** Acompanha um carro; `null` larga. */
    follow(car) {
      state.interacted = true
      state.follow = car
      if (car) state.goalDistance = Math.min(state.goalDistance, 150)
    },
    pixelsPerMetre(heightPx) {
      const dist = camera.position.distanceTo(state.target)
      return heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * dist)
    },
    update(dt, aspect) {
      const rate = state.follow ? 5 : 9
      if (state.follow) {
        // Mira à frente do carro: a suavização deixaria a câmera atrás dele, e de perto ele sairia do quadro.
        const lead = (state.follow.speed ?? 0) / rate
        state.goal.x = state.follow.x + Math.cos(state.follow.heading) * lead
        state.goal.z = -(state.follow.y + Math.sin(state.follow.heading) * lead)
      }
      state.goal.y = state.follow ? state.follow.z : goalHeight(state.goal.x, state.goal.z, state.goalDistance)
      state.distance = Math.exp(damp(Math.log(state.distance), Math.log(state.goalDistance), rate, dt))
      state.target.x = damp(state.target.x, state.goal.x, rate, dt)
      state.target.y = damp(state.target.y, state.goal.y, rate, dt)
      state.target.z = damp(state.target.z, state.goal.z, rate, dt)
      camera.aspect = aspect
      // O prédio dos boxes fica entre a câmera e o pit lane: seguindo um carro parado ali, ela
      // dá a volta e olha da reta para as garagens. Ao sair do box, volta sozinha.
      const inBox = state.follow?.state === 'inPit' && state.follow.speed < 8
      state.azimuth = damp(state.azimuth, inBox ? 0.42 : AZIMUTH, 1.8, dt)
      place(camera, state.target, state.distance, pitchFor(state.distance), state.azimuth)
    },
    /** Tudo parado? Permite o teste automático fotografar uma vista exata. */
    jump(x, y, distance) {
      state.interacted = true
      state.follow = null
      state.goal.set(x, heightAt(x, y), -y)
      state.target.copy(state.goal)
      state.distance = state.goalDistance = distance
    },
  }
}
