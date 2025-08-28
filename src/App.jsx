
import { useState, useEffect, useRef } from "react"

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DOC_MIME = 'application/vnd.google-apps.document';
const TXT_MIME = 'text/plain';
const ERROR_DOC = '[Non-text file or unsupported type]';

async function fetchFileContent({ id, mimeType }, token) {
  if (mimeType === DOC_MIME) {
    const res = await fetch(`${DRIVE_API}/${id}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return await res.text();
  } else if (mimeType === TXT_MIME) {
    const res = await fetch(`${DRIVE_API}/${id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return await res.text();
  } else {
    return ERROR_DOC;
  }
}

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [accessToken, setAccessToken] = useState(null)
  const [driveLink, setDriveLink] = useState('')
  const [chatStarted, setChatStarted] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [buttonError, setButtonError] = useState(false)
  const googleButtonRef = useRef(null)
  const [files, setFiles] = useState([])

  function parseGoogleLink(link) {
    const docMatch = link.match(/\/document\/d\/([\w-]{25,})/);
    if (docMatch) return { type: 'doc', id: docMatch[1] };
    const folderMatch = link.match(/\/folders\/([\w-]{25,})/);
    if (folderMatch) return { type: 'folder', id: folderMatch[1] };
    return { type: null, id: null };
  }

  async function fetchFilesAndContentsOrDoc(link, token) {
    try {
      const { type, id } = parseGoogleLink(link);
      if (type === 'doc') {
        // Handle single Google Doc
        const docMetaRes = await fetch(`${DRIVE_API}/${id}?fields=id%2Cname%2CmimeType`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const docMeta = await docMetaRes.json();
        if (!docMeta.id) throw new Error('Could not access Google Doc.');
        const content = await fetchFileContent(docMeta, token);
        setFiles([{ ...docMeta, content }]);
        return;
      }
      if (type === 'folder') {
        const listRes = await fetch(`${DRIVE_API}?q='${id}'+in+parents&fields=files(id%2Cname%2CmimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const listData = await listRes.json();
        if (!listData.files) throw new Error('No files found or access denied.');
        const filesWithContent = await Promise.all(
          listData.files.map(async (file) => ({ ...file, content: await fetchFileContent(file, token) }))
        );
        setFiles(filesWithContent);
        return;
      }
      throw new Error('Invalid Google Drive folder or document link.');
    } catch (e) {
      setFiles([]);
    }
  }

  useEffect(() => {
    function onScriptLoad() {
      setScriptLoaded(true);
      if (googleButtonRef.current && !authenticated && window.google) {
        try { initGoogleAuthButton(); } catch {}
      }
    }
    if (!document.getElementById('google-identity')) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.id = 'google-identity';
      script.onload = onScriptLoad;
      script.onerror = () => setButtonError(true);
      document.body.appendChild(script);
    } else {
      onScriptLoad();
    }
  }, []);

  function initGoogleAuthButton() {
    window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (response) => {
        if (response && response.access_token) {
          setAuthenticated(true);
          setAccessToken(response.access_token);
        } else {
          setButtonError(true);
        }
      },
    });
    googleButtonRef.current.innerHTML = '';
    const btn = document.createElement('button');
    btn.textContent = 'Sign in with Google';
    btn.style.padding = '0.75rem 2rem';
    btn.style.fontSize = '1rem';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #ddd';
    btn.style.background = '#fff';
    btn.onclick = () => {
      window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: (response) => {
          if (response && response.access_token) {
            setAuthenticated(true);
            setAccessToken(response.access_token);
          } else {
            setButtonError(true);
          }
        },
      }).requestAccessToken();
    };
    googleButtonRef.current.appendChild(btn);
  }

  useEffect(() => {
    if (scriptLoaded && window.google && googleButtonRef.current && !authenticated) {
      try {
        initGoogleAuthButton();
      } catch (e) {
        setButtonError(true);
      }
    }
  }, [scriptLoaded, authenticated]);

  const handleLinkSubmit = async (e) => {
    e.preventDefault()
    if (!driveLink) return
    await fetchFilesAndContentsOrDoc(driveLink, accessToken)
    setChatStarted(true)
  }

  if (typeof document !== 'undefined') {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }
  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#fafbfc', margin: 0, padding: 0, overflow: 'hidden' }}>
      {!authenticated ? (
        buttonError ? (
          <div style={{ color: 'red', fontSize: 16 }}>Google Sign-In failed to load. Check client_id and network.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <h1 style={{ fontWeight: 600, fontSize: 32, marginBottom: 40, letterSpacing: 1, color: '#222' }}>Talk to a Folder</h1>
            <div ref={googleButtonRef} style={{ display: 'flex', justifyContent: 'center' }} />
            {!scriptLoaded && <div style={{ color: '#888', marginTop: 16 }}>Loading Google Sign-In...</div>}
          </div>
        )
      ) : !chatStarted ? (
        <>
          <button onClick={() => { setAuthenticated(false); setAccessToken(null); }} style={{ position: 'absolute', top: 24, right: 32, background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 1.5rem', fontSize: 15, cursor: 'pointer' }}>Log out</button>
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: '10vh', display: 'flex', justifyContent: 'center', width: '100vw', overflow: 'hidden' }}>
            <form onSubmit={handleLinkSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 600, alignItems: 'center', background: '#fff', borderRadius: 16, boxShadow: '0 2px 8px #eee', padding: 32 }}>
              <input
                type="text"
                placeholder="Paste Google Drive link here to get answers"
                value={driveLink}
                onChange={e => setDriveLink(e.target.value)}
                style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: 10, border: '1px solid #ddd', width: 520 }}
                autoFocus
              />
              <button type="submit" style={{ padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }}>
                Start
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <button onClick={() => { setAuthenticated(false); setAccessToken(null); setChatStarted(false); setDriveLink(''); }} style={{ position: 'absolute', top: 24, right: 32, background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '0.5rem 1.5rem', fontSize: 15, cursor: 'pointer' }}>Log out</button>
          <div style={{
            width: 600,
            background: '#fff',
            borderRadius: 16,
            boxShadow: '0 2px 8px #eee',
            padding: 32,
            minHeight: 340,
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '10vh',
            height: '70vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'center',
            overflow: 'hidden'
          }}>
            <ChatAgent driveLink={driveLink} accessToken={accessToken} files={files} />
          </div>
        </>
      )}
    </div>
  )
}

function ChatAgent({ driveLink, accessToken, files }) {
  const [messages, setMessages] = useState([
    { role: 'system', content: '' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  async function fetchFullFileContent(file) {
    if (!file || !accessToken) return file;
    const content = await fetchFileContent(file, accessToken);
    return { ...file, content };
  }

  async function buildSystemPrompt(userMsg) {
    let requestedFile = null;
    if (userMsg) {
      requestedFile = files.find(f => userMsg.content && f.name && userMsg.content.includes(f.name));
    }
    let filesForPrompt = files;
    if (requestedFile) {
      const fullFile = await fetchFullFileContent(requestedFile);
      filesForPrompt = files.map(f => f.id === fullFile.id ? fullFile : { ...f, content: f.content?.slice(0, 200) });
    } else {
      filesForPrompt = files.map(f => ({ ...f, content: f.content?.slice(0, 200) }));
    }
    return `You are an expert assistant. The user will ask questions about the contents of the Google Drive folder or document at this link: ${driveLink}. Here are the files and summaries of their contents:\n\n${filesForPrompt.map(f => `File: ${f.name}\n${f.content || ''}\n`).join('\n')}\n\nAlways answer as short direct clear and concise as possible, and wherever possible provide citations (file name, or page numbers, or quoted text) for every fact or quote you use. If you are not sure about something do not try to guess. If asked about the entire folder, make sure to be accurate and precise when counting and performing arithemtic.`;
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    const userMsg = { role: 'user', content: input }
    setMessages(msgs => [...msgs, userMsg])
    setInput('')
    setLoading(true)
    const systemPrompt = await buildSystemPrompt(userMsg)
    const chatMsgs = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system'),
      userMsg
    ]
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: chatMsgs,
          temperature: 0.2,
        })
      })
      const data = await res.json()
      const reply = data.choices?.[0]?.message?.content || 'No response.'
      setMessages(msgs => [...msgs, { role: 'assistant', content: reply }])
    } catch {
      setMessages(msgs => [...msgs, { role: 'assistant', content: 'Error contacting OpenAI API.' }])
    }
    setLoading(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      justifyContent: 'flex-end',
    }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        background: '#f7f7fa',
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxHeight: 'calc(70vh - 100px)',
      }}>
        {messages.filter(m => m.role !== 'system').map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? '#e5e7eb' : '#2563eb',
              borderRadius: 18,
              padding: '12px 20px',
              maxWidth: 340,
              fontSize: 16,
              boxShadow: m.role === 'user'
                ? '0 1px 2px rgba(0,0,0,0.01)'
                : '0 2px 8px rgba(37,99,235,0.08)',
              marginBottom: 2,
              wordBreak: 'break-word',
              backgroundColor: m.role === 'user' ? '#e5e7eb' : '#2563eb',
              color: m.role === 'user' ? '#111' : '#fff',
            }}
          >
            {m.content}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, width: '100%' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask a question about your folder..."
          style={{ flex: 1, padding: '0.75rem', fontSize: '1rem', borderRadius: 10, border: '1px solid #ddd' }}
          disabled={loading}
        />
        <button type="submit" style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', borderRadius: 10, border: '1px solid #ddd', background: '#fff' }} disabled={loading}>
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  )
}

export default App
