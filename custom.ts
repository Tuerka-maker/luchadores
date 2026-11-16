// rey_custom.ts — GENERADO por kits/v4/codigo/armar_makecode.py: no editar aqui.
// Va en custom.ts del proyecto de MakeCode (JavaScript -> Explorador -> +). El niño ve main.ts (rey_main.ts).
// Fuente: rey_logica.ts (reglas, probadas en Node) + rey_nucleo.ts (pines, pantalla, sonido, bloques).

// Rey — adaptador del Núcleo v2 con BLOQUES PROPIOS (2026-11-14). Mismo patrón que asedio_nucleo.ts (aprobado en la placa
// el 2026-11-14, parte E): armar_makecode.py lo une con rey_logica.ts en rey_custom.ts, que se pega como custom.ts del
// proyecto de MakeCode. Lo que está arriba de la línea «FIN DE LO QUE VA FUERA» queda fuera del namespace (el enum Jugador);
// el resto y toda la lógica van DENTRO de «namespace rey», así las variables del juego no aparecen en la paleta del niño.
// El niño solo ve main.ts (rey_main.ts = «Programa original»). Aquí NO se decide nada del juego: se leen botones y pines,
// se llama a paso() cada 10 ms, se pinta, suena y se avisa a los eventos del niño.
// ORDEN DE ARRANQUE: las variables que tocan los bloques del niño NO tienen valor inicial y la configuración se aplica en el
// bucle (probado en la placa con Asedio, E5). 0 = «no lo cambió»: vale el de la lógica.
// Conexiones: corona A -> P1, corona B -> P2, las dos -> GND. Corona puesta = la arandela cierra el contacto = lectura 0.
// No se usa P0: en el V2 MakeCode también saca el sonido por P0.

enum Jugador {
    //% block="A"
    A = 0,
    //% block="B"
    B = 1
}

//% color="#B7950B" weight=100 icon="\uf091" block="Rey"
//% groups='["Juego", "Reglas", "Sensores", "Eventos", "Acciones"]'
namespace rey {
    // Rey (Luchadores + Solitario) — lógica pura del Núcleo v2 (2026-11-14). Port de nucleo.ts v0.6 (aprobado en la mesa el
    // 2026-11-14, filas B1–B14) a una máquina de estados que avanza con paso() cada 10 ms, como Asedio, para dar bloques propios.
    // Reglas: kits/v4/reglas_borrador.md. Cambios frente a v0.6 (fundador 2026-11-14):
    //   - sin la opción F del menú (Asedio es un programa aparte): el menú es L Luchadores, S Solitario, R Registro;
    //   - si una corona cae durante el 3-2-1 se vuelve a esperar (antes la cuenta seguía).
    // Sin APIs de la placa: el adaptador (rey_nucleo.ts) llama a paso() con botones y coronas y lee las SALIDAS. Después de
    // mostrar aviso y sonido los pone en "" y 0.
    // RESTRICCIÓN DE BLOQUES (lecciones C4 de Asedio): solo variables globales, listas con tipo, nombres que no difieren solo en
    // mayúsculas, ninguna variable local; nada de objetos, clases, flechas, «? :», switch ni plantillas.
    // Pruebas: node --experimental-strip-types --no-warnings kits/v4/codigo/probar_rey.mjs

    // ---------- PARÁMETROS (el niño los cambia en la misión 3) ----------
    let VIDAS_INICIO = 3
    let RONDA_MS = 120000            // 2 min por ronda
    let RONDAS_PARA_GANAR = 2        // al mejor de 3
    let INMUNIDAD_MS = 2000          // tras un K.O., esa corona no cuenta durante este tiempo
    let EVENTO_MIN_MS = 20000
    let EVENTO_MAX_MS = 40000
    let PRORROGA_MS = 30000          // empate al acabar el tiempo: muerte súbita durante este tiempo
    let SOLO_MS = 60000
    let ARMADO_MS = 300              // la corona debe estar puesta este tiempo para volver a contar
    let CAIDA_MS = 60                // y caída al menos este tiempo (antirrebote)
    let AL_CENTRO_MS = 8000          // cuánto dura «¡Al centro!»
    let FINAL_AL_CENTRO_MS = 20000   // últimos segundos de la ronda con los dos reyes en la zona de golpe
    let CUENTA_MS = 3000             // 3-2-1
    let PAUSA_RONDA_MS = 1500        // tras ganar una ronda, para que se lea la letra del ganador antes del 3-2-1
    let ULTIMOS_SOLO_MS = 5000       // el solitario pita en sus últimos segundos

