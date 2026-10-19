///permission net.fetch
/**
 * Source: https://github.com/Snehil-Shah/libresprite-mcp (v0.1.3, GPL-2.0)
 *
 * Angepasst für LibreSprite 1.3 (Kellogg's Land HD, 19.10.2026), ebenfalls GPL-2.0:
 * - globales Objekt ohne `this` ermitteln (in 1.3 ist `this` im Skript undefiniert)
 * - Relay über 127.0.0.1 statt localhost (Server lauscht nur auf IPv4)
 * - erste Zeile `///permission net.fetch`: ohne diese Freigabe blockiert LibreSprite 1.3 storage.fetch
 * - Ereignis-Handler zusätzlich ausdrücklich mit setEventHandler setzen
 * - Antworten von storage.fetch nicht nur über das Ereignis „<schlüssel>_fetch“ erkennen, sondern
 *   zusätzlich durch Nachsehen bei jedem Ereignis; Takt über setTimeout statt app.yield (kommt in 1.3 nicht an)
 */

// Cache the global context.
const global = (typeof globalThis !== 'undefined' && globalThis) || Function('return this')();

/**
 * Model Context Protocol (MCP) remote script that interacts with the libresprite-mcp server.
 *
 * NOTE: Defined as an IIFE to avoid global namespace pollution.
 */
