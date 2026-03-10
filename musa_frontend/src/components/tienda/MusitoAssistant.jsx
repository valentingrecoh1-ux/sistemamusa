import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMusito } from '../../context/MusitoContext';
import { tiendaPath } from '../../tiendaConfig';
import PixelMusito from './PixelMusito';
import s from './MusitoAssistant.module.css';

export default function MusitoAssistant() {
  const {
    message, pose, visible, bubbleVisible, dismissed, outfit,
    showQuickMenu, quickSuggestions, musitoX, musitoY, facing, isRunning,
    isDragging, isThrown,
    dismiss, reactivate, handleMusitoClick, toggleQuickMenu, setShowQuickMenu,
    startDrag, onDrag, endDrag,
  } = useMusito();
  const navigate = useNavigate();
  const [minimized, setMinimized] = useState(false);

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
        <div className={s.miniHead} />
      </button>
    );
  }

  const poseClass = s[`pose_${pose}`] || '';

  // Drag & long press logic
  const pressTimer = useRef(null);
  const wasLongPress = useRef(false);
  const dragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    wasLongPress.current = false;
    dragging.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    pressTimer.current = setTimeout(() => {
      if (!dragging.current) { wasLongPress.current = true; setMinimized(true); }
    }, 600);
  };

  const handlePointerMove = (e) => {
    const dx = Math.abs(e.clientX - dragStartPos.current.x);
    const dy = Math.abs(e.clientY - dragStartPos.current.y);
    if (!dragging.current && (dx > 8 || dy > 8)) {
      dragging.current = true;
      clearTimeout(pressTimer.current);
      startDrag(e.clientX, e.clientY);
    }
    if (dragging.current) {
      onDrag(e.clientX, e.clientY);
    }
  };

  const handlePointerUp = (e) => {
    clearTimeout(pressTimer.current);
    if (dragging.current) {
      endDrag(e.clientX);
      dragging.current = false;
    } else if (!wasLongPress.current) {
      handleMusitoClick();
    }
  };

  const handleQuickSuggestion = (query) => {
    setShowQuickMenu(false);
    navigate(tiendaPath('/sommelier') + `?q=${encodeURIComponent(query)}`);
  };

  return (
    <div
      className={`${s.container} ${poseClass} ${isDragging ? s.draggingContainer : ''}`}
      style={{ left: `${musitoX}%`, bottom: `${musitoY}px` }}
    >
      {/* Speech bubble */}
      {bubbleVisible && message && !showQuickMenu && (
        <div className={s.bubble}>
          <span>{message}</span>
        </div>
      )}

      {/* Quick sommelier menu */}
      {showQuickMenu && (
        <div className={s.quickMenu}>
          <div className={s.quickMenuTitle}>Preguntame algo!</div>
          {quickSuggestions.map((sug) => (
            <button key={sug.label} className={s.quickMenuItem} onClick={() => handleQuickSuggestion(sug.query)}>
              {sug.label}
            </button>
          ))}
        </div>
      )}

      {/* Character */}
      <div
        className={`${s.character} ${isDragging ? s.dragging : ''} ${isThrown ? s.thrown : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={(e) => { clearTimeout(pressTimer.current); if (dragging.current) { endDrag(e.clientX); dragging.current = false; } }}
        style={{ touchAction: 'none' }}
      >
        {/* Pose overlays */}
        {pose === 'celebrar' && <div className={s.confetti} />}
        {pose === 'sleep' && <div className={s.sleepZzz}>Z</div>}

        {/* SVG Pixel Art Sprite */}
        <PixelMusito pose={pose} outfit={outfit} facing={facing} isRunning={isRunning} size={36} />

        {/* Dust particles when running */}
        {isRunning && <div className={s.dustParticles}><span /><span /><span /></div>}

        {/* Shadow */}
        <div className={s.shadow} />
        <span className={s.nameTag}>Musito</span>
      </div>

      {/* Action buttons */}
      <div className={s.actionBtns}>
        <button className={s.actionBtn} onClick={toggleQuickMenu} title="Preguntar"><i className="bi bi-chat-dots" /></button>
        <button className={s.dismissBtn} onClick={dismiss} title="Ocultar"><i className="bi bi-x" /></button>
      </div>
    </div>
  );
}
