import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- Noise ----------
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry(5752);
const perm = new Uint8Array(512);
{ const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
function snoise(xin, yin) {
  const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s), t = (i + j) * G2;
  const x0 = xin - (i - t), y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0, tt, g;
  tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { tt *= tt; g = G[perm[ii + perm[jj]] & 7]; n += tt * tt * (g[0] * x0 + g[1] * y0); }
  tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { tt *= tt; g = G[perm[ii + i1 + perm[jj + j1]] & 7]; n += tt * tt * (g[0] * x1 + g[1] * y1); }
  tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { tt *= tt; g = G[perm[ii + 1 + perm[jj + 1]] & 7]; n += tt * tt * (g[0] * x2 + g[1] * y2); }
  return 70 * n;
}
function ridged(x, y, oct) {
  let sum = 0, f = 1, a = 0.5, prev = 1;
  for (let o = 0; o < oct; o++) { let n = 1 - Math.abs(snoise(x * f, y * f)); n *= n; sum += n * a * prev; prev = Math.min(1, n * 1.4); a *= 0.46; f *= 2.07; }
  return sum * 1.25;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ---------- Geography (GPS → mundo, 1 u = 1 m vertical; horizontal ×1.4 para jugabilidad) ----------
const LAT0 = -9.02, LON0 = -77.63, HS = 1.4;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180) * HS, KZ = 110574 * HS;
const proj = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const BASE = 3900, TOP = 5752;
let SX = -169, SZ = -1274;
// Cumbres reales alrededor del valle de Llanganuco y Campo Base:
// Huandoy (6395 m, a la izquierda del Campo Base), Huascarán Sur (6768 m) y Norte (6655 m, gemelos al mirar atrás en la subida),
// Chopicalqui (6354 m) y Chacraraju / Yanapaccha (al mirar atrás desde la cima previa al campamento)
const NEIGH = [
  [-1420, -640, 2495, 1420, 1.24],   // Nevado Huandoy (6,395 m) - a la izquierda del Campo Base
  [1850, 3950, 2868, 2900, 1.34],    // Huascarán Sur (6,768 m) - atrás al fondo mirando desde la subida
  [780, 4150, 2755, 2650, 1.34],     // Huascarán Norte (6,655 m) - cumbre gemela junto al Sur
  [3350, 2750, 2454, 2550, 1.36],    // Chopicalqui (6,354 m) - atrás a la izquierda
  [-1150, 3200, 2212, 2250, 1.35],   // Chacraraju (6,112 m) - atrás a la derecha
  [2450, 950, 1980, 1950, 1.40],     // Yanapaccha (5,460 m)
  [-480, -8200, 2125, 3600, 1.5],
  [-5200, -3000, 1900, 3500, 1.5],
  [-4800, 3500, 1700, 3500, 1.5],
  [7800, -4200, 1900, 3600, 1.5]
];
function Bh(x, z, oct = 6) {
  const r = ridged(x * 0.0011 + 11.3, z * 0.0011 - 4.7, oct);
  const dx = x - SX, dz = z - SZ, d = Math.sqrt(dx * dx + dz * dz);
  let y = 1900 * Math.pow(Math.max(0, 1 - d / 2450), 1.32) * (0.84 + 0.26 * r);
  if (d < 480) y = Math.max(y, 1852 - 0.0016 * d * d);
  const r2 = ridged(x * 0.0017 + 3.3, z * 0.0017 + 8.1, Math.min(oct, 5));
  for (let k = 0; k < NEIGH.length; k++) {
    const p = NEIGH[k], ex = x - p[0], ez = z - p[1], dd = Math.sqrt(ex * ex + ez * ez);
    if (dd < p[3]) y += p[2] * Math.pow(1 - dd / p[3], p[4]) * (0.72 + 0.40 * r2);
  }
  y += 90 * (r2 - 0.45) * Math.min(1, Math.max(0, y) / 600);
  y += 40 * snoise(x * 0.0005, z * 0.0005);
  y += 5 * snoise(x * 0.012, z * 0.012) + 1.8 * snoise(x * 0.05 + 3.1, z * 0.05);
  return y;
}

// ---------- Shaders con Mapeo Triplanar y Micro-Relieve PBR ----------
const NOISE_GLSL = `
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5;} return s; }
float triFbm(vec3 p, vec3 n, float sc){
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  return fbm(p.yz * sc) * w.x + fbm(p.xz * sc) * w.y + fbm(p.xy * sc) * w.z;
}
`;
const terrainVS = `varying vec3 vW; varying vec3 vN;
void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`;
const terrainFS = `
uniform vec3 uSunDir,uSunCol,uMoonDir,uMoonCol,uSky,uGround,uFogCol,uCam,uHeadCol,uTentCol;
uniform vec3 uHeadPos,uHeadDir,uHead2Pos,uHead2Dir;
uniform float uSunI,uLightLine,uFogD,uHeadI,uTentI,uSnowL,uTop,uSunK;
uniform vec3 uTents[8],uAmb,uCebP,uCampP;
uniform sampler2D uTrail; uniform vec3 uGrid;
varying vec3 vW; varying vec3 vN;
${NOISE_GLSL}
vec3 hl(vec3 P, vec3 D, vec3 N){ vec3 L=P-vW; float d2=dot(L,L); vec3 l=L*inversesqrt(d2);
  float cone=smoothstep(0.78,0.95,dot(-l,D)); return uHeadCol*min((cone*7.+0.35)*max(dot(N,l),0.)/(1.+d2*0.05),0.85); }
void main(){
  vec3 N0=normalize(vN); float h=vW.y; float slope=1.-N0.y;
  float fd=length(uCam-vW);
  float detailFade = 1.0 - smoothstep(25.0, 220.0, fd);
  float n=fbm(vW.xz*0.035); float nf=fbm(vW.xz*0.42);
  float triCoarse = triFbm(vW, N0, 0.22);
  float triFine = triFbm(vW, N0, 1.85);
  float triMicro = vnoise(vW.xz * 7.5 + vW.y * 3.2);

  // Perturbación de normales triplanares para textura realista de roca, ichu y hielo
  vec3 dN = vec3(
    (vnoise(vW.yz*1.8) - 0.5) + (vnoise(vW.xz*6.5) - 0.5)*0.6,
    0.0,
    (vnoise(vW.xy*1.8) - 0.5) + (vnoise(vW.zx*6.5) - 0.5)*0.6
  ) * (0.28 * detailFade);
  vec3 N = normalize(N0 + dN);

  // Granodiorita andina (batolito de la Cordillera Blanca) + estratos y líquenes
  vec3 darkGranite = vec3(0.11, 0.105, 0.10);
  vec3 paleGranite = vec3(0.46, 0.44, 0.41);
  vec3 rock = mix(darkGranite, paleGranite, clamp(n*0.65 + triCoarse*0.55 - 0.08, 0., 1.));
  float strata = 0.84 + 0.26 * vnoise(vec2(vW.y * 0.24, vW.x * 0.02 + vW.z * 0.015));
  rock *= strata * (0.80 + 0.36 * triFine) * (0.92 + 0.16 * triMicro * detailFade);

  // Ecosistema andino sin nieve (fotos de la ruta): pampa amarillo-verdosa de Cebollapampa, laderas de ichu dorado
  // con matorral oscuro, y bofedal verde oscuro con charcos en la hoyada del Campo Base
  float valleyZone = 1.0 - smoothstep(800.0, 900.0, h);
  float cebW = 1.0 - smoothstep(70.0, 175.0, length(vW.xz - uCebP.xz));
  float campW = (1.0 - smoothstep(26.0, 70.0, length(vW.xz - uCampP.xz))) * (1.0 - smoothstep(6.0, 22.0, abs(h - uCampP.y)));
  float highW = smoothstep(620.0, 820.0, h); // sobre ~4 550 m: ichu pardo más ralo y más roca a la vista
  float grassMask = valleyZone * smoothstep(0.62, 0.22, slope) * (0.78 + 0.22 * smoothstep(0.25, 0.6, nf));
  grassMask *= mix(1.0, 0.45 + 0.55 * smoothstep(0.35, 0.6, triCoarse), highW * (1.0 - campW));
  vec3 straw = vec3(0.47, 0.39, 0.17), ichuOlive = vec3(0.27, 0.27, 0.11), dryGreen = vec3(0.24, 0.30, 0.10);
  vec3 soilCol = vec3(0.24, 0.20, 0.14) * (0.85 + 0.3 * triFine);
  vec3 slopeIchu = mix(ichuOlive, straw, smoothstep(0.3, 0.75, triFine * 0.6 + n * 0.6));
  slopeIchu = mix(slopeIchu, vec3(0.12, 0.15, 0.07), smoothstep(0.62, 0.8, triCoarse) * (1.0 - cebW) * (1.0 - highW) * 0.8);
  slopeIchu = mix(slopeIchu, vec3(0.40, 0.32, 0.17) * (0.8 + 0.4 * triFine), highW * 0.75);
  vec3 pampa = mix(dryGreen, straw, smoothstep(0.35, 0.7, nf * 0.7 + triFine * 0.4));
  vec3 grassCol = mix(soilCol, mix(slopeIchu, pampa, cebW), smoothstep(0.12, 0.4, nf));
  float hummock = smoothstep(0.4, 0.6, fbm(vW.xz * 1.6));
  vec3 bofedal = mix(vec3(0.17, 0.15, 0.08), vec3(0.06, 0.095, 0.04), hummock) * (0.85 + 0.3 * triFine);
  float bofW = smoothstep(0.25, 0.75, campW);
  float puddle = (1.0 - smoothstep(0.215, 0.235, fbm(vW.xz * 0.3 + 7.3))) * smoothstep(0.55, 0.95, campW) * (1.0 - hummock);
  grassCol = mix(grassCol, bofedal, bofW);
  rock = mix(rock, grassCol, grassMask);
  // Sendero de tierra y grava clara (ruta rasterizada en uTrail sobre el tramo sin nieve)
  vec2 tUv = (vW.xz - uGrid.xy) / uGrid.z;
  float trailM = (tUv.x > 0. && tUv.y > 0. && tUv.x < 1. && tUv.y < 1.) ? texture2D(uTrail, tUv).r : 0.;
  float trail = smoothstep(0.3, 0.65, trailM + (nf - 0.5) * 0.35) * valleyZone;
  rock = mix(rock, vec3(0.40, 0.37, 0.32) * (0.85 + 0.3 * triFine), trail);

  // Morrena gris-parda sobre el Campo Base (entre 4 740 m y 5 050 m)
  float moraine = smoothstep(820.0, 960.0, h) * (1.0 - smoothstep(uSnowL - 180., uSnowL - 10., h));
  rock = mix(rock, rock * vec3(0.96, 0.91, 0.85), moraine * 0.55);

  // Nieve y hielo glaciar (solo desde el borde del glaciar > 5 040 m y en las caras acanaladas de los nevados)
  float snowLine = uSnowL + (n - 0.5) * 75.;
  float highPeak = smoothstep(uSnowL + 40., uSnowL + 260., h);
  float flute = 0.5 + 0.5 * sin(vW.x * 0.14 + vW.z * 0.14 + triCoarse * 5.0);
  float maxSlope = mix(0.72, 0.93, highPeak * (0.65 + 0.35 * flute));
  float flatness = 1. - smoothstep(0.40, maxSlope, slope + (nf - 0.5) * 0.22);
  float snow = smoothstep(snowLine - 20., snowLine + 25., h) * flatness;
  snow = max(snow, highPeak * smoothstep(0.88, 0.52, slope) * (0.75 + 0.25 * flute));
  float glacier = smoothstep(uSnowL - 30., uSnowL + 25., h) * (1. - smoothstep(mix(uSnowL, uTop, 0.55), mix(uSnowL, uTop, 0.88), h)) * flatness;

  vec3 snowAlb = vec3(0.91, 0.94, 0.98) * (0.93 + 0.09 * triFine + 0.04 * triMicro * detailFade);
  vec3 alb = mix(rock, snowAlb, snow);
  vec3 iceCol = mix(vec3(0.34, 0.58, 0.78), vec3(0.58, 0.80, 0.92), triFine);
  alb = mix(alb, iceCol, glacier * smoothstep(0.08, 0.3, slope) * (0.35 + 0.45 * nf));

  float cr = abs(sin(vW.x * 0.045 + vW.z * 0.12 + n * 7.));
  float crev = (1. - smoothstep(0., 0.07, cr)) * glacier * snow * smoothstep(0.4, 0.5, n);
  alb = mix(alb, vec3(0.02, 0.08, 0.16), crev * 0.88);
  alb = mix(alb, vec3(0.03, 0.045, 0.05), puddle);

  vec3 V = normalize(uCam - vW);
  float lit = smoothstep(uLightLine - 70., uLightLine + 50., h);
  float ndl = max(dot(N, uSunDir), 0.);
  vec3 col = alb * uSunCol * uSunI * uSunK * ndl * lit;
  vec3 Hh = normalize(V + uSunDir);
  float sparkle = snow * (0.35 + 0.65 * step(0.76, triMicro) * detailFade);
  col += sparkle * uSunCol * uSunI * lit * pow(max(dot(N, Hh), 0.), 42.) * 0.42;
  col += alb * uMoonCol * max(dot(N, uMoonDir), 0.);
  col += alb * mix(uGround, uAmb, N.y * 0.5 + 0.5);
  col += snow * uSky * pow(1. - max(dot(N, V), 0.), 4.) * 0.55;
  col += puddle * (uAmb * 0.12 + uSunCol * uSunI * uSunK * pow(max(dot(N0, Hh), 0.), 120.) * 2.0); // reflejo del cielo en los charcos del bofedal
  col += alb * uHeadI * (hl(uHeadPos, uHeadDir, N) + 0.85 * hl(uHead2Pos, uHead2Dir, N));
  for(int i=0;i<8;i++){ vec3 Lt=uTents[i]-vW; float t2=dot(Lt,Lt);
    col+=alb*uTentCol*uTentI*0.35*max(dot(N,Lt*inversesqrt(t2)),0.15)/(1.+t2*0.05); }
  float f = (1. - exp(-uFogD * uFogD * fd * fd)) * mix(1., 0.6, smoothstep(300., 1500., h));
  col = mix(col, uFogCol, clamp(f, 0., 1.));
  gl_FragColor = vec4(col, 1.);
}`;
const skyVS = `varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const skyFS = `
uniform vec3 uZen,uHor,uGlow,uSunCol,uSunDir; uniform float uGlowI,uDisc;
varying vec3 vDir;
float h1(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 d=normalize(vDir); float y=d.y;
  vec3 col=mix(uHor,uZen,pow(clamp(y,0.,1.),0.45));
  float sd=max(dot(d,uSunDir),0.);
  col+=uGlow*uGlowI*exp(-abs(y-0.02)*9.)*(0.3+0.7*pow(sd,3.));
  col+=uGlow*uGlowI*pow(sd,8.)*0.8;
  col+=uSunCol*uDisc*(smoothstep(0.99972,0.99988,sd)*40.+pow(sd,400.)*3.+pow(sd,30.)*0.3);
  if(y<0.) col=mix(col,uHor*0.55,smoothstep(0.,-0.25,y));
  col+=(h1(gl_FragCoord.xy)-0.5)/255.;
  gl_FragColor=vec4(col,1.);
}`;
const starsVS = `attribute float aSize; attribute float aPhase; uniform float uPR; varying float vP; varying float vY;
void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*uPR; vP=aPhase; vY=normalize(position).y; }`;
const starsFS = `uniform float uOp,uTime; varying float vP; varying float vY;
void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d);
  float tw=0.65+0.35*sin(uTime*(1.5+vP*2.)+vP*40.);
  gl_FragColor=vec4(vec3(1.,.96,.9)*1.2, a*a*uOp*tw*smoothstep(0.,0.18,vY)); }`;
const pathVS = `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const pathFS = `uniform float uProg,uTime,uGlow,uFogD,uVis; uniform vec3 uCol,uCam,uFogCol;
varying vec2 vUv; varying vec3 vW;
void main(){ float x=vUv.x;
  float behind=1.-smoothstep(uProg-0.0008,uProg+0.0002,x);
  float pulse=0.75+0.25*sin(x*1400.-uTime*3.);
  float ahead=(1.-behind)*0.35*step(0.6,fract(x*420.));
  vec3 col=uCol*(behind*pulse*0.32+ahead*0.5)*uGlow+vec3(0.01);
  float fd=length(uCam-vW); col=mix(col,uFogCol,(1.-exp(-uFogD*uFogD*fd*fd))*0.6);
  col*=smoothstep(140.,30.,fd)*0.85+0.15;
  if(uVis<0.5) discard;
  gl_FragColor=vec4(col,1.); }`;
const snowVS = `attribute float aSeed; uniform vec3 uCam,uWind; uniform float uTime,uPR,uOp; varying float vA;
const vec3 BOX=vec3(70.,40.,70.);
void main(){ vec3 p=position+uWind*uTime*(0.6+aSeed*0.8); p.y+=sin(uTime*2.+aSeed*40.)*0.6;
  vec3 local=mod(p-uCam,BOX)-BOX*0.5; vec3 w=uCam+local;
  vec4 mv=viewMatrix*vec4(w,1.); gl_Position=projectionMatrix*mv;
  gl_PointSize=min((0.8+aSeed*1.8)*uPR*(16./max(-mv.z,0.5)),9.);
  vA=uOp*(1.-smoothstep(18.,33.,length(local))); }`;
