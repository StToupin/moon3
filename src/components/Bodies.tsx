import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { Matrix4, Quaternion, TextureLoader, Vector3 } from "three";
import * as THREE from "three";
import type { Line2 } from "three-stdlib";
import type { SolarSystem } from "./types";
import { withBase } from "../basePath";

function quaternionFromMatrix(directionMatrix: number[][]): Quaternion {
  const matrix4 = new Matrix4().set(
    directionMatrix[0][0],
    directionMatrix[0][2],
    -directionMatrix[0][1],
    0,
    directionMatrix[1][0],
    directionMatrix[1][2],
    -directionMatrix[1][1],
    0,
    directionMatrix[2][0],
    directionMatrix[2][2],
    -directionMatrix[2][1],
    0,
    0,
    0,
    0,
    1,
  );

  const quaternion = new Quaternion();
  quaternion.setFromRotationMatrix(matrix4);
  return quaternion;
}

interface BodiesProps {
  solarSystem: SolarSystem;
  schematicMode?: boolean;
  hideEarth?: boolean;
  showEarthTexture?: boolean;
  showSunTexture?: boolean;
  showOrbits?: boolean;
}

const SCHEMATIC_SUN_SCALE = 35;
const SCHEMATIC_EARTH_SCALE = 1300;
const SCHEMATIC_MOON_SCALE = 1700;
const SCHEMATIC_MOON_ORBIT_SCALE = 50;
const SCHEMATIC_TRANSITION_DURATION = 0.3;
const SUN_TEXTURE_URL = withBase("sun-texture.jpg");
const EARTH_TEXTURE_URL = withBase("earth-texture.jpg");
const MOON_TEXTURE_URL = withBase("moon-texture.webp");
const MOON_ELEVATION_URL = withBase("moon-elevation.webp");

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpArray(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function interpolateOrbitPoints(
  normalOrbit: Vector3[],
  schematicOrbit: Vector3[],
  progress: number,
): Vector3[] {
  return normalOrbit.map((normalPoint, index) => {
    const schematicPoint = schematicOrbit[index];
    return new Vector3(
      lerp(normalPoint.x, schematicPoint.x, progress),
      lerp(normalPoint.y, schematicPoint.y, progress),
      lerp(normalPoint.z, schematicPoint.z, progress),
    );
  });
}

function flattenOrbitPoints(points: Vector3[]): Float32Array {
  const flattenedPoints = new Float32Array(points.length * 3);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const offset = index * 3;
    flattenedPoints[offset] = point.x;
    flattenedPoints[offset + 1] = point.y;
    flattenedPoints[offset + 2] = point.z;
  }

  return flattenedPoints;
}

function updateOrbitLine(line: Line2 | null, points: Vector3[]) {
  if (!line) {
    return;
  }

  line.geometry.setPositions(flattenOrbitPoints(points));
  line.geometry.computeBoundingSphere();
}

function SunTexturedMaterial() {
  const texture = useLoader(TextureLoader, SUN_TEXTURE_URL);

  return (
    <meshStandardMaterial
      emissive="#ffffff"
      emissiveIntensity={2}
      emissiveMap={texture}
      map={texture}
      roughness={1}
      toneMapped={false}
    />
  );
}

function SunPlainMaterial() {
  return (
    <meshStandardMaterial
      color="#ffd43b"
      emissive="#ffd43b"
      emissiveIntensity={2}
      wireframe
    />
  );
}

function EarthTexturedMaterial() {
  const texture = useLoader(TextureLoader, EARTH_TEXTURE_URL);

  return <meshStandardMaterial map={texture} roughness={1} />;
}

function EarthPlainMaterial() {
  return <meshStandardMaterial color="#4b7dff" roughness={1} />;
}