    // ---------- ESTADOS ----------
    let E_MENU = 0
    let E_ARMANDO = 1
    let E_CUENTA = 2
    let E_DUELO = 3
    let E_FIN = 4
    let E_SOLO_ARMANDO = 5
    let E_SOLO = 6
    let E_SOLO_FIN = 7
    let E_REG = 8

    // ---------- SONIDOS (el adaptador los traduce a notas) ----------
    let S_NADA = 0
    let S_KO = 1
    let S_BLOQUEADO = 2
    let S_EVENTO = 3
    let S_AL_CENTRO = 4
    let S_SALIR_CENTRO = 5
    let S_CUENTA = 6
    let S_YA = 7
    let S_FIN = 8
    let S_GOLPE_SOLO = 9
    let S_ULTIMOS = 10
    let S_FIN_SOLO = 11
    let S_RECORD = 12

    // ---------- SALIDAS (las lee el adaptador) ----------
    let estado = 0
    let opcion = 0                   // 0 L Luchadores, 1 S Solitario, 2 R Registro
    let vidas: number[] = [3, 3]
    let rondas: number[] = [0, 0]    // rondas ganadas en la partida
    let aviso = ""                   // letra o número que hay que mostrar ("" = nada nuevo)
    let sonido = 0                   // código S_... (0 = nada nuevo)
    let ganador = -1
    let falta = -1                   // corona que falta: -1 ninguna, 0 A, 1 B, 2 las dos
    let viento = false
    let muerteSubita = false
    let finRonda = 0
    let alCentroHasta = 0
    let cuentaFin = 0
    let golpesSolo = 0
    let recordSolo = 0               // se borra al apagar
    let soloRecord = false           // el último solitario fue récord
    let regItem = 0                  // dato del registro que se muestra (0 PA … 7 MIN)
    let vidasPerdidas: number[] = [0, 0]       // cuenta siempre hacia arriba (evento «pierde una vida»)
    let rondasTerminadas = 0                   // cuenta siempre hacia arriba (evento «termina la ronda»)

    // registro de la prueba con niños (RAM; sin datos personales)
    let regPartidas = 0
    let regRevanchas = 0
    let regRondas = 0
    let regKO = 0
    let regBloqueados = 0
    let regAlCentro = 0
    let regSolos = 0
    let regJugandoMs = 0

    // ---------- ESTADO INTERNO ----------
    let inmuneHasta: number[] = [0, 0]
    let puestaDesde: number[] = [-1, -1]
    let caidaDesde: number[] = [-1, -1]
    let armada: number[] = [0, 0]              // 1 = puesta al menos ARMADO_MS
    let finalAlCentro = false
    let proximoEvento = 0
    let cuentaSolo = false
    let soloHasta = 0
    let proximoPitido = 0
    let ultimoPaso = -1
    let pausaHasta = 0               // el 3-2-1 no empieza antes de esto (revisión firmware 2026-11-14)
    let combo = false                // A y B estuvieron pulsados a la vez durante esta pulsación
    let antesA = false
    let antesB = false
    let semilla = 12345              // el adaptador la cambia al encender
    let colaAzar: number[] = []
    // internas de paso() (globales: en Bloques no hay variables locales; se asignan en cada paso)
    let sueltaA = false
    let sueltaB = false
    let cayoA = false
    let cayoB = false
    let tipoEvento = 0

    // número entero entre min y max (incluidos)
    function azar(min: number, max: number): number {
        if (colaAzar.length > 0) {
            return colaAzar.shift()
        }
        semilla = (semilla * 75 + 74) % 65537
        return min + semilla % (max - min + 1)
    }

    function letra(j: number): string {
        if (j == 0) {
            return "A"
        }
        return "B"
    }

