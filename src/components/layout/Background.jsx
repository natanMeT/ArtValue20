import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../../store/store.jsx';

/**
 * Obsidian ambient background: a slowly rotating wireframe Earth with a cyan
 * atmosphere glow, a soft points/stars shell, and a gentle floating drift.
 * Deep-blue + תכלת (cyan) palette. Decorative, pointer-events:none, behind all
 * content, fully guarded so a missing WebGL context never breaks the app.
 */
// ---- palette: deep blue + cyan (תכלת) ----
const COL_WIRE = 0x0a2e52;   // deep blue wireframe
const COL_EMIT = 0x0b3a6b;   // subtle blue self-glow
const COL_GLOW = 0x48cae4;   // cyan atmosphere halo
const COL_PTS = 0x90e0ef;    // light cyan stars
const COL_LIGHT = 0x0096c7;  // cyan-blue key light

export default function Background() {
  const { theme } = useStore();
  const globeRef = useRef(null);

  useEffect(() => {
    if (theme === 'light') return; // ambiance is dark-mode only
    if (window.innerWidth < 900) return; // skip heavy WebGL on phones/small tablets
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    let raf, renderer, onResize, t = 0;

    try {
      const container = globeRef.current;
      if (!container) return;
      const scene = new THREE.Scene();
      const W = window.innerWidth, H = window.innerHeight;
      const camera = new THREE.PerspectiveCamera(75, W / H, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0x223344, 2));
      const point = new THREE.PointLight(COL_LIGHT, 5, 100);
      point.position.set(10, 10, 10);
      scene.add(point);

      const group = new THREE.Group();
      scene.add(group);
      // deep-blue wireframe globe with a faint self-glow
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 64, 64),
        new THREE.MeshStandardMaterial({ color: COL_WIRE, emissive: COL_EMIT, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3, wireframe: true, transparent: true, opacity: 0.28 })
      ));
      // cyan atmosphere halo
      group.add(new THREE.Mesh(
        new THREE.SphereGeometry(2.6, 64, 64),
        new THREE.MeshBasicMaterial({ color: COL_GLOW, transparent: true, opacity: 0.07, side: THREE.BackSide })
      ));
      // soft cyan points/stars shell
      const points = new THREE.Points(
        new THREE.SphereGeometry(2.62, 32, 32),
        new THREE.PointsMaterial({ color: COL_PTS, size: 0.02, transparent: true, opacity: 0.7 })
      );
      group.add(points);

      camera.position.z = 6;
      group.rotation.x = 0.4;
      group.position.set(2.2, 0, 0);

      const animate = () => {
        t += 0.01;
        group.rotation.y += 0.003;
        group.position.y = Math.sin(t) * 0.12; // gentle floating drift
        renderer.render(scene, camera);
        if (!reduce) raf = requestAnimationFrame(animate);
      };
      raf = requestAnimationFrame(animate);

      onResize = () => {
        const w = window.innerWidth, h = window.innerHeight;
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);
    } catch { /* WebGL unavailable — ignore */ }

    return () => {
      cancelAnimationFrame(raf);
      if (onResize) window.removeEventListener('resize', onResize);
      try {
        renderer?.dispose();
        if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      } catch { /* noop */ }
    };
  }, [theme]);

  if (theme === 'light' || (typeof window !== 'undefined' && window.innerWidth < 900)) return null;
  return (
    <div className="bg-layer" aria-hidden="true">
      <div ref={globeRef} className="globe-container" />
    </div>
  );
}
