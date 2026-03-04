import { useState, useEffect, useRef, useCallback } from 'react';
import { IP, socket } from '../../main';
import s from './TvDisplay.module.css';

function TvImage({ medio, className }) {
  const rot = ((medio.rotacion || 0) + 90) % 360;
  const swapped = rot === 90 || rot === 270;
  return (
    <img
      className={className}
      src={`${IP()}/api/tv/imagen/${medio._id}`}
      alt=""
      style={{
        width: swapped ? '100vh' : '100%',
        height: swapped ? '100vw' : '100%',
        transform: `rotate(${rot}deg)`,
      }}
    />
  );
}

export default function TvDisplay() {
  const [medios, setMedios] = useState([]);
  const [current, setCurrent] = useState(0);
  const [prev, setPrev] = useState(null);
  const [destello, setDestello] = useState(true);
  const timerRef = useRef(null);
  const transRef = useRef(null);

  const fetchMedias = useCallback(() => {
    socket.emit('request-media-tv-public');
  }, []);

  useEffect(() => {
    const handler = (data) => setMedios(data || []);
    const cambios = () => fetchMedias();
    const configHandler = (cfg) => setDestello(cfg?.destello ?? true);

    socket.on('response-media-tv-public', handler);
    socket.on('cambios-media-tv', cambios);
    socket.on('response-config-tv', configHandler);
    socket.on('cambios-config-tv', configHandler);
    fetchMedias();
    socket.emit('request-config-tv');

    return () => {
      socket.off('response-media-tv-public', handler);
      socket.off('cambios-media-tv', cambios);
      socket.off('response-config-tv', configHandler);
      socket.off('cambios-config-tv', configHandler);
    };
  }, [fetchMedias]);

  useEffect(() => {
    setCurrent(0);
    setPrev(null);
  }, [medios.length]);

  // Slideshow timer - crossfade
  useEffect(() => {
    if (medios.length <= 1) return;

    const duracion = (medios[current]?.duracion || 8) * 1000;

    timerRef.current = setTimeout(() => {
      const nextIdx = (current + 1) % medios.length;
      setPrev(current);
      setCurrent(nextIdx);
      // Limpiar prev despues de la transicion (800ms)
      transRef.current = setTimeout(() => setPrev(null), 800);
    }, duracion);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (transRef.current) clearTimeout(transRef.current);
    };
  }, [current, medios]);

  const goFullscreen = useCallback(() => {
    const el = document.documentElement;
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (rfs && !document.fullscreenElement && !document.webkitFullscreenElement) {
      rfs.call(el).catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cursorTimer;
    const show = () => {
      document.body.style.cursor = 'default';
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => {
        document.body.style.cursor = 'none';
      }, 3000);
    };
    document.addEventListener('mousemove', show);
    cursorTimer = setTimeout(() => {
      document.body.style.cursor = 'none';
    }, 3000);
    return () => {
      document.removeEventListener('mousemove', show);
      clearTimeout(cursorTimer);
      document.body.style.cursor = 'default';
    };
  }, []);

  if (medios.length === 0) {
    return <div className={s.screen} />;
  }

  const medio = medios[current];
  const medioPrev = prev != null ? medios[prev] : null;
  if (!medio) return <div className={s.screen} />;

  return (
    <div className={s.screen} onClick={goFullscreen}>
      {/* Imagen anterior (se desvanece) */}
      {medioPrev && (
        <TvImage key={`prev-${medioPrev._id}`} medio={medioPrev} className={`${s.image} ${s.imgBack} ${s.fadeOut}`} />
      )}
      {/* Imagen actual (aparece) */}
      <TvImage key={`cur-${medio._id}`} medio={medio} className={`${s.image} ${s.imgFront} ${prev != null ? s.fadeIn : ''}`} />
      {destello && <div className={s.borderGlow} />}
      {destello && <div className={s.borderGlow2} />}
    </div>
  );
}
