import { onAuthChange, getCurrentUser, loginWithGoogle, loginWithEmail, registerWithEmail, getUserProfile, createUserProfile, addLeagueToProfile } from './auth.js';
import { loadTeam, defaultTeamState } from './state.js';
import { getLeague, joinLeague } from './leagues.js';
import { showToast } from './ui.js';
import { render as renderEquipo }  from './tabs/equipo.js';
import { render as renderMercado } from './tabs/mercado.js';
import { render as renderRanking } from './tabs/ranking.js';
import { render as renderJornada } from './tabs/jornada.js';
import { render as renderPerfil }  from './tabs/perfil.js';
import { render as renderLiga }   from './tabs/liga.js';

window.NET11 = {
  ctx: { user: null, profile: null, league: null, teamState: null },
  activeSlot: null,
  refresh: () => renderCurrentTab(),
  switchTab: (tab) => {
    currentTab = tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    if (btn) btn.classList.add('active');
    renderCurrentTab();
  },
  updateLigaNav: () => updateLigaNav(),
};

let currentTab = 'equipo';
let rankingUnsub = null;

function updateLigaNav() {
  const { user, league } = window.NET11.ctx;
  const btn = document.getElementById('nav-liga');
  if (btn) btn.style.display = (league && user && league.adminUid === user.uid) ? '' : 'none';
}

function renderCurrentTab() {
  if (rankingUnsub) { rankingUnsub(); rankingUnsub = null; }
  const c = document.getElementById('content');
  c.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'fade-in';
  const ctx = window.NET11.ctx;

  if      (currentTab === 'equipo')  renderEquipo(wrap, ctx);
  else if (currentTab === 'mercado') renderMercado(wrap, ctx);
  else if (currentTab === 'ranking') { rankingUnsub = renderRanking(wrap, ctx); }
  else if (currentTab === 'jornada') renderJornada(wrap, ctx).catch(console.error);
  else if (currentTab === 'perfil')  renderPerfil(wrap, ctx);
  else if (currentTab === 'liga')    renderLiga(wrap, ctx).catch(console.error);

  c.appendChild(wrap);
}

window.switchTab = (tab, btn) => {
  currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderCurrentTab();
};

function showLoginModal() {
  document.getElementById('login-modal').classList.remove('hidden');
}
function hideLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}
function showOnboardingModal() {
  document.getElementById('onboarding-modal').classList.remove('hidden');
}
function hideOnboardingModal() {
  document.getElementById('onboarding-modal').classList.add('hidden');
}

document.getElementById('btn-google-login').addEventListener('click', async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
});

document.getElementById('btn-email-login').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  try {
    await loginWithEmail(email, pass);
  } catch (err) {
    document.getElementById('auth-error').textContent = 'Email o contraseña incorrectos';
  }
});

document.getElementById('btn-email-register').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-password').value;
  if (pass.length < 6) {
    document.getElementById('auth-error').textContent = 'La contraseña debe tener al menos 6 caracteres';
    return;
  }
  try {
    await registerWithEmail(email, pass);
  } catch (err) {
    document.getElementById('auth-error').textContent = 'Error al registrar: ' + err.message;
  }
});

document.getElementById('btn-onboarding-save').addEventListener('click', async () => {
  const name = document.getElementById('onboarding-team-name').value.trim();
  if (!name) {
    document.getElementById('onboarding-error').textContent = 'Introduce un nombre para tu equipo';
    return;
  }
  const user = getCurrentUser();
  try {
    const profile = await createUserProfile(user.uid, user.displayName || user.email, name);
    window.NET11.ctx.profile = profile;
    hideOnboardingModal();
    renderCurrentTab();
    showToast('¡Bienvenido a Net11! 🎉');
  } catch (err) {
    document.getElementById('onboarding-error').textContent = 'Error al guardar. Inténtalo de nuevo.';
  }
});

function getJoinCodeFromUrl() {
  const match = window.location.pathname.match(/^\/join\/([A-Z0-9-]+)$/i);
  return match ? match[1].toUpperCase() : null;
}

async function handleJoinFromUrl(code) {
  const user    = getCurrentUser();
  const profile = window.NET11.ctx.profile;
  if (!user || !profile) return;
  try {
    const league = await joinLeague(code, user.uid, profile.teamName);
    await addLeagueToProfile(user.uid, code);
    window.NET11.ctx.league    = league;
    window.NET11.ctx.teamState = defaultTeamState(league.competition);
    window.history.replaceState({}, '', '/');
    showToast(`✅ Te uniste a "${league.name}"`);
    updateLigaNav();
    renderCurrentTab();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

onAuthChange(async (user) => {
  window.NET11.ctx.user = user;

  if (!user) {
    window.NET11.ctx = { user: null, profile: null, league: null, teamState: null };
    showLoginModal();
    updateLigaNav();
    renderCurrentTab();
    return;
  }

  hideLoginModal();
  const profile = await getUserProfile(user.uid);

  if (!profile) {
    showOnboardingModal();
    return;
  }

  window.NET11.ctx.profile = profile;

  if (profile.leagues && profile.leagues.length > 0) {
    const leagueCode = profile.leagues[0];
    const league     = await getLeague(leagueCode);
    if (league) {
      window.NET11.ctx.league    = league;
      window.NET11.ctx.teamState = await loadTeam(user.uid, leagueCode, league.competition);
    }
  }

  const joinCode = getJoinCodeFromUrl();
  if (joinCode) {
    await handleJoinFromUrl(joinCode);
    return;
  }

  updateLigaNav();
  renderCurrentTab();
  showToast('☁️ Sesión activa', 'success');
});

let _deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstall = e;
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'visible';
  banner.innerHTML = `
    <div class="ib-text">
      <strong>📲 Instalar Net11</strong>
      <span>Añade la app a tu pantalla de inicio</span>
    </div>
    <button class="ib-btn" id="btn-install-pwa">Instalar</button>
    <button class="ib-close" id="btn-install-close">✕</button>`;
  document.body.appendChild(banner);
  document.getElementById('btn-install-pwa').onclick = () => {
    _deferredInstall.prompt();
    _deferredInstall.userChoice.then(() => { _deferredInstall = null; banner.remove(); });
  };
  document.getElementById('btn-install-close').onclick = () => banner.remove();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
  });
}

renderCurrentTab();
