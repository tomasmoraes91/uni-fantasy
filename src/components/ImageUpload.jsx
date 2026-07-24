import { useRef, useState, useEffect } from 'react';

/**
 * ImageUpload — upload com preview imediato.
 * Corrigido: sincroniza currentUrl quando a prop muda externamente.
 * Props: currentUrl, onUpload(file)=>Promise<string>, label, size, shape
 */
export default function ImageUpload({ currentUrl, onUpload, label = 'imagem', size = 48, shape = 'circle' }) {
  const [preview, setPreview] = useState(currentUrl || null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const inputRef = useRef();

  // Sincroniza se a URL mudar por fora (ex: reload da lista)
  useEffect(() => { setPreview(currentUrl || null); }, [currentUrl]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // permite re-upload do mesmo arquivo

    if (file.size > 2 * 1024 * 1024) { setError('Máximo 2MB.'); return; }
    if (!file.type.startsWith('image/')) { setError('Somente imagens.'); return; }

    setPreview(URL.createObjectURL(file)); // preview imediato
    setLoading(true);
    setError(null);
    try {
      const url = await onUpload(file);
      setPreview(url);
    } catch (err) {
      setError(err.message);
      setPreview(currentUrl || null);
    } finally {
      setLoading(false);
    }
  };

  const radius = shape === 'square' ? '8px' : '50%';

  return (
    <div className="img-upload-wrapper" style={{ '--sz': size + 'px' }}>
      <div
        className={`img-upload-circle ${loading ? 'loading' : ''}`}
        style={{ borderRadius: radius }}
        onClick={() => !loading && inputRef.current?.click()}
        title={`Clique para ${preview ? 'alterar' : 'adicionar'} ${label}`}
      >
        {preview
          ? <img src={preview} alt={label} className="img-upload-img" style={{ borderRadius: radius }} />
          : <span className="img-upload-placeholder">{shape === 'square' ? '🛡️' : '📷'}</span>}
        {loading && <div className="img-upload-spinner" />}
        {!loading && <div className="img-upload-edit-overlay">✎</div>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
      {error && <div className="error" style={{ fontSize:'0.72rem', marginTop:3 }}>{error}</div>}
    </div>
  );
}
