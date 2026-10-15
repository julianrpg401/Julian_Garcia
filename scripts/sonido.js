/*
 * Sonido del portafolio. Todo se sintetiza en vivo con Web Audio, sin archivos.
 *
 *   - Ambiente generativo calmado y consonante, en la linea de la musica de seleccion de perfil de la PS5:
 *     triadas mayores que cambian por fundido, un arpegio de cristal, una voz que planea entre notas y una
 *     reverberacion larga.
 *   - Efectos de interfaz: clic en enlaces y botones, hover en tarjetas y chips, abrir y cerrar el menu y
 *     cambiar de seccion. Son burbujas y gotas suaves afinadas con el acorde que suena en ese momento.
 *   - Arranca en silencio. La eleccion se guarda en localStorage["sonido"] ("activado" | "silencio").
 *     El navegador solo deja sonar despues de un clic, una tecla o un toque: si el sonido quedo activado
 *     de antes, arranca con el primer gesto. Con la pestana oculta el audio se suspende.
 *
 *   Sonido.activar({ inicio, silencioso })  Sonido.silenciar({ conEfecto })  Sonido.activo()
 *     «inicio» = { anillo, salida }: segundos desde el clic en que la intro cierra el anillo y sale.
 *   Sonido.ferro({ tipo, paneo, intensidad, forzar })  ferrofluido sobre la ola o los anillos de puntos.
 *     «forzar» lo deja sonar aunque aun no se haya elegido sonido (la ola de la intro, antes de los botones).
 *   Sonido.seguirFerro(zona, estaSobre, paneoDe)  ferrofluido al entrar y moverse sobre los puntos.
 *   Sonido.efecto(nombre, { indice })
 */