    function reiniciar() {
        estado = E_MENU
        opcion = 0
        aviso = ""
        sonido = S_NADA
        ganador = -1
        falta = -1
        antesA = false
        antesB = false
        puestaDesde = [-1, -1]
        caidaDesde = [-1, -1]
        armada = [0, 0]
        rondas = [0, 0]
        empezarRonda()
        estado = E_MENU
    }

    function empezarPartida() {
        regPartidas += 1
        rondas = [0, 0]
        ganador = -1
        empezarRonda()
    }

    // deja la ronda lista y espera las dos coronas
    function empezarRonda() {
        vidas[0] = VIDAS_INICIO
        vidas[1] = VIDAS_INICIO
        inmuneHasta = [0, 0]
        viento = false
        muerteSubita = false
        alCentroHasta = 0
        finalAlCentro = false
        estado = E_ARMANDO
    }

    // ---------- SENSORES ----------
    // devuelve true en el paso en que la corona j se da por caída (estaba armada y lleva CAIDA_MS fuera)
    function revisarCorona(j: number, puesta: boolean, ahora: number): boolean {
        if (puesta) {
            caidaDesde[j] = -1
            if (puestaDesde[j] < 0) {
                puestaDesde[j] = ahora
            }
            if (armada[j] == 0 && ahora - puestaDesde[j] >= ARMADO_MS) {
                armada[j] = 1
            }
            return false
        }
        puestaDesde[j] = -1
        if (caidaDesde[j] < 0) {
            caidaDesde[j] = ahora
        }
        if (armada[j] == 1 && ahora - caidaDesde[j] >= CAIDA_MS) {
            armada[j] = 0
            return true
        }
        return false
    }

    function calcularFalta(dos: boolean) {
        falta = -1
        if (armada[0] == 0) {
            falta = 0
        }
        if (dos && armada[1] == 0) {
            if (falta == 0) {
                falta = 2
            } else {
                falta = 1
            }
        }
    }

    // ---------- JUEGO ----------
    function ko(j: number, ahora: number) {
        if (ahora < inmuneHasta[j]) {
            regBloqueados += 1
            sonido = S_BLOQUEADO
            return
        }
        inmuneHasta[j] = ahora + INMUNIDAD_MS
        if (viento) {
            viento = false
            aviso = "V"
            regBloqueados += 1
            sonido = S_EVENTO
            return
        }
        sonido = S_KO
        regKO += 1
        if (muerteSubita) {
            muerteSubita = false
            vidas[j] = 0
        } else {
            vidas[j] = vidas[j] - 1
        }
        vidasPerdidas[j] = vidasPerdidas[j] + 1
        aviso = letra(j)
        if (vidas[j] <= 0) {
            finDeRonda(1 - j)
        }
    }

    function finDeRonda(g: number) {
        regRondas += 1
        rondasTerminadas += 1
        rondas[g] = rondas[g] + 1
        if (rondas[g] >= RONDAS_PARA_GANAR) {
            ganador = g
            estado = E_FIN
            sonido = S_FIN
        } else {
            aviso = letra(g)
            empezarRonda()
            pausaHasta = ultimoPaso + PAUSA_RONDA_MS
        }
    }

    function alCentro(hasta: number) {
        alCentroHasta = hasta
        regAlCentro += 1
        aviso = "C"
        sonido = S_AL_CENTRO
    }

    function lanzarEvento(ahora: number) {
        proximoEvento = ahora + azar(EVENTO_MIN_MS, EVENTO_MAX_MS)
        tipoEvento = azar(0, 2)
        if (tipoEvento == 0) {
            viento = true
            aviso = "V"
            sonido = S_EVENTO
        } else if (tipoEvento == 1) {
            muerteSubita = true
            aviso = "M"
            sonido = S_EVENTO
        } else {
            alCentro(ahora + AL_CENTRO_MS)
        }
    }

    function boton(j: number) {
        if (estado == E_MENU) {
            if (j == 0) {
                opcion = (opcion + 1) % 3
            } else if (opcion == 0) {
                empezarPartida()
            } else if (opcion == 1) {
                estado = E_SOLO_ARMANDO
            } else {
                regItem = 0
                estado = E_REG
            }
        } else if (estado == E_REG) {
            if (j == 0) {
                regItem = (regItem + 1) % 8
            }
        } else if (estado == E_FIN) {
            if (j == 0) {
                regRevanchas += 1
                empezarPartida()
            }
        } else if (estado == E_SOLO_FIN) {
            if (j == 0) {
                estado = E_SOLO_ARMANDO
            }
        }
    }

