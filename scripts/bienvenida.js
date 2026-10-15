/*
 * Bienvenida: la primera visita de la sesion abre con una intro antes de mostrar la pagina.
 *
 *   1. Espera: una cinta de puntos ondula como la ola del video de fondo, en silencio, y abajo estan
 *      «Entrar con sonido» y «Entrar sin sonido». Se elige primero porque el navegador no deja sonar
 *      nada antes de un clic, un toque o una tecla.
 *   2. Forma: al elegir, la ola se enrolla en el anillo (el mismo motivo del avatar, ver puntos.js) y
 *      aparece el logo. Con sonido, Sonido.activar({ inicio }) programa la ola, la musica de bienvenida
 *      al cerrarse el anillo y el respiro de la salida con estos mismos tiempos.
 *   3. Salida: el anillo se expande y la pagina aparece debajo. Una tecla, o un clic fuera de los puntos,
 *      durante 2 y 3 la adelanta.
 *   Un clic sobre la ola o el anillo lanza una onda expansiva en los puntos y un sonido de ferrofluido
 *   (Sonido.ferro); pasar el cursor sobre ellos tambien suena (Sonido.seguirFerro). El clic sobre la ola,
 *   antes de elegir, suena aunque aun no se haya activado el sonido.
 *
 *   El script en linea del <head> pone la clase «bienvenida-activa» en <html> antes de pintar si
 *   sessionStorage["bienvenida"] no dice «vista»; el CSS oculta entonces la pagina y no hay destello.
 *   Ese mismo script quita la clase a los 4 s si este archivo no llega a cargar.
 *   Enter entra con sonido y Esc sin sonido. Con «reducir movimiento» no hay animacion: el anillo y el
 *   logo se ven quietos y al elegir se entra directo.
 */
