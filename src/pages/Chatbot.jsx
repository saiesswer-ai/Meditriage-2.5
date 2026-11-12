import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Send, RotateCcw, AlertTriangle, Activity, Stethoscope, CalendarCheck, MapPin, Mic, ImagePlus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const API_BASE = 'http://127.0.0.1:8001';
const LANGUAGES = [{ value: 'en', label: 'English', speech: 'en-IN' }, { value: 'hi', label: 'Hindi', speech: 'hi-IN' }, { value: 'ta', label: 'Tamil', speech: 'ta-IN' }];
const initialDetails = { name: '', age: '', gender: '', language: '', email: '' };
const intro = "Hello! I'm the MediTriage AI assistant. Describe your details below to begin.";
const symptomGreeting = "Describe your symptoms in detail and I'll help assess your condition.\n\nFor example: *\"I have a persistent headache, mild fever, and feel very tired for the past 3 days.\"*";

export default function Chatbot() {
  const navigate = useNavigate();
  const { t, setLanguage, setPatientData } = useApp();
  const [messages, setMessages] = useState([{ role: 'assistant', text: intro }]);
  const [details, setDetails] = useState(initialDetails);
  const [touched, setTouched] = useState({});
  const [intakeComplete, setIntakeComplete] = useState(false);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [turn, setTurn] = useState(0);
  const [inputError, setInputError] = useState('');
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [image, setImage] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const imageInputRef = useRef(null);

  const errors = {
    name: details.name.trim().length >= 2 ? '' : t('nameError'),
    age: /^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(details.age) ? '' : t('ageError'),
    gender: details.gender ? '' : t('genderError'),
    language: details.language ? '' : t('languageError'),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) ? '' : t('emailError'),
  };
  const intakeValid = Object.values(errors).every((error) => !error);

  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };
  const clearImage = () => {
    if (image?.url) URL.revokeObjectURL(image.url);
    setImage(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  useEffect(() => {
    setSpeechSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => { recognitionRef.current?.abort(); };
  }, []);
  useEffect(() => () => { if (image?.url) URL.revokeObjectURL(image.url); }, [image]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, intakeComplete, diagnosis]);
  useEffect(() => { if (intakeComplete && !loading && !diagnosis) inputRef.current?.focus(); }, [intakeComplete, loading, diagnosis]);

  const updateDetail = (field, value) => {
    setDetails((previous) => ({ ...previous, [field]: value }));
    setTouched((previous) => ({ ...previous, [field]: true }));
    if (field === 'language') setLanguage(value);
  };
  const continueIntake = () => {
    setTouched({ name: true, age: true, gender: true, language: true, email: true });
    if (!intakeValid) return;
    setPatientData({ name: details.name, age: Number(details.age), gender: details.gender, email: details.email });
    setIntakeComplete(true);
    setMessages((previous) => [...previous, { role: 'user', text: `${details.name} - ${details.age} - ${t(details.gender)}` }, { role: 'assistant', text: symptomGreeting }]);
  };
  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    setInputError('');
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = LANGUAGES.find((language) => language.value === details.language)?.speech || 'en-IN';
    let finalText = input;
    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInput(`${finalText}${interimText}`);
    };
    recognition.onerror = (event) => setInputError(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? t('voicePermissionError') : event.error === 'no-speech' ? t('voiceNoSpeechError') : t('voiceError'));
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !intakeComplete) return;
    stopListening();
    setMessages((previous) => [...previous, { role: 'user', text }]);
    setInput(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chatbot/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, message: text }) });
      if (!res.ok) throw new Error('Server error');
      const data = await res.json();
      setSessionId(data.session_id); setTurn(data.turn);
      setMessages((previous) => [...previous, { role: 'assistant', text: data.reply }]);
      if (data.is_final && data.diagnosis) setDiagnosis(data.diagnosis);
    } catch {
      setMessages((previous) => [...previous, { role: 'assistant', text: "❌ Sorry, I couldn't connect to the server. Please make sure the chatbot backend is running on port 8001." }]);
    } finally { setLoading(false); }
  };
  const resetChat = async () => {
    stopListening(); clearImage();
    if (sessionId) { try { await fetch(`${API_BASE}/chatbot/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, message: '' }) }); } catch {} }
    setMessages([{ role: 'assistant', text: intro }]); setTouched({}); setIntakeComplete(false); setInput(''); setSessionId(null); setPatientData(null); setDiagnosis(null); setTurn(0); setInputError('');
  };
  const handleImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setInputError(t('imageError')); event.target.value = ''; return; }
    clearImage(); setImage({ name: file.name, url: URL.createObjectURL(file) });
  };
  const riskColor = (level) => level === 'High' ? 'var(--high)' : level === 'Medium' ? 'var(--medium)' : 'var(--low)';
  const formatMessage = (text) => text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/---/g, '<hr style="border:none;border-top:1px solid rgba(100,116,139,0.25);margin:12px 0"/>').replace(/\n/g, '<br/>');
  const field = (name, type = 'text') => <div className="form-group" key={name}><label htmlFor={`chat-${name}`}>{t(name)}</label><input id={`chat-${name}`} type={type} value={details[name]} onChange={(event) => updateDetail(name, event.target.value)} onBlur={() => setTouched((previous) => ({ ...previous, [name]: true }))} />{touched[name] && errors[name] && <span className="field-error">{errors[name]}</span>}</div>;

  return <div className="chatbot-page page-transition"><div className="chatbot-container glass">
    <div className="chatbot-header"><div className="chatbot-header-left"><div className="chatbot-avatar"><Stethoscope size={20} /></div><div><h2 className="chatbot-title">MediTriage AI Chat</h2><span className="chatbot-status"><span className="status-dot" />{loading ? 'Analyzing...' : 'Online'}</span></div></div><button className="chatbot-reset-btn" onClick={resetChat} title="New conversation"><RotateCcw size={16} />New Chat</button></div>
    <div className="chatbot-messages">
      {messages.map((message, index) => <div key={index} className={`chat-bubble ${message.role}`}>{message.role === 'assistant' && <div className="bubble-avatar"><Activity size={14} /></div>}<div className="bubble-content" dangerouslySetInnerHTML={{ __html: formatMessage(message.text) }} /></div>)}
      {!intakeComplete && <div className="chat-intake-card glass"><h3>{t('patientIntake')}</h3>{field('name')}{field('age', 'number')}<div className="form-group"><label>{t('gender')}</label><div className="gender-radios">{['male', 'female', 'other'].map((gender) => <label key={gender} className={`gender-option${details.gender === gender ? ' selected' : ''}`}><input type="radio" name="chat-gender" checked={details.gender === gender} onChange={() => updateDetail('gender', gender)} />{t(gender)}</label>)}</div>{touched.gender && errors.gender && <span className="field-error">{errors.gender}</span>}</div><div className="form-group"><label htmlFor="chat-language">{t('language')}</label><select id="chat-language" className="styled-select" value={details.language} onChange={(event) => updateDetail('language', event.target.value)} onBlur={() => setTouched((previous) => ({ ...previous, language: true }))}><option value="">{t('selectLanguage')}</option>{LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}</select>{touched.language && errors.language && <span className="field-error">{errors.language}</span>}</div>{field('email', 'email')}<button className="chat-intake-continue" onClick={continueIntake} disabled={!intakeValid}>{t('continue')}</button></div>}
      {loading && <div className="chat-bubble assistant"><div className="bubble-avatar"><Activity size={14} /></div><div className="bubble-content typing-indicator"><span /><span /><span /></div></div>}
      {diagnosis && <div className="diagnosis-card glass" style={{ borderColor: riskColor(diagnosis.risk_level) }}><div className="diagnosis-header"><AlertTriangle size={18} style={{ color: riskColor(diagnosis.risk_level) }} /><h3>Diagnosis Summary</h3></div><div className="diagnosis-patient-details"><div><small>{t('name')}</small><span>{details.name}</span></div><div><small>{t('age')}</small><span>{details.age}</span></div><div><small>{t('gender')}</small><span>{t(details.gender)}</span></div><div><small>{t('email')}</small><span title={details.email}>{details.email}</span></div></div><div className="diagnosis-main"><div className="diagnosis-disease">{diagnosis.predicted_disease}</div><div className="diagnosis-confidence"><div className="confidence-bar"><div className="confidence-fill" style={{ width: `${diagnosis.confidence}%`, background: riskColor(diagnosis.risk_level) }} /></div><span>{diagnosis.confidence}% confidence</span></div><span className="risk-badge" style={{ background: `${riskColor(diagnosis.risk_level)}22`, color: riskColor(diagnosis.risk_level), border: `1px solid ${riskColor(diagnosis.risk_level)}` }}>{diagnosis.risk_level} Risk</span></div><div className="recommended-doctor"><span>Recommended Doctor</span><strong><Stethoscope size={17} />{diagnosis.specialist}</strong></div><div className="diagnosis-actions"><button className="diagnosis-action book" onClick={() => navigate('/booking')}><CalendarCheck size={17} />Book appointment</button><button className="diagnosis-action nearby" onClick={() => navigate('/navigation')}><MapPin size={17} />Find nearby</button></div><div className="diagnosis-disclaimer">⚕️ This is an AI-assisted preliminary assessment. Always consult a qualified healthcare professional.</div></div>}
      <div ref={messagesEndRef} />
    </div>
    <div className="chatbot-input-area">{diagnosis ? <button className="chatbot-restart-btn" onClick={resetChat}><MessageCircle size={16} />Start New Assessment</button> : <><input ref={imageInputRef} className="image-file-input" type="file" accept="image/*" onChange={handleImage} />{image && <div className="image-chip"><img src={image.url} alt="Selected upload" /><span>{image.name}</span><button onClick={clearImage} aria-label="Remove image"><X size={14} /></button><em>{t('imageComingSoon')}</em></div>}<div className="chatbot-input-wrapper"><button className="chatbot-icon-btn" onClick={() => imageInputRef.current?.click()} disabled={!intakeComplete || loading} aria-label="Upload image"><ImagePlus size={18} /></button><textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }} placeholder={!intakeComplete ? t('completeDetails') : turn === 0 ? 'Describe your symptom...' : 'Answer the follow-up question...'} disabled={!intakeComplete || loading} rows={1} /><button className={`chatbot-icon-btn mic ${listening ? 'listening' : ''}`} onClick={listening ? stopListening : startListening} disabled={!intakeComplete || loading || !speechSupported} aria-label={listening ? t('stopListening') : t('startListening')} title={!speechSupported ? 'Voice input needs Chrome or Edge' : listening ? t('stopListening') : t('startListening')}><Mic size={18} /></button><button className="chatbot-send-btn" onClick={sendMessage} disabled={!input.trim() || loading || !intakeComplete}><Send size={18} /></button></div>{inputError && <div className="chat-voice-error" role="alert">{inputError}</div>}</>}</div>
  </div></div>;
}