    function irAlMenu() {
        estado = E_MENU
        aviso = ""
    }

    // ---------- UN PASO (cada 10 ms) ----------
    function paso(ahora: number, botonA: boolean, botonB: boolean, coronaA: boolean, coronaB: boolean) {
        if (ultimoPaso >= 0 && (estado == E_DUELO || estado == E_SOLO)) {
            regJugandoMs += ahora - ultimoPaso
        }
        ultimoPaso = ahora
        // los botones actúan al SOLTARLOS, como los eventos de MakeCode de la v0.6: si A y B estuvieron pulsados a la vez
        // en algún momento, es A+B (menú) y no cuenta ninguno solo (revisión firmware 2026-11-14: A un instante antes que B
        // arrancaba una revancha y ensuciaba el registro)
        sueltaA = antesA && !botonA
        sueltaB = antesB && !botonB
        antesA = botonA
        antesB = botonB
        if (botonA && botonB) {
            combo = true
        }
        cayoA = revisarCorona(0, coronaA, ahora)
        cayoB = revisarCorona(1, coronaB, ahora)

        if (combo) {
            if (!botonA && !botonB) {
                combo = false
                irAlMenu()
                return
            }
        } else {
            if (sueltaA) {
                boton(0)
            }
            if (sueltaB) {
                boton(1)
            }
        }

        if (estado == E_ARMANDO || estado == E_SOLO_ARMANDO) {
            cuentaSolo = estado == E_SOLO_ARMANDO
            calcularFalta(!cuentaSolo)
            if (falta == -1 && ahora >= pausaHasta) {
                estado = E_CUENTA
                cuentaFin = ahora + CUENTA_MS
                proximoPitido = ahora + 1000
                sonido = S_CUENTA
            }
        } else if (estado == E_CUENTA) {
            calcularFalta(!cuentaSolo)
            if (falta != -1) {
                // se cayó una corona durante la cuenta: volver a esperar
                if (cuentaSolo) {
                    estado = E_SOLO_ARMANDO
                } else {
                    estado = E_ARMANDO
                }
            } else if (ahora >= cuentaFin) {
                sonido = S_YA
                if (cuentaSolo) {
                    estado = E_SOLO
                    regSolos += 1
                    golpesSolo = 0
                    soloHasta = ahora + SOLO_MS
                    proximoPitido = soloHasta - ULTIMOS_SOLO_MS
                } else {
                    estado = E_DUELO
                    finRonda = ahora + RONDA_MS
                    proximoEvento = ahora + azar(EVENTO_MIN_MS, EVENTO_MAX_MS)
                }
            } else if (ahora >= proximoPitido) {
                sonido = S_CUENTA
                proximoPitido = proximoPitido + 1000
            }
        } else if (estado == E_DUELO) {
            if (cayoA) {
                ko(0, ahora)
            }
            if (estado == E_DUELO && cayoB) {
                ko(1, ahora)
            }
            if (estado == E_DUELO) {
                if (ahora >= finRonda) {
                    if (vidas[0] > vidas[1]) {
                        finDeRonda(0)
                    } else if (vidas[1] > vidas[0]) {
                        finDeRonda(1)
                    } else {
                        muerteSubita = true
                        aviso = "M"
                        finRonda = ahora + PRORROGA_MS
                        alCentroHasta = finRonda             // empate: muerte súbita en el centro
                    }
                } else if (!finalAlCentro && finRonda - ahora <= FINAL_AL_CENTRO_MS) {
                    finalAlCentro = true
                    alCentro(finRonda)
                } else if (ahora >= proximoEvento) {
                    lanzarEvento(ahora)
                }
                if (alCentroHasta > 0 && ahora >= alCentroHasta) {
                    alCentroHasta = 0
                    sonido = S_SALIR_CENTRO                  // ya se puede salir del centro
                }
            }
        } else if (estado == E_SOLO) {
            if (cayoA) {
                golpesSolo += 1
                sonido = S_GOLPE_SOLO
            }
            if (ahora >= soloHasta) {
                estado = E_SOLO_FIN
                sonido = S_FIN_SOLO
                soloRecord = golpesSolo > recordSolo
                if (soloRecord) {
                    recordSolo = golpesSolo
                    sonido = S_RECORD
                }
            } else if (ahora >= proximoPitido) {
                sonido = S_ULTIMOS
                proximoPitido = ahora + 200
            }
        }
    }

