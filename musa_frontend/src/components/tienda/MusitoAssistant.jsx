import { useState } from 'react';
import { useMusito } from '../../context/MusitoContext';
import s from './MusitoAssistant.module.css';

export default function MusitoAssistant() {
  const { message, pose, visible, bubbleVisible, dismissed, dismiss, reactivate } = useMusito();
  const [minimized, setMinimized] = useState(false);

  // Show reactivate button when dismissed
  if (dismissed) {
    return (
      <button className={s.reactivateBtn} onClick={reactivate} title="Traer a Musito">
        <span className={s.reactivateEmoji}>🍇</span>
      </button>
    );
  }

  if (!visible) return null;

  if (minimized) {
    return (
      <button className={s.minimizedBtn} onClick={() => setMinimized(false)} title="Ver a Musito">
        <div className={s.miniSprite}>
          <div className={s.miniHead} />
        </div>
      </button>
    );
  }

  const poseClass = s[`pose_${pose}`] || '';

  return (
    <div className={`${s.container} ${poseClass}`}>
      {/* Speech bubble */}
      {bubbleVisible && message && (
        <div className={s.bubble}>
          <span>{message}</span>
        </div>
      )}

      {/* Character */}
      <div className={s.character} onClick={() => setMinimized(true)} title="Click para minimizar">
        {/* Pose-specific overlays */}
        {pose === 'moto' && <div className={s.motoOverlay} />}
        {pose === 'paquete' && <div className={s.paqueteOverlay} />}
        {pose === 'celebrar' && <div className={s.confetti} />}

        <div className={s.sprite}>
          {/* Hat / hair */}
          <div className={s.hair} />
          {/* Head */}
          <div className={s.head}>
            <span className={s.eyeL} />
            <span className={s.eyeR} />
            <span className={s.mouth} />
          </div>
          {/* Body */}
          <div className={s.body}>
            <span className={s.armL} />
            <span className={s.armR} />
          </div>
          {/* Legs */}
          <div className={s.legs}>
            <span className={s.legL} />
            <span className={s.legR} />
          </div>
        </div>
        <span className={s.nameTag}>Musito</span>
      </div>

      {/* Dismiss button */}
      <button className={s.dismissBtn} onClick={dismiss} title="Ocultar a Musito">
        <i className="bi bi-x" />
      </button>
    </div>
  );
}
