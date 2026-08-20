/**
 * NTP synchronizace pro ELECFREAKS IoT:bit.
 */
//% weight=70 icon="\uf017" color=#006699
namespace IoTbitNTP {

    function mesicNaCislo(mesic: string): number {
        if (mesic == "Jan") return 1
        if (mesic == "Feb") return 2
        if (mesic == "Mar") return 3
        if (mesic == "Apr") return 4
        if (mesic == "May") return 5
        if (mesic == "Jun") return 6
        if (mesic == "Jul") return 7
        if (mesic == "Aug") return 8
        if (mesic == "Sep") return 9
        if (mesic == "Oct") return 10
        if (mesic == "Nov") return 11
        if (mesic == "Dec") return 12

        return 0
    }


    function prestupnyRok(rok: number): boolean {
        if (rok % 400 == 0) return true
        if (rok % 100 == 0) return false
        if (rok % 4 == 0) return true

        return false
    }


    function pocetDniVMesici(
        rok: number,
        mesic: number
    ): number {

        if (
            mesic == 1 ||
            mesic == 3 ||
            mesic == 5 ||
            mesic == 7 ||
            mesic == 8 ||
            mesic == 10 ||
            mesic == 12
        ) {
            return 31
        }

        if (
            mesic == 4 ||
            mesic == 6 ||
            mesic == 9 ||
            mesic == 11
        ) {
            return 30
        }

        if (mesic == 2) {
            if (prestupnyRok(rok)) {
                return 29
            } else {
                return 28
            }
        }

        return 0
    }


    // Vrací:
    // 0 = neděle
    // 1 = pondělí
    // ...
    // 6 = sobota
    function denVTydnu(
        rok: number,
        mesic: number,
        den: number
    ): number {

        let tabulka = [
            0, 3, 2, 5, 0, 3,
            5, 1, 4, 6, 2, 4
        ]

        let y = rok

        if (mesic < 3) {
            y = y - 1
        }

        return (
            y +
            Math.floor(y / 4) -
            Math.floor(y / 100) +
            Math.floor(y / 400) +
            tabulka[mesic - 1] +
            den
        ) % 7
    }


    function posledniNedele(
        rok: number,
        mesic: number
    ): number {

        let posledniDen =
            pocetDniVMesici(rok, mesic)

        let denTydne =
            denVTydnu(
                rok,
                mesic,
                posledniDen
            )

        return posledniDen - denTydne
    }


    /*
     * Letní čas v ČR:
     *
     * začátek:
     * poslední neděle v březnu
     * v 01:00 UTC
     *
     * konec:
     * poslední neděle v říjnu
     * v 01:00 UTC
     */
    function jeLetniCas(
        rok: number,
        mesic: number,
        den: number,
        hodinaUTC: number
    ): boolean {

        // Duben až září
        if (mesic > 3 && mesic < 10) {
            return true
        }

        // Leden, únor, listopad, prosinec
        if (mesic < 3 || mesic > 10) {
            return false
        }


        // BŘEZEN
        if (mesic == 3) {

            let posledni =
                posledniNedele(rok, 3)

            if (den > posledni) {
                return true
            }

            if (den < posledni) {
                return false
            }

            // Poslední neděle v březnu
            return hodinaUTC >= 1
        }


        // ŘÍJEN
        if (mesic == 10) {

            let posledni =
                posledniNedele(rok, 10)

            if (den < posledni) {
                return true
            }

            if (den > posledni) {
                return false
            }

            // Poslední neděle v říjnu
            return hodinaUTC < 1
        }


        return false
    }


