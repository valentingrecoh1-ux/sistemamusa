import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMusito } from '../../context/MusitoContext';
import { tiendaPath } from '../../tiendaConfig';
import s from './MusitoAssistant.module.css';

export default function MusitoAssistant() {
  const {
    message, pose, visible, bubbleVisible, dismissed, outfit,
    showQuickMenu, quickSuggestions,
    dismiss, reactivate, handleMusitoClick, toggleQuickMenu, setShowQuickMenu,
  } = useMusito();
  const navigate = useNavigate();
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
  const accessoryClass = outfit.accessory ? s[`acc_${outfit.accessory}`] : '';

  // Short click = easter egg count, long press = minimize
  const pressTimer = useRef(null);
  const wasLongPress = useRef(false);

  const handlePointerDown = () => {
    wasLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      wasLongPress.current = true;
      setMinimized(true);
    }, 600);
  };

  const handlePointerUp = () => {
    clearTimeout(pressTimer.current);
    if (!wasLongPress.current) {
      handleMusitoClick();
    }
  };

  const handleQuickSuggestion = (query) => {
    setShowQuickMenu(false);
    navigate(tiendaPath('/sommelier') + `?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className={`${s.container} ${poseClass} ${accessoryClass}`}>
      {/* Quick sommelier menu */}
      {showQuickMenu && (
        <div className={s.quickMenu}>
          <div className={s.quickMenuTitle}>Preguntame algo!</div>
          {quickSuggestions.map((sug) => (
            <button
              key={sug.label}
              className={s.quickMenuItem}
              onClick={() => handleQuickSuggestion(sug.query)}
            >
              {sug.label}
            </button>
          ))}
        </div>
      )}

      {/* Speech bubble */}
      {bubbleVisible && message && !showQuickMenu && (
        <div className={s.bubble}>
          <span>{message}</span>
        </div>
      )}

      {/* Character */}
      <div
        className={s.character}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => clearTimeout(pressTimer.current)}
        title="Click para interactuar, manten presionado para minimizar"
      >
        {/* Pose-specific overlays */}
        {pose === 'moto' && <div className={s.motoOverlay} />}
        {pose === 'paquete' && <div className={s.paqueteOverlay} />}
        {pose === 'celebrar' && <div className={s.confetti} />}
        {pose === 'sleep' && <div className={s.sleepZzz} />}

        <div className={s.sprite}>
          {/* Hat / hair / accessory */}
          <div className={s.hair} style={{ background: outfit.hair }} />
          {/* Head */}
          <div className={s.head}>
            <span className={s.eyeL} />
            <span className={s.eyeR} />
            <span className={s.mouth} />
          </div>
          {/* Body */}
          <div className={s.body} style={{ background: outfit.body }}>
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

      {/* Action buttons */}
      <div className={s.actionBtns}>
        <button className={s.actionBtn} onClick={toggleQuickMenu} title="Preguntar a Musito">
          <i className="bi bi-chat-dots" />
        </button>
        <button className={s.dismissBtn} onClick={dismiss} title="Ocultar a Musito">
          <i className="bi bi-x" />
        </button>
      </div>
    </div>
  );
}