export function Bodies({
  solarSystem,
  schematicMode = false,
  hideEarth = false,
  showEarthTexture = false,
  showSunTexture = false,
  showOrbits = true,
}: BodiesProps) {
  const [moonColorTexture, moonElevationTexture] = useLoader(TextureLoader, [
    MOON_TEXTURE_URL,
    MOON_ELEVATION_URL,
  ]);

  const animationProgress = useRef(schematicMode ? 1 : 0);
  const targetProgress = schematicMode ? 1 : 0;
  const sunRef = useRef<THREE.Mesh>(null);
  const earthRef = useRef<THREE.Mesh>(null);
  const moonRef = useRef<THREE.Mesh>(null);
  const moonOrbitLineRef = useRef<Line2 | null>(null);

  const states = useMemo(() => {
    const realEarthPosition = new Vector3(...solarSystem.EARTH.position);
    const realMoonPosition = new Vector3(...solarSystem.MOON.position);
    const earthToMoon = realMoonPosition.clone().sub(realEarthPosition);
    const schematicMoonPosition = realEarthPosition
      .clone()
      .add(earthToMoon.multiplyScalar(SCHEMATIC_MOON_ORBIT_SCALE));

    const rawMoonOrbit = (solarSystem.MOON.orbit ?? []).map(
      (point) => new Vector3(point[0], point[1], point[2]),
    );
    // The orbit data is generated so the first point corresponds to "now".
    // Re-align it to the live moon position to avoid visible jumps when the
    // orbit query briefly lags behind the ephemeris query during playback.
    const moonOrbitAlignment =
      rawMoonOrbit.length > 0
        ? realMoonPosition.clone().sub(rawMoonOrbit[0])
        : new Vector3();
    const normalMoonOrbit = rawMoonOrbit.map((point) =>
      point.clone().add(moonOrbitAlignment),
    );
    const schematicMoonOrbit = normalMoonOrbit.map((point) => {
      const earthToPoint = point.clone().sub(realEarthPosition);
      const scaledOffset = earthToPoint.multiplyScalar(
        SCHEMATIC_MOON_ORBIT_SCALE,
      );
      return realEarthPosition.clone().add(scaledOffset);
    });

    return {
      normal: {
        sunScale: solarSystem.SUN.radii,
        earthPosition: solarSystem.EARTH.position,
        moonPosition: solarSystem.MOON.position,
        earthScale: solarSystem.EARTH.radii,
        moonScale: solarSystem.MOON.radii,
        moonOrbit: normalMoonOrbit,
      },
      schematic: {
        sunScale: solarSystem.SUN.radii.map(
          (radius) => radius * SCHEMATIC_SUN_SCALE,
        ) as [number, number, number],
        earthPosition: solarSystem.EARTH.position,
        moonPosition: [
          schematicMoonPosition.x,
          schematicMoonPosition.y,
          schematicMoonPosition.z,
        ] as [number, number, number],
        earthScale: solarSystem.EARTH.radii.map(
          (radius) => radius * SCHEMATIC_EARTH_SCALE,
        ) as [number, number, number],
        moonScale: solarSystem.MOON.radii.map(
          (radius) => radius * SCHEMATIC_MOON_SCALE,
        ) as [number, number, number],
        moonOrbit: schematicMoonOrbit,
      },
    };
  }, [solarSystem]);
  const applyMoonOrbitPoints = useCallback((points: Vector3[]) => {
    updateOrbitLine(moonOrbitLineRef.current, points);
  }, []);

  useFrame((_, delta) => {
    const speed = 1 / SCHEMATIC_TRANSITION_DURATION;
    const previousProgress = animationProgress.current;

    if (animationProgress.current < targetProgress) {
      animationProgress.current = Math.min(
        animationProgress.current + delta * speed,
        targetProgress,
      );
    } else if (animationProgress.current > targetProgress) {
      animationProgress.current = Math.max(
        animationProgress.current - delta * speed,
        targetProgress,
      );
    }

    const transition = animationProgress.current;
    const { normal, schematic } = states;

    if (sunRef.current) {
      const scale = lerpArray(normal.sunScale, schematic.sunScale, transition);
      sunRef.current.scale.set(scale[0], scale[1], scale[2]);
    }

    if (earthRef.current) {
      const scale = lerpArray(
        normal.earthScale,
        schematic.earthScale,
        transition,
      );
      earthRef.current.scale.set(scale[0], scale[1], scale[2]);
    }

    if (moonRef.current) {
      const position = lerpArray(
        normal.moonPosition,
        schematic.moonPosition,
        transition,
      );
      moonRef.current.position.set(position[0], position[1], position[2]);

      const scale = lerpArray(normal.moonScale, schematic.moonScale, transition);
      moonRef.current.scale.set(scale[0], scale[1], scale[2]);
    }

    if (previousProgress !== transition && normal.moonOrbit.length > 0) {
      applyMoonOrbitPoints(
        interpolateOrbitPoints(normal.moonOrbit, schematic.moonOrbit, transition),
      );
    }
  });

  const earthOrbitPoints = useMemo(
    () =>
      (solarSystem.EARTH.orbit ?? []).map(
        (point) => new Vector3(point[0], point[1], point[2]),
      ),
    [solarSystem.EARTH.orbit],
  );

  useLayoutEffect(() => {
    if (!showOrbits) {
      return;
    }

    const transition = animationProgress.current;
    const { normal, schematic } = states;

    if (normal.moonOrbit.length > 0) {
      applyMoonOrbitPoints(
        interpolateOrbitPoints(normal.moonOrbit, schematic.moonOrbit, transition),
      );
    }
  }, [applyMoonOrbitPoints, showOrbits, states]);

  return (
    <>
      <mesh
        ref={sunRef}
        position={solarSystem.SUN.position}
        quaternion={quaternionFromMatrix(solarSystem.SUN.rotationMatrix)}
        scale={states.normal.sunScale}
      >
        <sphereGeometry args={[1, 32, 16]} />
        {showSunTexture ? <SunTexturedMaterial /> : <SunPlainMaterial />}
      </mesh>

      {!hideEarth && (
        <>
          <mesh
            ref={earthRef}
            position={solarSystem.EARTH.position}
            quaternion={quaternionFromMatrix(solarSystem.EARTH.rotationMatrix)}
            scale={states.normal.earthScale}
          >
            <sphereGeometry args={[1, 64, 64]} />
            {showEarthTexture ? <EarthTexturedMaterial /> : <EarthPlainMaterial />}
          </mesh>
          {showOrbits && earthOrbitPoints.length >= 2 && (
            <Line points={earthOrbitPoints} color="blue" lineWidth={2} />
          )}
        </>
      )}

      <mesh
        ref={moonRef}
        position={solarSystem.MOON.position}
        quaternion={quaternionFromMatrix(solarSystem.MOON.rotationMatrix)}
        scale={states.normal.moonScale}
      >
        <sphereGeometry args={[1, 64, 64]} />
        <meshPhongMaterial
          map={moonColorTexture}
          bumpMap={moonElevationTexture}
          bumpScale={4}
          shininess={0}
        />
      </mesh>

      {showOrbits && states.normal.moonOrbit.length >= 2 && (
        <Line
          ref={moonOrbitLineRef}
          color="white"
          lineWidth={2}
          points={states.normal.moonOrbit}
        />
      )}
    </>
  );
}
