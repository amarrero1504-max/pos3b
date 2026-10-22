# Fix: autorización de login / más tiempo (QuotaExceeded)

## Qué fallaba

Al aprobar «Más tiempo» (PIN admin + 2–12 h):

> Failed to execute 'setItem' on 'Storage': Setting the value of `pos3b_autorizacion_turno_fh` exceeded the quota.

Causa: `localStorage` lleno en el celular del admin. El código guardaba **primero en local** y abortaba **antes de la nube**.

## Fix (v2)

1. Guarda primero en **nube** (`pos_autorizacion_turno_fh`).
2. Usa **caché en memoria** además de localStorage → aunque el storage esté lleno, la auth vale en la sesión.
3. `localStorage.setItem` es best-effort y **nunca lanza**.
4. `aprobarExtensionTurnoConPin` atrapa QuotaExceeded y igual marca la solicitud aprobada.
5. Overlay con mensaje claro.

### Archivos a copiar a `aba3bs-arch/pos3b` (producción Netlify)

- `src/lib/autorizacionTurnoFueraHorario.js`
- `src/lib/solicitudExtensionTurno.js`
- `src/components/AlertaExtensionTurnoOverlay.jsx`

También en `patches/login-autorizacion-quota/`.

**Importante:** este espejo no puede pushear a `aba3bs-arch/pos3b`. Relanza el Cloud Agent apuntando a ese repo, o copia/pega los 3 archivos y despliega.
