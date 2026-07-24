import { Component } from 'react';

/**
 * Captura erros de renderização de qualquer página e mostra um fallback,
 * em vez de derrubar o app inteiro (tela branca). Reinicia ao trocar de rota
 * (o pai passa `key={location.pathname}`).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, stack: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log para diagnóstico (aparece no console do usuário/Sentry futuramente)
    console.error('[ErrorBoundary]', error, info?.componentStack);
    this.setState({ stack: info?.componentStack || '' });
  }

  render() {
    if (this.state.hasError) {
      const { error, stack } = this.state;
      return (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', marginTop: '1.5rem' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>⚠️ Algo deu errado</h2>
          <p className="muted" style={{ margin: '0 0 1.25rem' }}>
            Ocorreu um erro inesperado nesta tela. Tente recarregar a página.
          </p>
          <button onClick={() => window.location.reload()}>Recarregar</button>
          <details style={{ marginTop: '1.25rem', textAlign: 'left' }}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: '0.8rem' }}>Detalhes do erro (para reportar)</summary>
            <pre style={{ fontSize: '0.7rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ef4444', marginTop: '0.5rem', maxHeight: 240, overflow: 'auto' }}>
              {String(error?.message || error || 'erro desconhecido')}
              {stack ? `\n${stack}` : ''}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
