import * as THREE from 'three';

export function createOcean(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 }, classic: { value: 1 },
      deep: { value: new THREE.Color('#203c4d') }, shallow: { value: new THREE.Color('#3b5866') }
    },
    vertexShader: `
      uniform float time;
      varying vec3 surface;
      void main() {
        vec3 p = position;
        p.y += sin(p.x * 0.028 + time * 0.7) * 0.48
             + sin(p.z * 0.043 - time * 0.9) * 0.3;
        surface = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float time;
      uniform float classic;
      uniform vec3 deep;
      uniform vec3 shallow;
      varying vec3 surface;
      float grain(vec2 p) {
        return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453);
      }
      float smoothNoise(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(grain(cell), grain(cell + vec2(1.0,0.0)), f.x),
                   mix(grain(cell + vec2(0.0,1.0)), grain(cell + vec2(1.0,1.0)), f.x), f.y);
      }
      void main() {
        float dx = cos(surface.x * 0.028 + time * 0.7) * 0.01344
                 + cos(surface.x * 0.19 + surface.z * 0.11 + time) * 0.018;
        float dz = cos(surface.z * 0.043 - time * 0.9) * 0.0129
                 + cos(surface.x * 0.19 + surface.z * 0.11 + time) * 0.011;
        vec3 n = normalize(vec3(-dx, 1.0, -dz));
        vec3 viewDir = normalize(cameraPosition - surface);
        float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
        float wave = sin(surface.x * 0.17 + surface.z * 0.09 + time)
                   + sin(surface.x * 0.31 - surface.z * 0.24 - time * 0.8) * 0.4;
        float glint = pow(max(dot(reflect(normalize(vec3(0.4,-0.8,-0.2)), n), viewDir), 0.0), 80.0);
        vec3 color = mix(deep, shallow, 0.2 + fresnel * 0.75);
        color += wave * 0.009 + (grain(floor(surface.xz * 1.4)) - 0.5) * 0.045
               + glint * vec3(0.1,0.1,0.08);
        float swell = smoothNoise(surface.xz * 0.008 + vec2(time * 0.016, 0.0));
        float ripple = smoothNoise(surface.xz * 0.11 + vec2(0.0, time * 0.018));
        float chop = smoothNoise(vec2(surface.x*.24 + surface.z*.11, surface.z*.52) + time*.05);
        vec3 classicColor = mix(vec3(.039,.064,.087), vec3(.089,.124,.154),
                                swell*.34 + ripple*.41 + chop*.25);
        classicColor += (grain(floor(surface.xz * 1.4)) - 0.5) * .004;
        color = mix(color, classicColor, classic);
        float haze = smoothstep(1800.0, 8000.0, distance(cameraPosition, surface));
        gl_FragColor = vec4(mix(color, vec3(0.2,0.3,0.36), haze), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000, 32, 32).rotateX(-Math.PI / 2), material);
}