window.Sonido = (() => {
    const CLAVE = 'sonido';
    const VOLUMEN = 0.5;
    const VOLUMEN_AMBIENTE = 0.15;
    const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
    const azar = (min, max) => min + Math.random() * (max - min);
    const elegir = lista => lista[Math.floor(Math.random() * lista.length)];

    // Progresion del ambiente en Re mayor: Re, Si menor, Sol, La. Solo triadas en el pad (nada de septimas
    // ni novenas: sonaban disonantes) y voces que se mueven lo minimo de un acorde al siguiente.
    // «arpegio»: fundamental, tercera, quinta, octava y una nota de color suave (novena o septima menor).
    const ACORDES = [
        { pad: [50, 57, 62, 66, 69], arpegio: [74, 78, 81, 86, 76] },
        { pad: [47, 54, 62, 66, 71], arpegio: [71, 74, 78, 83, 81] },
        { pad: [43, 50, 59, 62, 67], arpegio: [67, 71, 74, 79, 81] },
        { pad: [45, 52, 61, 64, 69], arpegio: [69, 73, 76, 81, 83] },
    ];
    const SEGUNDOS_POR_PASO = 0.42;
    const PASOS_POR_ACORDE = 16;
    // Indices de «arpegio» en cada paso del compas (null = silencio)
    const PATRON = [0, 2, 3, 2, 1, 2, 4, 2, 0, 2, 3, 2, 1, null, 3, null];
    // Ferrofluido de la ola y los anillos: nota fija La4 (440 Hz), no sigue al acorde. El racimo de razones
    // sale del efecto de referencia del usuario (tonos estables en ~0,77, 0,89, 1 y 1,15 veces La4).
    const NOTA_FERRO = 69;
    const RACIMO_FERRO = [0.77, 0.89, 1, 1.15];
    // Milisegundos minimos entre repeticiones del mismo efecto (por defecto 60)
    const ESPERA_MS = { brillo: 90, seccion: 900 };

    let ctx = null;
    let buses = null;
    let ruido = null;
    let ambiente = null;
    let suspender = 0;
    let quiereSonar = false;
    const ultimaVez = {};

    try { quiereSonar = localStorage.getItem(CLAVE) === 'activado'; } catch (e) { /* sin almacenamiento: silencio */ }

    // ── Cadena de audio ──────────────────────────────────────────────

    function crearContexto() {
        if (ctx) return true;
        const Contexto = window.AudioContext || window.webkitAudioContext;
        if (!Contexto) return false;
        ctx = new Contexto();

        const maestro = ctx.createGain();
        maestro.gain.value = 0;
        const compresor = ctx.createDynamicsCompressor();
        compresor.threshold.value = -16;
        compresor.ratio.value = 4;
        maestro.connect(compresor).connect(ctx.destination);

        const reverb = ctx.createConvolver();
        reverb.buffer = respuestaReverb(4.5);
        reverb.connect(maestro);

        const eco = crearEco(maestro, reverb);

        const efectos = ctx.createGain();
        efectos.gain.value = 0.35;
        efectos.connect(maestro);
        const envio = ctx.createGain();
        envio.gain.value = 0.5;
        efectos.connect(envio).connect(reverb);

        buses = { maestro, reverb, eco, efectos };
        return true;
    }

    /** Respuesta al impulso de una sala enorme: ruido estereo que se apaga lentamente. */
    function respuestaReverb(segundos) {
        const largo = Math.floor(ctx.sampleRate * segundos);
        const buffer = ctx.createBuffer(2, largo, ctx.sampleRate);
        for (let canal = 0; canal < 2; canal++) {
            const datos = buffer.getChannelData(canal);
            for (let i = 0; i < largo; i++) datos[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 3.2);
        }
        return buffer;
    }

    /** Eco estereo de ida y vuelta (izquierda, derecha, izquierda...) que tambien alimenta la reverb. */
    function crearEco(destino, reverb) {
        const entrada = ctx.createGain();
        const tono = ctx.createBiquadFilter();
        tono.type = 'lowpass';
        tono.frequency.value = 2600;
        const izquierda = ctx.createDelay(2);
        const derecha = ctx.createDelay(2);
        izquierda.delayTime.value = 0.42;
        derecha.delayTime.value = 0.42;
        const realimentacion = ctx.createGain();
        realimentacion.gain.value = 0.38;
        const mezcla = ctx.createChannelMerger(2);
        const salida = ctx.createGain();
        salida.gain.value = 0.5;

        entrada.connect(tono).connect(izquierda);
        izquierda.connect(derecha);
        derecha.connect(realimentacion).connect(izquierda);
        izquierda.connect(mezcla, 0, 0);
        derecha.connect(mezcla, 0, 1);
        mezcla.connect(salida);
        salida.connect(destino);
        salida.connect(reverb);
        return entrada;
    }

    function bufferRuido() {
        if (ruido) return ruido;
        ruido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const datos = ruido.getChannelData(0);
        for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;
        return ruido;
    }

    // ── Instrumentos ─────────────────────────────────────────────────

    /**
     * Campana de cristal: seno con un parcial alto que se apaga antes. Con «desde» la nota llega deslizandose.
     */
    function campana(t, midi, { volumen = 0.2, duracion = 1.2, desde = null, paneo = 0, eco = false, destino = null } = {}) {
        const final = hz(midi);
        const inicial = desde ? hz(desde) : final;
        const salida = ctx.createStereoPanner();
        salida.pan.value = paneo;
        salida.connect(destino || buses.efectos);
        if (eco) salida.connect(buses.eco);

        [[1, volumen, duracion], [3, volumen * 0.18, duracion * 0.35]].forEach(([multiplo, pico, largo]) => {
            const osc = ctx.createOscillator();
            const gan = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(inicial * multiplo, t);
            if (desde) osc.frequency.exponentialRampToValueAtTime(final * multiplo, t + 0.09);
            gan.gain.setValueAtTime(0.0001, t);
            gan.gain.exponentialRampToValueAtTime(pico, t + 0.012);
            gan.gain.exponentialRampToValueAtTime(0.0001, t + largo);
            osc.connect(gan).connect(salida);
            osc.start(t);
            osc.stop(t + largo + 0.05);
        });
    }

    /**
     * Burbuja: un seno redondo que llega a su nota subiendo rapido desde una sexta abajo (o bajando, si
     * «sube» es false). Filtrado y sin armonicos agudos para que no pinche sobre la musica.
     */
    function burbuja(t, midi, { volumen = 0.15, sube = true } = {}) {
        const f = hz(midi);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(sube ? f * 0.6 : f * 1.5, t);
        osc.frequency.exponentialRampToValueAtTime(f, t + 0.07);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 1600;
        const gan = ctx.createGain();
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(volumen, t + 0.018);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        osc.connect(filtro).connect(gan).connect(buses.efectos);
        osc.start(t);
        osc.stop(t + 0.42);
    }

    /** Gota: una nota suelta y suave, como una del arpegio, con ataque redondeado y cola larga. */
    function gota(t, midi, { volumen = 0.08, duracion = 1, paneo = 0, eco = false } = {}) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = hz(midi);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.value = 1500;
        const gan = ctx.createGain();
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(volumen, t + 0.025);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
        const salida = ctx.createStereoPanner();
        salida.pan.value = paneo;
        osc.connect(filtro).connect(gan).connect(salida);
        salida.connect(buses.efectos);
        if (eco) salida.connect(buses.eco);
        osc.start(t);
        osc.stop(t + duracion + 0.05);
    }

    /**
     * Respiro: fundamental y quinta del acorde actual tras un filtro que se abre (abrir el menu) o se
     * cierra (cerrarlo), como un pad que inhala o exhala.
     */
    function respiro(t, abre) {
        const acorde = acordeActual();
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.Q.value = 2;
        filtro.frequency.setValueAtTime(abre ? 250 : 1500, t);
        filtro.frequency.exponentialRampToValueAtTime(abre ? 1500 : 250, t + 0.4);
        const gan = ctx.createGain();
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(0.07, t + 0.12);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
        filtro.connect(gan).connect(buses.efectos);
        [acorde.pad[2], acorde.pad[2] + 7].forEach(midi => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = hz(midi);
            osc.connect(filtro);
            osc.start(t);
            osc.stop(t + 0.8);
        });
    }

    /**
     * Ola de la intro: aire que crece mientras la cinta de puntos se enrolla, con gotas de cristal que
     * suben por el acorde de Re y viajan de izquierda a derecha, como la ola en pantalla.
     */
    function ola(t, duracion) {
        const fuente = ctx.createBufferSource();
        fuente.buffer = bufferRuido();
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'bandpass';
        filtro.Q.value = 1.2;
        filtro.frequency.setValueAtTime(350, t);
        filtro.frequency.exponentialRampToValueAtTime(2200, t + duracion);
        const paneo = ctx.createStereoPanner();
        paneo.pan.setValueAtTime(-0.6, t);
        paneo.pan.linearRampToValueAtTime(0.6, t + duracion);
        const gan = ctx.createGain();
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(0.09, t + duracion * 0.7);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion + 0.5);
        fuente.connect(filtro).connect(gan).connect(paneo).connect(buses.efectos);
        fuente.start(t);
        fuente.stop(t + duracion + 0.6);

        const notas = [62, 66, 69, 74, 78, 81];
        notas.forEach((midi, i) => {
            gota(t + (i / notas.length) * duracion * 0.9, midi, {
                volumen: 0.06 + i * 0.006, duracion: 1.4, paneo: -0.6 + (1.2 * i) / (notas.length - 1), eco: true,
            });
        });
    }

    /**
     * Ferrofluido, a partir del efecto de referencia del usuario (un «riser» metalico): un racimo apretado de
     * tonos estables alrededor de La4 que NO cambia de altura; lo que sube es el brillo (el filtro se abre).
     * Cada voz son dos sierras desafinadas unos cents: el batido entre ellas da el brillo de metal.
     */
    function racimo(t, destino, fin) {
        const f = hz(NOTA_FERRO);
        const osciladores = [];
        RACIMO_FERRO.forEach(razon => {
            [-5, 5].forEach(desafino => {
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.value = f * razon;
                osc.detune.value = desafino;
                const gan = ctx.createGain();
                gan.gain.value = 0.12;
                osc.connect(gan).connect(destino);
                osc.start(t);
                if (fin) osc.stop(fin);
                osciladores.push(osc);
            });
        });
        return osciladores;
    }

    /** Sin eco: sus rebotes repetian el golpe, y la referencia tiene un solo impacto con una cola continua. */
    function salidaFerro(paneo) {
        const salida = ctx.createStereoPanner();
        salida.pan.value = paneo;
        salida.connect(buses.efectos);
        return salida;
    }

    /** Clic: el racimo sube abriendo el filtro, golpe grave en la cima y una cola oscura que se apaga. */
    function ferroClic(t, volumen, paneo, nivelRacimo = volumen) {
        const subida = 0.35;
        const cima = t + subida;
        const salida = salidaFerro(paneo);

        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.Q.value = 3;
        filtro.frequency.setValueAtTime(450, t);
        filtro.frequency.exponentialRampToValueAtTime(3200, cima);
        // Tras el golpe la cola se oscurece, como en la referencia
        filtro.frequency.exponentialRampToValueAtTime(380, cima + 0.7);
        const gan = ctx.createGain();
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(nivelRacimo, cima);
        gan.gain.exponentialRampToValueAtTime(nivelRacimo * 0.35, cima + 0.15);
        gan.gain.exponentialRampToValueAtTime(0.0001, cima + 0.9);
        filtro.connect(gan).connect(salida);
        racimo(t, filtro, cima + 0.95);

        // Golpe: un seno grave que cae una octava (La2 a La1) y un chasquido de ruido apagado
        const golpe = ctx.createOscillator();
        golpe.frequency.setValueAtTime(110, cima);
        golpe.frequency.exponentialRampToValueAtTime(55, cima + 0.25);
        const golpeGan = ctx.createGain();
        golpeGan.gain.setValueAtTime(0.0001, cima);
        golpeGan.gain.exponentialRampToValueAtTime(volumen * 1.6, cima + 0.008);
        golpeGan.gain.exponentialRampToValueAtTime(0.0001, cima + 0.6);
        golpe.connect(golpeGan).connect(salida);
        golpe.start(cima);
        golpe.stop(cima + 0.65);

        const chasquido = ctx.createBufferSource();
        chasquido.buffer = bufferRuido();
        const chasquidoFiltro = ctx.createBiquadFilter();
        chasquidoFiltro.type = 'lowpass';
        chasquidoFiltro.frequency.value = 1500;
        const chasquidoGan = ctx.createGain();
        chasquidoGan.gain.setValueAtTime(0.0001, cima);
        chasquidoGan.gain.exponentialRampToValueAtTime(volumen * 0.8, cima + 0.005);
        chasquidoGan.gain.exponentialRampToValueAtTime(0.0001, cima + 0.12);
        chasquido.connect(chasquidoFiltro).connect(chasquidoGan).connect(salida);
        chasquido.start(cima, Math.random());
        chasquido.stop(cima + 0.15);

        // Cola: retumbo grave que se apaga, como el final de la referencia
        const cola = ctx.createBufferSource();
        cola.buffer = bufferRuido();
        const colaFiltro = ctx.createBiquadFilter();
        colaFiltro.type = 'lowpass';
        colaFiltro.frequency.value = 260;
        const colaGan = ctx.createGain();
        colaGan.gain.setValueAtTime(0.0001, cima);
        colaGan.gain.exponentialRampToValueAtTime(volumen * 0.7, cima + 0.05);
        colaGan.gain.exponentialRampToValueAtTime(0.0001, cima + 1.1);
        cola.connect(colaFiltro).connect(colaGan).connect(salida);
        cola.start(cima, Math.random());
        cola.stop(cima + 1.15);
    }

    /** Entrar con el cursor: solo una subida corta y suave del racimo, sin golpe. */
    function ferroEntrar(t, volumen, paneo) {
        const salida = salidaFerro(paneo);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.Q.value = 2;
        filtro.frequency.setValueAtTime(450, t);
        filtro.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
        const gan = ctx.createGain();
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(volumen, t + 0.22);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        filtro.connect(gan).connect(salida);
        racimo(t, filtro, t + 0.75);
    }

    /**
     * Zumbido mientras el cursor recorre los puntos: el mismo racimo, sostenido. Cada movimiento lo aviva y
     * abre su filtro segun la velocidad; con el cursor quieto se apaga solo.
     */
    let zumbido = null;

    function zumbidoIniciar(paneo) {
        if (zumbido) return;
        const t = ctx.currentTime;
        const salida = salidaFerro(paneo);
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.Q.value = 2;
        filtro.frequency.value = 600;
        const gan = ctx.createGain();
        gan.gain.value = 0;
        filtro.connect(gan).connect(salida);
        zumbido = { gan, filtro, salida, osciladores: racimo(t, filtro, null) };
    }

    function zumbidoMover(volumen, intensidad, paneo) {
        if (!zumbido) zumbidoIniciar(paneo);
        const t = ctx.currentTime;
        zumbido.salida.pan.setTargetAtTime(paneo, t, 0.05);
        zumbido.gan.gain.cancelScheduledValues(t);
        zumbido.gan.gain.setTargetAtTime(volumen * intensidad, t, 0.03);
        zumbido.gan.gain.setTargetAtTime(0, t + 0.12, 0.35);
        zumbido.filtro.frequency.cancelScheduledValues(t);
        zumbido.filtro.frequency.setTargetAtTime(600 + 2200 * intensidad, t, 0.05);
        zumbido.filtro.frequency.setTargetAtTime(600, t + 0.12, 0.4);
    }

    function zumbidoParar() {
        if (!zumbido) return;
        const { gan, osciladores } = zumbido;
        zumbido = null;
        const t = ctx.currentTime;
        gan.gain.cancelScheduledValues(t);
        gan.gain.setTargetAtTime(0, t, 0.12);
        osciladores.forEach(osc => osc.stop(t + 0.8));
    }

    /** Acorde que florece: voces que abren su filtro despacio, como el arranque de una consola. */
    function florecer(t) {
        gota(t, 50, { volumen: 0.14, duracion: 2.8, eco: true });
        gota(t, 62, { volumen: 0.07, duracion: 2.2, eco: true });
        const filtro = ctx.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.Q.value = 0.8;
        filtro.frequency.setValueAtTime(350, t);
        filtro.frequency.exponentialRampToValueAtTime(3200, t + 2);
        filtro.frequency.exponentialRampToValueAtTime(900, t + 5);
        const gan = ctx.createGain();
        gan.gain.setValueAtTime(0.0001, t);
        gan.gain.exponentialRampToValueAtTime(0.6, t + 1.1);
        gan.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
        filtro.connect(gan);
        gan.connect(buses.efectos);
        gan.connect(buses.reverb);

        [50, 57, 62, 66, 69].forEach((midi, i) => {
            [-8, 8].forEach(desafino => {
                const osc = ctx.createOscillator();
                osc.type = i === 0 ? 'sine' : 'triangle';
                osc.frequency.value = hz(midi);
                osc.detune.value = desafino;
                const voz = ctx.createGain();
                voz.gain.value = 0.045;
                osc.connect(voz).connect(filtro);
                osc.start(t);
                osc.stop(t + 5.6);
            });
        });
        [74, 78, 81, 86].forEach((midi, i) => {
            campana(t + 0.5 + i * 0.22, midi, { volumen: 0.05, duracion: 2, paneo: [-0.5, 0.3, -0.2, 0.5][i], eco: true });
        });
    }

    // ── Ambiente generativo ──────────────────────────────────────────
    //
    // Inspirado en la musica de seleccion de perfil de la PS5: triadas mayores abiertas que cambian por
    // fundido (sin deslizar el pad: el deslizamiento entre acordes producia choques), un arpegio de
    // cristal que se repite y una voz que planea despacio entre notas del acorde.
    // Todo se programa sobre el reloj del audio con un planificador de anticipacion: si la pestana se
    // oculta y el audio se suspende, simplemente se detiene y sigue donde iba.

    function crearAmbiente(retraso) {
        const vivos = new Set();
        const arrancar = (nodo, t, fin) => {
            vivos.add(nodo);
            nodo.onended = () => vivos.delete(nodo);
            nodo.start(t);
            if (fin) nodo.stop(fin);
            return nodo;
        };

        const salida = ctx.createGain();
        salida.gain.value = 0;
        // Volumen de fondo: acompana, no protagoniza (el usuario lo pidio bajo con el equipo al 100 %)
        salida.gain.setTargetAtTime(VOLUMEN_AMBIENTE, ctx.currentTime + retraso, 1.4);
        salida.connect(buses.maestro);
        const envio = ctx.createGain();
        envio.gain.value = 0.7;
        salida.connect(envio).connect(buses.reverb);

        // Bus del pad: filtro calido que respira muy despacio
        const padFiltro = ctx.createBiquadFilter();
        padFiltro.type = 'lowpass';
        padFiltro.frequency.value = 1300;
        padFiltro.Q.value = 0.4;
        padFiltro.connect(salida);
        const respiracion = ctx.createOscillator();
        respiracion.frequency.value = 0.05;
        const profundidad = ctx.createGain();
        profundidad.gain.value = 350;
        respiracion.connect(profundidad).connect(padFiltro.frequency);
        arrancar(respiracion, ctx.currentTime);

        // Aire: ruido muy bajo con un filtro que pasea, como viento lejano
        const aire = ctx.createBufferSource();
        aire.buffer = bufferRuido();
        aire.loop = true;
        const aireFiltro = ctx.createBiquadFilter();
        aireFiltro.type = 'bandpass';
        aireFiltro.frequency.value = 1500;
        aireFiltro.Q.value = 0.6;
        const paseo = ctx.createOscillator();
        paseo.frequency.value = 0.03;
        const paseoGan = ctx.createGain();
        paseoGan.gain.value = 800;
        paseo.connect(paseoGan).connect(aireFiltro.frequency);
        const aireGan = ctx.createGain();
        aireGan.gain.value = 0.01;
        aire.connect(aireFiltro).connect(aireGan).connect(salida);
        arrancar(aire, ctx.currentTime);
        arrancar(paseo, ctx.currentTime);

        // Voz: triangulo con vibrato suave que se desliza (portamento) entre notas del acorde
        const voz = ctx.createOscillator();
        voz.type = 'triangle';
        voz.frequency.value = hz(ACORDES[0].arpegio[1] - 12);
        const vibrato = ctx.createOscillator();
        vibrato.frequency.value = 4.4;
        const vibratoGan = ctx.createGain();
        vibratoGan.gain.value = 7;
        vibrato.connect(vibratoGan).connect(voz.detune);
        const vozFiltro = ctx.createBiquadFilter();
        vozFiltro.type = 'lowpass';
        vozFiltro.frequency.value = 1800;
        const vozGan = ctx.createGain();
        vozGan.gain.value = 0;
        voz.connect(vozFiltro).connect(vozGan);
        vozGan.connect(salida);
        vozGan.connect(buses.eco);
        arrancar(voz, ctx.currentTime);
        arrancar(vibrato, ctx.currentTime);

        /** Una capa del pad: entra con un fundido de ~2 s y sale con otro mientras entra la siguiente. */
        function capaPad(acorde, t, largo) {
            const gan = ctx.createGain();
            gan.gain.setValueAtTime(0, t);
            gan.gain.setTargetAtTime(1, t, 0.8);
            gan.gain.setTargetAtTime(0, t + largo, 0.9);
            gan.connect(padFiltro);
            const fin = t + largo + 5;
            acorde.pad.forEach(midi => {
                [['triangle', -4, 0.05], ['sine', 4, 0.04]].forEach(([tipo, desafino, volumen]) => {
                    const osc = ctx.createOscillator();
                    osc.type = tipo;
                    osc.frequency.value = hz(midi);
                    osc.detune.value = desafino;
                    const voz = ctx.createGain();
                    voz.gain.value = volumen;
                    osc.connect(voz).connect(gan);
                    arrancar(osc, t, fin);
                });
            });
            // Bajo: un seno una octava por debajo de la fundamental
            const bajo = ctx.createOscillator();
            bajo.frequency.value = hz(acorde.pad[0] - 12);
            const bajoGan = ctx.createGain();
            bajoGan.gain.value = 0.07;
            bajo.connect(bajoGan).connect(gan);
            arrancar(bajo, t, fin);
        }

        /** Nota del arpegio: pulsacion de cristal (seno + octava suave) con cola larga. */
        function nota(t, midi, volumen, paneo) {
            const f = hz(midi);
            const salidaNota = ctx.createStereoPanner();
            salidaNota.pan.value = paneo;
            salidaNota.connect(salida);
            salidaNota.connect(buses.eco);
            [[1, volumen, 1.8], [2, volumen * 0.22, 0.6]].forEach(([multiplo, pico, largo]) => {
                const osc = ctx.createOscillator();
                osc.frequency.value = f * multiplo;
                const gan = ctx.createGain();
                gan.gain.setValueAtTime(0.0001, t);
                gan.gain.exponentialRampToValueAtTime(pico, t + 0.006);
                gan.gain.exponentialRampToValueAtTime(0.0001, t + largo);
                osc.connect(gan).connect(salidaNota);
                arrancar(osc, t, t + largo + 0.05);
            });
        }

        // Planificador: cada 90 ms programa los pasos que caen en los proximos 350 ms
        let paso = 0;
        let acordeVigente = ACORDES[0];
        let tPaso = ctx.currentTime + retraso;

        function programarPaso(n, t) {
            const posicion = n % PASOS_POR_ACORDE;
            const acorde = ACORDES[Math.floor(n / PASOS_POR_ACORDE) % ACORDES.length];
            const tonos = acorde.arpegio;

            if (posicion === 0) {
                acordeVigente = acorde;
                capaPad(acorde, t, PASOS_POR_ACORDE * SEGUNDOS_POR_PASO);
            }

            const indice = PATRON[posicion];
            if (indice !== null) {
                const fuerte = posicion % 4 === 0;
                nota(t, tonos[indice], fuerte ? 0.06 : 0.038, posicion % 2 ? 0.3 : -0.3);
            }

            // La voz canta dos notas largas por acorde (a veces descansa) y planea de una a otra
            if (posicion === 0 || posicion === 8) {
                if (posicion === 0 && Math.random() < 0.35) {
                    vozGan.gain.setTargetAtTime(0, t, 0.8);
                } else {
                    voz.frequency.setTargetAtTime(hz(elegir([tonos[0], tonos[1], tonos[2]]) - 12), t, 0.28);
                    vozGan.gain.setTargetAtTime(0.03, t, 0.6);
                }
            }

            // Destellos: de vez en cuando, una nota del acorde dos octavas arriba, muy lejos
            if (Math.random() < 0.08) {
                campana(t + azar(0, SEGUNDOS_POR_PASO), elegir(tonos.slice(0, 4)) + 12, {
                    volumen: 0.02, duracion: 2.6, paneo: azar(-0.7, 0.7), eco: true, destino: salida,
                });
            }
        }

        const reloj = setInterval(() => {
            while (tPaso < ctx.currentTime + 0.35) {
                programarPaso(paso, tPaso);
                paso++;
                tPaso += SEGUNDOS_POR_PASO;
            }
        }, 90);

        return {
            acorde: () => acordeVigente,
            detener() {
                clearInterval(reloj);
                const t = ctx.currentTime;
                salida.gain.cancelScheduledValues(t);
                salida.gain.setTargetAtTime(0, t, 0.5);
                vivos.forEach(nodo => { try { nodo.stop(t + 4); } catch (e) { /* ya detenido */ } });
            },
        };
    }

    // ── Efectos ──────────────────────────────────────────────────────
    //
    // Burbujas afinadas: cada efecto cae en una nota del acorde que esta sonando, una octava por debajo del
    // arpegio, con ataque redondeado y sin armonicos agudos, y comparte la reverberacion de la musica.
    // Asi suenan como notas que la musica pudo haber tocado y no como avisos encima de ella.

    const acordeActual = () => (ambiente ? ambiente.acorde() : ACORDES[0]);
    /** Nota «indice» del arpegio del acorde actual (0 fundamental, 1 tercera, 2 quinta, 3 octava), una octava abajo. */
    const tono = indice => acordeActual().arpegio[indice % 4] - 12;
    let clics = 0;

    const EFECTOS = {
        toque: t => {
            burbuja(t, tono([2, 3, 1][clics++ % 3]), { volumen: 0.16 });
        },
        brillo: (t, { indice = 0 } = {}) => {
            gota(t, tono(indice), { volumen: 0.09, duracion: 1.1, paneo: azar(-0.4, 0.4), eco: true });
        },
        chip: (t, { indice = 0 } = {}) => {
            gota(t, tono(indice) + 12, { volumen: 0.08, duracion: 0.5, paneo: azar(-0.3, 0.3) });
        },
        abrir: t => respiro(t, true),
        cerrar: t => respiro(t, false),
        seccion: t => {
            const acorde = acordeActual();
            gota(t, acorde.pad[2], { volumen: 0.06, duracion: 1.8, eco: true });
            gota(t + 0.09, acorde.pad[3], { volumen: 0.045, duracion: 1.6, eco: true });
        },
        encender: t => {
            [0, 1, 2, 3].forEach((indice, i) => burbuja(t + i * 0.09, tono(indice), { volumen: 0.12 }));
        },
        apagar: t => {
            [3, 2, 0].forEach((indice, i) => burbuja(t + i * 0.1, tono(indice), { volumen: 0.1, sube: false }));
        },
        // Intro: la ola mientras se enrolla, la musica de bienvenida al cerrarse el anillo y un respiro al salir
        inicio: (t, { anillo = 1, salida = 2.4 } = {}) => {
            if (anillo > 0) ola(t, anillo);
            florecer(t + anillo * 0.9);
            if (salida > 0) respiro(t + salida, true);
        },
    };

    function efecto(nombre, opciones) {
        if (!quiereSonar || !ctx || ctx.state !== 'running' || !EFECTOS[nombre]) return;
        const ahora = performance.now();
        if (ahora - (ultimaVez[nombre] || -1e9) < (ESPERA_MS[nombre] || 60)) return;
        ultimaVez[nombre] = ahora;
        EFECTOS[nombre](ctx.currentTime + 0.01, opciones);
    }

    // ── Encender y apagar ────────────────────────────────────────────

    const boton = document.querySelector('.cabeza__sonido');

    function pintarBoton() {
        if (!boton) return;
        const etiqueta = quiereSonar ? 'Silenciar' : 'Activar sonido';
        boton.setAttribute('aria-pressed', String(quiereSonar));
        boton.setAttribute('aria-label', etiqueta);
        boton.title = etiqueta;
    }

    function guardar() {
        try { localStorage.setItem(CLAVE, quiereSonar ? 'activado' : 'silencio'); } catch (e) { /* solo esta visita */ }
    }

    /** Debe llamarse dentro de un gesto del visitante (clic, tecla o toque) para que el navegador deje sonar. */
    function activar({ inicio = false, silencioso = false } = {}) {
        quiereSonar = true;
        guardar();
        pintarBoton();
        if (!crearContexto()) return;
        clearTimeout(suspender);
        ctx.resume().then(() => {
            const t = ctx.currentTime;
            buses.maestro.gain.cancelScheduledValues(t);
            buses.maestro.gain.setTargetAtTime(VOLUMEN, t, 0.05);
            if (inicio) EFECTOS.inicio(t + 0.02, inicio);
            else if (!silencioso) EFECTOS.encender(t + 0.02);
            // Con la intro, la musica de fondo entra cuando la pagina ya aparecio
            if (!ambiente) ambiente = crearAmbiente(inicio ? (inicio.salida || 0) + 1.2 : 0.6);
        }, () => { /* el navegador aun no deja sonar: lo intentara el proximo gesto */ });
    }

    function silenciar({ conEfecto = true } = {}) {
        quiereSonar = false;
        guardar();
        pintarBoton();
        if (!ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        if (conEfecto) EFECTOS.apagar(t + 0.01);
        buses.maestro.gain.setTargetAtTime(0, t + 0.6, 0.3);
        if (ambiente) {
            ambiente.detener();
            ambiente = null;
        }
        zumbidoParar();
        clearTimeout(suspender);
        suspender = setTimeout(() => { if (!quiereSonar) ctx.suspend(); }, 3000);
    }

    // ── Ferrofluido en la ola y los anillos de puntos ────────────────

    // Volumenes medidos con un OfflineAudioContext para quedar a la par del resto de efectos
    // racimo: nivel de la subida del clic · golpe: golpe grave y cola · entrar y mover: hover
    const FERRO = { racimo: 0.2, golpe: 0.03, entrar: 0.12, mover: 0.09 };

    /** Pone el audio a sonar solo para este efecto cuando aun no se eligio sonido, y luego lo suspende. */
    function sonarSinEleccion() {
        buses.maestro.gain.cancelScheduledValues(ctx.currentTime);
        buses.maestro.gain.setTargetAtTime(VOLUMEN, ctx.currentTime, 0.01);
        clearTimeout(suspender);
        suspender = setTimeout(() => {
            if (quiereSonar) return;
            buses.maestro.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
            ctx.suspend();
        }, 3500);
    }

    /**
     * tipo: «clic» (subida, golpe y cola), «entrar» (subida corta), «mover» (aviva el zumbido segun
     * «intensidad», de 0 a 1) o «salir» (apaga el zumbido). Debe llamarse dentro del gesto o del movimiento
     * del puntero. «forzar» (solo el clic sobre la ola de la intro) suena aunque aun no se haya elegido sonido.
     */
    function ferroPuntos({ tipo = 'clic', paneo = 0, intensidad = 1, forzar = false } = {}) {
        if (tipo === 'salir') {
            if (ctx) zumbidoParar();
            return;
        }
        if (!quiereSonar && !forzar) return;
        if (tipo !== 'clic' && (!ctx || ctx.state !== 'running')) return;
        if (!crearContexto()) return;
        const ahora = performance.now();
        const clave = `ferro-${tipo}`;
        if (ahora - (ultimaVez[clave] || -1e9) < ({ clic: 150, entrar: 400, mover: 40 }[tipo])) return;
        ultimaVez[clave] = ahora;

        ctx.resume().then(() => {
            if (!quiereSonar) sonarSinEleccion();
            const t = ctx.currentTime + 0.01;
            if (tipo === 'clic') ferroClic(t, FERRO.golpe, paneo, FERRO.racimo);
            else if (tipo === 'entrar') ferroEntrar(t, FERRO.entrar, paneo);
            else zumbidoMover(FERRO.mover, intensidad, paneo);
        }, () => { /* el navegador no dejo sonar */ });
    }

    /**
     * Conecta el ferrofluido a una zona: al entrar el cursor a los puntos suena una subida corta, al moverse
     * sobre ellos el zumbido se aviva segun la velocidad, y el cursor cambia a mano. «estaSobre(evento)»
     * decide si el puntero esta sobre los puntos; «paneoDe(evento)» ubica el sonido a izquierda o derecha.
     */
    function seguirFerro(zona, estaSobre, paneoDe) {
        let dentro = false;
        let anterior = null;
        const salir = () => {
            if (dentro) ferroPuntos({ tipo: 'salir' });
            dentro = false;
            anterior = null;
        };
        zona.addEventListener('pointermove', e => {
            const sobre = estaSobre(e);
            zona.style.cursor = sobre ? 'pointer' : '';
            if (!sobre || e.pointerType !== 'mouse') {
                salir();
                return;
            }
            if (!dentro) {
                ferroPuntos({ tipo: 'entrar', paneo: paneoDe(e) });
            } else if (anterior) {
                const velocidad = Math.hypot(e.clientX - anterior.x, e.clientY - anterior.y) / Math.max(e.timeStamp - anterior.t, 1);
                if (velocidad > 0.15) ferroPuntos({ tipo: 'mover', paneo: paneoDe(e), intensidad: Math.min(velocidad / 1.5, 1) });
            }
            dentro = true;
            anterior = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        });
        zona.addEventListener('pointerleave', () => {
            salir();
            zona.style.cursor = '';
        });
    }

    // ── Conexion con la pagina ───────────────────────────────────────

    pintarBoton();
    if (boton) boton.addEventListener('click', () => (quiereSonar ? silenciar() : activar()));

    // Si el sonido quedo activado de antes, arranca con el primer gesto (la bienvenida se encarga si aparece)
    if (quiereSonar && !document.documentElement.classList.contains('bienvenida-activa')) {
        const alPrimerGesto = e => {
            window.removeEventListener('pointerdown', alPrimerGesto, true);
            window.removeEventListener('keydown', alPrimerGesto, true);
            if (quiereSonar && !e.target.closest('.cabeza__sonido')) activar({ silencioso: true });
        };
        window.addEventListener('pointerdown', alPrimerGesto, true);
        window.addEventListener('keydown', alPrimerGesto, true);
    }

    document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend();
        else if (quiereSonar) ctx.resume();
    });

    // Clic en enlaces y botones (los del menu, el del sonido y los de la bienvenida tienen su propio sonido)
    const SIN_TOQUE = '.cabeza__barra, .cabeza__cerrar, .cabeza__sonido, .bienvenida button';
    document.addEventListener('click', e => {
        const objetivo = e.target.closest('a, button');
        if (objetivo && !objetivo.matches(SIN_TOQUE)) efecto('toque');
    });

    // Hover en tarjetas y chips: cada una tiene su nota fija, asi recorrerlas suena como una escala
    const CAJAS = '.app__card, .exp__card, .paso, .grupo, .referencia__card';
    const CHIPS = '.chip, .tag';
    const notas = new WeakMap();
    [CAJAS, CHIPS].forEach(selector => document.querySelectorAll(selector).forEach((el, i) => notas.set(el, i)));

    document.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse') return;
        const chip = e.target.closest(CHIPS);
        const caja = chip ? null : e.target.closest(CAJAS);
        const el = chip || caja;
        if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
        efecto(chip ? 'chip' : 'brillo', { indice: notas.get(el) || 0 });
    });

    return { activar, silenciar, efecto, ferro: ferroPuntos, seguirFerro, activo: () => quiereSonar };
})();
