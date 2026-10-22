'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { mount } from '@/lib/pisco-sim.js';

interface HudData {
  alt: string;
  clock: string;
  ampm: string;
  rested: boolean;
  atCamp?: boolean;
  tentPitched?: boolean;
  left: number;
  ext: number;
  weather?: string;
  stamina: number;
  oxygen: number;
  body: number;
  sweat: number;
  sat: number;
  layers?: string;
  thermal?: boolean;
  windbreaker?: boolean;
  poles: boolean;
  techOK: boolean;
  thermos: number;
  thermosMax: number;
  drinks?: number;
  drinksMax?: number;
  snacks: number;
  weight: string;
  cp: string;
  cpAlt?: string;
  next: string;
  nextAlt: string;
  toSummit: string;
  guideDist: number;
  guideState: string;
  block?: string;
  exhausted: boolean;
  gearT: number;
  centerActive?: boolean;
  centerText?: string;
  centerBar?: number;
  muted: boolean;
  surface?: string;
  wind?: number;
  cpIndex: number;
  cpTotal: number;
  canGear: boolean;
  trot?: boolean;
  difficulty?: 'facil' | 'medio' | 'avanzado';
  difficultyLabel?: string;
}

const DEFAULT_HUD: HudData = {
  alt: '3 900',
  clock: '09:30',
  ampm: 'AM',
  rested: false,
  atCamp: false,
  tentPitched: false,
  left: -1,
  ext: 12,
  weather: 'Despejado',
  stamina: 100,
  oxygen: 96,
  body: 82,
  sweat: 0,
  sat: 97,
  layers: '1/3 (Solo capa ligera)',
  thermal: false,
  windbreaker: false,
  poles: true,
  techOK: false,
  thermos: 4,
  thermosMax: 4,
  drinks: 4,
  drinksMax: 4,
  snacks: 5,
  weight: '6,3',
  cp: 'Cebollapampa (Trailhead)',
  next: 'Refugio Perú / Campo Base',
  nextAlt: '4 680',
  toSummit: '3,6',
  guideDist: 10,
  guideState: 'Marcando el ritmo',
  cpIndex: 0,
  cpTotal: 9,
  gearT: 0,
  centerActive: false,
  centerText: '',
  centerBar: 0,
  exhausted: false,
  canGear: false,
  muted: false,
  difficulty: 'medio',
  difficultyLabel: 'Medio (~10 min)'
};

const DIFFICULTY_OPTIONS: {
  id: 'facil' | 'medio' | 'avanzado';
  title: string;
  time: string;
  desc: string;
}[] = [
  {
    id: 'facil',
    title: 'Fácil',
    time: '~5 min',
    desc: 'Paso más veloz, menor desgaste de estamina y frío, +1 ración extra.'
  },
  {
    id: 'medio',
    title: 'Medio',
    time: '~10 min',
    desc: 'Ritmo alpino equilibrado y gestión realista de capas e hidratación.'
  },
  {
    id: 'avanzado',
    title: 'Avanzado',
    time: '~15 min',
    desc: 'Alta exigencia física, frío intenso en arista y soroche severo.'
  }
];

const CONTROLS = [
  { k: 'W A S D', t: 'Caminar' },
  { k: 'Ratón', t: 'Cámara (clic para fijar)' },
  { k: 'Shift', t: 'Paso rápido' },
  { k: 'Espacio', t: 'Paso alto / Saltar grieta' },
  { k: 'ESC / P', t: 'Menú, Equipo y Checkpoint' },
  { k: 'C / V', t: '2ª Capa térmica / 3ª Cortavientos' },
  { k: 'B', t: 'Bastones (usar / guardar)' },
  { k: 'T / H / E', t: 'Mate / Rehidratante / Snack' },
  { k: 'G', t: 'Crampones y piolet' },
  { k: 'F', t: 'Armar carpa / Fauna' },
  { k: 'R', t: 'Saltar a las 12:00 AM' },
  { k: 'N', t: 'Zoom del mapa' }
];