    reiniciar()

    // ---------- lo que ponen los bloques del niño (sin valor inicial: ver ORDEN DE ARRANQUE) ----------
    let cfgVidas: number
    let cfgRondaS: number
    let cfgRondasGanar: number
    let cfgInmunidadS: number
    let cfgAlCentroS: number
    let arrancado: boolean
    let configurado: boolean
    let cfgSucia: boolean
    let pinesListos: boolean
    let alVidaA: () => void
    let alVidaB: () => void
    let alCaeA: () => void
    let alCaeB: () => void
    let alRonda: () => void
    let alFin: () => void

    // ---------- internas del adaptador ----------
    let USAR_ICONOS = false          // true = V/M salen como iconos (nube, calavera). Se decide en la prueba con niños
    let texto = ""
    let perdidasAntesA = 0
    let perdidasAntesB = 0
    let rondasAntes = 0
    let estadoAntes = 0
    let eventosCorriendo = 0         // eventos del niño en marcha: mientras tanto el juego no pinta (no le borra su dibujo)
    // «?» y letras de la corona que falta: se crean una vez (firmware ronda 2: crearlas 20 veces por segundo gasta memoria)
    let imgPregunta = images.createImage(`
        . # # # .
        . . . # .
        . . # # .
        . . . . .
        . . # . .
        `)
    let imgA = images.createImage(`
        . # # . .
        # . . # .
        # # # # .
        # . . # .
        # . . # .
        `)
    let imgB = images.createImage(`
        # # # . .
        # . . # .
        # # # . .
        # . . # .
        # # # . .
        `)

    function prepararPines() {
        if (!pinesListos) {
            pins.setPull(DigitalPin.P1, PinPullMode.PullUp)
            pins.setPull(DigitalPin.P2, PinPullMode.PullUp)
            pinesListos = true
        }
    }

    function leerCorona(j: number): boolean {
        prepararPines()
        if (j == 0) {
            return pins.digitalReadPin(DigitalPin.P1) == 0
        }
        return pins.digitalReadPin(DigitalPin.P2) == 0
    }

    // copia las reglas del niño a la lógica. Las vidas y el tiempo de ronda valen desde la próxima ronda.
    function aplicarReglas() {
        cfgSucia = false
        if (cfgVidas > 0) {
            VIDAS_INICIO = cfgVidas
        }
        if (cfgRondaS > 0) {
            RONDA_MS = cfgRondaS * 1000
            // «al centro» final: los últimos 20 s; en rondas de menos de 1 min, el último tercio
            if (RONDA_MS >= 60000) {
                FINAL_AL_CENTRO_MS = 20000
            } else {
                FINAL_AL_CENTRO_MS = Math.idiv(RONDA_MS, 3)
            }
        }
        if (cfgRondasGanar > 0) {
            RONDAS_PARA_GANAR = cfgRondasGanar
        }
        if (cfgInmunidadS > 0) {
            INMUNIDAD_MS = cfgInmunidadS * 1000
        }
        if (cfgAlCentroS > 0) {
            AL_CENTRO_MS = cfgAlCentroS * 1000
        }
    }

