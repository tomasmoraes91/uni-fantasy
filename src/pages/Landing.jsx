import { Link } from 'react-router-dom';
import CapitolaLogo from '../components/CapitolaLogo';

// Faz a seção ocupar a largura total da viewport, apesar do .container (max 960px)
const fullBleed = { width: '100vw', marginLeft: 'calc(50% - 50vw)' };

const FEATURES = [
  { icon: '🏅', title: 'Fantasy', desc: 'Monte seu time com os jogadores reais do torneio. Gols, assistências e defesas viram pontos. Escolha seu capitão e fature em dobro.' },
  { icon: '🔮', title: 'Bolão', desc: 'Palpite no placar de cada partida. Acertou o exato? Pontuação cheia. A pontuação cresce conforme avançam as fases.' },
  { icon: '🏆', title: 'Ligas', desc: 'Crie uma liga privada e dispute o ranking só com seus amigos, colegas ou a família. Quem manda mais no fantasy?' },
];

const STEPS = [
  { n: '1', title: 'Crie sua conta', desc: 'Rápido, com Google ou e-mail. De graça.' },
  { n: '2', title: 'Monte seu time', desc: 'Escolha os jogadores e defina o capitão.' },
  { n: '3', title: 'Palpite nos jogos', desc: 'Antes de cada partida começar.' },
  { n: '4', title: 'Suba no ranking', desc: 'A pontuação atualiza a cada resultado.' },
];

export default function Landing() {
  return (
    <div style={{ marginTop: '-1.5rem' /* compensa o padding-top do .container */ }}>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section style={{
        ...fullBleed,
        background: 'linear-gradient(135deg, #16a34a 0%, #0ea5e9 55%, #2563eb 100%)',
        padding: '3.5rem 1.25rem 4rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', maxWidth: 680, margin: '0 auto', zIndex: 1 }}>
          <div style={{ display: 'inline-block', borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem', boxShadow: '0 8px 30px rgba(0,0,0,0.35)' }}>
            <CapitolaLogo height={44} />
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)', lineHeight: 1.1, margin: '0 0 1rem', color: '#fff', letterSpacing: '-0.02em', fontWeight: 800 }}>
            Monte. Palpite. <span style={{ whiteSpace: 'nowrap' }}>Dispute.</span>
          </h1>
          <p style={{ fontSize: 'clamp(1rem, 2.4vw, 1.2rem)', color: 'rgba(255,255,255,0.92)', margin: '0 0 2rem', lineHeight: 1.5 }}>
            O fantasy + bolão do seu campeonato. Monte seu time, dê seus palpites
            e dispute o ranking com seus amigos — tudo num lugar só.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register" style={{
              background: '#fff', color: '#16a34a', fontWeight: 700, padding: '0.85rem 1.6rem',
              borderRadius: 10, fontSize: '1rem', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
            }}>Criar conta grátis →</Link>
            <Link to="/login" style={{
              background: 'rgba(255,255,255,0.12)', color: '#fff', fontWeight: 600, padding: '0.85rem 1.6rem',
              borderRadius: 10, fontSize: '1rem', border: '1px solid rgba(255,255,255,0.5)',
            }}>Entrar</Link>
          </div>
        </div>
      </section>

      {/* ── DESTAQUES ─────────────────────────────────────────── */}
      <section style={{ padding: '3rem 0 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.6rem', margin: '0 0 0.5rem' }}>Três jogos em um</h2>
        <p className="muted" style={{ margin: '0 0 2rem' }}>Acompanhe o torneio do jeito que quiser.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ padding: '1.5rem', textAlign: 'left' }}>
              <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>{f.icon}</div>
              <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.15rem' }}>{f.title}</h3>
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMO FUNCIONA ─────────────────────────────────────── */}
      <section style={{ padding: '2.5rem 0' }}>
        <h2 style={{ fontSize: '1.6rem', margin: '0 0 2rem', textAlign: 'center' }}>Como funciona</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem' }}>
          {STEPS.map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center',
                background: 'linear-gradient(135deg, #22c55e, #2563eb)', color: '#fff', fontWeight: 800,
              }}>{s.n}</div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{s.title}</div>
                <div className="muted" style={{ fontSize: '0.85rem', lineHeight: 1.45 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────────────────── */}
      <section style={{
        ...fullBleed,
        background: 'linear-gradient(135deg, #2563eb 0%, #16a34a 100%)',
        padding: '3rem 1.25rem', textAlign: 'center', marginTop: '1rem',
      }}>
        <h2 style={{ color: '#fff', fontSize: 'clamp(1.5rem, 4vw, 2rem)', margin: '0 0 0.5rem', fontWeight: 800 }}>
          Pronto para entrar em campo?
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.9)', margin: '0 0 1.75rem' }}>
          Crie sua conta grátis e comece a pontuar hoje.
        </p>
        <Link to="/register" style={{
          background: '#fff', color: '#16a34a', fontWeight: 700, padding: '0.9rem 2rem',
          borderRadius: 10, fontSize: '1.05rem', boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        }}>Criar minha conta →</Link>
      </section>

      {/* ── RODAPÉ ────────────────────────────────────────────── */}
      <footer style={{ padding: '2rem 0 0.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', borderRadius: 8, overflow: 'hidden', marginBottom: '0.75rem' }}>
          <CapitolaLogo height={26} />
        </div>
        <div className="muted" style={{ fontSize: '0.8rem' }}>
          Já tem conta? <Link to="/login">Entrar</Link> · © {new Date().getFullYear()} Capitola
        </div>
      </footer>
    </div>
  );
}