export default function PiscoPage() {
  const [phase, setPhase] = useState<'loading' | 'intro' | 'playing' | 'paused' | 'defeat' | 'win'>('loading');
  const [difficulty, setDifficulty] = useState<'facil' | 'medio' | 'avanzado'>('medio');
  const [hud, setHud] = useState<HudData | null>(null);
  const [msg, setMsg] = useState<{ text: string; rec: { k: string; t: string }[]; kind?: string; id?: number } | null>(null);
  const [msgOn, setMsgOn] = useState(false);
  const [toasts, setToasts] = useState<
    { id: number; k: string; title: string; detail: string; tone: 'ok' | 'info' | 'warn' }[]
  >([]);
  const [end, setEnd] = useState<{ type: string; reason?: string; stats?: any } | null>(null);
  const [resting, setResting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const tunnelRef = useRef<HTMLDivElement>(null);
  const frostRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  const simRef = useRef<any>(null);
  const mtRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rtRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        if (dead || !hostRef.current) return;
        const sim = await mount(hostRef.current, {
          options: { quality: 'alta', showRoute: true, difficulty: 'medio', duration: 10 },
          fx: {
            map: mapRef.current,
            tunnel: tunnelRef.current,
            frost: frostRef.current,
            strip: stripRef.current,
            marker: markerRef.current
          },
          onHud: (h: HudData) => setHud(h),
          onToast: (t: { id: number; k: string; title: string; detail: string; tone: 'ok' | 'info' | 'warn' }) => {
            setToasts(prev => [...prev.slice(-2), t]);
            setTimeout(() => {
              setToasts(prev => prev.filter(item => item.id !== t.id));
            }, 3200);
          },
          onMsg: (m: any) => {
            if (mtRef.current) clearTimeout(mtRef.current);
            setMsg(m);
            setMsgOn(true);
            mtRef.current = setTimeout(() => setMsgOn(false), 7500);
          },
          onPhase: (p: any) => {
            setPhase(p);
            if (p === 'playing') setEnd(null);
          },
          onEnd: (e: any) => setEnd(e),
          onRest: () => {
            if (rtRef.current) clearTimeout(rtRef.current);
            setResting(true);
            rtRef.current = setTimeout(() => setResting(false), 3800);
          },
          onReady: () => {
            if (!dead) setPhase('intro');
          }
        });
        if (dead) {
          sim.dispose();
          return;
        }
        simRef.current = sim;
      } catch (e) {
        console.error(e);
        setErr(String(e));
      }
    })();

    return () => {
      dead = true;
      if (mtRef.current) clearTimeout(mtRef.current);
      if (rtRef.current) clearTimeout(rtRef.current);
      if (simRef.current) {
        simRef.current.dispose();
        simRef.current = null;
      }
    };
  }, []);

  const marks = useMemo(() => {
    const names: Record<number, string> = {
      0: 'N',
      45: 'NE',
      90: 'E',
      135: 'SE',
      180: 'S',
      225: 'SO',
      270: 'O',
      315: 'NO'
    };
    const arr = [];
    for (let d = 0; d <= 1080; d += 15) {
      const n = names[d % 360];
      arr.push({
        left: d * 2 + 'px',
        label: n || '',
        size: n && n.length === 1 ? '14px' : '11px',
        weight: n && n.length === 1 ? 600 : 400,
        tick: n ? '5px' : d % 45 === 0 ? '7px' : '9px'
      });
    }
    return arr;
  }, []);

  const h = hud || DEFAULT_HUD;
  const pct = (v: number) => Math.max(0, Math.min(100, v)).toFixed(1) + '%';

  const bars = [
    {
      label: 'Estamina',
      value: h.exhausted ? 'Sin aliento' : Math.round(h.stamina) + ' %',
      width: pct(h.stamina),
      color: h.stamina < 30 ? 'var(--color-accent-2)' : 'var(--color-text)',
      noteColor: h.stamina < 30 ? 'var(--color-accent-2-700)' : 'var(--color-text)'
    },
    {
      label: 'Oxígeno',
      value: Math.round(h.oxygen) + ' %',
      width: pct(h.oxygen),
      color: 'var(--color-accent)',
      noteColor: h.oxygen < 45 ? 'var(--color-accent-2-700)' : 'var(--color-text)'
    },
    {
      label: 'Temp. corporal',
      value: h.sweat > 0.3 ? 'Sudor · ' + Math.round(h.body) + ' %' : Math.round(h.body) + ' %',
      width: pct(h.body),
      color: h.body < 35 ? 'var(--color-accent-2)' : 'var(--color-accent-300)',
      noteColor: h.body < 35 || h.sweat > 0.3 ? 'var(--color-accent-2-700)' : 'var(--color-text)'
    }
  ];

  const ink = 'var(--color-text)';
  const warn = 'var(--color-accent-2-700)';
  const ok = 'var(--color-accent-700)';
  const activeLayersCount = 1 + (h.thermal ? 1 : 0) + (h.windbreaker ? 1 : 0);

  const inv = [
    { k: 'B', label: 'Bastones', value: h.poles ? 'Activos' : 'Guardados', color: ink },
    {
      k: 'C',
      label: '2ª Capa: Térmica',
      value: h.thermal ? 'Puesta' : 'En mochila',
      color: h.thermal ? ok : ink
    },
    {
      k: 'V',
      label: '3ª Capa: Cortavientos',
      value: h.windbreaker ? 'Puesta' : 'En mochila',
      color: h.windbreaker ? ok : ink
    },
    { k: 'T', label: 'Termo de mate', value: h.thermos + '/' + h.thermosMax, color: h.thermos ? ink : warn },
    {
      k: 'H',
      label: 'Bebida rehidratante',
      value: (h.drinks ?? 4) + '/' + (h.drinksMax ?? 4),
      color: (h.drinks ?? 4) ? ink : warn
    },
    { k: 'E', label: 'Snacks', value: String(h.snacks), color: h.snacks ? ink : warn },
    {
      k: 'G',
      label: 'Crampones y piolet',
      value: h.techOK ? 'Puestos' : h.canGear ? 'Equípate aquí' : 'En mochila',
      color: h.techOK ? ok : h.canGear ? warn : ink
    }
  ];

  const left = h.left ?? 480;
  const playing = phase === 'playing' || phase === 'paused';
  const msgVisible = !!(msg && msgOn && (playing || phase === 'win'));
  const e =
    end && end.stats
      ? end.stats
      : { clock: '', ampm: '', alt: '', reached: '', progress: 0, dist: '0', dur: '', real: '', minStam: 0, usedT: 0, usedE: 0, slips: 0 };

  const hudOpacity = playing ? 1 : 0;
  const msgOpacity = msgVisible ? 1 : 0;
  const msgTransform = msgVisible ? 'translateY(0)' : 'translateY(-8px)';
  const msgText = msg ? msg.text : '';
  const msgRec = msg && msg.rec ? msg.rec : [];
  const hasRec = msgRec.length > 0;
  const guideLine = h.guideState + ' · ' + h.guideDist + ' m';
  const cpNum = h.cpIndex + 1 + ' / ' + (h.cpTotal + 1);
  const windowText =
    h.rested === false
      ? h.atCamp
        ? h.tentPitched
          ? 'Campamento Base · Carpa armada ✓'
          : 'Campamento Base · Tarde libre (arma tu carpa con F)'
        : 'Día 1 · Caminata diurna al Refugio Perú'
      : left > 0
      ? 'Ventana de cumbre: ' + Math.floor(left / 60) + ' h ' + String(left % 60).padStart(2, '0') + ' min'
      : 'Ventana cerrada';
  const windowColor = h.rested !== false && left < 75 ? warn : 'var(--color-neutral-700)';
  const showCenter = playing && !!h.centerActive;
  const centerText = h.centerText || '';
  const centerBar = pct(h.centerBar ?? 0);

  const isIntro = phase === 'intro';
  const isPaused = phase === 'paused';
  const notReady = phase !== 'intro';

  const defeatOpacity = phase === 'defeat' ? 1 : 0;
  const defeatPe = phase === 'defeat' ? 'auto' : 'none';
  const defeatBlur = phase === 'defeat' ? '14px' : '0px';
  const endReason = end && end.reason ? end.reason : '';

  const winOpacity = phase === 'win' && end ? 1 : 0;
  const winShift = phase === 'win' && end ? '0' : '24px';
  const winPe = phase === 'win' && end ? 'auto' : 'none';

  const winStats = [
    { k: 'Hora de cumbre', v: e.clock + ' ' + (e.ampm || 'AM') },
    { k: 'Tiempo de ascenso', v: e.dur },
    { k: 'Distancia', v: e.dist + ' km' },
    { k: 'Estamina mínima', v: e.minStam + ' %' },
    { k: 'Hidratación y snacks', v: e.usedT + ' · ' + e.usedE },
    { k: 'Resbalones', v: String(e.slips) }
  ];

  const loaderOpacity = phase === 'loading' ? 1 : 0;
  const loaderPe = phase === 'loading' ? 'auto' : 'none';
  const loaderText = err ? 'No se pudo iniciar WebGL' : 'Generando el Nevado Pisco…';

  const handleSelectDifficulty = (d: 'facil' | 'medio' | 'avanzado') => {
    setDifficulty(d);
    if (simRef.current && simRef.current.setDifficulty) {
      simRef.current.setDifficulty(d);
    }
  };

  const handleStart = () => {
    if (simRef.current) simRef.current.start(difficulty);
  };

  const handlePause = () => {
    if (simRef.current && simRef.current.pause) simRef.current.pause();
  };

  const handleResume = () => {
    if (simRef.current) simRef.current.resume();
  };

  const handleRespawnCheckpoint = () => {
    setEnd(null);
    if (simRef.current && simRef.current.respawnCheckpoint) {
      simRef.current.respawnCheckpoint();
    }
  };

  const handleGoMainMenu = () => {
    setEnd(null);
    if (simRef.current && simRef.current.goMainMenu) {
      simRef.current.goMainMenu();
    }
  };

  const handleRetry = () => {
    setEnd(null);
    if (simRef.current) simRef.current.restart();
  };

  const handleSkipToMidnight = () => {
    if (simRef.current && simRef.current.skipToMidnight) {
      simRef.current.skipToMidnight();
    }
  };

  const handleToggleMute = () => {
    if (simRef.current && simRef.current.toggleMute) {
      simRef.current.toggleMute();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, fontFamily: 'var(--font-body)', color: 'var(--color-text)', userSelect: 'none' }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, zIndex: 0, background: '#02040b' }} />

      <div
        ref={frostRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: 0,
          background:
            'radial-gradient(ellipse at center, transparent 45%, rgba(200,228,245,0.35) 75%, rgba(235,246,255,0.85) 100%)',
          mixBlendMode: 'screen'
        }}
      />
      <div
        ref={tunnelRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: 0,
          background: 'radial-gradient(ellipse at center, transparent 18%, rgba(0,0,0,0.75) 52%, #000 78%)'
        }}
      />

      {/* HUD limpio en partida: Mapa + Estamina (abajo izq.), Brújula (arriba centro), Altitud/Hora/Temp/Ventana (arriba der.) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
          opacity: hudOpacity,
          transition: 'opacity 700ms ease'
        }}
      >
        {/* Aviso breve de Radio · Guía AGMP (se oculta solo para mantener la pantalla limpia) */}
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            left: 'var(--space-4)',
            width: 'clamp(200px, calc(50vw - 180px - 40px), 340px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)'
          }}
        >
          <div
            style={{
              boxSizing: 'border-box',
              background: 'var(--color-bg)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              opacity: msgOpacity,
              transform: msgTransform,
              transition: 'opacity 500ms ease, transform 600ms cubic-bezier(.2,.7,.2,1)'
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: '2px var(--space-2)',
                fontSize: '10px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase'
              }}
            >
              <span style={{ color: 'var(--color-accent-2-700)' }}>Radio · Guía</span>
              <span
                style={{
                  color: 'var(--color-neutral-700)',
                  letterSpacing: '0.04em',
                  textTransform: 'none',
                  fontStyle: 'italic',
                  fontSize: '11px'
                }}
              >
                {guideLine}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 'clamp(12.5px, 2.1vh, 14.5px)',
                lineHeight: 1.35,
                fontStyle: 'italic',
                textWrap: 'pretty' as any
              }}
            >
              «{msgText}»
            </p>
            {hasRec && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px var(--space-2)', marginTop: '2px' }}>
                {msgRec.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                    <span
                      style={{
                        minWidth: '20px',
                        padding: '0px 5px',
                        border: '1px solid var(--color-text)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '11px',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {r.k}
                    </span>
                    <span>{r.t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Brújula + Checkpoint actual */}
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '360px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '360px',
              height: '34px',
              overflow: 'hidden',
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <div ref={stripRef} style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '2160px' }}>
              {marks.map((m, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: m.left,
                    top: 0,
                    height: '100%',
                    width: '30px',
                    marginLeft: '-15px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '2px',
                    paddingBottom: '5px',
                    boxSizing: 'border-box'
                  }}
                >
                  <span style={{ fontSize: m.size, fontWeight: m.weight, lineHeight: 1, color: 'var(--color-text)' }}>
                    {m.label}
                  </span>
                  <span style={{ width: '1px', height: m.tick, background: 'var(--color-text)' }} />
                </div>
              ))}
            </div>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: '1px',
                background: 'var(--color-accent-2)'
              }}
            />
          </div>
          <div style={{ position: 'relative', width: '360px', height: '14px' }}>
            <div
              ref={markerRef}
              style={{
                position: 'absolute',
                left: '174px',
                top: 0,
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderBottom: '9px solid var(--color-accent)'
              }}
            />
          </div>
          <div
            style={{
              maxWidth: 'min(480px, 40vw)',
              background: 'var(--color-bg)',
              padding: '4px var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1px',
              textAlign: 'center'
            }}
          >
            <span
              style={{
                fontSize: '10px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-700)',
                whiteSpace: 'nowrap'
              }}
            >
              Checkpoint {cpNum} · {h.cp}
            </span>
            <span style={{ fontSize: '12px', lineHeight: 1.3, color: 'var(--color-text)' }}>
              ▲ {h.next} · {h.nextAlt} m · cumbre a {h.toSummit} km
            </span>
          </div>
        </div>

        {/* Esquina superior derecha: Altitud, Hora, Temperatura, Ventana de cumbre y acceso a Menú ESC */}
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-4)',
            right: 'var(--space-4)',
            width: '256px',
            background: 'var(--color-bg)',
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '11px',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--color-neutral-700)'
              }}
            >
              Altímetro
            </span>
            <span
              style={{
                fontSize: '11px',
                fontStyle: 'italic',
                color: h.weather?.includes('Nevando') ? 'var(--color-accent-700)' : 'var(--color-neutral-700)'
              }}
            >
              {h.weather || 'Despejado'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
            <span
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                fontSize: '40px',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums lining-nums',
                letterSpacing: '-0.01em'
              }}
            >
              {h.alt}
            </span>
            <span style={{ fontSize: '14px', fontStyle: 'italic', color: 'var(--color-neutral-700)' }}>m.s.n.m.</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-2)',
              marginTop: '2px'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--color-neutral-700)'
                }}
              >
                Hora
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: '21px',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {h.clock} <span style={{ fontSize: '12.5px', fontWeight: 400, fontStyle: 'italic' }}>{h.ampm}</span>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--color-neutral-700)'
                }}
              >
                Temperatura
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: '21px',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {h.ext} °C
              </span>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: windowColor }}>{windowText}</div>
          {!h.rested && (
            <button
              className="btn btn-primary"
              onClick={handleSkipToMidnight}
              style={{
                pointerEvents: 'auto',
                width: '100%',
                marginTop: '2px',
                padding: '6px 10px',
                fontSize: '12px',
                justifyContent: 'center'
              }}
            >
              [R] Saltar a las 12:00 AM
            </button>
          )}
          <div
            onClick={handlePause}
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '6px',
              marginTop: '2px',
              borderTop: '1px solid var(--color-neutral-200)',
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-neutral-700)'
            }}
          >
            <span>[ESC] Menú y Equipo</span>
            <span>Capas {activeLayersCount}/3</span>
          </div>
        </div>

        {/* Esquina inferior izquierda: Mapa Circular + Estamina y signos vitales */}
        <div
          style={{
            position: 'absolute',
            left: 'var(--space-4)',
            bottom: 'var(--space-4)',
            width: '236px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'var(--space-3)'
          }}
        >
          <div
            style={{
              width: 'clamp(110px, 24vh, 190px)',
              aspectRatio: '1',
              borderRadius: '50%',
              boxShadow: 'var(--shadow-md)',
              background: 'var(--color-bg)',
              position: 'relative'
            }}
          >
            <canvas
              ref={mapRef}
              width={400}
              height={400}
              style={{ width: '100%', height: '100%', display: 'block', borderRadius: '50%' }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '-6px',
                transform: 'translateX(-50%)',
                background: 'var(--color-bg)',
                padding: '0 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '11px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                boxShadow: 'var(--shadow-sm)',
                whiteSpace: 'nowrap'
              }}
            >
              Mapa · N zoom
            </div>
          </div>

          <div
            style={{
              width: '236px',
              boxSizing: 'border-box',
              background: 'var(--color-bg)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '7px'
            }}
          >
            {bars.map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 'var(--space-2)',
                    fontSize: '12px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span style={{ letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: '10px' }}>{b.label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: b.noteColor }}>{b.value}</span>
                </div>
                <div style={{ height: '4px', background: 'var(--color-neutral-200)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: b.width,
                      background: b.color,
                      transition: 'width 160ms linear, background 300ms'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Toasts de consumo y equipo (abajo a la derecha, temporales y limpios) */}
        {toasts.length > 0 && (
          <div
            style={{
              position: 'absolute',
              right: 'var(--space-4)',
              bottom: 'var(--space-4)',
              width: 'min(320px, 86vw)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              alignItems: 'flex-end',
              pointerEvents: 'none'
            }}
          >
            {toasts.map(t => {
              const borderCol =
                t.tone === 'ok'
                  ? 'var(--color-accent)'
                  : t.tone === 'warn'
                  ? 'var(--color-accent-2)'
                  : 'var(--color-text)';
              return (
                <div
                  key={t.id}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'var(--color-bg)',
                    borderLeft: `4px solid ${borderCol}`,
                    padding: '9px 12px',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: 'var(--shadow-md)',
                    display: 'grid',
                    gridTemplateColumns: '30px 1fr',
                    alignItems: 'center',
                    gap: '10px',
                    animation: 'piscoToastIn 220ms cubic-bezier(.2,.7,.2,1)'
                  }}
                >
                  <span
                    style={{
                      padding: '2px 0',
                      border: '1px solid var(--color-text)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '12px',
                      fontWeight: 600,
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {t.k}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 600,
                        fontSize: '14.5px',
                        lineHeight: 1.2,
                        color: 'var(--color-text)'
                      }}
                    >
                      {t.title}
                    </span>
                    {t.detail && (
                      <span
                        style={{
                          fontSize: '12px',
                          lineHeight: 1.25,
                          color: t.tone === 'warn' ? 'var(--color-accent-2-700)' : 'var(--color-neutral-700)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {t.detail}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Indicador central contextual (equipándose / carpa / animalitos / sin aliento / bloqueado) */}
        {showCenter && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: '22%',
              transform: 'translateX(-50%)',
              background: 'var(--color-bg)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-2)',
              minWidth: '280px'
            }}
          >
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '17px', textAlign: 'center' }}>
              {centerText}
            </div>
            <div style={{ width: '220px', height: '4px', background: 'var(--color-neutral-200)' }}>
              <div style={{ height: '100%', width: centerBar, background: 'var(--color-accent)' }} />
            </div>
          </div>
        )}
      </div>

      {/* Pantalla de Introducción (Menú Principal + Selector de Dificultad) */}
      {isIntro && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            padding: 'var(--space-6)',
            boxSizing: 'border-box',
            background: 'linear-gradient(90deg, rgba(2,4,11,0.62), rgba(2,4,11,0.08) 65%)'
          }}
        >
          <div
            style={{
              width: 'min(580px, 94vw)',
              maxHeight: 'calc(100vh - 36px)',
              overflow: 'auto',
              boxSizing: 'border-box',
              background: 'var(--color-bg)',
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--color-accent-700)'
              }}
            >
              Cordillera Blanca · Ruta normal, arista suroeste
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                fontSize: 'clamp(30px, 5.5vh, 42px)',
                lineHeight: 1.02,
                letterSpacing: '-0.015em'
              }}
            >
              Nevado Pisco · 5 752 m
            </h1>
            <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, textWrap: 'pretty' as any }}>
              Cebollapampa, 09:30 AM. Sube de día hasta el Refugio Perú al mediodía, explora el campamento, arma tu carpa o
              salta cuando quieras a las 12:00 AM con <b>R</b>. De noche subirás el cerrito en zigzag, bajarás por las cadenas
              hacia la morrena y escalarás el glaciar con tus 3 capas antes de las 08:00 AM.
            </p>

            {/* Selector de Nivel de Dificultad y Duración */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--color-neutral-700)'
                }}
              >
                Nivel de dificultad y duración aproximada
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                {DIFFICULTY_OPTIONS.map(opt => {
                  const active = difficulty === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectDifficulty(opt.id)}
                      style={{
                        pointerEvents: 'auto',
                        cursor: 'pointer',
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: active ? '2px solid var(--color-accent)' : '1px solid var(--color-neutral-300)',
                        background: active ? 'rgba(0, 136, 176, 0.08)' : 'var(--color-bg)',
                        color: 'var(--color-text)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        fontFamily: 'inherit'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '16px' }}>
                          {opt.title}
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: active ? 'var(--color-accent-700)' : 'var(--color-neutral-700)',
                            fontVariantNumeric: 'tabular-nums'
                          }}
                        >
                          {opt.time}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', lineHeight: 1.3, color: 'var(--color-neutral-700)' }}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto 1fr',
                gap: '5px var(--space-3)',
                fontSize: '13px',
                alignItems: 'center'
              }}
            >
              {CONTROLS.map((c, i) => (
                <React.Fragment key={i}>
                  <span
                    style={{
                      padding: '1px 6px',
                      border: '1px solid var(--color-text)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11.5px',
                      textAlign: 'center',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {c.k}
                  </span>
                  <span>{c.t}</span>
                </React.Fragment>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                style={{ pointerEvents: 'auto', whiteSpace: 'nowrap' }}
                onClick={handleStart}
                disabled={notReady}
              >
                Iniciar expedición ({DIFFICULTY_OPTIONS.find(d => d.id === difficulty)?.title} ·{' '}
                {DIFFICULTY_OPTIONS.find(d => d.id === difficulty)?.time})
              </button>
              <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--color-neutral-700)' }}>
                Presiona ESC en cualquier momento para ver tu equipo o reiniciar checkpoint.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Menú ESC: Equipo, Capas, Controles, Reiniciar en Último Checkpoint e Ir al Menú Principal */}
      {isPaused && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-4)',
            boxSizing: 'border-box',
            background: 'rgba(2,4,11,0.62)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)'
          }}
        >
          <div
            style={{
              width: 'min(760px, 95vw)',
              maxHeight: 'calc(100vh - 36px)',
              overflowY: 'auto',
              boxSizing: 'border-box',
              background: 'var(--color-bg)',
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)'
            }}
          >
            {/* Cabecera del menú ESC */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--color-accent-700)'
                  }}
                >
                  Expedición en pausa · Dificultad {h.difficultyLabel || 'Medio (~10 min)'}
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '30px', lineHeight: 1.1 }}>
                  Menú y Equipo de Montaña
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--color-neutral-700)' }}>
                <div>
                  Último checkpoint: <b style={{ color: 'var(--color-text)' }}>{h.cp}</b>
                </div>
                <div>
                  Altitud actual: <b>{h.alt} m</b> · Hora: <b>{h.clock} {h.ampm}</b>
                </div>
              </div>
            </div>

            {/* Cuadrícula de dos columnas: Equipo/Mochila + Estado de Radio y Controles */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-4)'
              }}
            >
              {/* Columna 1: Equipo, 3 Capas y Mochila */}
              <div
                style={{
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3) var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--color-neutral-700)'
                    }}
                  >
                    Equipo y Mochila · Capas {activeLayersCount}/3
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 600,
                      fontSize: '17px',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {h.weight} kg
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--color-neutral-700)', fontStyle: 'italic' }}>
                  Abrigo activo: {h.layers}
                </div>
                {inv.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '32px 1fr auto',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      fontSize: '14px'
                    }}
                  >
                    <span
                      style={{
                        padding: '1px 0',
                        border: '1px solid var(--color-text)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '12px',
                        textAlign: 'center'
                      }}
                    >
                      {it.k}
                    </span>
                    <span>{it.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: it.color }}>{it.value}</span>
                  </div>
                ))}
              </div>

              {/* Columna 2: Guía por Radio + Controles Rápidos */}
              <div
                style={{
                  border: '1px solid var(--color-neutral-300)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 'var(--space-3) var(--space-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--color-accent-2-700)'
                    }}
                  >
                    <span>Radio · Guía AGMP</span>
                    <span style={{ color: 'var(--color-neutral-700)', textTransform: 'none', fontStyle: 'italic' }}>
                      {guideLine}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.4, fontStyle: 'italic' }}>
                    «{msgText || 'Mantén el ritmo y vigila tu temperatura corporal.'}»
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--color-neutral-200)', paddingTop: '8px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--color-neutral-700)',
                      marginBottom: '6px'
                    }}
                  >
                    Atajos de teclado
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '4px 10px',
                      fontSize: '12.5px',
                      alignItems: 'center'
                    }}
                  >
                    {CONTROLS.slice(0, 8).map((c, i) => (
                      <React.Fragment key={i}>
                        <span
                          style={{
                            padding: '0px 5px',
                            border: '1px solid var(--color-text)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '11px',
                            textAlign: 'center',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {c.k}
                        </span>
                        <span>{c.t}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Botonera de Acciones del Menú ESC */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-3)',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 'var(--space-2)',
                borderTop: '1px solid var(--color-neutral-300)'
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <button className="btn btn-primary" onClick={handleResume}>
                  Continuar (ESC)
                </button>
                <button
                  className="btn"
                  onClick={handleRespawnCheckpoint}
                  style={{
                    border: '1px solid var(--color-text)',
                    background: 'transparent',
                    color: 'var(--color-text)'
                  }}
                >
                  Reiniciar en último checkpoint ({h.cp})
                </button>
                {!h.rested && (
                  <button
                    className="btn"
                    onClick={handleSkipToMidnight}
                    style={{
                      border: '1px solid var(--color-accent)',
                      background: 'transparent',
                      color: 'var(--color-accent-700)'
                    }}
                  >
                    [R] Saltar a las 12:00 AM
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <button
                  className="btn"
                  onClick={handleToggleMute}
                  style={{
                    border: '1px solid var(--color-neutral-400)',
                    background: 'transparent',
                    color: 'var(--color-text)'
                  }}
                >
                  {h.muted ? 'Activar audio (M)' : 'Silenciar audio (M)'}
                </button>
                <button
                  className="btn"
                  onClick={handleGoMainMenu}
                  style={{
                    border: '1px solid var(--color-accent-2-700)',
                    background: 'transparent',
                    color: 'var(--color-accent-2-700)'
                  }}
                >
                  Ir al Menú Principal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla de Derrota */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 5,
          pointerEvents: defeatPe as any,
          opacity: defeatOpacity,
          transition: 'opacity 1800ms ease, backdrop-filter 1800ms ease',
          backdropFilter: `blur(${defeatBlur})`,
          WebkitBackdropFilter: `blur(${defeatBlur})`,
          background: 'rgba(0,0,0,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'var(--space-4)',
            maxWidth: '580px',
            padding: 'var(--space-6)',
            opacity: defeatOpacity,
            transition: 'opacity 1200ms ease 1400ms'
          }}
        >
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-2-400)'
            }}
          >
            Expedición fallida · {e.clock} {e.ampm} · {e.alt} m
          </div>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              fontSize: '88px',
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
              color: 'var(--color-bg)'
            }}
          >
            Derrota
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '18px',
              lineHeight: 1.5,
              color: 'var(--color-neutral-300)',
              textWrap: 'pretty' as any
            }}
          >
            {endReason}
          </p>
          <div style={{ fontSize: '14px', color: 'var(--color-neutral-400)' }}>
            Último punto: {e.reached || h.cp} · {e.progress} % de la ruta · {e.dist} km recorridos
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={handleRespawnCheckpoint}>
              Reiniciar en último checkpoint ({e.reached || h.cp})
            </button>
            <button
              className="btn"
              style={{
                whiteSpace: 'nowrap',
                border: '1px solid var(--color-neutral-400)',
                background: 'transparent',
                color: 'var(--color-bg)'
              }}
              onClick={handleRetry}
            >
              Reintentar desde Cebollapampa
            </button>
            <button
              className="btn"
              style={{
                whiteSpace: 'nowrap',
                border: '1px solid var(--color-neutral-400)',
                background: 'transparent',
                color: 'var(--color-neutral-300)'
              }}
              onClick={handleGoMainMenu}
            >
              Ir al Menú Principal
            </button>
          </div>
        </div>
      </div>

      {/* Pantalla de Victoria (Cumbre) */}
      <div
        style={{
          position: 'absolute',
          right: 'var(--space-6)',
          top: '50%',
          zIndex: 5,
          width: 'min(420px, 90vw)',
          background: 'var(--color-bg)',
          padding: 'var(--space-6)',
          borderRadius: 'var(--radius-sm)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          opacity: winOpacity,
          transform: `translateY(-50%) translateX(${winShift})`,
          pointerEvents: winPe as any,
          transition: 'opacity 1200ms ease, transform 1400ms cubic-bezier(.2,.7,.2,1)'
        }}
      >
        <div
          style={{
            fontSize: '12px',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-700)'
          }}
        >
          Cumbre · Pisco Oeste
        </div>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            fontSize: '44px',
            lineHeight: 1,
            letterSpacing: '-0.015em'
          }}
        >
          5 752 m
        </div>
        <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.5, fontStyle: 'italic' }}>
          «¡Cumbre del Pisco! Miren ese amanecer sobre el Huascarán.»
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3) var(--space-4)' }}>
          {winStats.map((s, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--color-neutral-700)'
                }}
              >
                {s.k}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: '20px',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {s.v}
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={handleRetry}>
            Repetir el ascenso
          </button>
          <button
            className="btn"
            style={{
              whiteSpace: 'nowrap',
              border: '1px solid var(--color-text)',
              background: 'transparent',
              color: 'var(--color-text)'
            }}
            onClick={handleGoMainMenu}
          >
            Ir al Menú Principal
          </button>
        </div>
      </div>

      {/* Transición de Descanso hasta las 12:00 AM en Refugio Perú */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          background: 'rgba(2,4,11,0.82)',
          opacity: resting ? 1 : 0,
          transition: 'opacity 900ms ease'
        }}
      >
        <div
          style={{
            background: 'var(--color-bg)',
            padding: 'var(--space-6)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            maxWidth: '460px'
          }}
        >
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-700)'
            }}
          >
            Refugio Perú · 4 680 m
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '30px', lineHeight: 1.1 }}>
            Descanso hasta las 12:00 AM
          </div>
          <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.5 }}>
            Carpa lista, cena caliente y unas horas de sueño. A las 12:00 AM de la medianoche salimos con frontales hacia el
            cerrito en zigzag, el descenso por las cadenas y la morrena rumbo al glaciar.
          </p>
        </div>
      </div>

      {/* Loader Inicial */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#02040b',
          opacity: loaderOpacity,
          pointerEvents: loaderPe as any,
          transition: 'opacity 1200ms ease'
        }}
      >
        <div
          style={{
            background: 'var(--color-bg)',
            padding: 'var(--space-4) var(--space-6)',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)'
          }}
        >
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-700)'
            }}
          >
            Nevado Pisco
          </div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '22px' }}>{loaderText}</div>
        </div>
      </div>
    </div>
  );
}