window.Bienvenida = (() => {
    const html = document.documentElement;
    if (!html.classList.contains('bienvenida-activa')) return { activa: () => false };

    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FORMA_MS = 1000;      // de la ola al anillo
    const PAUSA_MS = 3600;      // anillo y nombre en pantalla antes de salir
    const SALIDA_MS = 700;      // el anillo se expande
    const FILAS = 6;
    const puntero = Puntos.puntero();
    let activa = true;

    const capa = document.createElement('div');
    capa.className = 'bienvenida';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-labelledby', 'bienvenida-titulo');
    capa.innerHTML = `
        <canvas class="bienvenida__puntos" aria-hidden="true"></canvas>
        <div class="bienvenida__centro">
            <div class="bienvenida__anillo">
                <img src="assets/img/logo-julian.svg" alt="" class="bienvenida__logo">
            </div>
            <h2 id="bienvenida-titulo" class="sr-only">Portafolio de Julian Garcia</h2>
            <p class="bienvenida__lema">Arquitectura de software y desarrollo full stack</p>
            <div class="bienvenida__acciones">
                <button type="button" class="btn btn--primario" data-sonido="activado"><i class="fa-solid fa-volume-high" aria-hidden="true"></i> Entrar con sonido</button>
                <button type="button" class="btn btn--secundario" data-sonido="silencio">Entrar sin sonido</button>
            </div>
            <p class="bienvenida__ayuda" aria-hidden="true"><kbd>Enter</kbd> con sonido <kbd>Esc</kbd> sin sonido</p>
        </div>`;
    document.body.appendChild(capa);

    const lienzo = capa.querySelector('.bienvenida__puntos');
    const pincel = lienzo.getContext('2d');
    const anillo = capa.querySelector('.bienvenida__anillo');
    const botones = [...capa.querySelectorAll('.bienvenida__acciones button')];

    // ── Geometria: anillos de puntos alrededor del logo ──────────────
    let ancho = 0, alto = 0, centroX = 0, centroY = 0, radio = 0, radioExterior = 0;
    let puntos = [];

    function medir() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ancho = window.innerWidth;
        alto = window.innerHeight;
        lienzo.width = ancho * dpr;
        lienzo.height = alto * dpr;
        pincel.setTransform(dpr, 0, 0, dpr, 0, 0);

        radio = Math.max(105, Math.min(ancho * 0.3, alto * 0.22, 175));
        const paso = radio > 140 ? 13 : 11;
        radioExterior = radio + (FILAS - 1) * paso;
        capa.style.setProperty('--anillo', `${Math.round((radioExterior + 16) * 2)}px`);
        capa.style.setProperty('--interior', `${Math.round(radio * 2)}px`);
        const caja = anillo.getBoundingClientRect();
        centroX = caja.left + caja.width / 2;
        centroY = caja.top + caja.height / 2;

        puntos = [];
        for (let fila = 0; fila < FILAS; fila++) {
            const r = radio + fila * paso;
            const cantidad = Math.floor((2 * Math.PI * r) / paso);
            for (let i = 0; i < cantidad; i++) {
                // El angulo arranca a la izquierda para que la ola, leida de izquierda a derecha, se enrolle
                const a = Math.PI + (i / cantidad) * Math.PI * 2;
                puntos.push({ a, r, fila, avance: i / cantidad, azar: Math.random(), borde: Puntos.borde(r, radio, radioExterior) });
            }
        }
    }

    const suave = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

    /** Posicion en la ola: una cinta de seis filas que cruza la pantalla y ondula. */
    function enOla(p, t) {
        const x = -60 + p.avance * (ancho + 120);
        const y = alto * 0.5 + Math.sin(x * 0.006 + t * 1.8 + p.fila * 0.45) * alto * 0.12 + (p.fila - (FILAS - 1) / 2) * 11;
        return [x, y];
    }

    /** Dibuja un cuadro. «forma» va de 0 (ola) a 1 (anillo); «escala» y «tenue» sirven para la salida. */
    function dibujar(t, forma, escala = 1, tenue = 1) {
        pincel.clearRect(0, 0, ancho, alto);
        Puntos.avanzar(puntero);
        const mezcla = suave(Math.min(Math.max(forma, 0), 1));
        for (const p of puntos) {
            const r = p.r * escala;
            const ax = centroX + Math.cos(p.a) * r;
            const ay = centroY + Math.sin(p.a) * r;
            let x = ax, y = ay;
            if (mezcla < 1) {
                const [ox, oy] = enOla(p, t);
                // Cada punto sale un poco antes o despues: la ola se enrolla en vez de saltar
                const propio = suave(Math.min(Math.max((mezcla - p.azar * 0.25) / 0.75, 0), 1));
                x = ox + (ax - ox) * propio;
                y = oy + (ay - oy) * propio;
            }
            Puntos.dibujar(pincel, x, y, p.r, p.a, t, p.borde, puntero, tenue);
        }
    }

    // ── Linea de tiempo ──────────────────────────────────────────────
    const inicio = performance.now();
    let eleccion = null;   // momento en que el visitante eligio
    let salida = null;     // momento en que empezo la salida
    let rafId = 0;

    function cuadro(ahora) {
        const t = (ahora - inicio) / 1000;
        if (salida !== null) {
            const p = Math.min((ahora - salida) / SALIDA_MS, 1);
            dibujar(t, 1, 1 + Math.pow(p, 2) * 5, 1 - p);
            if (p >= 1) { quitar(); return; }
        } else if (eleccion !== null) {
            const ms = ahora - eleccion;
            dibujar(t, ms / FORMA_MS);
            if (ms >= FORMA_MS + PAUSA_MS) salir();
        } else {
            dibujar(t, 0);
        }
        rafId = requestAnimationFrame(cuadro);
    }

    function elegir(modo) {
        if (eleccion !== null || !activa) return;
        eleccion = performance.now();
        if (window.Sonido) {
            if (modo === 'activado') {
                // Los sonidos de la intro siguen estos mismos tiempos (en segundos desde el clic)
                Sonido.activar({ inicio: reducir ? { anillo: 0, salida: 0 } : { anillo: FORMA_MS / 1000, salida: (FORMA_MS + PAUSA_MS) / 1000 } });
            } else {
                Sonido.silenciar({ conEfecto: false });
            }
        }
        try { sessionStorage.setItem('bienvenida', 'vista'); } catch (e) { /* se vera en cada carga */ }
        capa.classList.add('bienvenida--forma');
        // El foco no puede quedarse en un boton que se esta ocultando
        capa.setAttribute('tabindex', '-1');
        capa.focus({ preventScroll: true });
        if (reducir) salir();
    }

    function salir() {
        if (salida !== null) return;
        activa = false;
        window.removeEventListener('keydown', alTeclear, true);
        window.removeEventListener('resize', alRedimensionar);
        // La pagina aparece debajo mientras la capa se desvanece y el anillo se expande
        html.classList.remove('bienvenida-activa');
        capa.classList.add('saliendo');
        if (reducir) { quitar(); return; }
        salida = performance.now();
    }

    function quitar() {
        cancelAnimationFrame(rafId);
        capa.remove();
        document.dispatchEvent(new CustomEvent('bienvenida:fin'));
    }

    function alTeclear(e) {
        if (eleccion !== null) {
            // Durante la animacion, cualquier tecla la adelanta
            e.preventDefault();
            salir();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            elegir('silencio');
        } else if (e.key === 'Enter' && !e.target.closest('.bienvenida button')) {
            e.preventDefault();
            elegir('activado');
        } else if (e.key === 'Tab') {
            // El foco no sale de los dos botones
            e.preventDefault();
            const i = botones.indexOf(document.activeElement);
            botones[(i + (e.shiftKey ? -1 : 1) + botones.length) % botones.length].focus();
        }
    }

    function alRedimensionar() {
        medir();
        if (reducir) dibujar(0, 1);
    }

    /** ¿El puntero esta sobre los puntos? Antes de elegir, sobre la ola; despues, sobre el anillo. */
    function sobrePuntos(x, y) {
        if (eleccion === null) {
            const t = (performance.now() - inicio) / 1000;
            const centroOla = alto * 0.5 + Math.sin(x * 0.006 + t * 1.8 + 1.1) * alto * 0.12;
            // La cinta ocupa unos ±28 px y se mueve rapido: margen generoso para que se pueda atrapar
            return Math.abs(y - centroOla) < 65;
        }
        const d = Math.hypot(x - centroX, y - centroY);
        return d > radio - 25 && d < radioExterior + 25;
    }

    botones.forEach(b => b.addEventListener('click', () => elegir(b.dataset.sonido)));
    capa.addEventListener('pointerdown', e => {
        if (e.target.closest('button') || salida !== null) return;
        if (sobrePuntos(e.clientX, e.clientY)) {
            Puntos.pulso(puntero, e.clientX, e.clientY);
            window.Sonido?.ferro({ tipo: 'clic', paneo: (e.clientX / ancho) * 1.2 - 0.6, forzar: eleccion === null });
        } else if (eleccion !== null) {
            // Un clic fuera de los puntos durante la animacion la adelanta
            salir();
        }
    });
    // Pasar el cursor sobre los puntos tambien suena, y la mano indica que se pueden tocar
    window.Sonido?.seguirFerro(capa,
        e => salida === null && !e.target.closest('button') && sobrePuntos(e.clientX, e.clientY),
        e => (e.clientX / ancho) * 1.2 - 0.6);
    window.addEventListener('keydown', alTeclear, true);
    window.addEventListener('resize', alRedimensionar);

    medir();
    // Las fuentes pueden mover el centro unos pixeles al cargar
    document.fonts?.ready.then(() => { if (activa) alRedimensionar(); });

    // Foco en «con sonido» (Enter lo elige), salvo que el visitante ya haya elegido silencio antes.
    // En pantallas tactiles no se enfoca: no hay teclado y el contorno de foco solo estorba.
    if (window.matchMedia('(hover: hover)').matches) {
        let preferida = 'activado';
        try { if (localStorage.getItem('sonido') === 'silencio') preferida = 'silencio'; } catch (e) { /* sin almacenamiento */ }
        capa.querySelector(`[data-sonido="${preferida}"]`).focus({ preventScroll: true });
    }

    if (reducir) {
        capa.classList.add('bienvenida--quieta');
        dibujar(0, 1);
    } else {
        Puntos.seguir(capa, lienzo, puntero);
        rafId = requestAnimationFrame(cuadro);
    }

    return { activa: () => activa };
})();
