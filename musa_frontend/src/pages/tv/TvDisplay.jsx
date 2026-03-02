import { useState, useEffect, useRef, useCallback } from 'react';
import { IP, socket } from '../../main';
import s from './TvDisplay.module.css';

export default function TvDisplay() {
  const [medios, setMedios] = useState([]);
  const [current, setCurrent] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef(null);

  const fetchMedias = useCallback(() => {
    socket.emit('request-media-tv-public');
  }, []);

  useEffect(() => {
    const handler = (data) => setMedios(data || []);
    const cambios = () => fetchMedias();

    socket.on('response-media-tv-public', handler);
    socket.on('cambios-media-tv', cambios);
    fetchMedias();

    return () => {
      socket.off('response-media-tv-public', handler);
      socket.off('cambios-media-tv', cambios);
    };
  }, [fetchMedias]);

  // Reset index when medios change
  useEffect(() => {
    setCurrent(0);
    setFade(true);
  }, [medios.length]);

  // Slideshow timer
  useEffect(() => {
    if (medios.length <= 1) return;

    const duracion = (medios[current]?.duracion || 8) * 1000;

    timerRef.current = setTimeout(() => {
      // Fade out
      setFade(false);
      // After fade out, switch and fade in
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % medios.length);
        setFade(true);
      }, 600);
    }, duracion);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, medios]);

  // Hide cursor after inactivity
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
  if (!medio) return <div className={s.screen} />;

  return (
    <div className={s.screen}>
      <img
        key={medio._id}
        className={`${s.image} ${fade ? s.fadeIn : s.fadeOut}`}
        src={`${IP()}/api/tv/imagen/${medio._id}`}
        alt=""
      />
      <div className={s.borderGlow} />
    </div>
  );
}