(function MCP() {
    // CONSTANTS //

    /**
     * URL to the relay server exposing the next command.
     */
    const RELAY_SERVER_URL = 'http://127.0.0.1:64823';

    /**
     * Delay between polling requests. (in number of rendering cycles)
     */
    const POLL_DELAY = 120;


    // VARIABLES //

    /**
     * Flag indicating extension state.
     *
     * @type {boolean}
     */
    let active = false;

    /**
     * Flag indicating whether polling is active.
     *
     * @type {boolean}
     */
    let polling = false;

    /**
     * Flag indicating whether the client is connected to the server.
     *
     * @type {boolean}
     */
    let connected = false;

    /**
     * Stores stdout.
     *
     * @type {string}
     */
    let output = '';

    /**
     * Function to get response from storage in the next cycle.
     *
     * @type {Function|null}
     */
    let _get_response = null;

    /**
     * Function to post response to storage in the next cycle.
     *
     * @type {Function|null}
     */
    let _post_response = null;

    /**
     * Dialog instance for UI.
     */
    let dialog = null;


    // FUNCTIONS //

    /**
     * Global `console.log`.
     */
    const _clientLogger = global.console.log;

    // Override global console object to capture stdout.
    const console = Object.assign({}, global.console);

    /**
     * Modified `console.log` that captures output before logging.
     */
    console.log = function() {
        var args = Array.prototype.slice.call(arguments);
        output += args.join(' ') + '\n';
        _clientLogger.apply(null, args);
    }

    /**
     * Makes a GET request.
     *
     * @private
     * @param {string} url - url to fetch
     * @param {Function} cb - callback function to handle the response
     */
    // Jede Anfrage bekommt einen eigenen Schlüssel; fertig ist sie, sobald „<schlüssel>_status“ gesetzt ist.
    // Fehlersuche: Schritte in die Konsole von LibreSprite schreiben (DEBUG = false schaltet es ab)
    const DEBUG = false;
    let _dbgCount = 0;
    function _dbg(msg) { if (DEBUG && _dbgCount++ < 200) global.console.log('[mcp] ' + msg); }
    // In LibreSprite 1.3 kommen app.yield-Ereignisse nicht beim Skript an. Deshalb: setTimeout, wenn
    // vorhanden; sonst sofort weitermachen (die Fertig-Ereignisse von storage.fetch treiben die Schleife).
    function schedule(event, frames) {
        if (typeof setTimeout === 'function') { setTimeout(function () { onEvent(event); }, Math.max(1, (frames || 1) * 16)); return; }
        try { app.yield(event, frames); } catch (e) {}
        if (event !== '_mcp_wait') _later.push(event);
    }
    let _later = [];
    function _runLater() { while (_later.length) onEvent(_later.shift()); }
    // ohne setTimeout: aufgeschobene Ereignisse nach dem aktuellen Ereignis abarbeiten
    function setTimeoutFree() { if (typeof setTimeout !== 'function' && _later.length) { const l = _later; _later = []; for (let i = 0; i < l.length; i++) onEvent(l[i]); } }
    let _reqId = 0;
    let _pending = [];
    function _request(url, args, cb) {
        const key = '_mcp_req_' + (++_reqId);
        _dbg('fetch ' + url + ' -> ' + key);
        try { storage.fetch.apply(storage, [url, key].concat(args)); } catch (e) { _dbg('fetch Fehler: ' + e); }
        _pending.push({ key: key, cb: cb, tries: 0 });
        schedule('_mcp_wait', 2);
    }
    function _checkPending() {
        const still = [];
        const done = [];
        for (let i = 0; i < _pending.length; i++) {
            const p = _pending[i];
            const status = storage.get(p.key + '_status');
            if (p.tries % 300 === 0) _dbg('warte ' + p.key + ' status=' + status + ' versuch=' + p.tries);
            if (status !== undefined && status !== null && status !== '') done.push({ p: p, status: status });
            else if (++p.tries > 1e9) done.push({ p: p, status: 0 });   // der Server hält Abfragen offen, bis ein Befehl kommt
            else still.push(p);
        }
        _pending = still;
        for (let i = 0; i < done.length; i++) {
            const d = done[i];
            d.p.cb({ string: storage.get(d.p.key), status: d.status });
        }
        if (_pending.length) schedule('_mcp_wait', 2);
    }
    function _get(url, cb) {
        _request(url, [], cb);
    }

    /**
     * Makes a POST request.
     *
     * @private
     * @param {string} url - url to fetch
     * @param {string} body - request body
     * @param {Function} cb - callback function to handle the response
     */
    function _post(url, body, cb) {
        _request(url, ["", "POST", body, "Content-Type", "application/json"], cb);
    }

    /**
     * Makes a GET request.
     *
     * @param {string} url - url to fetch
     * @param {Function} cb - callback function to handle the response
     */
    function get(url, cb) {
        _get(url, function(rsp) {
            var data, error = rsp.status != 200 ? 'status:' + rsp.status : 0;
            try {
                if (!error)
                    data = JSON.parse(rsp.string);
            } catch (ex) {
                error = ex + ' (Text: ' + String(rsp.string).slice(0, 120) + ')';
            }
            cb(data, error);
        });
    }

    /**
     * Makes a POST request.
     *
     * @param {string} url - url to fetch
     * @param {Object} body - request body
     * @param {Function} cb - callback function to handle the response
     */
    function post(url, body, cb) {
        _post(url, body, function(rsp) {
            var data, error = rsp.status != 200 ? 'status:' + rsp.status : 0;
            try {
                if (!error)
                    data = JSON.parse(rsp.string);
                else error += rsp.string;
            } catch (ex) {
                error = ex;
            }
            cb(data, error);
        });
    }

    /**
     * Pings for server health.
     *
     * This yields a "bad_health" event if the server is unreachable,
     * or an "init" event if the server is reachable.
     */
    function checkServerHealth() {
        get(RELAY_SERVER_URL + '/ping', function(data, error) {
            if (error) {
                connected = false;
                schedule("bad_health", POLL_DELAY);
                return;
            }
            if (data && data.status === 'pong') {
                connected = true;
                schedule("good_health");
            } else {
                connected = false;
                schedule("bad_health", POLL_DELAY);
            }

        });
    }

    /**
     * Fetches the next script from the server.
     *
     * @param {Function} cb - script handler
     */
    let _lastGetError = '';
    function getScript(cb) {
        get(RELAY_SERVER_URL, function(data, error) {
            if (error) {
                _lastGetError = String(error);
                // The post request will log the error.
                cb('');
                return;
            }
            _lastGetError = (data && typeof data.script !== 'string') ? 'Antwort ohne Skript: ' + JSON.stringify(data).slice(0, 200) : '';
            cb((data && data.script) ? data.script : '');
        });
    }

    /**
     * Posts the output to the server.
     */
    function postOutput() {
        const body = JSON.stringify({output: output});
        post(RELAY_SERVER_URL, body, function(data, error) {
            // NOTE: This is the last interaction with the MCP server for a tool call and hence we ensure updates to the UI and connection status.
            if (error) {
                _clientLogger('The MCP server was shut down.');
                connected = false;
                paintUI();
                schedule("bad_health", POLL_DELAY);
                return;
            }
            if ( !data ) {
                _clientLogger('Something went wrong. Please report it on https://github.com/Snehil-Shah/libresprite-mcp/issues.');
                return;
            }
            if ( data.status === 'invalid' )
                _clientLogger('Something is wrong. Please report it on https://github.com/Snehil-Shah/libresprite-mcp/issues.');
            // Other status types can be ignored...
            // Continue polling...
            if (!polling) {
                return;
            }
            schedule("poll", POLL_DELAY);
        });
    }

    /**
     * Runs a script in the current context.
     *
     * @param {string} script - script to run
     */
    function runScript(script) {
        if (!script) {
            return;
        }
        try {
            // Execute in global scope with our custom logger...
            // Ausgaben sowohl über den übergebenen als auch über den globalen console abfangen
            const g = global.console, oldLog = g && g.log;
            try { if (g) g.log = console.log; } catch (e) {}
            try { new Function('console', script)(console); }
            finally { try { if (g) g.log = oldLog; } catch (e) {} }
        } catch (e) {
            console.log('Error in script:', e.message);
        }
    }

    /**
     * Fetches, executes, and posts the output for the next script.
     *
     * NOTE: This is the entry point for the polling loop.
     */
    // Genau eine Abfrage-Schleife: jede Schleife hat eine Nummer, ältere beenden sich still.
    let _loop = 0;
    function exec(loop) {
        if (loop === undefined) loop = _loop;
        if (!polling || loop !== _loop) return;
        _dbg('exec loop=' + loop + ' polling=' + polling);
        getScript(script => {
            _dbg('script erhalten: ' + (script ? script.length + ' Zeichen' : 'leer') + ' loop=' + loop + '/' + _loop + ' polling=' + polling);
            if (!polling || loop !== _loop) return;
            if (!script) {
                // Kein Befehl (Server liefert null, wenn eine andere Abfrage ihn schon geholt hat):
                // nichts zurückschicken, sonst hielte der Server das für die Ausgabe eines Befehls.
                schedule('poll', 10);
                return;
            }
            output = ''; // sanity reset
            runScript(script);
            if (!output) output = '(Skript ausgeführt, keine Ausgabe)';
            postOutput();
        });
    }

    /**
     * Starts the polling loop.
     */
    function startPolling() {
        if (polling) return;
        polling = true;
        _loop++;
        exec(_loop);
    }

    /**
     * Stops the polling loop.
     */
    function stopPolling() {
        polling = false;
        _loop++;
    }

    /**
     * Paints the UI dialog based on the current state.
     */
    function paintUI() {
        // Das Fenster nur einmal bauen: Schließen und Neubauen löst in LibreSprite 1.3 ein „_close“-
        // Ereignis aus, das die Verbindung wieder beendet hat. Verbunden wird automatisch.
        if (dialog) return;
        dialog = app.createDialog();
        dialog.title = 'libresprite-mcp';
        dialog.addLabel('Verbindung zu Claude: verbindet sich automatisch, sobald der Server läuft.');
        dialog.addBreak();
        dialog.addLabel('Fenster offen lassen. Schließen beendet die Verbindung.');
    }


    // MAIN //

    /**
     * Event handler.
     *
     * @global
     * @param {string} event
     */
    function onEvent(event) {
        // Offene Anfragen bei jedem Ereignis prüfen (Fertig-Ereignisse heißen je nach Version anders)
        if (event !== '_mcp_wait' || _dbgCount < 5) _dbg('Ereignis: ' + event);
        if (_pending.length) _checkPending();
        if (event !== '_mcp_wait') setTimeoutFree();
        switch (event) {
            case '_mcp_wait':
                return;
            /**
             * Initialize script.
             */
            case 'init':
                _dbg('setTimeout=' + typeof setTimeout + ' app.yield=' + typeof app.yield);
                active = true;
                checkServerHealth();
                paintUI();
                return;
            /**
             * Cleanup script.
             */
            case '_close':
                _dbg('Fenster geschlossen -> Verbindung beendet');
                active = false;
                connected = false;
                polling = false;
                return;
            /**
             * Events triggered by initial health checks.
             */
            case 'bad_health':
                if (!active) {
                    // The extension was closed, stop recursion...
                    return;
                }
                checkServerHealth();
                return;
            case 'good_health':
                // Gleich verbinden: in LibreSprite 1.3 reagiert der Connect-Knopf nicht zuverlässig
                if (!polling) startPolling();
                paintUI();
                return;
            /**
             * UI operation.
             */
            case 'toggle_click':
                if (polling) {
                    stopPolling();
                } else {
                    startPolling();
                }
                paintUI();
                return;
            /**
             * Successful 'GET' event response triggered by `storage.fetch`.
             */
            case '_get_response_fetch':
                _get_response && _get_response();
                _get_response = null;
                return;
            /**
             * Successful 'POST' event response triggered by `storage.fetch`.
             */
            case '_post_response_fetch':
                _post_response && _post_response();
                _post_response = null;
                return;
            /**
             * Event triggered to continue polling the endpoint.
             */
            case 'poll':
                if (!active) {
                    // The extension was closed, stop recursion...
                    // NOTE: This is a sanity check and should never be executed given the close button is not visible during polling
                    stopPolling();
                    return;
                }
                exec();
                return;
            default:
                // No action for unknown events
                break;
        }
    }
    global.onEvent = onEvent;
    if (typeof setEventHandler === 'function') setEventHandler(onEvent);
})();