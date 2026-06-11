import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { getTheme } from '../game/levels'

/** 以等級為種子的偽隨機數,同一關場景永遠長一樣 */
function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Monument Valley 式的 3D 等距場景:
 * 正交相機 45° 俯瞰、Lambert 材質讓方塊三個面自然分出三種亮度、
 * 漂浮小島緩慢上下沉浮。每一關用種子重新生成一座新的浮空聖殿。
 */
export default function LevelBackground({ level }: { level: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const theme = getTheme(level)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const th = getTheme(level)
    const rnd = mulberry32(level * 9973 + 7)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.domElement.style.opacity = '0'
    renderer.domElement.style.transition = 'opacity 1s ease'
    mount.appendChild(renderer.domElement)
    requestAnimationFrame(() => {
      renderer.domElement.style.opacity = '1'
    })

    const scene = new THREE.Scene()

    // 等距視角
    const frustum = 13
    let aspect = mount.clientWidth / mount.clientHeight
    const camera = new THREE.OrthographicCamera(
      -frustum * aspect, frustum * aspect, frustum, -frustum, 0.1, 200,
    )
    camera.position.set(20, 16.5, 20)
    camera.lookAt(0, 1.5, 0)

    // 柔和天光 + 主向光 + 反方向的補色光
    scene.add(new THREE.HemisphereLight(new THREE.Color(th.sky[0]), new THREE.Color(th.sky[1]), 1.15))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.7)
    keyLight.position.set(8, 14, 5)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(new THREE.Color(th.accent), 0.4)
    fillLight.position.set(-8, 6, -7)
    scene.add(fillLight)

    const root = new THREE.Group()
    scene.add(root)

    const mats: THREE.Material[] = []
    const geos: THREE.BufferGeometry[] = []

    const lambert = (color: string, jitter = 0) => {
      const c = new THREE.Color(color)
      if (jitter) c.offsetHSL((rnd() - 0.5) * jitter, 0, (rnd() - 0.5) * 0.07)
      const m = new THREE.MeshLambertMaterial({ color: c })
      mats.push(m)
      return m
    }
    const glow = (color: string) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) })
      mats.push(m)
      return m
    }
    const add = (
      geo: THREE.BufferGeometry, mat: THREE.Material,
      x: number, y: number, z: number, parent: THREE.Object3D = root,
    ) => {
      geos.push(geo)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(x, y, z)
      parent.add(mesh)
      return mesh
    }
    const box = (
      w: number, h: number, d: number, mat: THREE.Material,
      x: number, y: number, z: number, parent: THREE.Object3D = root,
    ) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent)

    // ── 主島:階梯狀浮空底座 ──
    box(12, 2.4, 12, lambert(th.near), 0, -1.2, 0)
    box(9, 1.8, 9, lambert(th.near, 0.05), 0, -3.2, 0)
    box(6, 1.6, 6, lambert(th.near, 0.05), 0, -4.8, 0)
    box(3, 1.4, 3, lambert(th.far), 0, -6.2, 0)

    // ── 塔樓群 ──
    const spots: Array<[number, number]> = [
      [-3.6, -3.6], [0, -4.1], [3.8, -3.1], [-4.2, 0.4],
      [4.1, 0.9], [-2.6, 3.8], [0.9, 4.1], [3.6, 3.7],
    ]
    for (const [tx, tz] of spots) {
      if (rnd() < 0.22) continue
      const h = 2.5 + rnd() * 6
      const w = 1.0 + rnd() * 1.4
      const bodyMat = lambert(rnd() < 0.5 ? th.near : th.far, 0.07)
      if (rnd() < 0.3) {
        add(new THREE.CylinderGeometry(w * 0.55, w * 0.55, h, 14), bodyMat, tx, h / 2, tz)
      } else {
        box(w, h, w, bodyMat, tx, h / 2, tz)
      }
      // 塔頂:角錐 / 圓頂 / 簷板
      const cap = rnd()
      const capMat = lambert(th.accent)
      if (cap < 0.35) add(new THREE.ConeGeometry(w * 0.66, 1.4 + rnd(), 4), capMat, tx, h + 0.75, tz)
      else if (cap < 0.7) add(new THREE.SphereGeometry(w * 0.55, 16, 12), capMat, tx, h + 0.32, tz)
      else box(w * 1.3, 0.35, w * 1.3, capMat, tx, h + 0.18, tz)
      // 發光的窗
      if (rnd() < 0.7) {
        box(w * 0.22, w * 0.34, 0.12, glow(th.accent), tx, h * 0.55, tz + w / 2 + 0.04)
      }
    }

    // ── 階梯(Monument Valley 的招牌)──
    const stairMat = lambert(th.far, 0.05)
    const dir = rnd() < 0.5 ? 1 : -1
    for (let i = 0; i < 7; i++) {
      box(1.3, 0.5, 1.0, stairMat, dir * (5.4 - i * 0.85), 0.25 + i * 0.46, 5.4 - i * 0.3)
    }

    // ── 拱門 ──
    const archMat = lambert(th.near, 0.05)
    const ax = dir * -4.6
    box(0.7, 3.2, 0.7, archMat, ax - 1.1, 1.6, 4.6)
    box(0.7, 3.2, 0.7, archMat, ax + 1.1, 1.6, 4.6)
    box(3.4, 0.7, 0.9, archMat, ax, 3.4, 4.6)
    add(new THREE.ConeGeometry(0.55, 1.0, 4), lambert(th.accent), ax, 4.2, 4.6)

    // ── 漂浮小島 ──
    const sats: Array<{ g: THREE.Group; y0: number; sp: number }> = []
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group()
      const ang = i * 1.65 + rnd() * 0.8
      const r = 9.5 + rnd() * 4
      const y0 = -1.5 + rnd() * 7
      g.position.set(Math.cos(ang) * r, y0, Math.sin(ang) * r)
      const size = 1.6 + rnd() * 1.6
      box(size, 0.8, size, lambert(th.far, 0.06), 0, 0, 0, g)
      box(size * 0.55, 0.6, size * 0.55, lambert(th.near, 0.06), 0, -0.7, 0, g)
      const mh = 1.0 + rnd() * 1.6
      box(0.55, mh, 0.55, lambert(th.near, 0.06), 0, 0.4 + mh / 2, 0, g)
      add(new THREE.ConeGeometry(0.42, 0.8, 4), lambert(th.accent), 0, 0.85 + mh, 0, g)
      root.add(g)
      sats.push({ g, y0, sp: 0.35 + rnd() * 0.5 })
    }

    // ── 日 / 月圓盤 ──
    const disk = add(new THREE.CircleGeometry(2.6, 40), glow(th.accent), -10, 10.5, -14, scene)
    disk.lookAt(camera.position)
    const halo = add(
      new THREE.RingGeometry(3.4, 3.55, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(th.accent), transparent: true, opacity: 0.45, side: THREE.DoubleSide,
      }),
      -10, 10.5, -14, scene,
    )
    mats.push(halo.material as THREE.Material)
    halo.lookAt(camera.position)

    // ── 星空 ──
    if (th.stars) {
      const n = 260
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2
        const r2 = 28 + rnd() * 22
        pos[i * 3] = Math.cos(a) * r2
        pos[i * 3 + 1] = rnd() * 30 - 4
        pos[i * 3 + 2] = Math.sin(a) * r2
      }
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geos.push(sg)
      const sm = new THREE.PointsMaterial({ color: new THREE.Color(th.accent), size: 0.18 })
      mats.push(sm)
      scene.add(new THREE.Points(sg, sm))
    }

    const onResize = () => {
      aspect = mount.clientWidth / mount.clientHeight
      camera.left = -frustum * aspect
      camera.right = frustum * aspect
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let raf = 0
    const t0 = performance.now()
    const loop = () => {
      const t = (performance.now() - t0) / 1000
      root.rotation.y = Math.sin(t * 0.07) * 0.06
      root.position.y = Math.sin(t * 0.45) * 0.18
      for (const s of sats) {
        s.g.position.y = s.y0 + Math.sin(t * s.sp + s.y0) * 0.55
        s.g.rotation.y = t * 0.06 * s.sp
      }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      geos.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [level])

  return (
    <div
      className="bg"
      ref={mountRef}
      style={{ background: `linear-gradient(180deg, ${theme.sky[0]}, ${theme.sky[1]})` }}
    />
  )
}