const snowFS = `uniform vec3 uColr; varying float vA; void main(){ float d=length(gl_PointCoord-.5); gl_FragColor=vec4(uColr, smoothstep(.5,0.,d)*vA*0.8); }`;
const cloudVS = `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const cloudFS = `uniform float uOp,uTime,uFogD; uniform vec3 uLit,uShade,uCam,uFogCol; uniform vec2 uCtr; varying vec3 vW;
${NOISE_GLSL}
void main(){ float n=fbm(vW.xz*0.0007+vec2(uTime*0.004,0.)); n+=0.5*fbm(vW.xz*0.003-uTime*0.006);
  float a=smoothstep(0.55,0.95,n);
  a*=smoothstep(1500.,3200.,length(vW.xz-uCtr))*uOp;
  vec3 col=mix(uShade,uLit,smoothstep(0.5,1.15,n));
  float fd=length(uCam-vW); col=mix(col,uFogCol,(1.-exp(-uFogD*uFogD*fd*fd*0.5)));
  a*=1.-smoothstep(14000.,17000.,fd);
  gl_FragColor=vec4(col,a); }`;
const haloVS = `varying float vT; varying float vF; uniform float uLen;
void main(){ vT=clamp(position.z/uLen,0.,1.); vec4 mv=modelViewMatrix*vec4(position,1.); vec3 n=normalize(normalMatrix*normal);
  vF=abs(dot(n,normalize(-mv.xyz))); gl_Position=projectionMatrix*mv; }`;
const haloFS = `uniform float uI; uniform vec3 uCol; varying float vT; varying float vF;
void main(){ float a=uI*pow(1.-vT,2.2)*pow(vF,2.)*0.045; gl_FragColor=vec4(uCol*a,a); }`;

// ---------- Ciclo de luz de 24 horas (indexado por fase 0..1) ----------
const P = [0, 0.3, 0.5, 0.65, 0.8, 1];
const K = {
  zen: ['#01030a', '#040a1e', '#141a3e', '#2b4a86', '#3872bc', '#2965b8'],
  hor: ['#060a18', '#151836', '#5a2e58', '#d9805a', '#bcd3ea', '#c2daf0'],
  glow: ['#000000', '#2a1a4a', '#ff5a30', '#ffa050', '#ffe8c0', '#fff5e4'],
  sunCol: ['#ff4020', '#ff4020', '#ff4a3a', '#ff8a4a', '#ffe2bc', '#fff8ee'],
  sky: ['#0b1532', '#0d1738', '#2a2442', '#5a5a72', '#8aa0c2', '#9fb6d6'],
  ground: ['#050608', '#06070a', '#1a1414', '#3a3230', '#5a5048', '#686054'],
  fog: ['#03050d', '#070b1c', '#2a2240', '#8a6a72', '#a9bdd4', '#bdd0e4'],
  glowI: [0, 0.5, 1.3, 1.2, 0.45, 0.25], sunI: [0, 0, 1.1, 2.0, 2.8, 3.1], elev: [-14, -9, -3, 3, 12, 26],
  disc: [0, 0, 0, 0.3, 1, 1], line: [3400, 3400, 2300, 1700, -50, -500], moon: [1, 1, 0.6, 0.2, 0, 0],
  fogD: [0.00017, 0.00016, 0.00013, 0.0001, 0.000075, 0.00006], stars: [1, 0.9, 0.35, 0.05, 0, 0],
  tent: [2.4, 2.4, 1.8, 0.9, 0.15, 0.05], bloomS: [0.6, 0.6, 0.65, 0.58, 0.4, 0.32],
  bloomT: [0.95, 0.95, 1.0, 1.3, 2.2, 2.5], lamp: [1, 1, 0.9, 0.45, 0.0, 0], exp: [1.15, 1.12, 1.0, 0.95, 0.88, 0.88]
};
const KC = {}; for (const k of ['zen', 'hor', 'glow', 'sunCol', 'sky', 'ground', 'fog']) KC[k] = K[k].map(h => new THREE.Color(h));
function seg(p) { let i = 0; while (i < P.length - 2 && p > P[i + 1]) i++; const t = clamp((p - P[i]) / (P[i + 1] - P[i]), 0, 1); return [i, t * t * (3 - 2 * t)]; }
function kn(name, p) { const [i, t] = seg(p); return K[name][i] + (K[name][i + 1] - K[name][i]) * t; }
function kc(name, p, out) { const [i, t] = seg(p); return out.copy(KC[name][i]).lerp(KC[name][i + 1], t); }
const HOURK = [[4.2, 0], [5.0, 0.3], [5.5, 0.5], [5.95, 0.65], [6.4, 0.8], [7.3, 1]];
function hourToP(rawH) {
  const h = ((rawH % 24) + 24) % 24;
  if (h <= HOURK[0][0]) return 0;
  if (h <= 7.3) {
    for (let i = 0; i < HOURK.length - 1; i++) {
      const a = HOURK[i], b = HOURK[i + 1];
      if (h <= b[0]) return a[1] + (b[1] - a[1]) * (h - a[0]) / (b[0] - a[0]);
    }
  }
  if (h <= 16.8) return 1;
  if (h <= 18.8) return 1 - (h - 16.8) / 2.0;
  return 0;
}

function glowTexture(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- Audio procedural ----------
function makeAudio() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0.9;
  const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
  const sr = ac.sampleRate;
  const nb = ac.createBuffer(1, sr * 2, sr); { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const bb = ac.createBuffer(1, sr * 4, sr); { const d = bb.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } }
  const loop = buf => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
  const bq = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gn = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const wF = bq('bandpass', 420, 0.6), wG = gn(0); loop(bb).connect(wF).connect(wG).connect(master);
  const whF = bq('bandpass', 1400, 9), whG = gn(0); loop(nb).connect(whF).connect(whG).connect(master);
  const hF = bq('highpass', 3500, 0.7), hG = gn(0); loop(nb).connect(hF).connect(hG).connect(master);
  const bF = bq('bandpass', 1100, 0.9), bG = gn(0.0001); loop(nb).connect(bF).connect(bG).connect(master);
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function burst(t, d, type, f, q, peak, buf = nb, a = 0.004) {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; const fl = bq(type, f, q), g = gn(0.0001);
    const maxOff = Math.max(0, buf.duration - a - d - 0.1);
    s.connect(fl).connect(g).connect(master); env(g, t, a, peak, d); s.start(t, Math.random() * maxOff); s.stop(t + a + d + 0.05);
  }
  function tone(t, f, d, peak, type = 'sine', f2) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    const g = gn(0.0001); o.connect(g).connect(master); env(g, t, 0.005, peak, d); o.start(t); o.stop(t + d + 0.05);
  }
  let nextBreath = 0, nextHeart = 0, nextRumble = 0, muted = false;
  const R = Math.random;
  return {
    ac,
    resume() { if (ac.state !== 'running') ac.resume(); if (!nextRumble) nextRumble = ac.currentTime + 55; },
    setMuted(m) { muted = m; master.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.05); },
    get muted() { return muted; },
    step(surface, k = 1) {
      const t = ac.currentTime;
      if (surface === 'rock') {
        burst(t, 0.07, 'bandpass', 1300 + R() * 400, 0.8, 0.22 * k);
        for (let i = 0; i < 4; i++) burst(t + 0.01 + R() * 0.07, 0.018, 'bandpass', 2600 + R() * 3000, 2.5, 0.11 * k);
      } else {
        burst(t, 0.17, 'lowpass', 850, 0.7, (surface === 'ice' ? 0.2 : 0.32) * k, nb, 0.02);
        for (let i = 0; i < 5; i++) burst(t + 0.02 + R() * 0.12, 0.02, 'lowpass', 2400, 0.8, 0.06 * k);
        if (surface === 'ice') {
          tone(t + 0.004, 3050 + R() * 350, 0.12, 0.045 * k, 'triangle');
          tone(t + 0.012, 4650 + R() * 400, 0.08, 0.03 * k, 'sine');
          burst(t, 0.03, 'highpass', 5200, 0.7, 0.12 * k);
        }
      }
    },
    hop() { const t = ac.currentTime; burst(t, 0.12, 'lowpass', 600, 0.7, 0.3); },
    slip() { const t = ac.currentTime; burst(t, 0.5, 'bandpass', 900, 0.6, 0.35, nb, 0.02); },
    clink() { const t = ac.currentTime; tone(t, 2200, 0.25, 0.06, 'triangle'); tone(t + 0.05, 3300, 0.2, 0.04, 'triangle'); },
    drink() { const t = ac.currentTime; tone(t, 380, 0.12, 0.07, 'sine', 540); tone(t + 0.14, 420, 0.12, 0.06, 'sine', 610); },
    animal(kind) {
      const t = ac.currentTime;
      if (kind === 'vizcacha') { tone(t, 1850, 0.09, 0.05, 'sine', 2450); tone(t + 0.11, 2100, 0.08, 0.04, 'sine', 2600); }
      else if (kind === 'cow') { tone(t, 150, 0.55, 0.06, 'sawtooth', 118); tone(t + 0.5, 118, 0.45, 0.045, 'triangle', 100); }
      else if (kind === 'donkey') { tone(t, 440, 0.22, 0.06, 'sawtooth', 620); tone(t + 0.24, 310, 0.30, 0.05, 'triangle', 220); }
      else { tone(t, 320, 0.28, 0.05, 'triangle', 260); }
    },
    rumble() {
      const t = ac.currentTime; burst(t, 6, 'lowpass', 110, 0.7, 0.9, bb, 1.4); tone(t + 0.2, 44, 5.5, 0.22, 'sine', 30);
      burst(t + 1.6, 4, 'lowpass', 70, 0.7, 0.5, bb, 1.0);
    },
    update(p) {
      const t = ac.currentTime;
      const w = p.wind;
      wG.gain.setTargetAtTime(0.04 + w * 0.32, t, 0.3);
      wF.frequency.setTargetAtTime(320 + w * 500 + Math.sin(t * 0.37) * 120 * w, t, 0.4);
      whG.gain.setTargetAtTime(w > 0.5 ? (w - 0.5) * 0.08 * (0.5 + 0.5 * Math.sin(t * 0.9)) : 0, t, 0.3);
      whF.frequency.setTargetAtTime(1200 + 500 * Math.sin(t * 0.23), t, 0.5);
      hG.gain.setTargetAtTime(w * 0.03, t, 0.3);
      if (p.active && t >= nextBreath) {
        const lab = p.labored, per = lab ? 1.35 : 3.9 - p.effort * 1.2, inn = per * 0.42, ex = per * 0.5, pk = lab ? 0.13 : 0.035 + p.effort * 0.03;
        const g = bG.gain; g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t);
        g.linearRampToValueAtTime(pk * 0.7, t + inn * 0.6); g.linearRampToValueAtTime(0.0001, t + inn);
        g.linearRampToValueAtTime(pk, t + inn + ex * 0.25); g.linearRampToValueAtTime(0.0001, t + inn + ex);
        bF.frequency.setValueAtTime(1600, t); bF.frequency.setValueAtTime(760, t + inn);
        nextBreath = t + per * (0.95 + R() * 0.1);
      }
      if (p.soroche > 0.1 && t >= nextHeart) {
        const g = 0.55 * p.soroche; tone(t, 62, 0.16, g, 'sine', 38); tone(t + 0.19, 58, 0.14, g * 0.7, 'sine', 36);
        nextHeart = t + 60 / (95 + 45 * p.soroche);
      }
      if (p.active && nextRumble && t >= nextRumble) { nextRumble = t + 120 + R() * 120; this.rumble(); p.onRumble && p.onRumble(); }
    },
    dispose() { try { ac.close(); } catch (e) { } }
  };
}

// ---------- Montañista orgánico con sistema de 3 capas visibles ----------
function makeClimber(col) {
  const M = (c, r = 0.72, m = 0.04, e) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e || 0x000000 });
  const jacket = M(col, 0.62, 0.05, new THREE.Color(col).multiplyScalar(0.15));
  const thermalTrim = M(0xd89b18, 0.65, 0.02, new THREE.Color(0xd89b18).multiplyScalar(0.12));
  const pants = M(0x1e2229, 0.82), gaiterM = M(0x121418, 0.75), bootM = M(0x2a2420, 0.7);
  const skin = M(0xc89678, 0.65), pack = M(0x28303a, 0.78), packAccent = M(0xb84a24, 0.7), helm = M(0xf0ece1, 0.32, 0.12), metal = M(0xa8b0b8, 0.28, 0.85);

  // Cápsula orgánica suave con extremos esféricos (elimina el aspecto cuadrado/Roblox)
  const organicLimb = (rTop, rBot, len, mat) => {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 16, 2), mat);
    const sTop = new THREE.Mesh(new THREE.SphereGeometry(rTop * 0.99, 14, 10), mat); sTop.position.y = len * 0.5;
    const sBot = new THREE.Mesh(new THREE.SphereGeometry(rBot * 0.99, 14, 10), mat); sBot.position.y = -len * 0.5;
    g.add(cyl, sTop, sBot);
    return g;
  };

  const root = new THREE.Group(), upper = new THREE.Group(); upper.position.y = 0.95; root.add(upper);
  // Pelvis y torso esculpido
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 12), pants); pelvis.scale.set(1.05, 0.7, 0.88); pelvis.position.y = 0.05; upper.add(pelvis);
  const torso = organicLimb(0.205, 0.175, 0.38, jacket); torso.scale.set(1.08, 1, 0.84); torso.position.y = 0.29; upper.add(torso);
  // Cuello térmico (2ª capa visible) y capucha cortavientos (3ª capa visible)
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.036, 10, 18), thermalTrim); collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.52, -0.01); collar.visible = false; upper.add(collar);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), jacket); hood.scale.set(1.0, 0.65, 0.95); hood.position.set(0, 0.54, 0.07); hood.visible = false; upper.add(hood);

  // Mochila de expedición esculpida con tapa superior y aislante enrollado
  const pkGroup = new THREE.Group(); pkGroup.position.set(0, 0.34, 0.19); upper.add(pkGroup);
  const pkBody = organicLimb(0.165, 0.155, 0.38, pack); pkBody.scale.set(1.08, 1, 0.72); pkGroup.add(pkBody);
  const pkLid = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), packAccent); pkLid.scale.set(1.05, 0.45, 0.74); pkLid.position.y = 0.22; pkGroup.add(pkLid);
  const matRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 14), M(0xd8a21a, 0.8)); matRoll.rotation.z = Math.PI / 2; matRoll.position.set(0, -0.22, 0.02); pkGroup.add(matRoll);

  // Cabeza, gafas de glaciar, casco y linterna frontal
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 14), skin); head.position.y = 0.66; upper.add(head);
  const goggles = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.042, 16, 1, false, Math.PI * 0.65, Math.PI * 0.7), M(0x11161d, 0.2, 0.6));
  goggles.position.set(0, 0.665, -0.01); upper.add(goggles);
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.132, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), helm); hm.position.y = 0.68; upper.add(hm);
  const lampM = new THREE.MeshBasicMaterial({ color: 0xdff4ff });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.04, 12), lampM); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 0.71, -0.13); upper.add(lamp);
  const lampAnchor = new THREE.Object3D(); lampAnchor.position.set(0, 0.71, -0.155); upper.add(lampAnchor);

  const axePack = new THREE.Group(); { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.62, 10), metal); axePack.add(s); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.028, 0.038), metal); hd.position.y = 0.3; axePack.add(hd); }
  axePack.position.set(0.11, 0.36, 0.30); axePack.rotation.z = 0.42; upper.add(axePack);

  const legs = [], knees = [], arms = [], elbows = [], poles = [], crampons = [];
  let axe = null;
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.105, 0.95, 0); root.add(hip);
    const th = organicLimb(0.084, 0.068, 0.34, pants); th.position.y = -0.21; hip.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.44; hip.add(kn);
    const sh = organicLimb(0.066, 0.054, 0.33, gaiterM); sh.position.y = -0.20; kn.add(sh);
    // Bota de alta montaña esculpida
    const btGroup = new THREE.Group(); btGroup.position.set(0, -0.42, -0.035); kn.add(btGroup);
    const btUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.11, 14), bootM); btUpper.position.set(0, 0.02, 0.02); btGroup.add(btUpper);
    const btFoot = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 10), bootM); btFoot.scale.set(0.88, 0.68, 1.85); btFoot.position.set(0, -0.02, -0.02); btGroup.add(btFoot);
    const cr = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.024, 0.27), metal); cr.position.set(0, -0.485, -0.04); cr.visible = false; kn.add(cr);
    legs.push(hip); knees.push(kn); crampons.push(cr);

    const shd = new THREE.Group(); shd.position.set(s * 0.245, 0.47, 0); upper.add(shd);
    const ua = organicLimb(0.062, 0.052, 0.24, jacket); ua.position.y = -0.16; shd.add(ua);
    const el = new THREE.Group(); el.position.y = -0.32; shd.add(el);
    const fa = organicLimb(0.050, 0.042, 0.20, jacket); fa.position.y = -0.13; el.add(fa);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), gaiterM); glove.scale.set(0.9, 1.15, 0.85); glove.position.y = -0.26; el.add(glove);
    const hand = new THREE.Group(); hand.position.y = -0.28; el.add(hand);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.008, 1.15, 10), metal); pole.position.set(0, -0.45, -0.08); pole.rotation.x = 0.25; hand.add(pole);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.008, 12), gaiterM); basket.position.set(0, -0.48, 0); pole.add(basket);
    poles.push(pole); arms.push(shd); elbows.push(el);
    if (s === 1) { axe = new THREE.Group(); const sf = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.014, 0.62, 10), metal); sf.position.y = -0.22; axe.add(sf); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.028, 0.042), metal); hd.position.y = 0.08; axe.add(hd); axe.rotation.x = -0.3; hand.add(axe); axe.visible = false; }
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { root, upper, legs, knees, arms, elbows, poles, crampons, axe, axePack, jacket, collar, hood, lampAnchor, phase: 0 };
}

function animClimber(c, d, amp, mode, hop, t) {
  c.phase += d * 2.3;
  const s = Math.sin(c.phase), cs = Math.cos(c.phase);
  const climb = mode === 'climb', tired = mode === 'tired';
  for (let i = 0; i < 2; i++) {
    const sg = i ? -1 : 1, ph = sg * s;
    c.legs[i].rotation.x = ph * 0.55 * amp + (hop > 0 && i === 0 ? hop * 1.1 : 0) + (climb ? 0.25 : 0);
    c.knees[i].rotation.x = -Math.max(0, Math.sin(c.phase * 1 + (i ? Math.PI : 0) + 1.2)) * 0.8 * amp - (hop > 0 && i === 0 ? hop * 1.3 : 0) - (tired ? 0.35 : 0);
    if (climb) { c.arms[i].rotation.x = 2.5 + ph * 0.35; c.elbows[i].rotation.x = 0.4; }
    else if (tired) { c.arms[i].rotation.x = 0.6; c.elbows[i].rotation.x = 0.7; }
    else { c.arms[i].rotation.x = -ph * 0.45 * amp + 0.25; c.elbows[i].rotation.x = 0.35 + 0.2 * amp; }
    c.arms[i].rotation.z = (i ? -1 : 1) * 0.08;
  }
  const breath = Math.sin(t * (tired ? 7 : 2.2)) * (tired ? 0.04 : 0.012);
  c.upper.rotation.x = (tired ? -0.5 : -0.1 * amp) + breath - (climb ? 0.3 : 0);
  c.upper.position.y = 0.95 + Math.abs(cs) * 0.03 * amp;
}

// ---------- Texturas Canvas para letreros de madera y manta andina ----------
function makeSignBoardTexture(lines, opts = {}) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  // Fondo de madera veteada
  g.fillStyle = opts.bg || '#583822';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = opts.grain || 'rgba(30,16,8,0.32)';
  g.lineWidth = 3;
  for (let y = 8; y < 160; y += 14) {
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(170, y + 5, 340, y - 5, 512, y + 2); g.stroke();
  }
  g.strokeStyle = opts.border || '#382212';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 152);
  // Ícono de carpa o caminante opcional
  let textX = 256;
  if (opts.icon === 'tent') {
    g.fillStyle = '#f5f2eb';
    g.beginPath(); g.moveTo(46, 118); g.lineTo(82, 46); g.lineTo(118, 118); g.closePath(); g.fill();
    g.fillStyle = opts.bg || '#583822';
    g.beginPath(); g.moveTo(70, 118); g.lineTo(82, 82); g.lineTo(94, 118); g.closePath(); g.fill();
    textX = 285;
  } else if (opts.icon === 'hiker') {
    g.fillStyle = '#f5f2eb';
    g.beginPath(); g.arc(78, 54, 12, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f5f2eb'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(78, 68); g.lineTo(74, 102); g.lineTo(60, 126); g.moveTo(74, 102); g.lineTo(90, 126);
    g.moveTo(62, 84); g.lineTo(94, 78); g.moveTo(98, 64); g.lineTo(92, 126); g.stroke();
    textX = 285;
  }
  // Flecha direccional
  if (opts.arrow === 'right') {
    g.fillStyle = opts.color || '#f4d44d';
    g.beginPath(); g.moveTo(486, 80); g.lineTo(454, 52); g.lineTo(454, 108); g.closePath(); g.fill();
  } else if (opts.arrow === 'left') {
    g.fillStyle = opts.color || '#f4d44d';
    g.beginPath(); g.moveTo(26, 80); g.lineTo(58, 52); g.lineTo(58, 108); g.closePath(); g.fill();
  }
  g.fillStyle = opts.color || '#f4d44d';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (lines.length === 1) {
    g.font = 'bold 42px sans-serif';
    g.fillText(lines[0], textX, 82);
  } else {
    g.font = 'bold 38px sans-serif';
    g.fillText(lines[0], textX, 56);
    g.font = 'bold 29px sans-serif';
    g.fillStyle = opts.subColor || '#f7f4ec';
    g.fillText(lines[1], textX, 110);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function makeAndeanBlanketTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const stripes = [
    [0.00, '#df5286'], [0.12, '#f07aa4'], [0.20, '#3a6ea5'], [0.26, '#e8c538'],
    [0.32, '#d83b72'], [0.46, '#f49cbb'], [0.54, '#2a9d8f'], [0.60, '#df5286'],
    [0.74, '#b8255f'], [0.82, '#f2a6c2'], [0.90, '#457b9d'], [0.96, '#df5286']
  ];
  for (let i = 0; i < stripes.length; i++) {
    const y0 = stripes[i][0] * 256;
    const y1 = (i + 1 < stripes.length ? stripes[i + 1][0] : 1) * 256;
    g.fillStyle = stripes[i][1];
    g.fillRect(0, y0, 256, y1 - y0 + 1);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- Fauna Andina Real (Vizcachas, Llamas y Burritos de Carga) ----------
function makeVizcacha() {
  const fur = new THREE.MeshStandardMaterial({ color: 0x867c6e, roughness: 0.90 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xb8afa0, roughness: 0.88 });
  const earM = new THREE.MeshStandardMaterial({ color: 0x52483e, roughness: 0.85 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 12), fur); body.scale.set(0.95, 0.86, 1.38); body.position.y = 0.18; g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), belly); chest.position.set(0, 0.15, -0.14); g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), fur); head.scale.set(1.0, 0.92, 1.12); head.position.set(0, 0.30, -0.21); g.add(head);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.042, 0.23, 10), earM);
    ear.position.set(s * 0.068, 0.46, -0.18); ear.rotation.z = -s * 0.22; g.add(ear); ears.push(ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.048, 0.35, 10), earM);
  tail.position.set(0, 0.27, 0.29); tail.rotation.x = 0.82; g.add(tail);
  return { root: g, ears, tail, kind: 'vizcacha', name: 'Vizcacha andina' };
}

function makeLlama(coatHex = 0x4a382b) {
  const wool = new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.92 });
  const faceDark = new THREE.MeshStandardMaterial({ color: 0x221d1a, roughness: 0.85 });
  const blazeWhite = new THREE.MeshStandardMaterial({ color: 0xede8df, roughness: 0.85 });
  const tasselRed = new THREE.MeshStandardMaterial({ color: 0xd92b2b, roughness: 0.7 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 16, 12), wool); body.scale.set(0.84, 0.82, 1.52); body.position.y = 0.86; g.add(body);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.28, 8), wool); tail.position.set(0, 0.92, 0.68); tail.rotation.x = 0.45; g.add(tail);
  const neckGroup = new THREE.Group(); neckGroup.position.set(0, 1.04, -0.48); g.add(neckGroup);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.68, 12), wool); neck.position.y = 0.28; neck.rotation.x = 0.14; neckGroup.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), faceDark); head.position.set(0, 0.64, -0.05); neckGroup.add(head);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.082, 0.19, 10), faceDark); snout.rotation.x = Math.PI / 2; snout.position.set(0, 0.62, -0.19); neckGroup.add(snout);
  const blaze = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), blazeWhite); blaze.scale.set(0.75, 1.1, 1.35); blaze.position.set(0, 0.66, -0.16); neckGroup.add(blaze);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.036, 0.19, 8), faceDark);
    ear.position.set(s * 0.085, 0.82, -0.03); ear.rotation.z = -s * 0.18; neckGroup.add(ear);
    // Arete/borla roja tradicional andina en la oreja (como en la foto 20260823_082013.jpg)
    const tassel = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), tasselRed);
    tassel.position.set(s * 0.105, 0.78, -0.04); neckGroup.add(tassel);
  }
  for (const [lx, lz] of [[-0.19, -0.39], [0.19, -0.39], [-0.19, 0.39], [0.19, 0.39]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.05, 0.78, 10), wool);
    leg.position.set(lx, 0.39, lz); g.add(leg);
  }
  return { root: g, neckGroup, kind: 'llama', name: 'Llama del Campo Base' };
}

// Vacas criollas pastando en la pampa de Cebollapampa (fotos 3.jpg y 4.png: negras y marrones junto al riachuelo)
function makeCow(coatHex = 0x1c1a19, patchHex = null) {
  const hide = new THREE.MeshStandardMaterial({ color: coatHex, roughness: 0.86 });
  const muzzleM = new THREE.MeshStandardMaterial({ color: 0x3a302b, roughness: 0.8 });
  const hornM = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.6 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), hide); body.scale.set(0.82, 0.8, 1.62); body.position.y = 0.98; g.add(body);
  if (patchHex !== null) {
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshStandardMaterial({ color: patchHex, roughness: 0.86 }));
    patch.scale.set(0.84, 0.62, 0.7); patch.position.set(0.04, 0.86, 0.22); g.add(patch);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.75, 6), hide); tail.position.set(0, 0.82, 0.9); tail.rotation.x = 0.12; g.add(tail);
  const neckGroup = new THREE.Group(); neckGroup.position.set(0, 1.08, -0.78); g.add(neckGroup);
  const graze = new THREE.Group(); graze.rotation.x = -0.85; neckGroup.add(graze); // cabeza baja, pastando
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.5, 12), hide); neck.rotation.x = Math.PI / 2; neck.position.z = -0.18; graze.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), hide); head.scale.set(0.9, 0.95, 1.5); head.position.set(0, 0, -0.55); graze.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), muzzleM); muzzle.scale.set(1.1, 0.85, 0.9); muzzle.position.set(0, -0.04, -0.83); graze.add(muzzle);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 8), hornM); horn.position.set(s * 0.13, 0.15, -0.42); horn.rotation.z = -s * 0.9; graze.add(horn);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), hide); ear.scale.set(1.4, 0.5, 0.8); ear.position.set(s * 0.2, 0.06, -0.38); graze.add(ear);
  }
  for (const [lx, lz] of [[-0.24, -0.6], [0.24, -0.6], [-0.24, 0.6], [0.24, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.82, 10), hide);
    leg.position.set(lx, 0.41, lz); g.add(leg);
  }
  return { root: g, neckGroup, kind: 'cow', name: 'Vaca de Cebollapampa' };
}

let sharedBlanketTex = null;
function makeDonkey() {
  if (!sharedBlanketTex) sharedBlanketTex = makeAndeanBlanketTexture();
  const coat = new THREE.MeshStandardMaterial({ color: 0x6b6055, roughness: 0.88 });
  const darkMuzzle = new THREE.MeshStandardMaterial({ color: 0x2c2623, roughness: 0.85 });
  const lightNose = new THREE.MeshStandardMaterial({ color: 0xb8b0a4, roughness: 0.85 });
  const ropeM = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.8 });
  const strapYellow = new THREE.MeshStandardMaterial({ color: 0xd9bc1c, roughness: 0.7 });
  const blanketMat = new THREE.MeshStandardMaterial({ map: sharedBlanketTex, roughness: 0.85 });

  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 12), coat); body.scale.set(0.88, 0.84, 1.48); body.position.y = 0.76; g.add(body);
  // Manta andina rosada a rayas en el lomo + cincha amarilla (como en la foto 20260823_110533.jpg)
  const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.62, 16, 1, false, -Math.PI * 0.62, Math.PI * 1.24), blanketMat);
  blanket.rotation.z = Math.PI / 2; blanket.rotation.y = Math.PI / 2; blanket.position.set(0, 0.81, -0.02); g.add(blanket);
  const cinch = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.026, 8, 20), strapYellow);
  cinch.position.set(0, 0.77, -0.04); g.add(cinch);

  const neckGroup = new THREE.Group(); neckGroup.position.set(0, 0.88, -0.46); g.add(neckGroup);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.20, 0.46, 12), coat); neck.position.set(0, 0.16, -0.06); neck.rotation.x = 0.52; neckGroup.add(neck);
  // Soga blanca en el cuello
  const neckRope = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.024, 8, 18), ropeM);
  neckRope.rotation.x = Math.PI / 2 - 0.52; neckRope.position.set(0, 0.14, -0.05); neckGroup.add(neckRope);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), coat); head.scale.set(0.88, 0.92, 1.25); head.position.set(0, 0.36, -0.18); neckGroup.add(head);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.22, 12), darkMuzzle); snout.rotation.x = Math.PI / 2 + 0.25; snout.position.set(0, 0.30, -0.35); neckGroup.add(snout);
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.082, 10, 8), lightNose); noseTip.position.set(0, 0.27, -0.43); neckGroup.add(noseTip);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.048, 0.28, 10), coat);
    ear.position.set(s * 0.11, 0.56, -0.14); ear.rotation.z = -s * 0.32; ear.rotation.x = -0.12; neckGroup.add(ear);
  }
  for (const [lx, lz] of [[-0.18, -0.36], [0.18, -0.36], [-0.18, 0.36], [0.18, 0.36]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.052, 0.68, 10), coat);
    leg.position.set(lx, 0.34, lz); g.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.07, 10), darkMuzzle);
    hoof.position.set(lx, 0.035, lz); g.add(hoof);
  }
  return { root: g, neckGroup, kind: 'donkey', name: 'Burrito de carga' };
}

// ---------- Mount ----------
export async function mount(host, cb = {}) {
  const DIFFICULTIES = {
    facil: { label: 'Fácil (~5 min)', duration: 5, stamMul: 0.65, coldMul: 0.70, oxMul: 0.70, bonusServings: 1 },
    medio: { label: 'Medio (~10 min)', duration: 10, stamMul: 1.00, coldMul: 1.00, oxMul: 1.00, bonusServings: 0 },
    avanzado: { label: 'Avanzado (~15 min)', duration: 15, stamMul: 1.25, coldMul: 1.25, oxMul: 1.25, bonusServings: 0 }
  };
  let opts = Object.assign({ quality: 'alta', showRoute: true, difficulty: 'medio', duration: 10 }, cb.options || {});
  if (opts.difficulty && DIFFICULTIES[opts.difficulty]) opts.duration = DIFFICULTIES[opts.difficulty].duration;
  const getDiff = () => DIFFICULTIES[opts.difficulty] || DIFFICULTIES.medio;
  const data = cb.data || await (await fetch('/data/pisco/pisco-waypoints.json')).json();
  await new Promise(r => setTimeout(r, 40));

  const ROUTE = data.waypoints; // 10 hitos: Cebollapampa -> Refugio -> Loma -> Cadenas -> Morrena -> Glaciar -> Collado -> Grietas -> Crux -> Cumbre
  const AF = 0.36; // aproximación comprimida para jugabilidad
  const projR = (lat, lon, ele) => { const [x, z] = proj(lat, lon); return ele < 4680 ? [x * AF, z * AF] : [x, z]; };
  const RP = ROUTE.map(w => { const [x, z] = projR(w.lat, w.lon, w.elevation); return { x, z, y: w.elevation - BASE, w }; });
  let TRK = [];
  try {
    const gx = await (await fetch('/data/pisco/nevado-pisco-normal-route.gpx')).text();
    const doc = new DOMParser().parseFromString(gx, 'application/xml');
    TRK = [...doc.getElementsByTagName('trkpt')].map(p => { const lat = +p.getAttribute('lat'), lon = +p.getAttribute('lon'), ele = +(p.getElementsByTagName('ele')[0]?.textContent || 0); const [x, z] = projR(lat, lon, ele); return { x, z, ele }; });
  } catch (e) { TRK = []; }
  if (TRK.length < 4) TRK = RP.map(p => ({ x: p.x, z: p.z, ele: p.y + BASE }));

  // Construcción de la curva 3D con tramo inicial recto en la pampa de Cebollapampa, zigzags en la subida y en la Loma Rocosa
  const CTRL = [];
  TRK.forEach((p, i) => {
    if (i > 0 && TRK[i - 1].ele < 4660) {
      const a = TRK[i - 1], dx = p.x - a.x, dz = p.z - a.z, L = Math.hypot(dx, dz) || 1;
      if (i === 1) {
        // Primeros metros llanos y rectos en Cebollapampa (letrero triple y puente de madera) antes de empezar el zigzag
        CTRL.push(new THREE.Vector3(a.x + dx * 0.18, 0, a.z + dz * 0.18));
        [0.46, 0.76].forEach((f, k) => { const off = (k ? -1 : 1) * 34; CTRL.push(new THREE.Vector3(a.x + dx * f - dz / L * off, 0, a.z + dz * f + dx / L * off)); });
      } else if (i === 3) {
        // Tramo final coronando la cima/mirador y bajando hacia la hoyada del Campo Base
        CTRL.push(new THREE.Vector3(a.x + dx * 0.35 - dz / L * 28, 0, a.z + dz * 0.35 + dx / L * 28));
        CTRL.push(new THREE.Vector3(a.x + dx * 0.72 + dz / L * 14, 0, a.z + dz * 0.72 - dx / L * 14));
      } else {
        [0.33, 0.66].forEach((f, k) => { const off = (k ? -1 : 1) * 38; CTRL.push(new THREE.Vector3(a.x + dx * f - dz / L * off, 0, a.z + dz * f + dx / L * off)); });
      }
    } else if (i > 0 && Math.abs(TRK[i - 1].ele - 4680) < 25 && p.ele === 4885) {
      // Subida en zigzag al cerrito rocoso saliendo del Campo Base / Refugio Perú y tramo de filo
      const a = TRK[i - 1], dx = p.x - a.x, dz = p.z - a.z, L = Math.hypot(dx, dz) || 1;
      [[0.25, 24], [0.52, -24], [0.76, 16]].forEach(([f, off]) => {
        CTRL.push(new THREE.Vector3(a.x + dx * f - dz / L * off, 0, a.z + dz * f + dx / L * off));
      });
    }
    CTRL.push(new THREE.Vector3(p.x, 0, p.z));
  });
  SX = RP[RP.length - 1].x; SZ = RP[RP.length - 1].z;
  const gear = data.gearCatalog;

  // ruta (1 muestra ≈ 1 m)
  const crv = new THREE.CatmullRomCurve3(CTRL, false, 'centripetal', 0.5);
  const NS = Math.round(crv.getLength());
  const samples = crv.getSpacedPoints(NS);
  const wpIdx = RP.map(p => { let b = 1e12, bi = 0; samples.forEach((s, i) => { const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2; if (d < b) { b = d; bi = i; } }); return bi; });
  wpIdx[0] = 0; wpIdx[wpIdx.length - 1] = NS;
  const IDX = {
    ceb: wpIdx[0],
    ref: wpIdx[1],
    lom: wpIdx[2],
    cad: wpIdx[3],
    mor: wpIdx[4],
    gla: wpIdx[5],
    col: wpIdx[6],
    gri: wpIdx[7],
    cru: wpIdx[8],
    top: NS
  };

  // Perfil de elevación realista:
  // k=0 (Cebollapampa -> Campo Base): inicio llano en la pampa y puente, subida alternada con descansos llanos,
  // coronación de la cima/mirador (t=0.86, +18 m sobre el campamento) y descenso suave hacia la hoyada del Campo Base.
  // k=2 (Loma Rocosa -> Paso de las Cadenas): caminata por el filo y bajada vertical por el acantilado con cadenas.
  const tgtY = new Float32Array(NS + 1);
  for (let k = 0; k < wpIdx.length - 1; k++) {
    const a = wpIdx[k], b = wpIdx[k + 1];
    for (let i = a; i <= b; i++) {
      const t = b > a ? (i - a) / (b - a) : 0;
      if (k === 0) {
        const crestY = RP[1].y + 18;
        if (t < 0.085) {
          // Pampa llana inicial en Cebollapampa (letrero y puente sobre el riachuelo)
          tgtY[i] = RP[0].y + (t / 0.085) * 3.0;
        } else if (t < 0.86) {
          // Subida alternando tramos empinados y pequeños descansos llanos hasta la cima previa al campamento
          const u = (t - 0.085) / (0.86 - 0.085);
          const stepped = clamp(u - 0.038 * Math.sin(u * Math.PI * 6), 0, 1);
          tgtY[i] = (RP[0].y + 3.0) + (crestY - (RP[0].y + 3.0)) * stepped;
        } else {
          // Descenso suave desde la cima mirador hacia la explanada hundida/hoyada del Campo Base
          const td = smooth(0.86, 1.0, t);
          tgtY[i] = crestY + (RP[1].y - crestY) * td;
        }
      } else if (k === 2) {
        // Entre Loma Rocosa (wp 2, 4885m) y Paso de las Cadenas (wp 3, 4815m):
        // Primero se camina por el filo alto (62% del tramo) y luego se baja en vertical el acantilado con cadenas!
        if (t < 0.62) {
          tgtY[i] = RP[2].y + Math.sin(t / 0.62 * Math.PI) * 4;
        } else {
          const tc = smooth(0.62, 0.98, t);
          tgtY[i] = RP[2].y + (RP[3].y - RP[2].y) * tc;
        }
      } else {
        tgtY[i] = RP[k].y + (RP[k + 1].y - RP[k].y) * t;
      }
    }
  }
  {
    const tmp = Float32Array.from(tgtY);
    for (let i = 0; i <= NS; i++) {
      // Ventana pequeña cerca del acantilado de las cadenas y de la cresta del campamento
      const nearCliff = Math.abs(i - IDX.cad) < 42 || Math.abs(i - Math.round(IDX.ref * 0.86)) < 24;
      const W = nearCliff ? 3 : 14;
      let s = 0, n = 0;
      for (let j = -W; j <= W; j++) { const k = clamp(i + j, 0, NS); s += tmp[k]; n++; }
      tgtY[i] = s / n;
    }
    tgtY[0] = RP[0].y; tgtY[NS] = RP[RP.length - 1].y;
  }
  for (let i = 0; i <= NS; i++) {
    const flatStart = i < 48 ? 0.15 : 1.0;
    tgtY[i] += 0.9 * flatStart * snoise(i * 0.03, 7.7);
  }
  tgtY[0] = RP[0].y;
  tgtY[NS] = TOP - BASE;

  // heightmap cercano
  const segs = opts.quality === 'alta' ? 640 : 440;
  const NSIZE = 3900, NCX = -250, NCZ = -300, GN = segs + 1, CELL = NSIZE / segs, GX0 = NCX - NSIZE / 2, GZ0 = NCZ - NSIZE / 2;
  const hm = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) hm[j * GN + i] = Bh(GX0 + i * CELL, GZ0 + j * CELL, 6);
  const bil = (arr, x, z) => { const fx = clamp((x - GX0) / CELL, 0, segs - 1e-4), fz = clamp((z - GZ0) / CELL, 0, segs - 1e-4); const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j; const k = j * GN + i; return (arr[k] * (1 - u) + arr[k + 1] * u) * (1 - v) + (arr[k + GN] * (1 - u) + arr[k + GN + 1] * u) * v; };
  { // corrección amplia hacia el perfil GPS
    const sum = new Float32Array(GN * GN), wsum = new Float32Array(GN * GN), R = 460, SIG = 190, rc = Math.ceil(R / CELL);
    for (let s = 0; s <= NS; s += 8) {
      const p = samples[s], dlt = tgtY[s] - bil(hm, p.x, p.z), ci = Math.round((p.x - GX0) / CELL), cj = Math.round((p.z - GZ0) / CELL);
      for (let j = Math.max(0, cj - rc); j <= Math.min(segs, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(segs, ci + rc); i++) {
        const dx = GX0 + i * CELL - p.x, dz = GZ0 + j * CELL - p.z, d2 = dx * dx + dz * dz; if (d2 > R * R) continue;
        const w = Math.exp(-d2 / (SIG * SIG)), k = j * GN + i; sum[k] += w * dlt; wsum[k] += w;
      }
    }
    for (let k = 0; k < hm.length; k++) if (wsum[k] > 0) hm[k] += sum[k] / (wsum[k] + 1e-4) * Math.min(1, wsum[k] / 6);
  }
  const distG = new Float32Array(GN * GN).fill(1e9), pyG = new Float32Array(GN * GN);
  let LAG = null; { const li = Math.round(IDX.mor + (IDX.gla - IDX.mor) * 0.42), t = (() => { const a = samples[li - 3], b = samples[li + 3]; const v = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize(); return v; })(); const s = samples[li]; LAG = { x: s.x + t.z * 52, z: s.z - t.x * 52, y: tgtY[li] - 14 }; }
  { // corredor transitable, hoyada del Campo Base, colina protectora izquierda y colina del Refugio Perú a la derecha
    const R = 56, rc = Math.ceil(R / CELL);
    for (let s = 0; s <= NS; s++) {
      const p = samples[s], ci = Math.round((p.x - GX0) / CELL), cj = Math.round((p.z - GZ0) / CELL);
      for (let j = Math.max(0, cj - rc); j <= Math.min(segs, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(segs, ci + rc); i++) {
        const dx = GX0 + i * CELL - p.x, dz = GZ0 + j * CELL - p.z, d = Math.sqrt(dx * dx + dz * dz), k = j * GN + i;
        if (d < distG[k]) { distG[k] = d; pyG[k] = tgtY[s]; }
      }
    }
    for (let k = 0; k < hm.length; k++) if (distG[k] < 56) hm[k] += (pyG[k] - hm[k]) * (1 - smooth(5.0, 52, distG[k]));
    const ref = RP[1], sum = RP[RP.length - 1], ceb = RP[0];
    const tRefA = samples[clamp(IDX.ref - 6, 0, NS)], tRefB = samples[clamp(IDX.ref + 4, 0, NS)];
    const tRef = new THREE.Vector3(tRefB.x - tRefA.x, 0, tRefB.z - tRefA.z).normalize();
    // Derecha (off > 0): [-tRef.z, +tRef.x]; Izquierda (off < 0): [+tRef.z, -tRef.x]
    const hillRightX = ref.x - tRef.z * 34, hillRightZ = ref.z + tRef.x * 34; // Colina derecha donde está el Refugio Perú (4675 m)
    const hillLeftX = ref.x + tRef.z * 48, hillLeftZ = ref.z - tRef.x * 48;   // Colina izquierda que abriga el campamento frente al Huandoy
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = GX0 + i * CELL, z = GZ0 + j * CELL, k = j * GN + i;
      // Explanada llana (hoyada) del Campo Base
      const dr = Math.hypot(x - ref.x, z - ref.z);
      if (dr < 58) hm[k] += (ref.y + 0.35 * snoise(x * 0.1, z * 0.1) - hm[k]) * (1 - smooth(24, 56, dr));
      // Colina derecha elevada (+10.5 m) para el Refugio Perú con rampa suave para subir caminando
      const dHR = Math.hypot(x - hillRightX, z - hillRightZ);
      if (dHR < 32) hm[k] += (ref.y + 10.5 + 0.5 * snoise(x * 0.12, z * 0.12) - hm[k]) * (1 - smooth(10, 31, dHR));
      // Colina izquierda de roca e ichu (+19 m) que rodea y abriga el Campo Base del frío
      const dxL = x - hillLeftX, dzL = z - hillLeftZ;
      const alongL = dxL * tRef.x + dzL * tRef.z, perpL = -dxL * tRef.z + dzL * tRef.x;
      const dHL = Math.hypot(alongL * 0.58, perpL);
      if (dHL < 38) hm[k] += (ref.y + 19.0 + 1.4 * snoise(x * 0.08, z * 0.08) - hm[k]) * (1 - smooth(12, 37, dHL));
      // Pampa llana de Cebollapampa
      const dc = Math.hypot(x - ceb.x, z - ceb.z);
      if (dc < 165) hm[k] += (ceb.y + 0.45 * snoise(x * 0.025, z * 0.025) - hm[k]) * (1 - smooth(55, 160, dc)) * (distG[k] < 10 ? 0.25 : 1);
      if (LAG) { const dl = Math.hypot(x - LAG.x, z - LAG.z); if (dl < 60) hm[k] += (LAG.y - 2.5 + dl * dl * 0.004 - hm[k]) * (1 - smooth(18, 58, dl)); }
      const ds = Math.hypot(x - sum.x, z - sum.z); if (ds < 130) hm[k] += (sum.y - 0.004 * ds * ds + 1.5 * snoise(x * 0.05, z * 0.05) - hm[k]) * (1 - smooth(25, 125, ds));
    }
  }
  function H(x, z) {
    const fx = (x - GX0) / CELL, fz = (z - GZ0) / CELL;
    if (fx < 0 || fz < 0 || fx >= segs || fz >= segs) return Bh(x, z, 4);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, a = hm[j * GN + i], b = hm[(j + 1) * GN + i], c = hm[(j + 1) * GN + i + 1], d = hm[j * GN + i + 1];
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
  }
  const distPath = (x, z) => bil(distG, x, z);
  const YG = 5050 - BASE, YICE = 5480 - BASE;

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  const pr = () => Math.min(window.devicePixelRatio || 1, opts.quality === 'alta' ? 1.5 : 1);
  renderer.setPixelRatio(pr()); renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.innerHTML = '';
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement; canvas.style.cssText = 'display:block;width:100%;height:100%;outline:none'; canvas.tabIndex = 0;
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x03050d, 0.00016);
  const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.15, 40000);

  const uT = {
    uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSunI: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(-0.55, 0.6, 0.35).normalize() }, uMoonCol: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0 },
    uCam: { value: new THREE.Vector3() }, uLightLine: { value: 3000 },
    uHeadPos: { value: new THREE.Vector3() }, uHeadDir: { value: new THREE.Vector3(0, -0.3, -1).normalize() },
    uHead2Pos: { value: new THREE.Vector3() }, uHead2Dir: { value: new THREE.Vector3(0, -0.3, -1).normalize() },
    uHeadCol: { value: new THREE.Color(0.85, 0.93, 1.0) }, uHeadI: { value: 1 },
    uTents: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, -9999, 0)) }, uTentCol: { value: new THREE.Color(1.0, 0.5, 0.18) }, uTentI: { value: 2 },
    uSnowL: { value: YG - 10 }, uTop: { value: TOP - BASE },
    uSunK: { value: 1 }, uAmb: { value: new THREE.Color() }, // escala diurna del terreno (evita sobreexposición)
    uCebP: { value: new THREE.Vector3(RP[0].x, RP[0].y, RP[0].z) }, uCampP: { value: new THREE.Vector3(RP[1].x, RP[1].y, RP[1].z) },
    uTrail: { value: null }, uGrid: { value: new THREE.Vector3(0, 0, 1) }
  };
  { // máscara del sendero: la ruta sin nieve dibujada en un canvas (~0.7 m/px)
    const low = samples.filter((_, i) => tgtY[i] < 900);
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    low.forEach(p => { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); });
    const size = Math.max(x1 - x0, z1 - z0) + 40, RES = 2048, ppm = RES / size;
    x0 -= 20; z0 -= 20;
    const cv = document.createElement('canvas'); cv.width = cv.height = RES;
    const cx = cv.getContext('2d'); cx.fillStyle = '#000'; cx.fillRect(0, 0, RES, RES);
    cx.strokeStyle = '#fff'; cx.lineWidth = 1.2 * ppm; cx.lineJoin = cx.lineCap = 'round'; cx.filter = `blur(${(0.35 * ppm).toFixed(2)}px)`;
    cx.beginPath(); low.forEach((p, i) => { const px = (p.x - x0) * ppm, pz = (p.z - z0) * ppm; i ? cx.lineTo(px, pz) : cx.moveTo(px, pz); }); cx.stroke();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.flipY = false; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    uT.uTrail.value = tex; uT.uGrid.value.set(x0, z0, size);
  }
  const terrainMat = new THREE.ShaderMaterial({ uniforms: uT, vertexShader: terrainVS, fragmentShader: terrainFS });
  { // malla cercana (coincide 1:1 con H)
    const g = new THREE.PlaneGeometry(NSIZE, NSIZE, segs, segs); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) { const k = j * GN + i; pos.setXYZ(k, GX0 + i * CELL, hm[k], GZ0 + j * CELL); }
    g.computeVertexNormals(); g.computeBoundingSphere(); scene.add(new THREE.Mesh(g, terrainMat));
  }
  { // malla lejana (cordillera vecina)
    const FS = 32000, fsg = 300, g = new THREE.PlaneGeometry(FS, FS, fsg, fsg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + NCX, z = pos.getZ(i) + NCZ; let y = Bh(x, z, 5); if (Math.abs(x - NCX) < NSIZE / 2 - 30 && Math.abs(z - NCZ) < NSIZE / 2 - 30) y -= 320; pos.setXYZ(i, x, y, z); }
    g.computeVertexNormals(); g.computeBoundingSphere(); scene.add(new THREE.Mesh(g, terrainMat));
  }

  // sendero
  const pathPts = samples.filter((_, i) => i % 2 === 0 || i === NS).map(p => new THREE.Vector3(p.x, H(p.x, p.z) + 0.07, p.z));
  const pathCurve = new THREE.CatmullRomCurve3(pathPts, false, 'centripetal');
  const uP = { uProg: { value: 0 }, uTime: { value: 0 }, uGlow: { value: 1 }, uVis: { value: 1 }, uCol: { value: new THREE.Vector3(0.15, 0.7, 1.0) }, uCam: uT.uCam, uFogCol: uT.uFogCol, uFogD: uT.uFogD };
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(pathCurve, Math.min(4000, NS * 2), 0.055, 5, false), new THREE.ShaderMaterial({ uniforms: uP, vertexShader: pathVS, fragmentShader: pathFS })));

  // luces para materiales estándar
  const hemi = new THREE.HemisphereLight(0x223355, 0x080808, 0.6); scene.add(hemi);
  const sunL = new THREE.DirectionalLight(0xffffff, 0); scene.add(sunL);
  const moonL = new THREE.DirectionalLight(0x5a70b0, 0.6); moonL.position.copy(uT.uMoonDir.value).multiplyScalar(1000); scene.add(moonL);
  const mkSpot = () => { const s = new THREE.SpotLight(0xdff0ff, 60, 45, 0.5, 0.5, 1.6); scene.add(s); scene.add(s.target); return s; };
  const spot1 = mkSpot(), spot2 = mkSpot();

  // helpers de ruta y colisiones
  const tangentAt = i => { const a = samples[clamp(i - 2, 0, NS)], b = samples[clamp(i + 2, 0, NS)]; const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z); return t.normalize(); };
  const lateral = (i, off) => { const t = tangentAt(i), s = samples[i]; return [s.x - t.z * off, s.z + t.x * off]; };
  const obst = new Map(); const okey = (x, z) => (Math.floor(x / 12) * 4096 + Math.floor(z / 12));
  const addObs = (x, z, r) => { const k = okey(x, z); if (!obst.has(k)) obst.set(k, []); obst.get(k).push([x, z, r]); };
  const dummy = new THREE.Object3D();

  // ---------- Carpas de expedición (amarillas con azul tipo Doite) y Refugio Perú en la colina derecha ----------
  const tentMat = new THREE.MeshStandardMaterial({ color: 0xf0b418, roughness: 0.68, emissive: 0x382204 });
  const tentBlueMat = new THREE.MeshStandardMaterial({ color: 0x1b458f, roughness: 0.72, emissive: 0x051026 });
  function makeExpeditionTent() {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), tentMat);
    dome.scale.set(1.05, 0.92, 1.22);
    const flyBlue = new THREE.Mesh(new THREE.SphereGeometry(1.57, 16, 10, -Math.PI * 0.35, Math.PI * 0.7, 0, Math.PI * 0.48), tentBlueMat);
    flyBlue.scale.set(1.05, 0.93, 1.23);
    const vest = new THREE.Mesh(new THREE.ConeGeometry(0.98, 1.45, 8), tentBlueMat);
    vest.position.set(0, 0.62, -1.28); vest.rotation.x = -0.38;
    g.add(dome, flyBlue, vest);
    return g;
  }
  // Explanada del Campo Base: carpas amarillas/azules junto al riachuelo
  const tentSpots = [[-11, 7], [-16, 14], [-8, 19], [9, 8], [14, 16]];
  const t0v = tangentAt(IDX.ref), s0 = samples[IDX.ref];
  tentSpots.forEach(([lo, la], i) => {
    let x = s0.x - t0v.z * lo - t0v.x * la, zz = s0.z + t0v.x * lo - t0v.z * la;
    if (distPath(x, zz) < 5.5) { x -= t0v.z * Math.sign(lo) * 5.5; zz += t0v.x * Math.sign(lo) * 5.5; }
    const y = H(x, zz);
    const m = makeExpeditionTent();
    m.position.set(x, y, zz); m.rotation.y = rnd() * 6.28; scene.add(m);
    uT.uTents.value[i].set(x, y + 1.6, zz);
  });
  // Casetita pequeña de piedra al fondo de las carpas (como en la foto 20260823_080758.jpg)
  {
    const [sx, sz] = lateral(IDX.ref + 8, -15);
    const sy = H(sx, sz);
    const shed = new THREE.Group();
    const sWall = new THREE.MeshStandardMaterial({ color: 0xb8b2a8, roughness: 0.92 });
    const sDark = new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.2, 2.3), sWall); body.position.y = 1.1; shed.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.12), sDark); win.position.set(0, 1.35, 1.12); shed.add(win);
    shed.position.set(sx, sy, sz); shed.lookAt(s0.x, sy, s0.z); scene.add(shed);
  }
  // Refugio Perú (4675 m) arriba en la colina de la DERECHA (off = +34), con muros de piedra, postigos rojos y texto "REFUGIO PERU 4675"
  {
    const [hx, hz] = lateral(IDX.ref, 34); const hy = H(hx, hz);
    const hut = new THREE.Group();
    const stoneWall = new THREE.MeshStandardMaterial({ color: 0x8a847c, roughness: 0.92 });
    const terraceStone = new THREE.MeshStandardMaterial({ color: 0x6e6860, roughness: 0.95 });
    const slateRoof = new THREE.MeshStandardMaterial({ color: 0x363b42, roughness: 0.78 });
    const shutterRed = new THREE.MeshStandardMaterial({ color: 0xb82924, roughness: 0.65 });
    // Terraza/base de piedra sobre la colina
    const terr = new THREE.Mesh(new THREE.BoxGeometry(13.2, 1.4, 8.8), terraceStone); terr.position.y = 0.5; hut.add(terr);
    // Cuerpo de piedra de 2 niveles
    const b = new THREE.Mesh(new THREE.BoxGeometry(11.2, 4.3, 6.8), stoneWall); b.position.y = 3.1; hut.add(b);
    // Techo a dos aguas gris oscuro
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.9, 2.5, 4, 1), slateRoof); r.scale.set(1.68, 1, 1); r.rotation.y = Math.PI / 4; r.position.y = 6.35; hut.add(r);
    // Chimenea de piedra
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.9), terraceStone); chim.position.set(-3.2, 6.4, -1.2); hut.add(chim);
    // Puerta y ventanas con postigos rojos + luz cálida interior
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.05, 0.14), shutterRed); door.position.set(-3.4, 2.15, -3.42); hut.add(door);
    for (const wx of [-0.9, 1.8, 3.8]) {
      const wGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.92), new THREE.MeshBasicMaterial({ color: 0xffc478 }));
      wGlow.position.set(wx, 2.55, -3.43); wGlow.rotation.y = Math.PI; hut.add(wGlow);
      for (const sd of [-1, 1]) {
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.96, 0.08), shutterRed);
        sh.position.set(wx + sd * 0.68, 2.55, -3.42); hut.add(sh);
      }
    }
    // Letrero pintado en la fachada: "REFUGIO PERU 4675" (como en la foto refugio peru.jpg)
    const signTex = makeSignBoardTexture(['REFUGIO PERU', '4675'], { bg: '#7c766e', border: '#5c564e', color: '#f5f2eb', subColor: '#f5f2eb' });
    const facadeSign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.05), new THREE.MeshBasicMaterial({ map: signTex }));
    facadeSign.position.set(0.5, 4.25, -3.44); facadeSign.rotation.y = Math.PI; hut.add(facadeSign);
    hut.position.set(hx, hy - 0.3, hz); hut.lookAt(samples[IDX.ref].x, hy, samples[IDX.ref].z); scene.add(hut);
    addObs(hx, hz, 5.2);
    uT.uTents.value[5].set(hx, hy + 2.5, hz); uT.uTents.value[6].set(hx + 3, hy + 2.5, hz);
  }

  // Letreros de madera tallada con poste rojo en el Campo Base ("Nev. Huandoy 6,395 m.s.n.m." y "Nev. Pisco 5,752 m.s.n.m.", foto 20260823_102624.jpg)
  {
    const redPostMat = new THREE.MeshStandardMaterial({ color: 0x9e3228, roughness: 0.78 });
    const placeMountainSign = (idxOff, latOff, lines, lookX, lookZ) => {
      const [sx, sz] = lateral(clamp(IDX.ref + idxOff, 0, NS), latOff);
      const sy = H(sx, sz);
      const sg = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 1.55, 10), redPostMat);
      post.position.y = 0.77; sg.add(post);
      const tex = makeSignBoardTexture(lines, { bg: '#6e655c', border: '#4d463f', color: '#f2efe9', subColor: '#e8e4dc', arrow: 'right' });
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.42, 0.06), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
      board.position.y = 1.42; sg.add(board);
      sg.position.set(sx, sy, sz);
      sg.lookAt(lookX, sy, lookZ);
      scene.add(sg);
    };
    // Letrero apuntando a la izquierda hacia el Nevado Huandoy
    placeMountainSign(-2, -8.5, ['Nev. Huandoy', '6,395 m.s.n.m.'], s0.x - t0v.x * 20, s0.z - t0v.z * 20);
    // Letrero apuntando hacia el Nevado Pisco
    placeMountainSign(5, 7.5, ['Nev. Pisco', '5,752 m.s.n.m.'], s0.x - t0v.z * 20, s0.z + t0v.x * 20);
  }

  // Zona interactiva para que el jugador arme su propia carpa amarilla/azul en el Campo Base
  const [ptX, ptZ] = lateral(IDX.ref, 13.5);
  const ptY = H(ptX, ptZ);
  const playerTentGroup = new THREE.Group(); playerTentGroup.position.set(ptX, ptY, ptZ); scene.add(playerTentGroup);
  const ringGeo = new THREE.RingGeometry(1.75, 1.92, 28); ringGeo.rotateX(-Math.PI / 2);
  const tentRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xf0b418, side: THREE.DoubleSide })); tentRing.position.y = 0.06; playerTentGroup.add(tentRing);
  const unpitchedMat = new THREE.MeshStandardMaterial({ color: 0xf0b418, roughness: 0.8 });
  const unpitchedBundle = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 12), unpitchedMat); unpitchedBundle.rotation.z = Math.PI / 2; unpitchedBundle.position.y = 0.2; playerTentGroup.add(unpitchedBundle);
  const pitchedTent = makeExpeditionTent();
  pitchedTent.visible = false; playerTentGroup.add(pitchedTent);

  // ---------- Fauna Andina Real (Burritos con manta rosada, Llamas con arete rojo y Vizcachas sobre rocas con liquen) ----------
  const animals = [];
  const animalSpots = [
    // En la pampa de Cebollapampa y subida
    { idx: IDX.ceb + 18, off: -7.5, kind: 'llama', coat: 0x4a382b },
    { idx: IDX.ceb + 34, off: 8.0, kind: 'llama', coat: 0x8f6b47 },
    { idx: IDX.ceb + 14, off: -16.0, kind: 'cow', coat: 0x1c1a19 },
    { idx: IDX.ceb + 19, off: -24.0, kind: 'cow', coat: 0x4a2c1c },
    { idx: IDX.ceb + 27, off: 13.5, kind: 'cow', coat: 0x1c1a19, patch: 0xe8e2d6 },
    { idx: IDX.ceb + 31, off: 21.0, kind: 'cow', coat: 0x5a3622 },
    { idx: Math.round(IDX.ref * 0.42), off: -5.2, kind: 'vizcacha' },
    { idx: Math.round(IDX.ref * 0.74), off: 5.2, kind: 'vizcacha' },
    // En la hoyada del Campo Base (entre el riachuelo, las carpas y la colina del Refugio Perú)
    { idx: IDX.ref - 3, off: 8.5, kind: 'donkey' },
    { idx: IDX.ref + 3, off: 12.0, kind: 'donkey' },
    { idx: IDX.ref - 6, off: -6.5, kind: 'llama', coat: 0x3d2d22 },
    { idx: IDX.ref + 2, off: -11.5, kind: 'llama', coat: 0x5c4433 },
    { idx: IDX.ref - 9, off: 15.5, kind: 'llama', coat: 0x9a7650 },
    { idx: IDX.ref + 6, off: -16.0, kind: 'llama', coat: 0x4a382b },
    { idx: IDX.ref + 7, off: 6.5, kind: 'vizcacha' },
    { idx: IDX.ref - 5, off: -14.5, kind: 'vizcacha' }
  ];
  const lichenRockMat = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.92 });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3b5228, roughness: 0.9 });
  animalSpots.forEach((sp, i) => {
    const [ax, az] = lateral(clamp(sp.idx, 0, NS), sp.off);
    const ay = H(ax, az);
    const a = sp.kind === 'vizcacha' ? makeVizcacha()
      : sp.kind === 'donkey' ? makeDonkey()
      : sp.kind === 'cow' ? makeCow(sp.coat, sp.patch ?? null)
      : makeLlama(sp.coat);
    if (sp.kind === 'vizcacha') {
      // Roca granítica con líquenes y arbusto andino donde toma sol la vizcacha (foto 20260823_080950.jpg)
      const perch = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), lichenRockMat);
      perch.scale.set(1.35, 0.68, 1.25); perch.position.set(ax, ay + 0.18, az); scene.add(perch);
      for (let b = 0; b < 3; b++) {
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 1), shrubMat);
        bush.position.set(ax + (b - 1) * 0.45, ay + 0.16, az + (b % 2 ? 0.38 : -0.35)); scene.add(bush);
      }
      a.root.position.set(ax, ay + 0.50, az);
    } else {
      a.root.position.set(ax, ay, az);
    }
    a.root.rotation.y = rnd() * 6.28;
    a.baseY = a.root.position.y;
    a.x = ax; a.z = az; a.phase = i * 1.7; a.greetT = 0;
    scene.add(a.root);
    animals.push(a);
  });

  // Cóndores andinos planeando en las térmicas diurnas
  const condors = [];
  const condorMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.7 });
  const collarWhite = new THREE.MeshStandardMaterial({ color: 0xf2f0ec, roughness: 0.6 });
  for (let k = 0; k < 2; k++) {
    const cg = new THREE.Group();
    const cBody = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.8, 8), condorMat); cBody.rotation.x = Math.PI / 2; cg.add(cBody);
    const cNeck = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.07, 6, 12), collarWhite); cNeck.position.z = -0.5; cg.add(cNeck);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.06, 0.85), condorMat); cg.add(wings);
    scene.add(cg);
    condors.push({ root: cg, cx: RP[1].x + (k ? -120 : 90), cz: RP[1].z + (k ? 140 : -80), cy: RP[1].y + 115 + k * 35, r: 95 + k * 30, ph: k * 3.14 });
  }

  // rocas, seracs y colisiones (geometría subdividida para evitar look low-poly)
  function scatter(geo, mat, count, xr, zr, minD, scaleFn, cond, collide) {
    const inst = new THREE.InstancedMesh(geo, mat, count); let n = 0, tries = 0;
    while (n < count && tries++ < count * 25) {
      const x = xr[0] + rnd() * (xr[1] - xr[0]), z = zr[0] + rnd() * (zr[1] - zr[0]); const y = H(x, z);
      if (!cond(y) || distPath(x, z) < minD) continue;
      const s = scaleFn(); dummy.position.set(x, y - s.y * 0.3, z); dummy.scale.set(s.x, s.y, s.z);
      dummy.rotation.set(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6); dummy.updateMatrix(); inst.setMatrixAt(n++, dummy.matrix);
      if (collide && s.y > 0.7) addObs(x, z, Math.max(s.x, s.z) * 0.85);
    }
    inst.count = n; scene.add(inst); return inst;
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.92, emissive: 0x050608 });
  const whiteGraniteMat = new THREE.MeshStandardMaterial({ color: 0xc8c3ba, roughness: 0.88 });
  scatter(new THREE.DodecahedronGeometry(1, 1), rockMat, 1400, [-900, 750], [-950, 1050], 3.8, () => { const s = 0.4 + Math.pow(rnd(), 3) * 4.2; return { x: s * (0.8 + rnd() * 0.5), y: s * (0.6 + rnd() * 0.5), z: s }; }, y => y < YG - 8 && y > 180, true);
  scatter(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xb4d4e6, roughness: 0.25, emissive: 0x0a1a28 }),
    260, [-900, 200], [-1500, -650], 11, () => { const s = 2 + rnd() * 3; return { x: s, y: s * (1.4 + rnd() * 1.2), z: s * (0.7 + rnd() * 0.6) }; }, y => y > YG + 30 && y < 1790, true);

  // ---------- Escenografía real de Etapa 1: Letrero Triple de Cebollapampa, Puente de Madera, Piedras del Camino, Ichu, Queñuales, Cascadita y Riachuelo del Huandoy ----------
  {
    const waterM = new THREE.MeshStandardMaterial({ color: 0x246d82, roughness: 0.08, metalness: 0.45, emissive: 0x051c26 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x583822, roughness: 0.88 });
    const woodPlank = new THREE.MeshStandardMaterial({ color: 0x785235, roughness: 0.85 });

    // 1. Letrero direccional triple en Cebollapampa (Foto 1.jpg: CAMPO BASE PISCO / LAGUNA 69 / REFUGIO PERÚ A 2 horas de camino) + Cartel P.N. Huascarán
    const [sgX, sgZ] = lateral(IDX.ceb + 10, 2.3);
    const sgY = H(sgX, sgZ);
    const signGroup = new THREE.Group();
    const basePedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.66, 0.52, 16), whiteGraniteMat);
    basePedestal.position.y = 0.26; signGroup.add(basePedestal);
    const mainPost = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 2.65, 12), woodDark);
    mainPost.position.y = 1.45; signGroup.add(mainPost);
    // Tabla 1 (arriba): CAMPO BASE PISCO (con ícono de carpa, apuntando hacia la ruta de subida)
    const texPisco = makeSignBoardTexture(['CAMPO BASE PISCO'], { icon: 'tent', arrow: 'right', color: '#f4d44d' });
    const brd1 = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.34, 0.055), new THREE.MeshStandardMaterial({ map: texPisco, roughness: 0.82 }));
    brd1.position.set(0.32, 2.48, 0); signGroup.add(brd1);
    // Tabla 2 (medio): LAGUNA 69 (apuntando hacia el sentido contrario / perpendicular)
    const texLag69 = makeSignBoardTexture(['LAGUNA 69'], { icon: 'hiker', arrow: 'left', color: '#f4d44d' });
    const brd2 = new THREE.Mesh(new THREE.BoxGeometry(1.30, 0.32, 0.055), new THREE.MeshStandardMaterial({ map: texLag69, roughness: 0.82 }));
    brd2.position.set(-0.22, 2.08, 0.18); brd2.rotation.y = Math.PI * 0.38; signGroup.add(brd2);
    // Tabla 3 (abajo): REFUGIO PERÚ / A 2 horas de camino (misma dirección que Campo Base Pisco)
    const texRef = makeSignBoardTexture(['REFUGIO PERÚ', 'A 2 horas de camino'], { arrow: 'right', color: '#f4d44d', subColor: '#f7f4ec' });
    const brd3 = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.38, 0.055), new THREE.MeshStandardMaterial({ map: texRef, roughness: 0.82 }));
    brd3.position.set(0.30, 1.66, 0); signGroup.add(brd3);
    const tStart = tangentAt(IDX.ceb + 10);
    signGroup.position.set(sgX, sgY, sgZ);
    signGroup.rotation.y = Math.atan2(-tStart.z, tStart.x);
    scene.add(signGroup);
    // Cartel grande con techito del Parque Nacional Huascarán detrás del poste (como en la foto 1.jpg)
    const [pkX, pkZ] = lateral(IDX.ceb + 13, 5.5);
    const pkY = H(pkX, pkZ);
    const parkBoard = new THREE.Group();
    for (const s of [-0.95, 0.95]) {
      const pPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 8), woodDark);
      pPost.position.set(s, 1.1, 0); parkBoard.add(pPost);
    }
    const pTex = makeSignBoardTexture(['PARQUE NACIONAL HUASCARÁN', 'Quebrada Llanganuco · 3 900 m'], { bg: '#4a2e1b', color: '#f4d44d', subColor: '#ffffff' });
    const pPanel = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.95, 0.08), new THREE.MeshStandardMaterial({ map: pTex, roughness: 0.85 }));
    pPanel.position.y = 1.45; parkBoard.add(pPanel);
    const pRoof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.75), woodPlank);
    pRoof.position.y = 2.08; pRoof.rotation.x = 0.15; parkBoard.add(pRoof);
    parkBoard.position.set(pkX, pkY, pkZ); parkBoard.lookAt(samples[IDX.ceb + 8].x, pkY, samples[IDX.ceb + 8].z);
    scene.add(parkBoard);

    // 2. Riachuelo de Cebollapampa y Puente Plano de Tablones de Madera sobre estribos de piedra (Foto 3.jpg)
    const bIdx = IDX.ceb + 22;
    const bPos = samples[bIdx], bTan = tangentAt(bIdx);
    const rvCeb = [];
    for (let k = -26; k <= 26; k++) {
      const off = k * 4.2;
      const meander = (Math.abs(k) < 3 ? 0 : Math.sin(k * 0.55) * 3.2);
      const rx = bPos.x - bTan.z * off + bTan.x * meander;
      const rz = bPos.z + bTan.x * off + bTan.z * meander;
      rvCeb.push(new THREE.Vector3(rx, H(rx, rz) + 0.06, rz));
      if (Math.abs(k) >= 1 && Math.abs(k) <= 14) {
        for (const bank of [-1.7, 1.7]) {
          const bx = rx + bTan.x * bank, bz = rz + bTan.z * bank;
          const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + (Math.abs(k * 7) % 3) * 0.14, 1), whiteGraniteMat);
          st.scale.set(1.2, 0.65, 1.1); st.position.set(bx, H(bx, bz) + 0.12, bz); scene.add(st);
        }
      }
    }
    const cebStream = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rvCeb), 140, 1.35, 6, false), waterM);
    cebStream.scale.y = 0.18; scene.add(cebStream);
    // Puente de madera en bPos
    const bridgeGroup = new THREE.Group();
    const bY = H(bPos.x, bPos.z);
    for (const endS of [-1.85, 1.85]) {
      const abut = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.45, 0.75), whiteGraniteMat);
      abut.position.set(0, 0.14, endS); bridgeGroup.add(abut);
    }
    for (const beamX of [-0.68, 0, 0.68]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 4.1), woodDark);
      beam.position.set(beamX, 0.28, 0); bridgeGroup.add(beam);
    }
    for (let p = -6; p <= 6; p++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.065, 0.24), woodPlank);
      plank.position.set(0, 0.37, p * 0.29);
      plank.rotation.y = (rnd() - 0.5) * 0.03;
      bridgeGroup.add(plank);
    }
    bridgeGroup.position.set(bPos.x, bY, bPos.z);
    bridgeGroup.rotation.y = Math.atan2(-bTan.x, -bTan.z);
    scene.add(bridgeGroup);

    // 3. Hileras de piedras blancas/grises que delimitan el sendero (Fotos 2.jpg, 4.png, 8.jpg)
    const borderCnt = Math.floor((IDX.ref - 8) / 2) * 2;
    const borderInst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.24, 1), whiteGraniteMat, borderCnt);
    let bn = 0;
    for (let i = IDX.ceb + 3; i < IDX.ref - 8; i += 2) {
      if (Math.abs(i - bIdx) < 4) continue;
      for (const sd of [-1, 1]) {
        const [bx, bz] = lateral(i, sd * (1.35 + (rnd() - 0.5) * 0.22));
        const by = H(bx, bz);
        dummy.position.set(bx, by + 0.08, bz);
        dummy.scale.set(0.85 + rnd() * 0.6, 0.48 + rnd() * 0.3, 0.85 + rnd() * 0.5);
        dummy.rotation.set(rnd() * 0.4, rnd() * 6.28, rnd() * 0.4);
        dummy.updateMatrix();
        borderInst.setMatrixAt(bn++, dummy.matrix);
      }
    }
    borderInst.count = bn; scene.add(borderInst);

    // 4. Matas de Ichu (Jarava ichu) en Cebollapampa, la subida y los bordes de la hoyada (Fotos 7.jpg, 11.jpg, fauna)
    // Cada mata es un abanico de hojas finas curvadas, oscuras en la base y pajizas en la punta, que se mecen con el viento
    const ichuGeo = (() => {
      const pos = [], col = [], nrm = [], base = new THREE.Color('#6b5a2c'), tip = new THREE.Color('#d6bf86'), cc = new THREE.Color();
      const BL = 44, SEG = 2;
      for (let b = 0; b < BL; b++) {
        const a = rnd() * 6.283, lean = 0.3 + rnd() * 0.7, len = 0.34 + rnd() * 0.3, w = 0.011 + rnd() * 0.008;
        const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, ox = (rnd() - 0.5) * 0.2, oz = (rnd() - 0.5) * 0.2;
        const P = s => { const t = s / SEG, r = lean * t * t * len * 0.8; return [ox + dx * r, len * t * (1 - 0.45 * lean * t * t), oz + dz * r]; };
        for (let s = 0; s < SEG; s++) {
          const p0 = P(s), p1 = P(s + 1), w0 = w * (1 - s / SEG), w1 = w * (1 - (s + 1) / SEG);
          const q = [[p0[0] - px * w0, p0[1], p0[2] - pz * w0], [p0[0] + px * w0, p0[1], p0[2] + pz * w0], [p1[0] - px * w1, p1[1], p1[2] - pz * w1], [p1[0] + px * w1, p1[1], p1[2] + pz * w1]];
          for (const vi of [0, 1, 2, 2, 1, 3]) {
            pos.push(...q[vi]); nrm.push(dx * 0.35, 0.93, dz * 0.35);
            cc.copy(base).lerp(tip, Math.min(1, 0.25 + (s + (vi > 1 ? 1 : 0)) / SEG + rnd() * 0.15)); col.push(cc.r, cc.g, cc.b);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    })();
    const ichuMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
    ichuMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = uP.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 ip = instanceMatrix * vec4(0., 0., 0., 1.); float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.23) * 0.07 * position.y * position.y * 4.;
          transformed.x += sway; transformed.z += sway * 0.6; }`);
    };
    const ichuCnt = 5200;
    const ichuInst = new THREE.InstancedMesh(ichuGeo, ichuMat, ichuCnt);
    const ichuTint = new THREE.Color(), campC = RP[1];
    let inIdx = 0;
    for (let k = 0; k < ichuCnt * 2 && inIdx < ichuCnt; k++) {
      const routeSample = k % 5 < 4 ? Math.floor(rnd() * IDX.ref) : IDX.ref + Math.floor((rnd() - 0.5) * 70);
      const spread = 1.6 + Math.pow(rnd(), 1.6) * (routeSample > IDX.ref - 25 ? 70 : 45);
      const [ix, iz] = lateral(clamp(routeSample, 0, NS), (rnd() < 0.5 ? -1 : 1) * spread);
      const iy = H(ix, iz);
      if (distPath(ix, iz) < 1.3 || iy > 840) continue;
      const slp = Math.abs(H(ix + 1.5, iz) - iy) + Math.abs(H(ix, iz + 1.5) - iy);
      if (slp > 2.2) continue; // laderas muy empinadas: roca
      if (Math.hypot(ix - campC.x, iz - campC.z) < 34 && rnd() < 0.85) continue; // centro de la hoyada: bofedal
      const sc = 0.75 + rnd() * 0.6;
      dummy.position.set(ix, iy - 0.04, iz); dummy.scale.set(sc * (0.9 + rnd() * 0.3), sc, sc * (0.9 + rnd() * 0.3));
      dummy.rotation.set((rnd() - 0.5) * 0.15, rnd() * 6.28, (rnd() - 0.5) * 0.15); dummy.updateMatrix();
      ichuInst.setMatrixAt(inIdx, dummy.matrix);
      ichuInst.setColorAt(inIdx++, ichuTint.setRGB(0.8 + rnd() * 0.35, 0.8 + rnd() * 0.3, 0.75 + rnd() * 0.25));
    }
    ichuInst.count = inIdx; scene.add(ichuInst);

    // 5. Queñuales (Polylepis) en Cebollapampa y subiendo por las laderas hasta media-alta montaña (Fotos 3.jpg, 5.jpg, 10 a 13.jpg)
    // Troncos rojizos retorcidos que se abren en ramas, con follaje gris-verdoso en racimos irregulares
    const tint = (geo, hex, jit) => {
      geo = geo.index ? geo.toNonIndexed() : geo; geo.deleteAttribute('uv');
      const c0 = new THREE.Color(hex), cc = new THREE.Color(), arr = [], cnt = geo.attributes.position.count;
      for (let i = 0; i < cnt; i += 3) { const v = 1 - jit + rnd() * jit * 2; cc.copy(c0).multiplyScalar(v); for (let q = 0; q < 3; q++) arr.push(cc.r, cc.g, cc.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); return geo;
    };
    const makeQuenualGeo = () => {
      const parts = [], up = new THREE.Vector3(0, 1, 0);
      const limb = (from, dir, len, r0, r1) => {
        const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1); g.translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())); g.translate(from.x, from.y, from.z);
        parts.push(tint(g, '#7a3a1f', 0.12)); return from.clone().addScaledVector(dir.clone().normalize(), len);
      };
      const leaf = (at, r) => {
        const g = new THREE.IcosahedronGeometry(r, 0); const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const k = 0.75 + rnd() * 0.45; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.82, p.getZ(i) * k); }
        g.translate(at.x, at.y, at.z); parts.push(tint(g, rnd() < 0.5 ? '#5d6a4c' : '#4c5a3d', 0.18));
      };
      const stems = 1 + (rnd() * 2.2 | 0); // a menudo varios troncos desde el suelo
      for (let st = 0; st < stems; st++) {
        const sa = rnd() * 6.283, so = st ? 0.25 + rnd() * 0.3 : 0;
        const trunkTop = limb(new THREE.Vector3(Math.cos(sa) * so, -0.2, Math.sin(sa) * so), new THREE.Vector3(Math.cos(sa) * (0.2 + so) + (rnd() - 0.5) * 0.4, 1, Math.sin(sa) * (0.2 + so) + (rnd() - 0.5) * 0.4), (1.1 + rnd() * 0.9) * (st ? 0.8 : 1), st ? 0.17 : 0.24, st ? 0.12 : 0.17);
        const nb = 3 + (rnd() * 3 | 0);
        for (let b = 0; b < nb; b++) {
          const a = b / nb * 6.283 + rnd() * 0.8, out = 0.5 + rnd() * 0.6;
          const mid = limb(trunkTop, new THREE.Vector3(Math.cos(a) * out, 0.8 + rnd() * 0.5, Math.sin(a) * out), 0.8 + rnd() * 0.8, 0.14, 0.08);
          leaf(mid.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.6, 0.2, (rnd() - 0.5) * 0.6)), 0.5 + rnd() * 0.3);
          const tipP = limb(mid, new THREE.Vector3(Math.cos(a + 0.5) * 0.5, 1, Math.sin(a + 0.5) * 0.5), 0.5 + rnd() * 0.6, 0.08, 0.045);
          for (let q = 0; q < 4; q++) leaf(tipP.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.1, (rnd() - 0.2) * 0.8, (rnd() - 0.5) * 1.1)), 0.55 + rnd() * 0.4);
        }
        leaf(trunkTop.clone().add(new THREE.Vector3(0, 1.0, 0)), 0.85);
      }
      return mergeGeometries(parts);
    };
    const quenualMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const qVariants = [makeQuenualGeo(), makeQuenualGeo(), makeQuenualGeo()];
    const NT = 540, qInst = qVariants.map(g => new THREE.InstancedMesh(g, quenualMat, NT)), qN = [0, 0, 0];
    let n = 0, tries = 0; const c = RP[0];
    while (n < NT && tries++ < NT * 30) {
      let x, z;
      if (n < 320) {
        // Bosquetes densos alrededor de la pampa (Foto 4.png: masa continua de queñuales al pie de la ladera)
        const a = rnd() * 6.283, r = 25 + Math.sqrt(rnd()) * 620;
        x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
      } else {
        // Queñuales en las laderas a lo largo de la subida (hasta ~4 580 m)
        const si = Math.floor(rnd() * (IDX.ref * 0.82));
        [x, z] = lateral(si, (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 65));
      }
      const y = H(x, z);
      if (y > 685 || distPath(x, z) < 4.5) continue;
      if (Math.hypot(x - c.x, z - c.z) < 60 && rnd() < 0.8) continue; // la pampa central queda despejada
      const v = n % 3, s = 0.85 + rnd() * 0.7;
      dummy.position.set(x, y - 0.1, z); dummy.scale.set(s * (0.9 + rnd() * 0.3), s * (0.85 + rnd() * 0.4), s * (0.9 + rnd() * 0.3));
      dummy.rotation.set((rnd() - 0.5) * 0.15, rnd() * 6.28, (rnd() - 0.5) * 0.15); dummy.updateMatrix();
      qInst[v].setMatrixAt(qN[v]++, dummy.matrix);
      if (Math.hypot(x - c.x, z - c.z) < 400) addObs(x, z, 0.45); n++;
    }
    qInst.forEach((m, i) => { m.count = qN[i]; scene.add(m); });

    // 5b. Bofedal de la hoyada del Campo Base: cojines de musgo/champa verde oscuro entre charcos (fotos del campamento)
    const cushGeo = new THREE.SphereGeometry(1, 12, 7); { const p = cushGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.88 + 0.24 * (0.5 + 0.5 * Math.sin(p.getX(i) * 7.1 + p.getZ(i) * 5.3)); p.setXYZ(i, p.getX(i) * k, Math.max(-0.15, p.getY(i)) * k, p.getZ(i) * k); } cushGeo.computeVertexNormals(); }
    const NC = 1400, cushInst = new THREE.InstancedMesh(cushGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97 }), NC);
    const cushCols = ['#4a5a2a', '#5a6430', '#6a6236', '#3e4e22', '#77703e'].map(h => new THREE.Color(h));
    let cn = 0;
    for (let k = 0; k < NC * 3 && cn < NC; k++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 52, x = campC.x + Math.cos(a) * r, z = campC.z + Math.sin(a) * r, y = H(x, z);
      if (Math.abs(y - campC.y) > 6 || distPath(x, z) < 1.4) continue;
      const s = 0.2 + Math.pow(rnd(), 2) * 0.4;
      dummy.position.set(x, y - s * 0.08, z); dummy.scale.set(s * (0.9 + rnd() * 0.5), s * (0.3 + rnd() * 0.2), s * (0.9 + rnd() * 0.5));
      dummy.rotation.set(0, rnd() * 6.28, 0); dummy.updateMatrix();
      cushInst.setMatrixAt(cn, dummy.matrix); cushInst.setColorAt(cn++, cushCols[(rnd() * cushCols.length) | 0]);
    }
    cushInst.count = cn; scene.add(cushInst);

    // 6. La Cascadita en el farallón rocoso izquierdo durante la subida (Foto 13.jpg)
    const wfIdx = Math.round(IDX.ref * 0.62);
    const [wfX, wfZ] = lateral(wfIdx, -52);
    const wfY = H(wfX, wfZ);
    const cliffDarkMat = new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.92 });
    const waterfallMat = new THREE.MeshBasicMaterial({ color: 0xe6f5ff, transparent: true, opacity: 0.88 });
    const wfGroup = new THREE.Group();
    for (let k = 0; k < 7; k++) {
      const blk = new THREE.Mesh(new THREE.DodecahedronGeometry(6.5, 1), cliffDarkMat);
      blk.scale.set(1.2, 2.4, 1.0);
      blk.position.set((k - 3) * 3.8, 12 + (k % 2) * 4, (k % 3) * 1.5);
      wfGroup.add(blk);
    }
    // Chorro vertical blanco de agua cayendo por la pared de roca
    const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.15, 27, 10), waterfallMat);
    chute.position.set(0, 13.5, 4.2); chute.rotation.x = 0.14; wfGroup.add(chute);
    const splash = new THREE.Mesh(new THREE.SphereGeometry(2.1, 12, 10), waterfallMat);
    splash.scale.set(1.4, 0.55, 1.4); splash.position.set(0, 0.5, 6.0); wfGroup.add(splash);
    wfGroup.position.set(wfX, wfY - 1.5, wfZ);
    wfGroup.lookAt(samples[wfIdx].x, wfY, samples[wfIdx].z);
    scene.add(wfGroup);

    // 7. Riachuelo del Huandoy que atraviesa la hoyada del Campo Base entre musgo y piedras blancas (Foto 20260823_080758.jpg)
    const campStreamPts = [];
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x3d4d22, roughness: 0.94 });
    for (let k = -18; k <= 14; k++) {
      const off = k * 2.2; // Viene desde la izquierda (Huandoy, off < 0) hacia la derecha de la explanada
      const [cx, cz] = lateral(IDX.ref - 2 + Math.round(Math.sin(k * 0.45) * 2), off);
      const cy = H(cx, cz);
      campStreamPts.push(new THREE.Vector3(cx, cy + 0.05, cz));
      if (k % 2 === 0) {
        const moss = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8), mossMat);
        moss.scale.set(1.3, 0.28, 1.2); moss.position.set(cx + 0.55, cy + 0.03, cz - 0.35); scene.add(moss);
        const wRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 1), whiteGraniteMat);
        wRock.scale.set(1.2, 0.6, 1.0); wRock.position.set(cx - 0.48, cy + 0.08, cz + 0.25); scene.add(wRock);
      }
    }
    const campStream = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(campStreamPts), 90, 0.65, 6, false), waterM);
    campStream.scale.y = 0.16; scene.add(campStream);

    // 8. Laguna glaciar en la morrena
    const lag = new THREE.Mesh(new THREE.CircleGeometry(26, 40).rotateX(-Math.PI / 2), waterM); lag.position.set(LAG.x, LAG.y - 1.1, LAG.z); scene.add(lag);
  }
  // hitos de piedra en la morrena y placas de granito
  for (let i = IDX.mor; i < IDX.gla; i += 32) { const [x, z] = lateral(i, (i / 32 | 0) % 2 ? 2.4 : -2.4); const y = H(x, z); [0.4, 0.3, 0.2].forEach((r, q) => { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), rockMat); st.position.set(x, y + [0.25, 0.6, 0.88][q], z); st.rotation.set(rnd(), rnd(), rnd()); scene.add(st); }); }
  { const slabM = new THREE.MeshStandardMaterial({ color: 0x8f8a84, roughness: 0.78 }); for (let i = IDX.gla - 70; i < IDX.gla; i += 7) for (const sd of [-1, 1]) { const [x, z] = lateral(i, sd * (2.5 + rnd() * 5)); const y = H(x, z); const m = new THREE.Mesh(new THREE.BoxGeometry(3 + rnd() * 3, 0.35, 2 + rnd() * 3), slabM); m.position.set(x, y + 0.05, z); m.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3); scene.add(m); } }

  // Acantilado rocoso y cadenas fijas en el Paso de las Cadenas (descenso vertical hacia la morrena)
  for (let i = -30; i <= 16; i += 3) for (const sd of [-1, 1]) {
    const [x, z] = lateral(clamp(IDX.cad + i, 0, NS), sd * (2.8 + rnd() * 1.8)); const y = H(x, z), s = 1.9 + rnd() * 2.2;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMat); m.position.set(x, y + s * 0.45, z); m.scale.set(s, s * 2.1, s); m.rotation.set(rnd() * 0.4, rnd() * 6, rnd() * 0.4); scene.add(m); addObs(x, z, s * 0.85);
  }
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xc0c6ce, roughness: 0.25, metalness: 0.92 });
  {
    const chainPts = [];
    for (let i = -34; i <= 14; i += 3) {
      const ii = clamp(IDX.cad + i, 0, NS);
      const [x, z] = lateral(ii, -1.15);
      const y = H(x, z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 8), metalMat);
      post.position.set(x, y + 0.62, z);
      scene.add(post);
      if (chainPts.length) {
        const a = chainPts[chainPts.length - 1];
        for (let k = 1; k <= 6; k++) {
          const f = k / 6;
          chainPts.push(new THREE.Vector3(a.x + (x - a.x) * f, a.y + (y + 1.12 - a.y) * f - Math.sin(f * Math.PI) * 0.18, a.z + (z - a.z) * f));
        }
      } else chainPts.push(new THREE.Vector3(x, y + 1.12, z));
    }
    const chainCurve = new THREE.CatmullRomCurve3(chainPts);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 120, 0.028, 6, false), metalMat));
  }

  // grietas que cruzan la ruta
  const crevs = [IDX.col + Math.round((IDX.gri - IDX.col) * 0.55), IDX.gri + Math.round((IDX.cru - IDX.gri) * 0.35), IDX.cru - 9].map(i => ({ idx: i }));
  const crevMat = new THREE.MeshBasicMaterial({ color: 0x02060c }), lipMat = new THREE.MeshStandardMaterial({ color: 0xdfe9f2, roughness: 0.5 });
  crevs.forEach(c => {
    const s = samples[c.idx], t = tangentAt(c.idx), y = H(s.x, s.z), slope = (H(s.x + t.x, s.z + t.z) - H(s.x - t.x, s.z - t.z)) / 2;
    const g = new THREE.Group(); g.rotation.order = 'YXZ'; g.rotation.y = Math.atan2(-t.x, -t.z); g.rotation.x = Math.atan(slope);
    const gap = new THREE.Mesh(new THREE.BoxGeometry(16, 0.05, 1.0), crevMat); g.add(gap);
    for (const sd of [-1, 1]) { const lip = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 0.35), lipMat); lip.position.z = sd * 0.65; lip.position.y = 0.06; g.add(lip); }
    g.position.set(s.x, y + 0.03, s.z); scene.add(g);
  });
  // muro de hielo del crux (flanqueos)
  {
    const iceMat = new THREE.MeshStandardMaterial({ color: 0x9fd0ea, roughness: 0.18, emissive: 0x0a1c2a });
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) { const ii = IDX.cru - 4 + k * 4; const [x, z] = lateral(ii, sd * (3.4 + k * 0.6)); const y = H(x, z); const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), iceMat); m.position.set(x, y + 1.2, z); m.scale.set(2.2, 3.4, 1.6); m.rotation.y = rnd() * 6; scene.add(m); addObs(x, z, 2); }
  }
  // apachetas y banderolas
  const flagMat = new THREE.MeshBasicMaterial({ color: 0x0aa0d0, side: THREE.DoubleSide }); const flags = [];
  RP.forEach((p, k) => {
    const ii = wpIdx[k]; const [x, z] = lateral(clamp(ii, 0, NS), k === RP.length - 1 ? 3 : 2.6); const y = H(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z);
    [0.55, 0.4, 0.28].forEach((r, j) => { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), rockMat); st.position.y = [0.3, 0.75, 1.1][j]; st.rotation.set(rnd(), rnd(), rnd()); g.add(st); });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.6), metalMat); pole.position.y = 1.3; g.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), flagMat); fl.position.set(0.36, 2.35, 0); g.add(fl); flags.push(fl);
    scene.add(g);
  });

  // cielo, estrellas, nubes, ventisca
  const uS = { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunCol: uT.uSunCol, uSunDir: { value: new THREE.Vector3() }, uGlowI: { value: 0 }, uDisc: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(18000, 48, 32), new THREE.ShaderMaterial({ uniforms: uS, vertexShader: skyVS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false, fog: false }));
  scene.add(sky);
  const NST = 7000, sp = new Float32Array(NST * 3), ss = new Float32Array(NST), sph = new Float32Array(NST);
  const bandN = new THREE.Vector3(0.3, 0.5, 0.8).normalize();
  for (let i = 0; i < NST; i++) {
    let v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
    if (i < NST * 0.35) v.addScaledVector(bandN, -v.dot(bandN) * (0.85 + rnd() * 0.15)).normalize();
    if (v.y < -0.05) v.y = -v.y; v.multiplyScalar(16000); sp.set([v.x, v.y, v.z], i * 3);
    ss[i] = 0.9 + Math.pow(rnd(), 9) * 3.2; sph[i] = rnd();
  }
  const stGeo = new THREE.BufferGeometry(); stGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3)); stGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1)); stGeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  const uSt = { uOp: { value: 0 }, uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } };
  const stars = new THREE.Points(stGeo, new THREE.ShaderMaterial({ uniforms: uSt, vertexShader: starsVS, fragmentShader: starsFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  stars.frustumCulled = false; scene.add(stars);
  const uC = { uOp: { value: 0 }, uTime: uSt.uTime, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uCam: uT.uCam, uFogCol: uT.uFogCol, uFogD: uT.uFogD, uCtr: { value: new THREE.Vector2(SX, SZ) } };
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(36000, 36000, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: uC, vertexShader: cloudVS, fragmentShader: cloudFS, transparent: true, depthWrite: false }));
  clouds.position.y = 380; scene.add(clouds);
  const NSN = 4200, snp = new Float32Array(NSN * 3), sns = new Float32Array(NSN);
  for (let i = 0; i < NSN; i++) { snp.set([rnd() * 70, rnd() * 40, rnd() * 70], i * 3); sns[i] = rnd(); }
  const snGeo = new THREE.BufferGeometry(); snGeo.setAttribute('position', new THREE.BufferAttribute(snp, 3)); snGeo.setAttribute('aSeed', new THREE.BufferAttribute(sns, 1));
  const uSn = { uCam: uT.uCam, uWind: { value: new THREE.Vector3(-9, 1, 5) }, uTime: uSt.uTime, uPR: uSt.uPR, uOp: { value: 0 }, uColr: { value: new THREE.Color(1, 1, 1) } };
  const snowPts = new THREE.Points(snGeo, new THREE.ShaderMaterial({ uniforms: uSn, vertexShader: snowVS, fragmentShader: snowFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  snowPts.frustumCulled = false; scene.add(snowPts);

  const flareL = new THREE.PointLight(0xffffff, 0, 1); scene.add(flareL);
  let flare = null;
  try {
    flare = new Lensflare();
    const t0 = glowTexture(256, [[0, 'rgba(255,250,235,1)'], [0.2, 'rgba(255,230,190,0.5)'], [1, 'rgba(255,200,150,0)']]);
    const t1 = glowTexture(128, [[0, 'rgba(255,255,255,0)'], [0.75, 'rgba(255,255,255,0.12)'], [0.9, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
    const t2 = glowTexture(64, [[0, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    flare.addElement(new LensflareElement(t0, 420, 0, new THREE.Color(1, 0.95, 0.85)));
    flare.addElement(new LensflareElement(t2, 50, 0.35, new THREE.Color(0.4, 0.7, 1)));
    flare.addElement(new LensflareElement(t1, 110, 0.6, new THREE.Color(1, 0.6, 0.8)));
    flare.addElement(new LensflareElement(t1, 180, 1.0, new THREE.Color(0.5, 0.7, 1)));
    flareL.add(flare); flare.visible = false;
  } catch (e) { flare = null; }

  // personajes
  const player = makeClimber(0x48525c), guide = makeClimber(0xd6006c);
  scene.add(player.root); scene.add(guide.root); guide.axe.visible = false;
  const ropeGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 20 }, () => new THREE.Vector3()));
  const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0xff3d8a })); rope.frustumCulled = false; rope.visible = false; scene.add(rope);

  // post
  const rt = new THREE.WebGLRenderTarget(host.clientWidth, host.clientHeight, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(host.clientWidth, host.clientHeight), 1.0, 0.6, 0.6);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setPixelRatio(pr()); renderer.setSize(w, h); composer.setPixelRatio(pr()); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); uSt.uPR.value = renderer.getPixelRatio(); }
  window.addEventListener('resize', resize); resize();
  const ro = new ResizeObserver(() => resize()); ro.observe(host);

  // ---------- Estado de juego ----------
  // Sistema de 3 capas acumulativas:
  // Capa 1 (Base ligera, siempre activa): insul 0.20, wind 0.12
  // Capa 2 (Térmica / Polar, tecla C): +0.50 insul
  // Capa 3 (Cortavientos Gore-Tex, tecla V): +0.22 insul, +0.76 wind
  const baseW = Object.values(gear).reduce((s, g) => s + g.weightKg, 0);
  const drinkMax = gear.rehydratingDrink ? gear.rehydratingDrink.servings : 4;
  let G0;
  function fresh() {
    const s = samples[6];
    const diff = getDiff();
    return {
      phase: 'intro', x: s.x, z: s.z, y: H(s.x, s.z), vx: 0, vz: 0, face: Math.atan2(-(samples[12].x - s.x), -(samples[12].z - s.z)),
      sIdx: 6, maxIdx: 6,
      // Inicia a las 09:30 AM del Día 1 (-14.5 h antes de las 00:00 medianoche del ataque a cumbre)
      gameSec: -14.5 * 3600,
      rested: false, atCamp: false, tentPitched: false, pitchT: 0, interactPrompt: '',
      crumbs: [], stamina: 100, oxygen: 96, body: 82, sweat: 0,
      thermal: false, windbreaker: false, // Empieza con 1/3 capas (solo ropa ligera para el sol del valle)
      poles: true, crampons: false, axe: false, rope: false,
      thermos: gear.hotThermos.servings + diff.bonusServings,
      drinks: drinkMax + diff.bonusServings,
      snacks: gear.energySnacks.servings + diff.bonusServings,
      exhausted: false, soroche: 0, hop: 0, slide: 0, sdx: 0, sdz: 0,
      gearT: 0, steady: 0, stride: 0, slipAcc: 0, walked: 0, minStam: 100, usedT: 0, usedH: 0, usedE: 0, slips: 0,
      snowing: 0, snowTarget: 0, nextSnowToggle: 48,
      trig: {}, hintAt: {}, lastMsgAt: -99,
      guideS: 14, gWait: false, msgs: 0, endReason: null, winT: 0, summitClock: null, real: 0
    };
  }
  G0 = fresh(); let S = G0;
  const TS = () => {
    if (!S.rested) {
      // De Cebollapampa al Refugio dura ~3 horas de juego (09:30 AM -> 12:30 PM); en el campamento avanza suave
      return S.atCamp ? 18 : 11500 / (opts.duration * 60);
    }
    return 18000 / (opts.duration * 60);
  };
  const SPM = () => 13 / opts.duration;
  let camYaw = S.face, camPitch = 0.28, tYaw = camYaw, tPitch = camPitch, camDist = 5;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const keys = {};
  const audio = makeAudio();
  let paused = false, dayP = 1, ended = false, lastPlockPauseAt = 0;

  const fmtN = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  const hourNow = () => S.gameSec / 3600; // 0.0 = 12:00 AM medianoche
  const clockStr = sec => { let h = sec / 3600; h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), h12 = hh % 12 === 0 ? 12 : hh % 12; return String(h12).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
  const ampm = sec => { let h = sec / 3600; h = ((h % 24) + 24) % 24; return h >= 12 ? 'PM' : 'AM'; };
  const thermosMax = () => gear.hotThermos.servings + getDiff().bonusServings;
  const drinksMax = () => drinkMax + getDiff().bonusServings;
  const weight = () => baseW - (thermosMax() - S.thermos) * 0.25 - (drinksMax() - S.drinks) * 0.20 - ((gear.energySnacks.servings + getDiff().bonusServings) - S.snacks) * 0.09;
  const layersCount = () => 1 + (S.thermal ? 1 : 0) + (S.windbreaker ? 1 : 0);
  const layersDesc = () => {
    const n = layersCount();
    if (n === 3) return '3/3 (Ligera + Térmica + Cortav.)';
    if (S.thermal) return '2/3 (Ligera + Térmica)';
    if (S.windbreaker) return '2/3 (Ligera + Cortavientos)';
    return '1/3 (Solo capa ligera)';
  };
  const getJacketProps = () => ({
    insul: 0.20 + (S.thermal ? 0.50 : 0) + (S.windbreaker ? 0.22 : 0),
    wind: 0.12 + (S.windbreaker ? 0.78 : 0) + (S.thermal ? 0.05 : 0)
  });

  let toastSeq = 0;
  const toast = (k, title, detail = '', tone = 'ok') => {
    cb.onToast && cb.onToast({ id: ++toastSeq, k, title, detail, tone });
  };
  const say = (text, rec = [], kind = 'guia') => { S.lastMsgAt = S.real; cb.onMsg && cb.onMsg({ text, rec, kind, id: ++S.msgs }); };
  const hint = (key, gap, text, rec) => { if ((S.hintAt[key] ?? -1e9) + gap > S.real || S.real - S.lastMsgAt < 7) return false; S.hintAt[key] = S.real; say(text, rec); return true; };
  const wpName = k => ROUTE[k].name;
  const curWp = () => { let k = 0; for (let i = 0; i < wpIdx.length; i++) if (S.sIdx >= wpIdx[i] - 3) k = i; return k; };
  const DLG = Object.fromEntries(ROUTE.map(w => [w.id, w.guideDialogue]));
  const REC = {
    cp1_cebollapampa: [{ k: 'B', t: 'Bastones activos' }, { k: 'R', t: 'Saltar a 12:00 AM (opcional)' }],
    cp2_refugio_peru: [{ k: 'F', t: 'Armar carpa / Fauna' }, { k: 'R', t: 'Descansar hasta 12:00 AM' }],
    wp3_loma_rocosa: [{ k: 'C', t: 'Capa térmica puesta' }, { k: 'B', t: 'Bastones para el zigzag' }],
    cp3_paso_cadenas: [{ k: 'B', t: 'Guardar bastones' }, { k: 'W', t: 'Bajar por las cadenas' }],
    wp4_morrena_entrada: [{ k: 'B', t: 'Sacar bastones en morrena' }, { k: 'H', t: 'Bebida rehidratante' }],
    cp4_borde_glaciar: [{ k: 'G', t: 'Crampones, piolet y cuerda' }, { k: 'C / V', t: 'Ponerse las 3 capas' }],
    wp5_collado_huandoy: [{ k: 'V', t: 'Cortavientos obligatoria' }, { k: 'T', t: 'Mate caliente' }],
    wp6_campo_grietas: [{ k: 'Espacio', t: 'Saltar las grietas' }],
    cp5_el_crux_rimaia: [{ k: 'H / E', t: 'Hidratar y snack' }, { k: 'Espacio', t: 'Saltar la rimaya' }],
    cp6_cumbre_pisco: []
  };
  const LEAD = [0, 8, 22, 34, 18, 34, 85, 45, 34, 0];

  function sorocheFx() { return clamp(Math.max((55 - S.oxygen) / 45, S.soroche * 0.75), 0, 1); }

  function restart() {
    S = fresh(); S.phase = 'playing'; paused = false; ended = false; dayP = 1; camYaw = tYaw = S.face; camPitch = tPitch = 0.28;
    player.crampons.forEach(c => c.visible = false); rope.visible = false;
    pitchedTent.visible = false; unpitchedBundle.visible = true; tentRing.visible = true;
    say(DLG.cp1_cebollapampa, REC.cp1_cebollapampa); S.trig[0] = true;
    cb.onPhase && cb.onPhase('playing');
    pushHud(true);
  }
  function respawnCheckpoint() {
    const k = clamp(curWp(), 0, ROUTE.length - 1);
    const cpHours = [-14.5, -11.5, 0, 0.6, 1.1, 1.6, 2.3, 3.1, 3.9, 4.5];
    ended = false; paused = false; S.phase = 'playing'; S.endReason = null;
    const i = clamp(wpIdx[k], 6, NS - 6);
    pushBack(i); S.sIdx = i; S.guideS = Math.min(NS - 3, i + 10);
    S.stamina = 100; S.oxygen = 95; S.body = 86; S.sweat = 0; S.soroche = 0; S.exhausted = false;
    S.slide = 0; S.hop = 0; S.gearT = 0; S.pitchT = 0;
    S.thermos = Math.max(S.thermos, 2);
    S.drinks = Math.max(S.drinks, 2);
    S.snacks = Math.max(S.snacks, 2);
    if (k === 0) {
      S.rested = false; S.atCamp = false; S.gameSec = -14.5 * 3600;
    } else if (k === 1) {
      S.atCamp = !S.rested; S.gameSec = S.rested ? 0 : -11.5 * 3600;
    } else {
      S.rested = true; S.atCamp = false; S.thermal = true;
      S.gameSec = cpHours[k] * 3600;
    }
    if (k === 3) S.poles = false;
    else if (k === 4) S.poles = true;
    else if (k >= 5) {
      S.crampons = S.axe = S.rope = true; S.poles = false; S.thermal = true; S.windbreaker = true;
      player.crampons.forEach(c => c.visible = true);
    }
    const t = tangentAt(i); S.face = camYaw = tYaw = Math.atan2(-t.x, -t.z);
    dayP = hourToP(hourNow());
    say('Reiniciando desde el último punto de control: ' + wpName(k) + '.', REC[ROUTE[k].id] || []);
    cb.onPhase && cb.onPhase('playing');
    pushHud(true);
  }
  function goMainMenu() {
    if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { } }
    S = fresh(); paused = false; ended = false; dayP = 1; camYaw = tYaw = S.face; camPitch = tPitch = 0.28;
    player.crampons.forEach(c => c.visible = false); rope.visible = false;
    pitchedTent.visible = false; unpitchedBundle.visible = true; tentRing.visible = true;
    cb.onPhase && cb.onPhase('intro');
    pushHud(true);
  }
  function endGame(type, reason) {
    if (ended) return; ended = true; S.phase = type; S.endReason = reason;
    if (document.pointerLockElement) document.exitPointerLock();
    const st = stats(); cb.onEnd && cb.onEnd({ type, reason, stats: st }); cb.onPhase && cb.onPhase(type);
  }
  function stats() {
    const realMin = S.real / 60;
    return {
      clock: S.summitClock || clockStr(S.gameSec), ampm: ampm(S.gameSec), alt: fmtN(BASE + S.y), dist: (S.walked / 1000).toFixed(2).replace('.', ','),
      dur: (() => { const m = Math.max(0, Math.round(S.gameSec / 60)); return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; })(),
      real: Math.floor(realMin) + ':' + String(Math.round((realMin % 1) * 60)).padStart(2, '0'),
      minStam: Math.round(S.minStam), usedT: S.usedT + S.usedH, usedE: S.usedE, slips: S.slips,
      reached: wpName(curWp()), progress: Math.round(S.maxIdx / NS * 100)
    };
  }

  // Saltar / Descansar hasta las 12:00 AM (Medianoche) para iniciar el ataque nocturno a cumbre
  function rest() {
    if (S.rested) return;
    // Si el jugador salta desde antes del refugio o paseando lejos, lo ubicamos en el Refugio Perú listo para salir
    if (S.sIdx < IDX.ref - 4 || S.sIdx > IDX.ref + 16) {
      pushBack(IDX.ref); S.sIdx = S.maxIdx = IDX.ref; S.guideS = IDX.ref + 10;
      const t = tangentAt(IDX.ref); S.face = camYaw = tYaw = Math.atan2(-t.x, -t.z);
    }
    S.rested = true; S.atCamp = false; S.trig[1] = true; S.trig[2] = true;
    S.tentPitched = true; pitchedTent.visible = true; unpitchedBundle.visible = false; tentRing.visible = false;
    uT.uTents.value[7].set(ptX, ptY + 1.8, ptZ);
    S.gameSec = 0; // 12:00 AM (00:00 Medianoche)
    dayP = 0;
    S.stamina = 100; S.body = Math.max(S.body, 86); S.sweat = 0; S.oxygen = Math.max(S.oxygen, 94);
    S.thermal = true; // Abrigado con 2ª capa térmica para la medianoche
    S.exhausted = false; S.soroche = 0; S.hintAt = {}; S.lastMsgAt = -99;
    cb.onRest && cb.onRest();
    setTimeout(() => say(DLG.wp3_loma_rocosa, REC.wp3_loma_rocosa), 2400);
    pushHud(true);
  }

  function pushBack(toIdx) { const s = samples[clamp(toIdx, 0, NS)]; S.x = s.x; S.z = s.z; S.y = H(s.x, s.z); S.vx = S.vz = 0; S.slide = 0; }
  function nearestIdx(full) {
    let b = 1e12, bi = S.sIdx; const a0 = full ? 0 : Math.max(0, S.sIdx - 90), a1 = full ? NS : Math.min(NS, S.sIdx + 90);
    for (let i = a0; i <= a1; i++) { const p = samples[i], d = (p.x - S.x) ** 2 + (p.z - S.z) ** 2; if (d < b) { b = d; bi = i; } }
    return [bi, Math.sqrt(b)];
  }

  // Interacción con carpa o animalitos (tecla F)
  function tryInteract() {
    const dTent = Math.hypot(S.x - ptX, S.z - ptZ);
    if (!S.tentPitched && dTent < 8.5) {
      S.pitchT = 0.001;
      audio && audio.clink();
      return;
    }
    let bestA = null, bestD = 8.5;
    for (const a of animals) {
      const d = Math.hypot(S.x - a.x, S.z - a.z);
      if (d < bestD) { bestD = d; bestA = a; }
    }
    if (bestA) {
      bestA.greetT = 2.2;
      audio && audio.animal(bestA.kind);
      S.stamina = Math.min(100, S.stamina + 6);
      toast('F', `Interactuaste con ${bestA.name}`, '+6 % Estamina · Fauna del Campo Base', 'ok');
      if (bestA.kind === 'vizcacha') {
        say('Una vizcacha tomando sol sobre las rocas con líquenes. Si te acercas despacio casi ni se inmutan.');
      } else if (bestA.kind === 'cow') {
        say('Vacas criollas pastando en la pampa de Cebollapampa, junto al riachuelo. Son de las familias de la quebrada; pasa tranquilo a su lado.');
      } else if (bestA.kind === 'donkey') {
        say('Uno de los burritos de carga del campamento con su manta andina rosada y cincha amarilla descansando tras subir el equipo.');
      } else {
        say('Una llama marrón con su arete rojo en la oreja pastando tranquila frente al macizo del Huandoy.');
      }
      pushHud(true);
    }
  }

  // ---------- Entrada ----------
  const setPauseState = nextPaused => {
    paused = nextPaused;
    for (const k in keys) keys[k] = false;
    drag = false;
    if (paused && document.pointerLockElement) {
      try { document.exitPointerLock(); } catch (er) { }
    } else if (!paused && S.phase === 'playing') {
      try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => { }); } catch (er) { }
    }
    cb.onPhase && cb.onPhase(paused ? 'paused' : 'playing');
    pushHud(true);
  };
  const onPointerLockChange = () => {
    if (!document.pointerLockElement && S.phase === 'playing' && !paused && !ended) {
      lastPlockPauseAt = performance.now();
      setPauseState(true);
    }
  };
  const onKeyDown = e => {
    if (S.phase !== 'playing') return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const c = e.code; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
    if (e.repeat) { keys[c] = true; return; }
    keys[c] = true;
    if (c === 'Escape' || c === 'KeyP') {
      if (c === 'Escape' && performance.now() - lastPlockPauseAt < 220) return;
      setPauseState(!paused);
      return;
    }
    if (paused) return;
    if (c === 'KeyM' && audio) { audio.setMuted(!audio.muted); }
    if (c === 'KeyN') { mapZoom = !mapZoom; }
    if (c === 'Space' && S.hop <= 0 && !S.exhausted) { S.hop = 0.6; S.stamina = Math.max(0, S.stamina - 3); audio && audio.hop(); }
    if (c === 'KeyC') {
      S.thermal = !S.thermal;
      toast(
        'C',
        S.thermal ? 'Te pusiste la chompa térmica (2ª capa)' : 'Guardaste la chompa térmica en mochila',
        `Abrigo activo: ${layersDesc()}`,
        S.thermal ? 'ok' : 'info'
      );
    }
    if (c === 'KeyV') {
      S.windbreaker = !S.windbreaker;
      toast(
        'V',
        S.windbreaker ? 'Te pusiste la casaca cortavientos (3ª capa)' : 'Te quitaste la casaca cortavientos',
        `Abrigo activo: ${layersDesc()}`,
        S.windbreaker ? 'ok' : 'info'
      );
    }
    if (c === 'KeyB') {
      if (S.axe && !S.poles) { S.poles = true; } else S.poles = !S.poles;
      audio && audio.clink();
      toast(
        'B',
        S.poles ? 'Bastones de trekking en mano' : 'Bastones guardados en la mochila',
        S.poles ? 'Mayor equilibrio y menor desgaste en subida' : 'Manos libres para las cadenas o el piolet',
        S.poles ? 'ok' : 'info'
      );
    }
    if (c === 'KeyT') {
      if (S.thermos > 0) {
        S.thermos--; S.usedT++;
        S.body = Math.min(100, S.body + 16);
        S.oxygen = Math.min(100, S.oxygen + 8);
        S.soroche = Math.max(0, S.soroche - 0.35);
        audio && audio.drink();
        toast('T', 'Tomaste mate de coca caliente', `+16 % Temp. · +8 % O₂ · Quedan ${S.thermos}/${thermosMax()}`, 'ok');
      } else {
        toast('T', 'Termo de mate vacío', 'No te quedan raciones de mate caliente', 'warn');
      }
    }
    if (c === 'KeyH') {
      if (S.drinks > 0) {
        S.drinks--; S.usedH++;
        S.stamina = Math.min(100, S.stamina + 22);
        S.oxygen = Math.min(100, S.oxygen + 10);
        S.sweat = Math.max(0, S.sweat - 0.45);
        if (S.stamina >= 25) S.exhausted = false;
        audio && audio.drink();
        toast('H', 'Tomaste bebida rehidratante', `+22 % Estamina · +10 % O₂ · Quedan ${S.drinks}/${drinksMax()}`, 'ok');
      } else {
        toast('H', 'Sin bebida rehidratante', 'No te quedan raciones hidratantes', 'warn');
      }
    }
    if (c === 'KeyE') {
      if (S.snacks > 0) {
        S.snacks--; S.usedE++;
        S.stamina = Math.min(100, S.stamina + 25);
        if (S.stamina >= 25) S.exhausted = false;
        toast('E', 'Comiste un snack energético', `+25 % Estamina · Quedan ${S.snacks} en la mochila`, 'ok');
      } else {
        toast('E', 'Sin snacks energéticos', 'No te quedan raciones en la mochila', 'warn');
      }
    }
    if (c === 'KeyF') { tryInteract(); }
    if (c === 'KeyR' && !S.rested) { rest(); return; }
    if (c === 'KeyG') {
      if (S.crampons) {
        toast('G', 'Crampones y piolet ya puestos', 'Equipo técnico de glaciar activo', 'info');
        return;
      }
      if (S.sIdx < IDX.gla - 60) {
        toast('G', 'Todavía estás en roca', 'Los crampones se ponen en el borde del glaciar (5 050 m)', 'warn');
        return;
      }
      S.gearT = 0.001;
    }
    pushHud(true);
  };
  const onKeyUp = e => { keys[e.code] = false; if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { keys.ShiftLeft = keys.ShiftRight = false; } };
  const clearKeys = () => { for (const k in keys) keys[k] = false; drag = false; };
  document.addEventListener('visibilitychange', clearKeys);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  let drag = false;
  const onMouseDown = e => { if (S.phase !== 'playing' || paused) return; drag = true; if (!document.pointerLockElement) { try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => { }); } catch (er) { } } };
  const onMouseUp = () => { drag = false; };
  const onMouseMove = e => {
    if (S.phase !== 'playing' || paused) return;
    if (document.pointerLockElement === canvas || drag) { tYaw -= e.movementX * 0.0026; tPitch = clamp(tPitch + e.movementY * 0.0022, -25 * Math.PI / 180, 62 * Math.PI / 180); }
  };
  const onWheel = e => { if (S.phase !== 'playing') return; e.preventDefault(); camDist = clamp(camDist + Math.sign(e.deltaY) * 0.4, 3.8, 6.8); };
  const onBlur = () => { for (const k in keys) keys[k] = false; drag = false; };
  window.addEventListener('keydown', onKeyDown, true); window.addEventListener('keyup', onKeyUp, true);
  canvas.addEventListener('mousedown', onMouseDown); window.addEventListener('mouseup', onMouseUp); window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false }); window.addEventListener('blur', onBlur);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- Simulación ----------
  let effort = 0, wind = 0.25, extT = 12, surface = 'rock';
  function update(dt) {
    S.real += dt; S.gameSec += dt * TS();

    // Eventos aleatorios de nevada
    if (S.real >= S.nextSnowToggle) {
      if (S.snowTarget > 0) {
        S.snowTarget = 0;
        S.nextSnowToggle = S.real + 55 + rnd() * 65;
      } else {
        S.snowTarget = 0.65 + rnd() * 0.35;
        S.nextSnowToggle = S.real + 32 + rnd() * 38;
        if (!S.windbreaker) {
          say('¡Empezó a nevar! Ponte la casaca cortavientos (V) encima para no mojarte ni enfriarte.', [{ k: 'V', t: 'Ponerse cortavientos' }]);
        } else {
          say('Cae una nevada andina. Qué bueno que llevas la cortavientos puesta.');
        }
      }
    }
    S.snowing += (S.snowTarget - S.snowing) * (1 - Math.exp(-dt * 0.8));

    const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const str = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    const fX = -Math.sin(camYaw), fZ = -Math.cos(camYaw), rX = Math.cos(camYaw), rZ = -Math.sin(camYaw);
    let dx = fX * fwd + rX * str, dz = fZ * fwd + rZ * str; const dl = Math.hypot(dx, dz);
    if (dl > 0) { dx /= dl; dz /= dl; }
    let want = dl > 0; const wantIn = want; let why = '';

    // Progreso de armar la carpa en el campamento
    if (S.pitchT > 0) {
      if (want) {
        S.pitchT = 0;
        say('Mantente quieto junto al círculo amarillo y presiona F para terminar de armar tu carpa.');
      } else {
        S.pitchT += dt;
        if (S.pitchT >= 2.4) {
          S.pitchT = 0; S.tentPitched = true;
          pitchedTent.visible = true; unpitchedBundle.visible = false; tentRing.visible = false;
          uT.uTents.value[7].set(ptX, ptY + 1.8, ptZ);
          S.stamina = Math.min(100, S.stamina + 15);
          audio && audio.clink();
          toast('F', 'Carpa de alta montaña armada', '+15 % Estamina · Campamento listo', 'ok');
          say('¡Carpa de alta montaña lista! Puedes seguir explorando el campamento o presionar R para descansar hasta las 12:00 AM.', [{ k: 'R', t: 'Saltar a las 12:00 AM' }]);
        }
      }
      want = false;
    }

    if (S.gearT > 0) {
      if (want) { S.gearT = 0; toast('G', 'Equipamiento interrumpido', 'Mantente quieto 3 s para ponerte los crampones', 'warn'); }
      else {
        S.gearT += dt;
        if (S.gearT >= 3) {
          S.gearT = 0; S.crampons = S.axe = S.rope = true; S.poles = false;
          player.crampons.forEach(c => c.visible = true); audio && audio.clink();
          toast('G', 'Te pusiste crampones, piolet y cuerda', 'Bastones guardados · Listo para el hielo', 'ok');
          say('Bien. Crampones ajustados, piolet en mano y encordados. Asegúrate de tener las 3 capas puestas (C y V).', [{ k: 'C / V', t: '3 capas de abrigo' }]);
        }
      }
      want = false;
    }
    if (S.gearT > 0 && wantIn) why = 'Equipándote: quédate quieto';
    if (S.exhausted) { want = false; if (wantIn) why = 'Sin aliento: espera a recuperar el 25 %'; }

    // Llegada al Refugio Perú de día: modo libre en campamento
    if (!S.rested && S.sIdx >= IDX.ref - 4 && !S.atCamp) {
      S.atCamp = true;
      say(DLG.cp2_refugio_peru, REC.cp2_refugio_peru);
    }

    // Prompt contextual de interacción (F) cerca de la carpa o animalitos
    let promptF = '';
    if (!S.tentPitched && Math.hypot(S.x - ptX, S.z - ptZ) < 8.0) {
      promptF = '[F] Armar tu carpa de alta montaña';
    } else {
      for (const a of animals) {
        if (Math.hypot(S.x - a.x, S.z - a.z) < 7.5) {
          promptF = `[F] Interactuar con ${a.name}`;
          break;
        }
      }
    }
    S.interactPrompt = promptF;

    const trot = want && (keys.ShiftLeft || keys.ShiftRight) && S.stamina > 5;
    const onIce = S.y > YG - 4, techOK = S.crampons && S.axe;
    const inCad = S.sIdx >= IDX.cad - 36 && S.sIdx <= IDX.cad + 18;
    const inCrux = Math.abs(S.sIdx - IDX.cru) < 12;
    const inMor = S.sIdx > IDX.cad + 16 && S.sIdx < IDX.gla - 8;
    const climbing = (inCad || inCrux) && want;
    let ang = 0, blocked = false;
    if (want) {
      const pr = 1.2, h0 = H(S.x, S.z), angOf = (ax, az) => Math.atan2(H(S.x + ax * pr, S.z + az * pr) - h0, pr) * 180 / Math.PI;
      ang = angOf(dx, dz);
      const maxA = inCad ? 84 : (onIce && techOK ? 74 : 60);
      if (ang > maxA) {
        for (const r of [0.45, -0.45, 0.9, -0.9, 1.35, -1.35]) { const c = Math.cos(r), s = Math.sin(r), ax = dx * c - dz * s, az = dx * s + dz * c, a2 = angOf(ax, az); if (a2 <= maxA) { dx = ax; dz = az; ang = a2; break; } }
      }
      if (ang > maxA && !(onIce && !techOK)) { blocked = true; why = 'Pendiente de más de 60°: gira hacia la huella'; hint('steep', 14, 'Esa pared pasa de 60°. Vuelve a la huella.'); }
      else if (ang > maxA) { blocked = true; if (S.slide <= 0) { S.slide = 0.45; S.sdx = -dx; S.sdz = -dz; S.stamina = Math.max(0, S.stamina - 4); S.slips++; audio && audio.slip(); hint('steep', 14, onIce ? 'Demasiado vertical incluso con crampones. Busca la ruta.' : 'Esa pared pasa de 60°. Sin piolet en hielo resbalas. Vuelve a la huella.'); } }
      else if (onIce && !S.crampons && ang > 16) { if (S.slide <= 0) { S.slide = 0.5; S.sdx = -dx; S.sdz = -dz; S.slips++; audio && audio.slip(); hint('nocramp', 10, 'Sin crampones resbalas en el hielo. Para y ponte el equipo.', [{ k: 'G', t: 'Crampones y piolet' }]); } }
    }
    let spd = want && !blocked ? 4.0 * SPM() * (trot ? 2 : 1) : 0;
    if (want && !inCad) spd *= ang > 0 ? clamp(1 - ang / 90, 0.3, 1) : clamp(1 + ang / 140, 0.6, 1);
    if (climbing) spd *= inCrux ? 0.45 : 0.62;
    const w = weight(), acc = 7 / (1 + w * 0.06), k = 1 - Math.exp(-dt * acc);
    S.vx += (dx * spd - S.vx) * k; S.vz += (dz * spd - S.vz) * k;
    if (S.slide > 0) { S.slide -= dt; S.vx = S.sdx * 3.2; S.vz = S.sdz * 3.2; }
    let nx = S.x + S.vx * dt, nz = S.z + S.vz * dt;
    // rocas y seracs
    const ck = (x, z) => obst.get(Math.floor(x / 12) * 4096 + Math.floor(z / 12));
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = ck(nx + a * 12, nz + b * 12); if (!L) continue; for (const o of L) { const ox = nx - o[0], oz = nz - o[1], d = Math.hypot(ox, oz), r = o[2] + 0.3; if (S.hop > 0 && o[2] < 1.3) continue; if (d < r && d > 1e-4) { nx = o[0] + ox / d * r; nz = o[1] + oz / d * r; } } }
    nx = clamp(nx, GX0 + 60, GX0 + NSIZE - 60); nz = clamp(nz, GZ0 + 60, GZ0 + NSIZE - 60);
    const moved = Math.hypot(nx - S.x, nz - S.z);
    const px0 = S.x, pz0 = S.z;
    S.x = nx; S.z = nz; S.y = H(S.x, S.z);
    const hold = () => { S.x = px0; S.z = pz0; S.y = H(S.x, S.z); S.vx = S.vz = 0; S.slide = 0; S.sIdx = prevIdx; };
    const prevIdx = S.sIdx; const [ni, lat] = nearestIdx(false); S.sIdx = ni; S.lat = lat;

    // Si aún es de día y no ha descansado en el Refugio hasta las 12:00 AM, puede explorar toda la hoyada y subir al Refugio Perú, pero no ir al glaciar
    if (!S.rested && S.sIdx > IDX.ref + 26 && prevIdx < S.sIdx) {
      hold();
      why = 'Presiona R para descansar hasta las 12:00 AM antes del ataque a cumbre';
      hint('gcamp', 6, 'No podemos subir al glaciar de tarde. Explora la hoyada del Campo Base, el Refugio Perú en la colina o presiona R para saltar a las 12:00 AM.', [{ k: 'R', t: 'Saltar a las 12:00 AM' }]);
    }

    // Hitos paisajísticos reales durante la primera subida diurna (Huascarán atrás, Cascadita a la izquierda, y Cima mirador antes de bajar al Campo Base)
    if (!S.rested) {
      if (!S.trig.lookBackHuascaran && S.sIdx >= Math.round(IDX.ref * 0.34)) {
        S.trig.lookBackHuascaran = true;
        say('Gira la cámara hacia atrás: al fondo de la quebrada ya se ven brillar las dos cumbres del Huascarán y el Chopicalqui.');
      } else if (!S.trig.waterfallPisco && S.sIdx >= Math.round(IDX.ref * 0.60)) {
        S.trig.waterfallPisco = true;
        say('Mira hacia el farallón rocoso de la izquierda: esa cascadita baja del deshielo del Pisco, y arriba entre los queñuales ya asoma su cara blanca.');
      } else if (!S.trig.crestMirador && S.sIdx >= Math.round(IDX.ref * 0.85)) {
        S.trig.crestMirador = true;
        say('¡Llegamos a la cima del paso! Atrás tienes todo el camino recorrido; adelante descendemos a la hoyada del Campo Base (entre el Huandoy a la izquierda y el Pisco al frente, con el Refugio Perú en la colina derecha).');
      }
    }

    // Gates de equipo técnico
    if (S.poles && S.sIdx >= IDX.cad - 34 && S.sIdx <= IDX.cad + 16 && prevIdx < S.sIdx) {
      hold();
      why = 'Guarda los bastones (B) para bajar por las cadenas del acantilado';
      hint('gcad', 6, '¡Alto en el borde del acantilado! Guarda los bastones (B) para sujetarte de la cadena con las dos manos.', [{ k: 'B', t: 'Guardar bastones' }]);
    }
    if (!techOK && S.sIdx > IDX.gla + 2) {
      if (prevIdx > IDX.gla + 2) { pushBack(IDX.gla - 1); S.sIdx = IDX.gla - 1; } else hold();
      why = 'Ponte crampones y piolet (G, quieto 3 s)';
      hint('ggla', 6, 'Alto. Del glaciar no se pasa sin crampones, piolet y cuerda. Detente y equípate.', [{ k: 'G', t: 'Equipo técnico (3 s quieto)' }]);
    }
    if (S.poles && S.sIdx >= IDX.cru - 12 && S.sIdx <= IDX.cru + 12 && prevIdx < S.sIdx) {
      hold();
      why = 'Guarda los bastones (B) para el muro';
      hint('gcru', 6, 'En el muro van piolet y puntas frontales. Bastones a la mochila.', [{ k: 'B', t: 'Guardar bastones' }]);
    }
    for (const c of crevs) if (prevIdx < c.idx && S.sIdx >= c.idx && lat < 9) {
      if (S.hop > 0) { S.stamina = Math.max(0, S.stamina - 2); }
      else { pushBack(c.idx - 4); S.sIdx = c.idx - 4; S.stamina = Math.max(0, S.stamina - 18); S.slips++; audio && audio.slip(); say('¡Cuidado con la grieta! Paso alto con Espacio justo antes del borde.', [{ k: 'Espacio', t: 'Paso alto' }]); }
    }
    if (S.sIdx > S.maxIdx) S.maxIdx = S.sIdx;
    if (wantIn && want && !blocked && moved < 0.25 * Math.max(spd, 0.5) * dt && S.slide <= 0) S.stuckT = (S.stuckT || 0) + dt; else S.stuckT = 0;
    if (S.stuckT > 0.5) { const p = samples[clamp(S.sIdx + 3, 0, NS)], ex = p.x - S.x, ez = p.z - S.z, el = Math.hypot(ex, ez) || 1; S.x += ex / el * 1.6 * dt; S.z += ez / el * 1.6 * dt; S.y = H(S.x, S.z); if (!why) why = 'Atascado entre rocas: te acercamos a la huella'; }
    S.why = why; S.whyT = why ? (S.whyT || 0) + dt : 0;
    S.walked += moved;
    { const lc = S.crumbs[S.crumbs.length - 1]; if (!lc || Math.hypot(lc[0] - S.x, lc[1] - S.z) > 3) { S.crumbs.push([S.x, S.z]); if (S.crumbs.length > 5000) S.crumbs.splice(0, 1000); } }
    // resbalones en morrena sin bastones
    if (inMor && !S.poles && moved > 0) { S.slipAcc += moved; if (S.slipAcc > 6) { S.slipAcc = 0; if (Math.random() < 0.25) { S.slide = 0.3; S.sdx = -dx; S.sdz = -dz; S.stamina = Math.max(0, S.stamina - 8); S.slips++; audio && audio.slip(); hint('mor', 20, 'La morrena está muy suelta. Con bastones (B) ganas equilibrio y cuidas las rodillas.', [{ k: 'B', t: 'Bastones activos' }]); } } }
    // superficie y pasos
    surface = S.y < YG - 3 ? 'rock' : S.y < YICE - 20 ? 'snow' : 'ice';
    S.stride += moved; const strideL = trot ? 1.05 : 0.78;
    if (S.stride > strideL) { S.stride = 0; audio && audio.step(surface, (trot ? 1.2 : 0.9) * (climbing ? 0.7 : 1)); }
    if (S.hop > 0) S.hop -= dt;

    // fisiología
    const diff = getDiff();
    const altF = clamp(S.y / (TOP - BASE), 0, 1), alt = BASE + S.y;
    const up = moved > 0.001 ? Math.max(0, Math.tan(Math.max(0, ang) * Math.PI / 180)) : 0;
    effort = moved / dt > 0.3 ? (0.35 + Math.min(up, 1.3) * 1.2) * (trot ? 1.6 : 1) * (climbing ? 1.3 : 1) : 0;
    const gd = Math.hypot(guide.root.position.x - S.x, guide.root.position.z - S.z);
    const pace = gd > 2.5 && gd < 18 && !S.gWait;
    if (moved / dt > 0.3 && !trot) S.steady += dt; else S.steady = 0;
    const tMul = (inMor ? 1.4 : 1) * (inCrux ? 2.2 : 1);
    if (moved / dt > 0.3) {
      const drain = (0.5 + Math.min(up, 1.4) * 3.2) * (trot ? 3 : 1) * tMul * (S.poles && !onIce ? 0.8 : 1) * (1 + 0.05 * (w - 5)) * (pace ? 0.82 : 1) * (S.steady > 5 ? 0.8 : 1) * (climbing ? 1.15 : 1) * diff.stamMul;
      S.stamina -= drain * dt;
      if (up < 0.14 && !trot) S.stamina += 2 * dt;
    } else {
      S.stamina += 10 * (alt > 5000 ? 0.6 : 1) * (0.5 + 0.5 * S.oxygen / 100) * (S.exhausted ? 1.6 : 1) * dt;
    }
    S.stamina = clamp(S.stamina, 0, 100);
    if (S.stamina <= 0 && !S.exhausted) { S.exhausted = true; if (alt > 5200) S.soroche = Math.min(1, S.soroche + 0.6 * diff.oxMul); say(alt > 5000 ? 'Para. Respira hondo. A esta altura el cuerpo no se recupera si te vacías.' : 'Para un momento. Toma bebida rehidratante (H) o un snack (E).', [{ k: 'H', t: 'Bebida rehidratante' }, { k: 'E', t: 'Snack energético' }]); }
    if (S.exhausted && S.stamina >= 25) S.exhausted = false;
    S.minStam = Math.min(S.minStam, S.stamina);
    const oxT = 100 - altF * 24;
    if (S.exhausted && alt > 5000) S.oxygen -= 6 * diff.oxMul * dt;
    else if (alt > 5200 && S.stamina < 25) S.oxygen -= 1.2 * diff.oxMul * dt;
    else S.oxygen += (oxT - S.oxygen) * (S.oxygen < oxT ? (effort > 0 ? 0.02 : 0.06) : 0.05) * dt * 3;
    S.oxygen = clamp(S.oxygen, 0, 100);
    if (S.stamina > 40 && S.oxygen > 55) S.soroche = Math.max(0, S.soroche - dt * 0.05);

    // Termorregulación con sistema de 3 capas y clima dinámico (sol diurno + frío nocturno + nevadas)
    const rawH = hourNow(), hr24 = ((rawH % 24) + 24) % 24;
    const isDaytime = hr24 >= 7.5 && hr24 <= 17.5;
    const sunWarmth = isDaytime ? Math.sin((hr24 - 7.5) / 10.0 * Math.PI) * 14 : 0;
    const aboveRef = clamp((S.y - RP[1].y) / (RP[RP.length - 1].y - RP[1].y), 0, 1), valley = 1 - clamp(S.y / RP[1].y, 0, 1);
    const colD = Math.hypot(S.x - RP[6].x, S.z - RP[6].z), colZ = 1 - smooth(60, 170, colD);
    const sumZ = 1 - smooth(20, 120, Math.hypot(S.x - SX, S.z - SZ));
    extT = -4 + valley * 7 + sunWarmth - aboveRef * 8 - 7 * colZ - S.snowing * 4;
    wind = clamp(0.18 + altF * 0.3 + colZ * 0.95 + sumZ * 0.35 + S.snowing * 0.45, 0, 1.45);
    const J = getJacketProps();
    const snowWet = S.snowing > 0.35 && !S.windbreaker ? S.snowing * 0.55 : 0;
    const cold = (Math.max(0, (-extT + 4) / 14) * (1 - J.insul * 0.78) + wind * (1 - J.wind) * 1.65 + snowWet) * diff.coldMul;
    const warm = (0.35 + effort * 1.35 + (isDaytime ? 0.25 : 0)) * (0.42 + J.insul * 0.85);
    S.body += (warm - cold * (1 + S.sweat * 1.15)) * 1.35 * dt;
    S.body = clamp(S.body, 0, 100);
    if (S.body > 87 && effort > 0.45 && (S.thermal || S.windbreaker) && !onIce) {
      S.sweat += dt * (S.thermal && S.windbreaker ? 0.045 : 0.02);
    } else if (snowWet > 0) {
      S.sweat += dt * 0.025;
    } else {
      S.sweat -= dt * 0.012;
    }
    S.sweat = clamp(S.sweat, 0, 1);

    // Disparadores del guía
    for (let k2 = 1; k2 < ROUTE.length; k2++) {
      if (k2 >= 2 && !S.rested) continue;
      if (!S.trig[k2] && S.sIdx >= wpIdx[k2] - LEAD[k2]) {
        S.trig[k2] = true;
        const id = ROUTE[k2].id;
        if (id !== 'cp6_cumbre_pisco') say(DLG[id], REC[id] || []);
      }
    }
    if (S.stamina < 30 && !S.exhausted) hint('stam', 40, 'Toma bebida rehidratante (H) o un snack (E) y respira con el paso.', [{ k: 'H', t: 'Rehidratante' }, { k: 'E', t: 'Snack' }]);
    if (S.body < 38) {
      if (!S.thermal && !S.windbreaker) hint('cold', 28, 'Te estás enfriando rápido. Ponte la capa térmica (C) y la cortavientos (V).', [{ k: 'C', t: 'Capa térmica' }, { k: 'V', t: 'Cortavientos' }]);
      else if (!S.windbreaker) hint('cold', 28, 'El viento te enfría. Completa las 3 capas poniéndote la cortavientos (V).', [{ k: 'V', t: 'Cortavientos' }, { k: 'T', t: 'Mate caliente' }]);
      else if (!S.thermal) hint('cold', 28, 'Hace mucho frío a esta altura. Ponte la chompa térmica (C) debajo de la cortavientos.', [{ k: 'C', t: 'Capa térmica' }, { k: 'T', t: 'Mate caliente' }]);
      else hint('cold', 28, 'El frío aprieta. Toma mate de coca caliente (T) y mantén el ritmo.', [{ k: 'T', t: 'Mate de coca' }]);
    }
    if (S.sweat > 0.35 && S.thermal && S.y < YG - 80 && effort > 0) {
      hint('sweat', 35, 'Estás sudando mucho en la subida. Quítate la térmica (C) y toma bebida rehidratante (H).', [{ k: 'C', t: 'Quitar térmica' }, { k: 'H', t: 'Rehidratante' }]);
    }
    if (S.soroche > 0.3 || S.oxygen < 45) hint('soroche', 30, 'Eso es soroche. Para, respira lento y toma mate de coca (T) o rehidratante (H).', [{ k: 'T', t: 'Mate de coca' }, { k: 'H', t: 'Rehidratante' }]);
    if (lat > 75 && S.rested) hint('lost', 25, 'Te alejas de la huella. Sigue la línea azul y mi linterna frontal.');
    if (S.rested && rawH >= 6.75 && S.sIdx < IDX.cru) hint('late', 120, 'Se cierra la ventana. A las 08:00 AM el sol ablanda los puentes de nieve.');

    // Fin de partida
    if (S.oxygen <= 0) endGame('defeat', 'Soroche severo. Tu saturación de oxígeno colapsó por encima de los 5 000 m.');
    else if (S.body <= 0) endGame('defeat', 'Hipotermia. El frío, el viento y la humedad bajaron tu temperatura corporal a un nivel crítico.');
    else if (S.rested && rawH >= 8) endGame('defeat', 'Se cerró la ventana de cumbre. A las 08:00 AM los puentes de nieve se debilitan y la cordada debe bajar.');
    else if (S.rested && (S.sIdx >= NS - 5 || (Math.hypot(S.x - SX, S.z - SZ) < 9 && S.y > TOP - BASE - 6))) {
      S.summitClock = clockStr(S.gameSec); S.phase = 'win'; S.winT = 0; say(DLG.cp6_cumbre_pisco, [], 'guia');
      if (document.pointerLockElement) document.exitPointerLock();
      setTimeout(() => { cb.onEnd && cb.onEnd({ type: 'win', stats: stats() }); }, 2400);
      cb.onPhase && cb.onPhase('win');
    }
    return { want, trot, climbing, moved };
  }

  function updateGuide(dt, playing) {
    let gate = NS - 3;
    if (!S.rested) gate = IDX.ref + 2;
    else {
      if (!(S.crampons && S.axe)) gate = Math.min(gate, IDX.gla - 1);
      if (S.poles && S.sIdx < IDX.cad + 16) gate = Math.min(gate, IDX.cad - 35);
      if (S.poles && S.sIdx > IDX.gla && S.sIdx < IDX.cru + 12) gate = Math.min(gate, IDX.cru - 14);
    }
    const target = Math.min(S.sIdx + 11, gate);
    const behind = S.guideS - S.sIdx > 24;
    const prev = S.guideS;
    if (playing && !behind && target > S.guideS) S.guideS = Math.min(target, S.guideS + 3.4 * SPM() * dt);
    if (S.phase === 'win') S.guideS = Math.min(NS - 7, S.guideS + 2 * dt);
    const gm = S.guideS - prev;
    S.gWait = playing && gm < 0.001 && (S.guideS < target + 0.5 ? false : true) || behind || S.guideS >= gate - 0.5;
    const i = Math.floor(S.guideS), f = S.guideS - i, a = samples[clamp(i, 0, NS)], b = samples[clamp(i + 1, 0, NS)];
    const [ox, oz] = lateral(clamp(i, 0, NS), 0.7);
    const gx = a.x + (b.x - a.x) * f + (ox - a.x), gz = a.z + (b.z - a.z) * f + (oz - a.z);
    guide.root.position.set(gx, H(gx, gz), gz);
    const t = tangentAt(clamp(i, 0, NS));
    const ty = gm > 0.0005 ? Math.atan2(-t.x, -t.z) : Math.atan2(-(S.x - gx), -(S.z - gz));
    guide.root.rotation.y += Math.atan2(Math.sin(ty - guide.root.rotation.y), Math.cos(ty - guide.root.rotation.y)) * (1 - Math.exp(-dt * 5));
    const onIce = guide.root.position.y > YG - 4 && S.crampons;
    const inChains = S.guideS >= IDX.cad - 36 && S.guideS <= IDX.cad + 16;
    guide.poles.forEach(p => p.visible = !onIce && !inChains); guide.axe.visible = onIce; guide.axePack.visible = !onIce; guide.crampons.forEach(c => c.visible = onIce);
    const climb = inChains || Math.abs(S.guideS - IDX.cru) < 10;
    animClimber(guide, gm, Math.min(1, gm / dt / 2.5), climb && gm > 0 ? 'climb' : 'walk', 0, t0);
  }

  // ---------- HUD ----------
  let hudAt = 0;
  function pushHud(force) {
    if (!cb.onHud) return; const now = performance.now(); if (!force && now - hudAt < 120) return; hudAt = now;
    const k = curWp(), next = Math.min(k + 1, ROUTE.length - 1);
    const gd = Math.hypot(guide.root.position.x - S.x, guide.root.position.z - S.z);
    const centerActive = S.gearT > 0 || S.pitchT > 0 || S.exhausted || S.whyT > 0.35 || !!S.interactPrompt;
    let centerText = '';
    let centerBar = 0;
    if (S.gearT > 0) { centerText = 'Poniéndote crampones, piolet y cuerda…'; centerBar = S.gearT / 3 * 100; }
    else if (S.pitchT > 0) { centerText = 'Armando tu carpa de alta montaña…'; centerBar = S.pitchT / 2.4 * 100; }
    else if (S.exhausted) { centerText = 'Sin aliento. Quieto hasta recuperar el 25 %'; centerBar = S.stamina * 4; }
    else if (S.whyT > 0.35) { centerText = S.why; centerBar = 0; }
    else if (S.interactPrompt) { centerText = S.interactPrompt; centerBar = 100; }

    cb.onHud({
      alt: fmtN(BASE + S.y), clock: clockStr(S.gameSec), ampm: ampm(S.gameSec), rested: S.rested, atCamp: S.atCamp, tentPitched: S.tentPitched,
      left: S.rested ? Math.max(0, Math.round(480 - S.gameSec / 60)) : -1, ext: Math.round(extT),
      weather: S.snowing > 0.25 ? '❄ Nevando' : (wind > 0.75 ? 'Viento glaciar' : 'Despejado'),
      stamina: S.stamina, oxygen: S.oxygen, body: S.body, sweat: S.sweat,
      sat: Math.round(70 + S.oxygen * 0.3),
      layers: layersDesc(), thermal: S.thermal, windbreaker: S.windbreaker,
      poles: S.poles, techOK: S.crampons && S.axe,
      thermos: S.thermos, thermosMax: thermosMax(),
      drinks: S.drinks, drinksMax: drinksMax(),
      snacks: S.snacks, weight: weight().toFixed(1).replace('.', ','),
      cp: wpName(k), cpAlt: fmtN(ROUTE[k].elevation), next: wpName(next), nextAlt: fmtN(ROUTE[next].elevation),
      toSummit: ((NS - S.sIdx) / 1000).toFixed(2).replace('.', ','), guideDist: Math.round(gd),
      guideState: S.gWait ? (gd > 24 ? 'Te espera' : 'Esperando a la cordada') : 'Marcando el ritmo',
      block: S.whyT > 0.35 ? S.why : '', exhausted: S.exhausted,
      gearT: S.gearT > 0 ? S.gearT / 3 : 0,
      centerActive, centerText, centerBar,
      muted: audio ? audio.muted : true, surface, wind, cpIndex: k, cpTotal: ROUTE.length - 1,
      canGear: !S.crampons && S.sIdx >= IDX.gla - 60, trot: !!(keys.ShiftLeft || keys.ShiftRight),
      difficulty: opts.difficulty || 'medio', difficultyLabel: getDiff().label
    });
  }
  const fx = cb.fx || {};
  let mapZoom = false;
  const MAPN = 900, MPM = MAPN / NSIZE;
  const baseMap = document.createElement('canvas'); baseMap.width = baseMap.height = MAPN;
  {
    const g = baseMap.getContext('2d'), img = g.createImageData(MAPN, MAPN), D = img.data, hAt = (px, pz) => bil(hm, GX0 + px / MPM, GZ0 + pz / MPM);
    for (let py = 0; py < MAPN; py++) for (let px = 0; px < MAPN; px++) {
      const y = hAt(px, py), ex = hAt(px + 1, py) - hAt(px - 1, py), ez = hAt(px, py + 1) - hAt(px, py - 1), sc = 2 / MPM;
      const nx = -ex / sc, nz = -ez / sc, nl = Math.hypot(nx, 1, nz), sh = clamp((nx * -0.6 + 1 * 0.7 + nz * -0.4) / nl, 0, 1);
      const sl = 1 - 1 / nl; const snow = y > YG - 40 && sl < 0.55;
      let r = 236, gg = 233, b = 228; if (snow) { r = 250; gg = 251; b = 252; } else if (y < 330) { r = 222; gg = 226; b = 214; } else { r = 214; gg = 208; b = 202; }
      const k = 0.62 + 0.45 * sh; r *= k; gg *= k; b *= k;
      const c0 = Math.floor(y / 50), c1 = Math.floor(hAt(px + 1, py) / 50), c2 = Math.floor(hAt(px, py + 1) / 50);
      if (c0 !== c1 || c0 !== c2) { const idx = Math.max(c0, c1, c2) % 5 === 0 ? 0.45 : 0.2; r = r * (1 - idx) + 32 * idx; gg = gg * (1 - idx) + 30 * idx; b = b * (1 - idx) + 29 * idx; }
      const o = (py * MAPN + px) * 4; D[o] = r; D[o + 1] = gg; D[o + 2] = b; D[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (LAG) { g.fillStyle = '#99c9df'; g.beginPath(); g.arc((LAG.x - GX0) * MPM, (LAG.z - GZ0) * MPM, 24 * MPM, 0, 7); g.fill(); }
    g.strokeStyle = '#0088b0'; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.beginPath();
    for (let i = 0; i <= NS; i += 4) { const p = samples[i], X = (p.x - GX0) * MPM, Y = (p.z - GZ0) * MPM; i ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke(); g.setLineDash([]);
  }
  let mapAt = 0;
  function drawMap() {
    const cv = fx.map; if (!cv) return; const now = performance.now(); if (now - mapAt < 70) return; mapAt = now;
    const W = cv.width, c = cv.getContext('2d'), Rr = W / 2, rad = mapZoom ? 1400 : 260, sc = (Rr * 0.92) / (rad * MPM);
    c.clearRect(0, 0, W, W); c.save(); c.beginPath(); c.arc(Rr, Rr, Rr - 1, 0, 7); c.clip(); c.fillStyle = '#f3f2f2'; c.fillRect(0, 0, W, W);
    c.translate(Rr, Rr); c.rotate(camYaw); c.scale(sc, sc); c.translate(-(S.x - GX0) * MPM, -(S.z - GZ0) * MPM);
    c.drawImage(baseMap, 0, 0);
    const ink = '#201e1d';
    if (S.crumbs.length > 1) { c.strokeStyle = ink; c.lineWidth = 2.4 / sc; c.lineJoin = c.lineCap = 'round'; c.beginPath(); S.crumbs.forEach((p, i) => { const X = (p[0] - GX0) * MPM, Y = (p[1] - GZ0) * MPM; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.lineTo((S.x - GX0) * MPM, (S.z - GZ0) * MPM); c.stroke(); }
    const gp = guide.root.position; c.fillStyle = '#f3f2f2'; c.strokeStyle = ink; c.lineWidth = 2 / sc; c.beginPath(); c.arc((gp.x - GX0) * MPM, (gp.z - GZ0) * MPM, 5 / sc, 0, 7); c.fill(); c.stroke();
    c.restore();
    const cy = Math.cos(camYaw), sy = Math.sin(camYaw), toScr = (x, z) => { const mx = (x - S.x) * MPM * sc, mz = (z - S.z) * MPM * sc; return [Rr + mx * cy - mz * sy, Rr + mx * sy + mz * cy]; };
    c.font = '600 ' + Math.round(W * 0.055) + 'px "Source Serif 4", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const nextK = Math.min(curWp() + 1, RP.length - 1);
    RP.forEach((p, k) => {
      let [X, Y] = toScr(p.x, p.z); const dd = Math.hypot(X - Rr, Y - Rr), lim = Rr - W * 0.07; if (dd > lim) { if (k !== nextK) return; X = Rr + (X - Rr) / dd * lim; Y = Rr + (Y - Rr) / dd * lim; }
      const done = S.maxIdx >= wpIdx[k] - 3, rr = W * 0.042; c.beginPath(); c.arc(X, Y, rr, 0, 7); c.fillStyle = k === nextK ? '#0088b0' : done ? ink : '#f3f2f2'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = ink; c.stroke();
      c.fillStyle = k === nextK || done ? '#f3f2f2' : ink; c.fillText(String(k + 1), X, Y + 1);
    });
    c.save(); c.translate(Rr, Rr); c.rotate(camYaw - S.face); c.beginPath(); const a = W * 0.06; c.moveTo(0, -a); c.lineTo(a * 0.62, a * 0.7); c.lineTo(0, a * 0.35); c.lineTo(-a * 0.62, a * 0.7); c.closePath(); c.fillStyle = ink; c.fill(); c.lineWidth = 2; c.strokeStyle = '#f3f2f2'; c.stroke(); c.restore();
    const nX = Rr + sy * (Rr - W * 0.07), nY = Rr - cy * (Rr - W * 0.07); c.beginPath(); c.arc(nX, nY, W * 0.05, 0, 7); c.fillStyle = ink; c.fill(); c.fillStyle = '#f3f2f2'; c.fillText('N', nX, nY + 1);
    c.beginPath(); c.arc(Rr, Rr, Rr - 1.5, 0, 7); c.lineWidth = 3; c.strokeStyle = ink; c.stroke();
  }
  function pushFx() {
    const sf = sorocheFx();
    if (fx.tunnel) fx.tunnel.style.opacity = (S.phase === 'playing' || S.phase === 'defeat' ? sf : 0).toFixed(3);
    if (fx.frost) fx.frost.style.opacity = (S.phase === 'playing' || S.phase === 'defeat' ? clamp((45 - S.body) / 40, 0, 1) * 0.95 : 0).toFixed(3);
    if (fx.strip) {
      const hd = ((-camYaw * 180 / Math.PI) % 360 + 360) % 360;
      fx.strip.style.transform = `translateX(${(180 - (hd + 360) * 2).toFixed(1)}px)`;
      const k = Math.min(curWp() + 1, ROUTE.length - 1), tp = RP[k];
      const bt = (Math.atan2(tp.x - S.x, -(tp.z - S.z)) * 180 / Math.PI + 360) % 360;
      let rel = bt - hd; rel = ((rel + 540) % 360) - 180;
      if (fx.marker) fx.marker.style.transform = `translateX(${(clamp(rel, -88, 88) * 2).toFixed(1)}px)`;
    }
  }

  // ---------- Bucle ----------
  const clock = new THREE.Clock(); let raf = 0, alive = true, t0 = 0, lastFrameAt = 0;
  const tmpC = new THREE.Color(), DAY_AMB = new THREE.Color(0.40, 0.42, 0.47), sunDir = new THREE.Vector3(), SUN_AZ = 1.42, v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
  function frame() {
    if (!alive) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); lastFrameAt = performance.now();
    const dt = Math.min(clock.getDelta(), 0.05); t0 += dt;
    const playing = S.phase === 'playing' && !paused;
    let mv = { want: false, trot: false, climbing: false, moved: 0 };
    if (playing) mv = update(dt);
    updateGuide(dt, playing);
    if (S.phase === 'win') S.winT += dt;

    // Animar animalitos y cóndores
    animals.forEach(a => {
      const d = Math.hypot(S.x - a.x, S.z - a.z);
      if (a.greetT > 0) a.greetT = Math.max(0, a.greetT - dt);
      if (a.kind === 'vizcacha') {
        const hopY = a.greetT > 0 ? Math.abs(Math.sin(t0 * 9)) * 0.22 : (d < 10 ? Math.abs(Math.sin(t0 * 4 + a.phase)) * 0.05 : 0);
        a.root.position.y = a.baseY + hopY;
        a.ears[0].rotation.x = Math.sin(t0 * 6 + a.phase) * 0.15;
        a.ears[1].rotation.x = Math.cos(t0 * 6 + a.phase) * 0.15;
        if (d < 12) {
          const ty = Math.atan2(-(S.x - a.x), -(S.z - a.z));
          a.root.rotation.y += Math.atan2(Math.sin(ty - a.root.rotation.y), Math.cos(ty - a.root.rotation.y)) * dt * 4;
        }
      } else {
        a.neckGroup.rotation.x = Math.sin(t0 * (a.greetT > 0 ? 7 : 1.6) + a.phase) * (a.greetT > 0 ? 0.25 : 0.12);
        if (d < 14) {
          const ty = Math.atan2(-(S.x - a.x), -(S.z - a.z));
          a.root.rotation.y += Math.atan2(Math.sin(ty - a.root.rotation.y), Math.cos(ty - a.root.rotation.y)) * dt * 2.5;
        }
      }
    });
    condors.forEach((c, idx) => {
      const ang = t0 * 0.18 + c.ph;
      const x = c.cx + Math.cos(ang) * c.r, z = c.cz + Math.sin(ang) * c.r;
      c.root.position.set(x, c.cy + Math.sin(t0 * 0.7 + idx) * 6, z);
      c.root.rotation.y = -ang;
      c.root.rotation.z = 0.18;
    });
    if (tentRing.visible) {
      tentRing.scale.setScalar(1 + Math.sin(t0 * 3.5) * 0.06);
    }

    // avatar y visualización de las 3 capas
    player.root.position.set(S.x, S.y + (S.hop > 0 ? Math.sin((1 - S.hop / 0.6) * Math.PI) * 0.32 : 0), S.z);
    const spdNow = Math.hypot(S.vx, S.vz);
    if (spdNow > 0.2 && S.slide <= 0) { const ty = Math.atan2(-S.vx, -S.vz); S.face += Math.atan2(Math.sin(ty - S.face), Math.cos(ty - S.face)) * (1 - Math.exp(-dt * 8)); }
    player.root.rotation.y = S.face;
    animClimber(player, mv.moved, Math.min(1.2, spdNow / 3.2), S.exhausted ? 'tired' : mv.climbing ? 'climb' : 'walk', S.hop > 0 ? Math.sin((1 - S.hop / 0.6) * Math.PI) : 0, t0);
    player.poles.forEach(p => p.visible = S.poles); player.axe.visible = S.axe && !S.poles; player.axePack.visible = !S.axe || S.poles;
    const targetCol = S.windbreaker ? 0x0088b0 : (S.thermal ? 0xd89b18 : 0x48525c);
    if (player.jacket.color.getHex() !== targetCol) {
      player.jacket.color.setHex(targetCol);
      player.jacket.emissive.setHex(targetCol).multiplyScalar(0.15);
    }
    player.collar.visible = S.thermal;
    player.hood.visible = S.windbreaker;

    // cámara
    if (S.phase === 'intro') { tYaw = S.face + Math.PI * 0.1 + Math.sin(t0 * 0.15) * 0.5; tPitch = 0.22; }
    camYaw += (tYaw - camYaw) * (1 - Math.exp(-dt * 12)); camPitch += (tPitch - camPitch) * (1 - Math.exp(-dt * 10));
    const tgt = v3.set(S.x + Math.cos(camYaw) * 0.55, S.y + 1.6, S.z - Math.sin(camYaw) * 0.55);
    let cd = S.phase === 'intro' ? 7.5 : camDist;
    const dPos = v4.set(tgt.x + Math.sin(camYaw) * Math.cos(camPitch) * cd, tgt.y + Math.sin(camPitch) * cd, tgt.z + Math.cos(camYaw) * Math.cos(camPitch) * cd);
    if (S.phase === 'win') {
      const k = smooth(0, 4, S.winT), a = S.face + Math.PI + S.winT * 0.22, R = 8 + 150 * smooth(0, 14, S.winT), hh = 3 + 55 * smooth(0, 14, S.winT);
      dPos.lerp(new THREE.Vector3(SX + Math.sin(a) * R, TOP - BASE + hh, SZ + Math.cos(a) * R), k);
      tgt.lerp(new THREE.Vector3(SX, TOP - BASE + 1 - 6 * smooth(4, 14, S.winT), SZ), k);
    }
    const gy = H(dPos.x, dPos.z) + 0.6; if (dPos.y < gy) dPos.y = gy;
    if (S.phase === 'win') { camPos.lerp(dPos, 1 - Math.exp(-dt * 2)); camLook.lerp(tgt, 1 - Math.exp(-dt * 2)); }
    else { camPos.copy(dPos); camLook.copy(tgt); }
    camera.position.copy(camPos); camera.lookAt(camLook);

    // linternas
    const pLamp = player.lampAnchor.getWorldPosition(new THREE.Vector3());
    const camF = new THREE.Vector3(); camera.getWorldDirection(camF);
    const focal = new THREE.Vector3(S.x + camF.x * 9, 0, S.z + camF.z * 9); focal.y = H(focal.x, focal.z) + 0.3;
    if (S.phase !== 'playing') { focal.set(S.x - Math.sin(S.face) * 9, 0, S.z - Math.cos(S.face) * 9); focal.y = H(focal.x, focal.z); }
    const pDir = focal.clone().sub(pLamp).normalize();
    const gLamp = guide.lampAnchor.getWorldPosition(new THREE.Vector3());
    const gFoc = new THREE.Vector3(gLamp.x - Math.sin(guide.root.rotation.y) * 8, 0, gLamp.z - Math.cos(guide.root.rotation.y) * 8); gFoc.y = H(gFoc.x, gFoc.z);
    const gDir = gFoc.clone().sub(gLamp).normalize();
    uT.uHeadPos.value.copy(pLamp); uT.uHeadDir.value.copy(pDir); uT.uHead2Pos.value.copy(gLamp); uT.uHead2Dir.value.copy(gDir);
    spot1.position.copy(pLamp); spot1.target.position.copy(focal); spot2.position.copy(gLamp); spot2.target.position.copy(gFoc);

    // cuerda
    rope.visible = S.rope && S.phase !== 'intro';
    if (rope.visible) {
      const a = new THREE.Vector3(S.x, S.y + 0.95, S.z), b = guide.root.position.clone(); b.y += 0.95; const d = a.distanceTo(b); rope.visible = d < 32;
      const arr = ropeGeo.attributes.position; for (let i = 0; i < 20; i++) { const f = i / 19; const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f; let y = a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * Math.min(1.4, d * 0.09); y = Math.max(y, H(x, z) + 0.05); arr.setXYZ(i, x, y, z); } arr.needsUpdate = true;
    }

    // luz del día y sol cenital andino
    const hr24 = ((hourNow() % 24) + 24) % 24;
    let pt = hourToP(hr24); if (S.phase === 'win') pt = Math.max(pt, 0.85);
    dayP += (pt - dayP) * (1 - Math.exp(-dt * (S.phase === 'win' ? 0.35 : 3))); const p = dayP;
    const middayBoost = (hr24 >= 7.5 && hr24 <= 16.8) ? Math.sin((hr24 - 7.5) / 9.3 * Math.PI) * 26 : 0;
    const e = THREE.MathUtils.degToRad(kn('elev', p) + middayBoost);
    const sunAz = (hr24 >= 7.5 && hr24 <= 17.5) ? 1.42 - ((hr24 - 7.5) / 10.0) * 1.1 : SUN_AZ;
    sunDir.set(Math.cos(e) * Math.sin(sunAz), Math.sin(e), Math.cos(e) * Math.cos(sunAz)).normalize();
    uS.uSunDir.value.copy(sunDir); uT.uSunDir.value.copy(sunDir).add(new THREE.Vector3(0, 0.14, 0)).normalize();
    kc('sunCol', p, uT.uSunCol.value); uT.uSunI.value = kn('sunI', p); uT.uLightLine.value = kn('line', p);
    uT.uMoonCol.value.set(0x3a4c7a).multiplyScalar(2.4 * kn('moon', p));
    kc('sky', p, uT.uSky.value).multiplyScalar(1.6 - 0.7 * smooth(0.3, 0.6, p) + 1.3 * smooth(0.6, 0.9, p)); kc('ground', p, uT.uGround.value).multiplyScalar(0.5);
    const dayK = smooth(0.55, 0.9, p); uT.uSunK.value = 1 - 0.62 * dayK; uT.uAmb.value.copy(uT.uSky.value).lerp(DAY_AMB, dayK);
    kc('fog', p, uT.uFogCol.value); uT.uFogD.value = kn('fogD', p) * (1 + S.snowing * 1.1); scene.fog.color.copy(uT.uFogCol.value); scene.fog.density = uT.uFogD.value * 0.6;
    uT.uCam.value.copy(camera.position);
    const lampI = kn('lamp', p); uT.uHeadI.value = lampI; spot1.intensity = 70 * lampI; spot2.intensity = 55 * lampI;
    const ti = kn('tent', p); uT.uTentI.value = ti; tentMat.emissive.setRGB(0.12 + ti * 0.12, 0.05 + ti * 0.05, 0.015);
    uP.uProg.value = S.maxIdx / NS; uP.uTime.value = t0; uP.uGlow.value = 0.45 + 0.55 * lampI; uP.uVis.value = opts.showRoute ? 1 : 0;
    kc('zen', p, uS.uZen.value); kc('hor', p, uS.uHor.value); kc('glow', p, uS.uGlow.value); uS.uGlowI.value = kn('glowI', p); uS.uDisc.value = kn('disc', p) * (1 - S.snowing * 0.7);
    sky.position.copy(camera.position); stars.position.copy(camera.position); uSt.uOp.value = kn('stars', p) * (1 - S.snowing * 0.85); uSt.uTime.value = t0;
    hemi.color.copy(uT.uSky.value).multiplyScalar(4).lerp(tmpC.copy(DAY_AMB).multiplyScalar(2.2), dayK); hemi.groundColor.copy(uT.uGround.value);
    sunL.color.copy(uT.uSunCol.value); sunL.intensity = uT.uSunI.value * smooth(0.55, 0.8, p) * (1 - 0.45 * dayK); sunL.position.copy(sunDir).multiplyScalar(1000);
    moonL.intensity = 0.7 * kn('moon', p);
    uC.uOp.value = smooth(0.55, 0.85, p);
    tmpC.copy(uT.uSunCol.value).multiplyScalar(0.35 * uT.uSunI.value); uC.uLit.value.copy(uT.uSky.value).multiplyScalar(0.8).add(tmpC); uC.uShade.value.copy(uT.uSky.value).multiplyScalar(0.55);
    const snowViz = clamp((S.y > YG - 120 ? 0.12 + wind * 0.45 : 0.02) + S.snowing * 0.85, 0, 0.95);
    uSn.uOp.value = snowViz;
    uSn.uWind.value.set(-9, -2.5 - S.snowing * 3.5, 5).multiplyScalar(0.5 + wind * 2.0);
    uSn.uColr.value.copy(uT.uSky.value).multiplyScalar(1.4).add(tmpC.copy(uT.uSunCol.value).multiplyScalar(0.25 * uT.uSunI.value)).addScalar(0.18 * lampI + 0.25 * p);
    if (flare) { flare.visible = uS.uDisc.value > 0.6; flareL.position.copy(camera.position).addScaledVector(sunDir, 15000); }
    flags.forEach((f, i) => { f.rotation.y = Math.sin(t0 * (2 + wind * 4) + i) * 0.5; });
    bloom.strength = kn('bloomS', p); bloom.threshold = kn('bloomT', p); renderer.toneMappingExposure = kn('exp', p);

    composer.render(dt);
    if (audio) audio.update({ wind: S.phase === 'intro' ? 0.2 : wind, active: playing, labored: S.stamina < 30 || BASE + S.y > 5200 || S.exhausted, effort: Math.min(1, effort), soroche: playing ? sorocheFx() : 0, onRumble: () => hint('rumble', 60, 'Eso fue una avalancha lejana en el Chacraraju. Tranquilos, estamos lejos. Sigamos.') });
    pushHud(false); pushFx(); drawMap();
  }
  frame();
  const watchdog = setInterval(() => { if (alive && performance.now() - lastFrameAt > 1200) frame(); }, 600);
  cb.onReady && cb.onReady();
  pushHud(true);

  const api = {
    start(diffKey) {
      if (diffKey && DIFFICULTIES[diffKey]) {
        opts.difficulty = diffKey;
        opts.duration = DIFFICULTIES[diffKey].duration;
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      for (const k in keys) keys[k] = false;
      if (audio) audio.resume();
      restart();
      try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => { }); } catch (e) { }
      canvas.focus();
    },
    restart() { api.start(); },
    pause() { if (S.phase === 'playing' && !paused) setPauseState(true); },
    resume() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); setPauseState(false); canvas.focus(); },
    respawnCheckpoint() {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      for (const k in keys) keys[k] = false;
      if (audio) audio.resume();
      respawnCheckpoint();
      try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => { }); } catch (e) { }
      canvas.focus();
    },
    goMainMenu() {
      for (const k in keys) keys[k] = false;
      goMainMenu();
    },
    setDifficulty(diffKey) {
      if (DIFFICULTIES[diffKey]) {
        opts.difficulty = diffKey;
        opts.duration = DIFFICULTIES[diffKey].duration;
        pushHud(true);
      }
    },
    skipToMidnight() {
      if (S.phase === 'playing' && !S.rested) {
        if (paused) setPauseState(false);
        rest();
      }
    },
    setOptions(o) {
      const q = opts.quality;
      opts = Object.assign(opts, o);
      if (o && o.difficulty && DIFFICULTIES[o.difficulty]) opts.duration = DIFFICULTIES[o.difficulty].duration;
      if (q !== opts.quality) resize();
      pushHud(true);
    },
    toggleMute() { if (audio) { audio.resume(); audio.setMuted(!audio.muted); pushHud(true); } },
    teleport(k) {
      k = clamp(k, 0, ROUTE.length - 1); if (S.phase !== 'playing') restart();
      const i = clamp(wpIdx[k] - (k === ROUTE.length - 1 ? 30 : 6), 0, NS); pushBack(i); S.sIdx = S.maxIdx = i; S.guideS = Math.min(NS - 3, i + 10);
      if (k >= 2) { S.rested = true; S.thermal = true; }
      if (k >= 5) { S.crampons = S.axe = S.rope = true; S.poles = false; S.thermal = true; S.windbreaker = true; player.crampons.forEach(c => c.visible = true); }
      for (let j = 1; j <= k; j++) S.trig[j] = true;
      S.gameSec = [-14.5, -11.5, 0, 0.6, 1.1, 1.6, 2.3, 3.1, 3.9, 4.5][k] * 3600; S.crumbs = []; dayP = hourToP(hourNow());
      S.y = H(S.x, S.z); const t = tangentAt(i); S.face = camYaw = tYaw = Math.atan2(-t.x, -t.z);
    },
    get state() { return S; },
    dispose() {
      alive = false; clearInterval(watchdog); ro.disconnect(); cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', clearKeys);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mouseup', onMouseUp); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('blur', onBlur);
      audio && audio.dispose(); renderer.dispose(); composer.dispose && composer.dispose(); canvas.remove();
    }
  };
  api.scene = scene; window.__pisco = api;
  return api;
}