    function sonar(s: number) {
        if (s == S_KO) {
            music.startMelody(music.builtInMelody(Melodies.Wawawawaa), MelodyOptions.Once)
        } else if (s == S_BLOQUEADO) {
            music.play(music.tonePlayable(262, 60), music.PlaybackMode.InBackground)
        } else if (s == S_EVENTO) {
            music.startMelody(music.builtInMelody(Melodies.BaDing), MelodyOptions.Once)
        } else if (s == S_AL_CENTRO) {
            music.startMelody(music.builtInMelody(Melodies.PowerUp), MelodyOptions.Once)
        } else if (s == S_SALIR_CENTRO) {
            music.play(music.tonePlayable(784, 200), music.PlaybackMode.InBackground)
        } else if (s == S_CUENTA) {
            music.play(music.tonePlayable(523, 150), music.PlaybackMode.InBackground)
        } else if (s == S_YA) {
            music.play(music.tonePlayable(1047, 300), music.PlaybackMode.InBackground)
        } else if (s == S_FIN) {
            music.startMelody(music.builtInMelody(Melodies.Entertainer), MelodyOptions.Once)
        } else if (s == S_GOLPE_SOLO) {
            music.play(music.tonePlayable(988, 60), music.PlaybackMode.InBackground)
        } else if (s == S_ULTIMOS) {
            music.play(music.tonePlayable(1319, 30), music.PlaybackMode.InBackground)
        } else if (s == S_FIN_SOLO) {
            music.play(music.tonePlayable(1047, 400), music.PlaybackMode.InBackground)
        } else if (s == S_RECORD) {
            music.startMelody(music.builtInMelody(Melodies.PowerUp), MelodyOptions.Once)
        }
    }

    function mostrarAviso(a: string) {
        if (USAR_ICONOS && a == "V") {
            images.createImage(`
                . . . . .
                # # # . .
                . . . # #
                # # # . .
                . . . . .
                `).showImage(0)
        } else if (USAR_ICONOS && a == "M") {
            images.createImage(`
                . # # # .
                # . # . #
                # # # # #
                . # # # .
                . # . # .
                `).showImage(0)
        } else {
            basic.showString(a)
        }
    }

    function textoRegistro(): string {
        let decimas = Math.idiv(regJugandoMs, 6000)
        if (regItem == 0) {
            return "PA" + regPartidas
        } else if (regItem == 1) {
            return "RV" + regRevanchas
        } else if (regItem == 2) {
            return "RO" + regRondas
        } else if (regItem == 3) {
            return "KO" + regKO
        } else if (regItem == 4) {
            return "BL" + regBloqueados
        } else if (regItem == 5) {
            return "AC" + regAlCentro
        } else if (regItem == 6) {
            return "SO" + regSolos
        }
        return "MIN" + Math.idiv(decimas, 10) + "." + (decimas % 10)
    }

    function dibujar() {
        basic.clearScreen()
        if (estado == E_MENU) {
            basic.showString("LSR".charAt(opcion))
        } else if (estado == E_ARMANDO || estado == E_SOLO_ARMANDO) {
            // «?» y la letra de la corona que falta, alternando cada 0,6 s SIN bloquear la pantalla (showImage con pausa 0):
            // con showString tapaban el 3 del 3-2-1 si la corona se ponía a mitad (revisión firmware 2026-11-14) [S: ver F4]
            // con las dos puestas (pausa de 1,5 s tras una ronda) no falta ninguna: pantalla vacía (firmware ronda 2)
            if (falta == -1) {
                basic.clearScreen()
            } else if (control.millis() % 1200 < 600) {
                imgPregunta.showImage(0, 0)
            } else if (falta == 1) {
                imgB.showImage(0, 0)
            } else {
                imgA.showImage(0, 0)
            }
        } else if (estado == E_CUENTA) {
            basic.showNumber(Math.max(1, Math.idiv(cuentaFin - control.millis(), 1000) + 1))
        } else if (estado == E_DUELO) {
            for (let v = 0; v < Math.min(vidas[0], 5); v++) {
                led.plot(0, 4 - v)
            }
            for (let w = 0; w < Math.min(vidas[1], 5); w++) {
                led.plot(4, 4 - w)
            }
            // columna central = tiempo que queda de la ronda (0-5 LED)
            let barras = Math.idiv(Math.max(0, finRonda - control.millis()) * 5 + RONDA_MS - 1, RONDA_MS)
            for (let y = 0; y < Math.min(barras, 5); y++) {
                led.plot(2, 4 - y)
            }
            if (control.millis() < alCentroHasta) {
                led.plot(1, 1)
                led.plot(3, 1)
                led.plot(1, 3)
                led.plot(3, 3)
            }
        } else if (estado == E_FIN) {
            basic.showString(letra(ganador))
            basic.showIcon(IconNames.Happy)
        } else if (estado == E_SOLO) {
            for (let i = 0; i < Math.min(golpesSolo, 25); i++) {
                led.plot(i % 5, Math.idiv(i, 5))
            }
        } else if (estado == E_SOLO_FIN) {
            // se repite hasta pulsar A (lección C11 de Asedio)
            basic.showNumber(golpesSolo)
            if (soloRecord) {
                basic.showString("R")
            }
            basic.pause(800)
        } else if (estado == E_REG) {
            basic.showString(textoRegistro())
            basic.pause(800)
        }
    }

