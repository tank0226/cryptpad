require.config({ paths: { 'json.sortify': '/bower_components/json.sortify/dist/JSON.sortify' } });
define([
    '/api/config?cb=' + Math.random().toString(16).substring(2),
    '/common/realtime-input.js',
    '/common/crypto.js',
    '/common/TextPatcher.js',
    'json.sortify',
    '/form/ula.js',
    '/common/json-ot.js',
    '/bower_components/jquery/dist/jquery.min.js',
    '/customize/pad.js'
], function (Config, Realtime, Crypto, TextPatcher, Sortify, Formula, JsonOT) {
    var $ = window.jQuery;

    var key;
    var channel = '';
    var hash = false;
    if (!/#/.test(window.location.href)) {
        key = Crypto.genKey();
    } else {
        hash = window.location.hash.slice(1);
        channel = hash.slice(0,32);
        key = hash.slice(32);
    }

    var module = window.APP = {
        TextPatcher: TextPatcher,
        Sortify: Sortify,
        Formula: Formula,
    };
    var initializing = true;

    var uid = module.uid = Formula.uid;

    var getInputType = Formula.getInputType;
    var $elements = module.elements = $('input, select, textarea')

    var eventsByType = Formula.eventsByType;

    var Map = module.Map = {};

    var UI = module.UI = {
        ids: [],
        each: function (f) {
            UI.ids.forEach(function (id, i, list) {
                f(UI[id], i, list);
            });
        }
    };

    var cursorTypes = ['textarea', 'password', 'text'];

    var canonicalize = function (text) { return text.replace(/\r\n/g, '\n'); };
    $elements.each(function (index, element) {
        var $this = $(this);

        var id = uid();
        var type = getInputType($this);

        $this   // give each element a uid
            .data('rtform-uid', id)
                // get its type
            .data('rt-ui-type', type);

        UI.ids.push(id);

        var component = UI[id] = {
            id: id,
            $: $this,
            element: element,
            type: type,
            preserveCursor: cursorTypes.indexOf(type) !== -1,
            name: $this.prop('name'),
        };

        component.value = (function () {
            var checker = ['radio', 'checkbox'].indexOf(type) !== -1;

            if (checker) {
                return function (content) {
                    return typeof content !== 'undefined'?
                        $this.prop('checked', !!content):
                        $this.prop('checked');
                };
            } else {
                return function (content) {
                    return typeof content !== 'undefined' ?
                        $this.val(content):
                        canonicalize($this.val());
                };
            }
        }());

        var update = component.update = function () { Map[id] = component.value(); };
        update();
    });

    var config = module.config = {
        initialState: Sortify(Map) || '{}',
        websocketURL: Config.websocketURL,
        userName: Crypto.rand64(8),
        channel: channel,
        cryptKey: key,
        crypto: Crypto,
        transformFunction: JsonOT.validate
    };

    var setEditable = module.setEditable = function (bool) {
        /* (dis)allow editing */
        $elements.each(function () {
            $(this).attr('disabled', !bool);
        });
    };

    setEditable(false);

    var onInit = config.onInit = function (info) {
        var realtime = module.realtime = info.realtime;
        window.location.hash = info.channel + key;

        // create your patcher
        module.patchText = TextPatcher.create({
            realtime: realtime,
            logging: true,
        });
    };

    var onLocal = config.onLocal = function () {
        if (initializing) { return; }
        /* serialize local changes */
        readValues();
        module.patchText(Sortify(Map));
    };

    var readValues = function () {
        UI.each(function (ui, i, list) {
            Map[ui.id] = ui.value();
        });
    };

    var updateValues = function () {
        var userDoc = module.realtime.getUserDoc();
        var parsed = JSON.parse(userDoc);

        console.log(userDoc);

        UI.each(function (ui, i, list) {
            var newval = parsed[ui.id];
            var oldval = ui.value();

            if (newval === oldval) { return; }

            var op;
            var element = ui.element;
            if (ui.preserveCursor) {
                op = TextPatcher.diff(oldval, newval);
                var selects = ['selectionStart', 'selectionEnd'].map(function (attr) {
                    var before = element[attr];
                    var after = TextPatcher.transformCursor(element[attr], op);
                    return after;
                });
            }

            ui.value(newval);
            ui.update();

            if (op) {
                console.log(selects);
                element.selectionStart = selects[0];
                element.selectionEnd = selects[1];
            }
        });
    };

    var onRemote = config.onRemote = function (info) {
        if (initializing) { return; }
        /* integrate remote changes */
        updateValues();
    };

    var onReady = config.onReady = function (info) {
        updateValues();

        console.log("READY");
        setEditable(true);
        initializing = false;
    };

    var onAbort = config.onAbort = function (info) {
        window.alert("Network Connection Lost");
    };

    var rt = Realtime.start(config);

    UI.each(function (ui, i, list) {
        var type = ui.type;
        var events = eventsByType[type];
        ui.$.on(events, onLocal);
    });

});