    /**
     * Synchronizuje RTC DS1307 přes NTP.
     * Automaticky nastaví český zimní nebo letní čas.
     * Wi-Fi připojení se kontroluje automaticky.
     */
    //% blockId=iotbit_ntp_sync
    //% block="synchronizovat RTC přes NTP"
    //% weight=100
    export function synchronizovatRTC(): boolean {

        // --------------------------------
        // 1. ČEKÁNÍ NA PŘIPOJENÍ WI-FI
        // --------------------------------

        let timeout =
            input.runningTime() + 15000

        while (
            !ESP8266_IoT.wifiState(true) &&
            input.runningTime() < timeout
        ) {
            basic.pause(200)
        }

        // Wi-Fi se nepodařilo připojit
        if (!ESP8266_IoT.wifiState(true)) {
            return false
        }


        // --------------------------------
        // 2. NASTAVENÍ SNTP NA UTC
        // --------------------------------

        // ELECFREAKS knihovna používá
        // při resetu UTC+8.
        //
        // Proto až po připojení Wi-Fi
        // přepíšeme nastavení na UTC+0.

        let cfg = ESP8266_IoT.sendRequest(
            'AT+CIPSNTPCFG=1,0,"0.pool.ntp.org","1.pool.ntp.org","time.google.com"',
            "OK",
            3000
        )

        if (cfg == null) {
            return false
        }

        // Počkáme na aktualizaci SNTP po změně z UTC+8 na UTC+0
        basic.pause(2000)

        // --------------------------------
        // 3. ČEKÁNÍ NA PLATNÝ NTP ČAS
        // --------------------------------

        let odpoved = ""
        let platnyCas = false

        for (
            let pokus = 0;
            pokus < 10;
            pokus++
        ) {

            odpoved =
                ESP8266_IoT.sendRequest(
                    "AT+CIPSNTPTIME?",
                    "+CIPSNTPTIME:",
                    3000
                )

            if (
                odpoved != null &&
                odpoved.indexOf(
                    "+CIPSNTPTIME:"
                ) >= 0 &&
                odpoved.indexOf(
                    "1970"
                ) < 0
            ) {

                platnyCas = true
                break
            }

            basic.pause(1000)
        }


        if (!platnyCas) {
            return false
        }


        // --------------------------------
        // 4. ROZPARSOVÁNÍ NTP ODPOVĚDI
        // --------------------------------

        // Příklad:
        //
        // +CIPSNTPTIME:Thu Aug 20 12:15:30 2026
        //
        // Čas je zde v UTC.

        let text =
            odpoved.replace(
                "+CIPSNTPTIME:",
                ""
            )

        let casti =
            text.split(" ")


        if (casti.length < 5) {
            return false
        }


        let mesic =
            mesicNaCislo(casti[1])

        let den =
            parseInt(casti[2])


        let cas =
            casti[3].split(":")


        if (cas.length < 3) {
            return false
        }


        let hodina =
            parseInt(cas[0])

        let minuta =
            parseInt(cas[1])

        let sekunda =
            parseInt(cas[2])

        let rok =
            parseInt(casti[4])


        if (mesic == 0) {
            return false
        }


        // --------------------------------
        // 5. ZIMNÍ / LETNÍ ČAS
        // --------------------------------

        let posun = 1

        if (
            jeLetniCas(
                rok,
                mesic,
                den,
                hodina
            )
        ) {
            posun = 2
        }


        hodina =
            hodina + posun


        // --------------------------------
        // 6. PŘECHOD PŘES PŮLNOC
        // --------------------------------

        if (hodina >= 24) {

            hodina =
                hodina - 24

            den =
                den + 1


            // Přechod do dalšího měsíce
            if (
                den >
                pocetDniVMesici(
                    rok,
                    mesic
                )
            ) {

                den = 1
                mesic = mesic + 1


                // Přechod do dalšího roku
                if (mesic > 12) {

                    mesic = 1
                    rok = rok + 1
                }
            }
        }


        // --------------------------------
        // 7. ZÁPIS DO RTC DS1307
        // --------------------------------

        RTC_DS1307.DateTime(
            rok,
            mesic,
            den,
            hodina,
            minuta,
            sekunda
        )


        return true
    }
}
