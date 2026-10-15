/*
 * Campo de puntos compartido: el anillo que rodea al avatar (scripts.js) y el de la bienvenida
 * (bienvenida.js) se dibujan con estas mismas reglas, asi se ven y reaccionan igual.
 *
 *   - Una onda lenta corre hacia afuera, como eco de la ola de particulas del video de fondo.
 *   - Los puntos cerca del puntero se apartan y se vuelven violeta, el color de toda interaccion.
 *   - Un clic lanza una onda expansiva desde ese punto (Puntos.pulso), con el mismo empuje y el mismo violeta.
 *
 *   const puntero = Puntos.puntero();
 *   Puntos.seguir(zona, lienzo, puntero);   // escucha el puntero sobre «zona», en coordenadas del lienzo
 *   Puntos.avanzar(puntero);                 // una vez por cuadro, antes de dibujar
 *   Puntos.pulso(puntero, x, y);             // onda expansiva desde (x, y), en coordenadas del lienzo
 *   Puntos.dibujar(pincel, x, y, r, a, t, borde, puntero, tenue);
 *   Puntos.borde(r, radioInterior, radioExterior)   // 1 en el anillo interior, mas tenue hacia afuera
 */
window.Puntos = (() => {
    const TEAL = [82, 199, 160];
    const VIOLETA = [158, 140, 255];
    const ALCANCE = 95;
    const EMPUJE = 14;
    const PULSO_MS = 900;        // vida de una onda expansiva
    const PULSO_VELOCIDAD = 0.45; // pixeles por milisegundo
    const PULSO_GROSOR = 34;

    const puntero = () => ({ x: 0, y: 0, suaveX: 0, suaveY: 0, fuerza: 0, fuerzaObjetivo: 0, pulsos: [], ahora: 0 });

    function pulso(p, x, y) {
        p.pulsos.push({ x, y, inicio: performance.now() });
    }

    function seguir(zona, lienzo, p) {
        zona.addEventListener('pointermove', e => {
            const caja = lienzo.getBoundingClientRect();
            p.x = e.clientX - caja.left;
            p.y = e.clientY - caja.top;
            // Al (re)entrar salta al puntero en vez de barrer el campo de lado a lado
            if (p.fuerza < 0.05) {
                p.suaveX = p.x;
                p.suaveY = p.y;
            }
            p.fuerzaObjetivo = 1;
        });
        zona.addEventListener('pointerleave', () => { p.fuerzaObjetivo = 0; });
    }

    function avanzar(p) {
        p.suaveX += (p.x - p.suaveX) * 0.12;
        p.suaveY += (p.y - p.suaveY) * 0.12;
        p.fuerza += (p.fuerzaObjetivo - p.fuerza) * 0.08;
        p.ahora = performance.now();
        p.pulsos = p.pulsos.filter(pu => p.ahora - pu.inicio < PULSO_MS);
    }

    const borde = (r, radioInterior, radioExterior) =>
        1 - Math.pow((r - radioInterior) / (radioExterior - radioInterior), 2) * 0.75;

    /** Dibuja un punto que en reposo esta en (x, y), a radio «r» y angulo «a» del centro de su anillo. */
    function dibujar(pincel, x, y, r, a, t, bordePunto, p, tenue = 1) {
        const onda = Math.sin(r * 0.055 - t * 1.5 + Math.sin(a * 3 + t * 0.35) * 0.9) * 0.5 + 0.5;

        const dx = x - p.suaveX;
        const dy = y - p.suaveY;
        const distancia = Math.hypot(dx, dy);
        let cerca = distancia < ALCANCE ? Math.pow(1 - distancia / ALCANCE, 2) * p.fuerza : 0;
        let px = x + (distancia ? (dx / distancia) * cerca * EMPUJE : 0);
        let py = y + (distancia ? (dy / distancia) * cerca * EMPUJE : 0);

        // Ondas expansivas: el frente empuja los puntos hacia afuera y los enciende en violeta
        for (const pu of p.pulsos) {
            const edad = p.ahora - pu.inicio;
            const ex = x - pu.x;
            const ey = y - pu.y;
            const d = Math.hypot(ex, ey);
            const banda = 1 - Math.abs(d - edad * PULSO_VELOCIDAD) / PULSO_GROSOR;
            if (banda <= 0 || !d) continue;
            const golpe = banda * (1 - edad / PULSO_MS);
            px += (ex / d) * golpe * 12;
            py += (ey / d) * golpe * 12;
            cerca = Math.max(cerca, golpe);
        }

        const color = TEAL.map((c, k) => Math.round(c + (VIOLETA[k] - c) * cerca));
        const alfa = ((0.22 + onda * 0.68) * bordePunto + cerca * 0.5) * tenue;
        const radio = 0.9 + onda * 1.5 * bordePunto + cerca * 1.6;

        pincel.beginPath();
        pincel.arc(px, py, radio, 0, Math.PI * 2);
        pincel.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.min(alfa, 1)})`;
        pincel.fill();
    }

    return { puntero, seguir, avanzar, borde, dibujar, pulso };
})();
