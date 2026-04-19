export async function render(wrap, ctx) {
  if (!ctx.league || ctx.league.adminUid !== ctx.user?.uid) {
    wrap.innerHTML = '<div style="padding:24px;color:var(--muted)">Acceso restringido.</div>';
    return;
  }
  wrap.innerHTML = '<div style="padding:24px;color:var(--muted)">⚙️ Panel de admin cargando...</div>';
}
