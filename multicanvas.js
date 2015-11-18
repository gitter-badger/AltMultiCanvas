/* global altspace */

var Chainable = (function() {
    "use strict";
    
    return function unit(value) {
        var chains = {
            bind : function(fn, args) { 
                var results = fn.apply(this, [value].concat(Array.prototype.slice.apply(args || [])));
                if(typeof results === "undefined") {
                    return this;  
                } else {
                    return results;
                }
            },
            wrap : function(fn) {
                var self = this;
                return function() { return self.bind.call(self, fn, arguments) };
            },
            lift : function(property, fn) {
                this[property] = this.wrap(fn);
                return this;
            },
            property : function(property, get, set) {
                Object.defineProperty(this, property, {
                    enumerable: true,
                    configurable: true,
                    get: get ? this.wrap(get) : undefined,
                    set: set ? this.wrap(set) : undefined
                });
                return this;
            }
        };
        
        return Object.create(chains);
    };
} ());

var MultiCanvas = (function() {
    "use strict";
    
    var events = [
            "keydown", "keypress", "mousedown", "mouseup", "mouseover", "click", "dblclick",
            "keyup", "mouseout", "mousemove"
        ],
        Simulate = (function() {
            var eventMatchers = {
                    "HTMLEvents": /^(?:load|unload|abort|error|select|change|submit|reset|focus|blur|resize|scroll)$/,
                    "MouseEvents": /^(?:click|dblclick|mouse(?:down|up|over|move|out))$/,
                    "KeyboardEvents": /^(?:keydown|keyup|keypress)$/
                };

            return function (element, options) {
                var oEvent, 
                    eventType;
                
                // really dislike this part
                for (var name in eventMatchers) {
                    if (eventMatchers[name].test(options.type)) { 
                        eventType = name; break; 
                    }
                }
                // TODO: mouse events should be an offset based on where on the canvas they clicked
                switch(eventType) {
                    case "MouseEvents":
                        oEvent = new MouseEvent(options.type, {});
                        break;
                    case "KeyboardEvents":
                        oEvent = new KeyboardEvent(options.type, {});
                        Object.defineProperty(oEvent, "keyCode", {
                            get : function() { return options.keyCode; }
                        });
                        
                        Object.defineProperty(oEvent, "which", {
                            get : function() { return options.keyCode; }
                        });
                        break;
                    default:
                        oEvent = new Event(options.type, options);
                }
                element.dispatchEvent(oEvent);

                return element;
            };
        } ());

    return function(canvas) {
        var sync = altspace.utilities.sync.getInstance({
                appId : "MultiCanvas",
                authorId: "Galvus"
            }),
            userInfo = null,
            syncData = {
                host : -1,
                canvas : "",
                event : ""   
            },
            userPromise = null,
            hostInt = null,
            isHost = false,
            lossless = false,
            quality = 0.5,
            eventTarget,
            ctx = canvas.getContext("2d"),
            hostSetup = function(tickRate) {
                sync.set({ host : userInfo.userId });
                hostInt = setInterval(onTick, tickRate);   
            },
            onTick = function() {
                var payload = lossless ? 
                    canvas.toDataURL("image/png") :
                    canvas.toDataURL("image/jpeg", quality);
                
                sync.update({ canvas : payload });
            },
            onEvent = function(e) {
                // I could care about sending only defined data... or I couldn't.
                if(e.preventDefault) {
                    e.preventDefault();
                }

                sync.update({ 
                    event : JSON.stringify({
                        type     : e.type,
                        keyCode  : e.keyCode,
                        charCode : e.charCode,
                        screenX  : e.screenX,
                        screenY  : e.screenY,
                        clientX  : e.clientX,
                        clientY  : e.clientY,
                        button   : e.button
                    })
                });
            };
         
        // grab user info ?
        if(false && altspace.inClient) {    
            userPromise = altspace.getUser().then(function(rUserInfo) {
                userInfo = rUserInfo;
            });
        } else {
            userInfo = {
                userId : Math.random()
            };
        }
        
        sync.child("host").on("value", function(data) {
            isHost = data.val() === (userInfo && userInfo.userId);
            if(hostInt && !isHost) {
                clearInterval(hostInt);
            }
        });
        
        sync.child("event").on("value", function(data) {
            if(isHost) {
                Simulate(eventTarget, JSON.parse(data.val()));
            }
        });
        
        sync.child("canvas").on("value", function(data) {
            if(!isHost) {
                var img = new Image();
                img.src = data.val();
                img.onload = function() {
                    ctx.drawImage(img, 0, 0);
                };
            }
        });

        return Chainable(canvas)
            .lift("host", function(canvas, tickRate) {
                if(!userInfo) {
                    userPromise.then(hostSetup.bind(null, tickRate));
                } else {
                    hostSetup(tickRate);
                }
            })
            .property("sync", function(canvas) {
                return sync;  
            })
            .property("lossless", function(canvas){
                return lossless;
            }, function(canvas, plossless) {
                lossless = plossless;
            })
            .property("quality", function(canvas) {
                return quality;
            }, function(canvas, pquality) {
                quality = pquality;
            })
            .lift("sim", function(canvas, e) {
                if(host) {
                    if(eventTarget) {
                        Simulate(eventTarget, e);
                    }
                } else {
                    onEvent(e);
                }
            })
            .lift("connect", function(canvas, id) {
                // (auto connects)
            })
            .lift("events", function(canvas, target, events) {
                target = target || canvas;
                
                if(!isHost) {
                    events.forEach(function(event) {
                        target.addEventListener(event, onEvent);
                    });
                } else {
                    eventTarget = target;
                }
            });
    };
} ());