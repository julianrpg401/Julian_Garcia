const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Menu: a real button opens the side drawer on tablet and mobile.
// Escape, the overlay and any link close it, and Tab stays inside while it is open.
const cabeza = document.querySelector('.cabeza');
const botonMenu = document.querySelector('.cabeza__barra');
const menu = document.getElementById('menu-principal');
const modoCajon = window.matchMedia('(max-width: 1024px)');

const menuAbierto = () => cabeza.classList.contains('cabeza--abierta');

const abrirMenu = ({ desdeTeclado }) => {
    cabeza.classList.add('cabeza--abierta');
    cabeza.classList.remove('cabeza--oculta');
    botonMenu.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    // Keyboard users land on the first option; touch and mouse users get no focus ring
    if (desdeTeclado) menu.querySelector('.opcion__enlace').focus();
};

const cerrarMenu = ({ devolverFoco = true } = {}) => {
    if (!menuAbierto()) return;
    cabeza.classList.remove('cabeza--abierta');
    botonMenu.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (devolverFoco) botonMenu.focus();
};

botonMenu.addEventListener('click', e => abrirMenu({ desdeTeclado: e.detail === 0 }));
document.querySelector('.cabeza__cerrar').addEventListener('click', () => cerrarMenu());
document.querySelector('.cabeza__overlay').addEventListener('click', () => cerrarMenu());
menu.querySelectorAll('a[href^="#"]').forEach(enlace => {
    enlace.addEventListener('click', () => cerrarMenu({ devolverFoco: false }));
});
modoCajon.addEventListener('change', () => cerrarMenu({ devolverFoco: false }));

document.addEventListener('keydown', e => {
    if (!menuAbierto()) return;
    if (e.key === 'Escape') {
        cerrarMenu();
    } else if (e.key === 'Tab') {
        const enfocables = [...menu.querySelectorAll('a, button')];
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
            e.preventDefault();
            ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primero.focus();
        }
    }
});

// Active section: highlights its link and slides a single underline under it.
// "Contacto" is a button, so it gets a filled state instead of the underline.
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.opcion__enlace');
const indicador = document.querySelector('.navbar__indicador');
const ctaContacto = document.querySelector('.navbar__cta');
let seccionActual = null;

const moverIndicador = () => {
    const activo = document.querySelector('.opcion__enlace--activo');
    if (!activo || modoCajon.matches) {
        indicador.style.opacity = 0;
        return;
    }
    const relleno = parseFloat(getComputedStyle(activo).paddingLeft);
    indicador.style.width = `${activo.offsetWidth - relleno * 2}px`;
    indicador.style.transform = `translateX(${activo.offsetLeft + relleno}px)`;
    indicador.style.opacity = 1;
};

const activateLink = () => {
    let current = '';
    sections.forEach(section => {
        if (window.scrollY >= section.offsetTop - 120) current = section.id;
    });
    // At the very bottom the last section may never reach the top of the screen
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = sections[sections.length - 1].id;
    }
    if (current === seccionActual) return;
    seccionActual = current;

    navLinks.forEach(link => {
        link.classList.toggle('opcion__enlace--activo', link.getAttribute('href') === `#${current}`);
    });
    ctaContacto.classList.toggle('navbar__cta--activo', current === 'contacto');
    moverIndicador();
};

// Header: compact after the hero; on tablet and mobile it hides while scrolling
// down and comes back as soon as the user scrolls up.
const seccionHero = document.querySelector('.seccion__hero');
let ultimoY = window.scrollY;

const alHacerScroll = () => {
    const y = window.scrollY;
    activateLink();
    cabeza.classList.toggle('cabeza--compacta', y > seccionHero.offsetHeight - 120);

    if (!modoCajon.matches || menuAbierto() || y < 160) {
        cabeza.classList.remove('cabeza--oculta');
        ultimoY = y;
    } else if (Math.abs(y - ultimoY) > 8) {
        cabeza.classList.toggle('cabeza--oculta', y > ultimoY);
        ultimoY = y;
    }
};

window.addEventListener('scroll', alHacerScroll, { passive: true });
window.addEventListener('resize', moverIndicador);
document.fonts.ready.then(moverIndicador);
alHacerScroll();

// Scroll-reveal: add .visible class when elements enter the viewport.
// Siblings get a staggered delay so grids appear one card after another.
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

const revelables = '.seccion, .trabajo, .app__card, .exp__card, .paso, .grupo, .timeline__item';
document.querySelectorAll(revelables).forEach(el => {
    if (!el.matches('.seccion')) {
        const hermanos = [...el.parentElement.children].filter(h => h.matches(revelables));
        el.style.setProperty('--retraso', `${Math.min(hermanos.indexOf(el), 5) * 90}ms`);
    }
    el.classList.add('fade-in');
    observer.observe(el);
});

// Hero: rotating role with a typewriter effect
const rolTexto = document.querySelector('.rol__texto');

if (rolTexto && !reducirMovimiento) {
    const roles = JSON.parse(rolTexto.dataset.roles);
    let indice = 0;
    let letras = roles[0].length;
    let borrando = true;

    const escribir = () => {
        letras += borrando ? -1 : 1;
        rolTexto.textContent = roles[indice].slice(0, letras);

        let espera = borrando ? 35 : 80;
        if (!borrando && letras === roles[indice].length) {
            borrando = true;
            espera = 2200;
        } else if (borrando && letras === 0) {
            borrando = false;
            indice = (indice + 1) % roles.length;
            espera = 350;
        }
        setTimeout(escribir, espera);
    };

    setTimeout(escribir, 2600);
}