    // los eventos del niño corren en paralelo y DESPUÉS de que la lógica resolvió el paso: una pausa dentro de un evento no
    // detiene el juego, y mientras corre el juego no pinta
    function lanzar(h: () => void) {
        if (h) {
            control.runInParallel(function () {
                eventosCorriendo += 1
                h()
                eventosCorriendo -= 1
            })
        }
    }

    // compara con cómo quedó todo al FINAL del paso anterior (también ve lo que cambió un evento del niño entre dos pasos)
    function avisarEventos() {
        if (vidasPerdidas[0] > perdidasAntesA) {
            lanzar(alVidaA)
        }
        if (vidasPerdidas[1] > perdidasAntesB) {
            lanzar(alVidaB)
        }
        // la corona solo «cae» en juego (duelo o solitario), no mientras se arma ni en el menú
        if (estadoAntes == E_DUELO || estadoAntes == E_SOLO) {
            if (cayoA) {
                lanzar(alCaeA)
            }
            if (cayoB && estadoAntes == E_DUELO) {
                lanzar(alCaeB)
            }
        }
        if (rondasTerminadas > rondasAntes) {
            lanzar(alRonda)
        }
        if (estado == E_FIN && estadoAntes != E_FIN) {
            lanzar(alFin)
        }
    }

    function arrancar() {
        // A+B = volver al menú (la lógica también lo detecta en paso())
        input.onButtonPressed(Button.AB, function () {
            irAlMenu()
        })
        // la lógica: un paso cada 10 ms
        basic.forever(function () {
            if (!configurado) {
                configurado = true
                aplicarReglas()
                semilla = randint(1, 30000)
                reiniciar()
                perdidasAntesA = vidasPerdidas[0]
                perdidasAntesB = vidasPerdidas[1]
                rondasAntes = rondasTerminadas
                estadoAntes = estado
            }
            if (cfgSucia) {
                aplicarReglas()
            }
            paso(control.millis(), input.buttonIsPressed(Button.A), input.buttonIsPressed(Button.B),
                leerCorona(0), leerCorona(1))
            if (sonido != S_NADA) {
                sonar(sonido)
                sonido = S_NADA
            }
            avisarEventos()
            perdidasAntesA = vidasPerdidas[0]
            perdidasAntesB = vidasPerdidas[1]
            rondasAntes = rondasTerminadas
            estadoAntes = estado
            basic.pause(10)
        })
        // la pantalla: los avisos primero (letras), luego el tablero
        basic.forever(function () {
            if (eventosCorriendo > 0) {
                basic.pause(50)
            } else if (aviso != "") {
                texto = aviso
                aviso = ""
                // un aviso que llega tarde no tapa el 3-2-1 (lección de Asedio E7b; firmware ronda 2)
                if (estado != E_CUENTA) {
                    mostrarAviso(texto)
                    basic.pause(500)
                }
            } else {
                dibujar()
                basic.pause(50)
            }
        })
    }

    // =====================================================================================================
    // BLOQUES DEL NIÑO (categoría «Rey»). Nombres y textos para 8–12 años; tiempos en segundos.
    // =====================================================================================================

    /**
     * Empieza el juego con las reglas de arriba. Sin este bloque, la placa no juega (misión 2).
     */
    //% block="jugar Rey" group="Juego" weight=100
    export function jugar() {
        if (arrancado) {
            return
        }
        arrancado = true
        arrancar()
    }

    /**
     * Con cuántas vidas empieza cada rey en cada ronda.
     */
    //% block="vidas al empezar $n" n.defl=3 n.min=1 n.max=9 group="Reglas" weight=90
    export function vidasAlEmpezar(n: number) {
        cfgVidas = Math.max(1, n)
        cfgSucia = true
    }

