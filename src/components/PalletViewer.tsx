// @ts-nocheck — incremental TS migration: file renamed to .tsx, strict typing pending
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Edges } from '@react-three/drei';
import { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { PALLET } from '../data/boxes';

function PalletBoard() {
  return (
    <mesh position={[PALLET.length / 2, PALLET.height / 2, PALLET.width / 2]}>
      <boxGeometry args={[PALLET.length, PALLET.height, PALLET.width]} />
      <meshStandardMaterial color="#92400e" roughness={0.9} />
      <Edges color="#451a03" />
    </mesh>
  );
}

function HeightLimitPlane() {
  const y = PALLET.maxTotalHeight;
  return (
    <mesh position={[PALLET.length / 2, y, PALLET.width / 2]}>
      <boxGeometry args={[PALLET.length, 0.3, PALLET.width]} />
      <meshStandardMaterial color="#ef4444" transparent opacity={0.18} />
      <Edges color="#ef4444" />
    </mesh>
  );
}

function ZoneOverlay({ zone, colorMap }) {
  if (!zone?.rect) return null;
  const { x, y, l, w } = zone.rect;
  const color = colorMap[zone.typeId] || '#888';
  return (
    <mesh position={[x + l / 2, PALLET.height + 0.5, y + w / 2]}>
      <boxGeometry args={[l, 0.2, w]} />
      <meshStandardMaterial color={color} transparent opacity={0.12} />
    </mesh>
  );
}

/* One instanced-mesh per box type for performance.
 * Locked boxes (b._locked) render with a vivid green emissive edge so the
 * user clearly sees what's frozen and won't move on next Optimize. */
function BoxInstances({ boxes, color, baseOpacity, activeLayer }) {
  if (boxes.length === 0) return null;

  // Split locked vs free first; then by active layer.
  const lockedBxs = boxes.filter((b) => b._locked);
  const freeBxs = boxes.filter((b) => !b._locked);

  const splitByLayer = (arr) => {
    if (activeLayer === null) return [arr, []];
    return [
      arr.filter((b) => (b.layerIndex ?? b.layer_index) === activeLayer),
      arr.filter((b) => (b.layerIndex ?? b.layer_index) !== activeLayer),
    ];
  };

  const [activeFree, inactiveFree] = splitByLayer(freeBxs);
  const [activeLocked, inactiveLocked] = splitByLayer(lockedBxs);

  return (
    <>
      {activeFree.length > 0 && (
        <InstanceGroup boxes={activeFree} color={color}
          opacity={baseOpacity} emissive={activeLayer !== null} />
      )}
      {inactiveFree.length > 0 && (
        <InstanceGroup boxes={inactiveFree} color={color}
          opacity={0.07} emissive={false} />
      )}
      {activeLocked.length > 0 && (
        <InstanceGroup boxes={activeLocked} color={color}
          opacity={baseOpacity} emissive={false} locked />
      )}
      {inactiveLocked.length > 0 && (
        <InstanceGroup boxes={inactiveLocked} color={color}
          opacity={0.18} emissive={false} locked />
      )}
    </>
  );
}

function InstanceGroup({ boxes, color, opacity, emissive, locked }) {
  const meshRef = useRef();
  const edgeRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // useEffect runs AFTER mount so refs.current are always valid.
  // Re-runs whenever boxes array changes (new result from API).
  useEffect(() => {
    if (!meshRef.current) return;
    boxes.forEach((b, i) => {
      dummy.position.set(
        b.x + b.l / 2,
        PALLET.height + b.z + b.h / 2,
        b.y + b.w / 2
      );
      dummy.scale.set(b.l, b.h, b.w);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
      if (edgeRef.current) edgeRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (edgeRef.current) edgeRef.current.instanceMatrix.needsUpdate = true;
  }, [boxes, dummy]);

  return (
    <>
      <instancedMesh ref={meshRef} args={[null, null, boxes.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opacity}
          roughness={0.55}
          emissive={emissive ? color : (locked ? '#22c55e' : '#000000')}
          emissiveIntensity={emissive ? 0.08 : (locked ? 0.18 : 0)}
        />
      </instancedMesh>
      {/* Bright green wireframe overlay for locked boxes */}
      {locked && (
        <instancedMesh ref={edgeRef} args={[null, null, boxes.length]}>
          <boxGeometry args={[1.005, 1.005, 1.005]} />
          <meshBasicMaterial
            color="#22c55e"
            wireframe
            transparent
            opacity={0.85}
          />
        </instancedMesh>
      )}
    </>
  );
}

export default function PalletViewer({ placedBoxes, colorMap, activeLayer, transparency, zones }) {
  // Group boxes by typeId
  const boxGroups = useMemo(() => {
    const groups = {};
    for (const b of (placedBoxes || [])) {
      const tid = b.typeId || b.type_id || 'unknown';
      if (!groups[tid]) groups[tid] = [];
      groups[tid].push(b);
    }
    return groups;
  }, [placedBoxes]);

  return (
    <div style={{ width: '100%', height: '100%', background: '#020617' }}>
      <Canvas
        camera={{ position: [230, 200, 200], fov: 35 }}
        shadows
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[150, 320, 200]} intensity={1.2} castShadow />
        <directionalLight position={[-150, 200, -150]} intensity={0.35} />

        <group position={[-PALLET.length / 2, 0, -PALLET.width / 2]}>
          <PalletBoard />
          <HeightLimitPlane />

          {/* Zone overlays */}
          {(zones || []).map((z) => (
            <ZoneOverlay key={z.id} zone={z} colorMap={colorMap} />
          ))}

          {/* Box instances per type */}
          {Object.entries(boxGroups).map(([typeId, boxes]) => (
            <BoxInstances
              key={typeId}
              boxes={boxes}
              color={colorMap[typeId] || '#888888'}
              baseOpacity={transparency}
              activeLayer={activeLayer}
            />
          ))}
        </group>

        <Grid
          args={[500, 500]}
          cellSize={10}
          cellColor="#1e293b"
          sectionSize={60}
          sectionColor="#334155"
          fadeDistance={600}
          infiniteGrid
          position={[0, 0, 0]}
        />
        <OrbitControls
          enableDamping
          dampingFactor={0.07}
          makeDefault
          target={[0, 70, 0]}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
}