// Hero: count up the stats the first time they become visible
const separarMiles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const animarContador = el => {
    const meta = Number(el.dataset.count);
    const prefijo = el.dataset.prefijo || '';
    const sufijo = el.dataset.sufijo || '';
    const duracion = 1600;
    const inicio = performance.now();

    const avanzar = ahora => {
        const t = Math.min((ahora - inicio) / duracion, 1);
        const suavizado = 1 - Math.pow(1 - t, 3);
        el.textContent = prefijo + separarMiles(Math.round(meta * suavizado)) + sufijo;
        if (t < 1) requestAnimationFrame(avanzar);
    };
    requestAnimationFrame(avanzar);
};

if (!reducirMovimiento) {
    const observadorStats = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animarContador(entry.target);
                observadorStats.unobserve(entry.target);
            }
        });
    }, { threshold: 0.6 });

    document.querySelectorAll('.stat__numero[data-count]').forEach(el => observadorStats.observe(el));
}

// Hero: dot field around the avatar. A slow ripple runs outward (echoing the
// particle wave of the background video) and the dots near the pointer move
// away and turn violet, the same color every box uses on hover.
const lienzo = document.querySelector('.foto__puntos');

if (lienzo) {
    const ctx = lienzo.getContext('2d');
    const marco = document.querySelector('.foto__marco');
    const hero = document.querySelector('.seccion__hero');
    const TEAL = [82, 199, 160];
    const VIOLETA = [158, 140, 255];
    const ALCANCE = 95;

    let puntos = [];
    let centro = 0;
    let radioExterior = 0;
    let radioInterior = 0;
    const puntero = { x: 0, y: 0, suaveX: 0, suaveY: 0, fuerza: 0, fuerzaObjetivo: 0 };
    let enPantalla = true;

    const construir = () => {
        const lado = lienzo.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        lienzo.width = lado * dpr;
        lienzo.height = lado * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        centro = lado / 2;
        radioExterior = centro - 4;
        radioInterior = marco.offsetWidth / 2 + 16;
        const paso = lado > 380 ? 13 : 11;

        puntos = [];
        for (let r = radioInterior; r <= radioExterior; r += paso) {
            const cantidad = Math.floor((2 * Math.PI * r) / paso);
            const desfase = Math.random() * Math.PI;
            for (let i = 0; i < cantidad; i++) {
                const a = desfase + (i / cantidad) * Math.PI * 2;
                puntos.push({ a, r, x: centro + Math.cos(a) * r, y: centro + Math.sin(a) * r });
            }
        }
        dibujar(0);
    };

    const dibujar = t => {
        const lado = lienzo.clientWidth;
        ctx.clearRect(0, 0, lado, lado);

        puntero.suaveX += (puntero.x - puntero.suaveX) * 0.12;
        puntero.suaveY += (puntero.y - puntero.suaveY) * 0.12;
        puntero.fuerza += (puntero.fuerzaObjetivo - puntero.fuerza) * 0.08;

        for (const p of puntos) {
            const onda = Math.sin(p.r * 0.055 - t * 1.5 + Math.sin(p.a * 3 + t * 0.35) * 0.9) * 0.5 + 0.5;
            const borde = 1 - Math.pow((p.r - radioInterior) / (radioExterior - radioInterior), 2) * 0.75;

            const dx = p.x - puntero.suaveX;
            const dy = p.y - puntero.suaveY;
            const distancia = Math.hypot(dx, dy);
            const cerca = distancia < ALCANCE ? Math.pow(1 - distancia / ALCANCE, 2) * puntero.fuerza : 0;
            const empuje = cerca * 14;
            const x = p.x + (distancia ? (dx / distancia) * empuje : 0);
            const y = p.y + (distancia ? (dy / distancia) * empuje : 0);

            const color = TEAL.map((c, k) => Math.round(c + (VIOLETA[k] - c) * cerca));
            const alfa = (0.22 + onda * 0.68) * borde + cerca * 0.5;
            const radio = 0.9 + onda * 1.5 * borde + cerca * 1.6;

            ctx.beginPath();
            ctx.arc(x, y, radio, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${Math.min(alfa, 1)})`;
            ctx.fill();
        }
    };

    const animar = ahora => {
        if (enPantalla) dibujar(ahora / 1000);
        requestAnimationFrame(animar);
    };

    construir();
    new ResizeObserver(construir).observe(lienzo);

    if (!reducirMovimiento) {
        hero.addEventListener('pointermove', e => {
            const caja = lienzo.getBoundingClientRect();
            puntero.x = e.clientX - caja.left;
            puntero.y = e.clientY - caja.top;
            // On (re)entry, jump to the pointer instead of sweeping across the field
            if (puntero.fuerza < 0.05) {
                puntero.suaveX = puntero.x;
                puntero.suaveY = puntero.y;
            }
            puntero.fuerzaObjetivo = 1;
        });
        hero.addEventListener('pointerleave', () => { puntero.fuerzaObjetivo = 0; });
        new IntersectionObserver(([entrada]) => { enPantalla = entrada.isIntersecting; }).observe(lienzo);
        requestAnimationFrame(animar);
    }
}
