# Fix: autorización de login / más tiempo (QuotaExceeded)

## Qué fallaba

Al aprobar «Más tiempo» (PIN admin + 2–12 h) en el celular, aparecía:

> Failed to execute 'setItem' on 'Storage': Setting the value of `pos3b_autorizacion_turno_fh` exceeded the quota.

El `localStorage` del dispositivo del admin estaba lleno. El código guardaba **primero en local** y, al fallar `setItem`, **abortaba antes de escribir en la nube** — así que el empleado no quedaba autorizado.

## Qué corrige

Archivos a copiar a `aba3bs-arch/pos3b`:

- `src/lib/autorizacionTurnoFueraHorario.js`
- `src/components/AlertaExtensionTurnoOverlay.jsx`

Cambios:

1. Guarda primero en **nube** (`pos_autorizacion_turno_fh`).
2. El local ya **no tumba** la aprobación si hay cuota llena (poda, libera temporales y reintenta).
3. Mensaje claro en el overlay si aún hay problema de storage.
4. El empleado sigue pudiendo entrar porque al login sincroniza desde la nube.

También en `patches/login-autorizacion-quota/`.
