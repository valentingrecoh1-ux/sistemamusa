import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IP, fotoSrc } from '../../main';
import { useCart } from '../../context/CartContext';
import ProductCard from '../../components/tienda/ProductCard';
import s from './TiendaSommelier.module.css';

export default function TiendaSommelier() {
  const { addItem } = useCart();
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hola! Soy el sommelier virtual de MUSA. Contame que estas buscando: que vas a comer, para que ocasion, o simplemente que tipo de vino te gusta, y te recomiendo los mejores vinos para vos.\n\nPodes escribirme o usar el microfono para hablarme.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const chatEndRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Web Speech API setup
  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setRecording(false);
      // Auto-enviar despues de obtener el texto
      handleSend(transcript);
    };

    recognition.onerror = () => {
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${IP()}/api/tienda/sommelier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: msg }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: 'assistant', text: 'Perdon, hubo un error. Intenta de nuevo.' }]);
      } else {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          text: data.respuesta,
          productos: data.recomendados || [],
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Error de conexion. Intenta de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={s.sommelier}>
      <div className={s.header}>
        <div className={s.headerIcon}>
          <i className="bi bi-cup-straw" />
        </div>
        <div>
          <h1 className={s.title}>Sommelier Virtual</h1>
          <p className={s.subtitle}>Tu asistente personal para elegir el vino perfecto</p>
        </div>
      </div>

      <div className={s.suggestions}>
        {['Vino para un asado', 'Algo fresco para mariscos', 'Un tinto especial de regalo', 'Espumante para brindar'].map((sug) => (
          <button key={sug} className={s.suggestion} onClick={() => handleSend(sug)} disabled={loading}>
            {sug}
          </button>
        ))}
      </div>

      <div className={s.chat}>
        {messages.map((msg, i) => (
          <div key={i} className={`${s.message} ${s[msg.role]}`}>
            {msg.role === 'assistant' && (
              <div className={s.avatar}><i className="bi bi-cup-straw" /></div>
            )}
            <div className={s.bubble}>
              <div className={s.bubbleText}>{msg.text}</div>
              {msg.productos?.length > 0 && (
                <div className={s.productsGrid}>
                  {msg.productos.map((p) => (
                    <div key={p._id} className={s.miniCard}>
                      <Link to={`/tienda/producto/${p._id}`} className={s.miniCardLink}>
                        <img src={fotoSrc(p.foto, p._id)} alt={p.nombre} className={s.miniCardImg} onError={(e) => { e.target.style.display = 'none'; }} />
                        <div className={s.miniCardInfo}>
                          <span className={s.miniCardName}>{p.nombre}</span>
                          <span className={s.miniCardMeta}>{p.bodega} {p.cepa ? `· ${p.cepa}` : ''}</span>
                          <span className={s.miniCardPrice}>${p.venta}</span>
                        </div>
                      </Link>
                      <button className={s.miniCardAdd} onClick={() => addItem(p)}>
                        <i className="bi bi-bag-plus" /> Agregar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className={`${s.message} ${s.assistant}`}>
            <div className={s.avatar}><i className="bi bi-cup-straw" /></div>
            <div className={s.bubble}>
              <div className={s.typing}>
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className={s.inputBar}>
        <div className={s.inputWrap}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Contame que buscas..."
            disabled={loading}
            className={s.input}
          />
          <button
            className={`${s.micBtn} ${recording ? s.micRecording : ''}`}
            onClick={recording ? stopRecording : startRecording}
            disabled={loading}
            title={recording ? 'Detener grabacion' : 'Hablar'}
          >
            <i className={`bi ${recording ? 'bi-stop-fill' : 'bi-mic'}`} />
          </button>
          <button className={s.sendBtn} onClick={() => handleSend()} disabled={loading || !input.trim()}>
            <i className="bi bi-send-fill" />
          </button>
        </div>
      </div>
    </div>
  );
}