    /**
     * Cuánto dura cada ronda. Al acabar, gana quien tiene más vidas; si empatan, muerte súbita.
     */
    //% block="segundos por ronda $s" s.defl=120 s.min=30 s.max=600 group="Reglas" weight=89
    export function segundosPorRonda(s: number) {
        cfgRondaS = Math.max(30, s)
        cfgSucia = true
    }

    /**
     * Rondas que hay que ganar para ganar la partida (2 = al mejor de 3).
     */
    //% block="rondas para ganar $n" n.defl=2 n.min=1 n.max=5 group="Reglas" weight=88
    export function rondasParaGanar(n: number) {
        cfgRondasGanar = Math.max(1, n)
        cfgSucia = true
    }

    /**
     * Segundos después de un K.O. en que esa corona no puede volver a perder.
     */
    //% block="segundos de inmunidad tras un K.O. $s" s.defl=2 s.min=1 s.max=10 group="Reglas" weight=87
    export function segundosDeInmunidad(s: number) {
        cfgInmunidadS = Math.max(1, s)
        cfgSucia = true
    }

    /**
     * Cuánto dura «¡Al centro!» (los dos reyes deben estar en la zona de golpe).
     */
    //% block="segundos al centro $s" s.defl=8 s.min=3 s.max=30 group="Reglas" weight=86
    export function segundosAlCentro(s: number) {
        cfgAlCentroS = Math.max(3, s)
        cfgSucia = true
    }

    /**
     * ¿Está puesta la corona? (verdadero si la arandela cierra el contacto)
     */
    //% block="corona $j puesta" group="Sensores" weight=80
    export function coronaPuesta(j: Jugador): boolean {
        return leerCorona(j)
    }

    /**
     * Vidas que le quedan a un rey en esta ronda.
     */
    //% block="vidas de $j" group="Sensores" weight=79
    export function vidasDe(j: Jugador): number {
        return vidas[j]
    }

    /**
     * Cuando un rey pierde una vida (después de que el juego la quitó).
     */
    //% block="cuando $j pierde una vida" group="Eventos" weight=70
    export function alPerderVida(j: Jugador, handler: () => void) {
        if (j == Jugador.A) {
            alVidaA = handler
        } else {
            alVidaB = handler
        }
    }

    /**
     * Cuando cae la corona de un rey, aunque no cuente (inmunidad o viento).
     */
    //% block="cuando cae la corona $j" group="Eventos" weight=69
    export function alCaerCorona(j: Jugador, handler: () => void) {
        if (j == Jugador.A) {
            alCaeA = handler
        } else {
            alCaeB = handler
        }
    }

    /**
     * Cuando termina una ronda (también la última).
     */
    //% block="cuando termina la ronda" group="Eventos" weight=68
    export function alTerminarRonda(handler: () => void) {
        alRonda = handler
    }

    /**
     * Cuando se acaba la partida.
     */
    //% block="cuando termina la partida" group="Eventos" weight=67
    export function alTerminarPartida(handler: () => void) {
        alFin = handler
    }

    /**
     * Suma vidas (número positivo) o resta (negativo). Solo durante el duelo. No dispara «cuando pierde una vida»
     * (ese evento es solo para los K.O. del juego); si deja a un rey en 0, termina la ronda.
     */
    //% block="cambiar vidas de $j en $n" n.defl=1 group="Acciones" weight=60
    export function cambiarVidas(j: Jugador, n: number) {
        if (estado != E_DUELO) {
            return
        }
        vidas[j] = Math.max(0, vidas[j] + n)
        if (vidas[j] <= 0) {
            finDeRonda(1 - j)
        }
    }

    /**
     * Muestra las rondas ganadas por A y por B, por ejemplo «1-0». Úsalo (o sonidos) para avisar algo dentro de un evento.
     * (Son rondas y no vidas: al terminar una ronda las vidas ya volvieron a empezar; prueba de bloques 2026-11-14.)
     */
    //% block="mostrar marcador" group="Acciones" weight=59
    export function mostrarMarcador() {
        aviso = "" + rondas[0] + "-" + rondas[1]
    }
}
