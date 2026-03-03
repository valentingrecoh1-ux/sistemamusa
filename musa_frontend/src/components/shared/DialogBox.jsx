import { useState, useEffect, useRef } from 'react';
import s from './DialogBox.module.css';
import Button from './Button';

const ICONS = {
  alert: 'bi bi-info-circle-fill',
  confirm: 'bi bi-question-circle-fill',
  prompt: 'bi bi-pencil-square',
};

const TITLES = {
  alert: 'Aviso',
  confirm: 'Confirmar',
  prompt: 'Ingrese un valor',
};

export default function DialogBox({ type, title, message, defaultValue = '', onResolve }) {
  const [inputValue, setInputValue] = useState(defaultValue);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (type === 'prompt' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [type]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') handleCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const animateOut = (cb) => {
    setClosing(true);
    setTimeout(cb, 180);
  };

  const handleOk = () => {
    animateOut(() => {
      if (type === 'alert') onResolve(undefined);
      else if (type === 'confirm') onResolve(true);
      else onResolve(inputValue);
    });
  };

  const handleCancel = () => {
    animateOut(() => {
      if (type === 'alert') onResolve(undefined);
      else if (type === 'confirm') onResolve(false);
      else onResolve(null);
    });
  };

  const displayTitle = title || TITLES[type];
  const iconStyle = type === 'alert' ? s.iconAlert : type === 'confirm' ? s.iconConfirm : s.iconPrompt;

  return (
    <div className={`${s.overlay} ${closing ? s.overlayClosing : ''}`} onClick={handleCancel}>
      <div className={`${s.dialog} ${closing ? s.dialogClosing : ''}`} onClick={e => e.stopPropagation()}>
        <div className={`${s.icon} ${iconStyle}`}>
          <i className={ICONS[type]} />
        </div>
        <h3 className={s.title}>{displayTitle}</h3>
        <p className={s.message}>{message}</p>
        {type === 'prompt' && (
          <input
            ref={inputRef}
            className={s.input}
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleOk()}
          />
        )}
        <div className={s.buttons}>
          {type !== 'alert' && (
            <Button variant="outline" onClick={handleCancel}>Cancelar</Button>
          )}
          <Button variant={type === 'confirm' ? 'danger' : 'primary'} autoFocus={type !== 'prompt'} onClick={handleOk}>
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
}
