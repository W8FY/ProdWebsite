/* 
	Turtle skin by Laszlo Molnar
	(C) 2011
*/

var DEBUG = true,
	UNDEF = 'undefined',
	OBJECT = 'object',
	NOLINK = 'javascript:void(0)',
	SHOCKWAVE_FLASH = 'Shockwave Flash',
	SHOCKWAVE_FLASH_AX = 'ShockwaveFlash.ShockwaveFlash',
	FLASH_MIME_TYPE = 'application/x-shockwave-flash';

String.prototype.trim = function() { 
	return this.replace(/^\s+|\s+$/g,''); 
};

String.prototype.trunc = function( n ) {
	if (this.length <= n) return this.toString();
	var s = this.substring(0, n - 1), i = s.lastIndexOf(' ');
	return ((i > 6 && (s.length - i) < 20)? s.substring(0, i) : s) + '...';
};

String.prototype.startsWith = function( s ) {
	return this.indexOf( s ) === 0;
};

String.prototype.endsWith = function( s ) {
	return this.substring(this.length - s.length) === s;
};

String.prototype.getExt = function() {
	var i = this.lastIndexOf('.');
	return (i <= 0 || i >= this.length - 1)? '' : this.substring(i + 1).toLowerCase();
};

String.prototype.replaceExt = function( s ) {
	var i = this.lastIndexOf('.');
	return (i <= 0)? this : (this.substring(0, i + 1) + s);  
};

String.prototype.fixExtension = function() {
	return this.replace(/.gif$/gi, '.png').replace(/.tif+$/gi, '.jpg');
};

var htmlregex = [
	[ /<br>/gi, '\n' ],
	[ /\&amp;/gi, '&' ],
	[ /\&lt;/gi, '<' ],
	[ /\&gt;/gi, '>' ],
	[ /\&(m|n)dash;/gi , '-' ],
	[ /\&apos;/gi, '\'' ],
	[ /\&quot;/gi, '"' ]
];

String.prototype.cleanupHTML = function() {
	var s = this;
	for ( var i = htmlregex.length - 1; i >= 0; i--) {
		s = s.replace( htmlregex[i][0], htmlregex[i][1] );
	}
	return s; 
};

String.prototype.stripHTML = function() { 
	return this.replace(/<\/?[^>]+>/gi, ''); 
};

String.prototype.stripQuote = function() {
	return this.replace(/\"/gi, '&quot;');
};

String.prototype.appendSep = function(s, sep) { 
	return (this.length? (this + (sep || ' &middot; ')) : '') + s; 
};

String.prototype.rgb2hex = function() {
	if (this.charAt(0) === '#' || this == 'transparent') {
		return this;
	}
	var n, r = this.match(/\d+/g), h = '';
	for ( var i = 0; i < r.length && i < 3; i++ ) {
		n = parseInt( r[i] ).toString(16);
		h += ((n.length < 2)? '0' : '') + n;
	}
	return '#' + h;
};

String.prototype.template = function( t ) {
	if ( !t ) {
		return this;
	}
	var s = this;
	for ( var i = 0; i < t.length; i++ ) {
		s = s.replace( new RegExp('\\{' + i + '\\}', 'gi'), t[i] );
	}
	return s;
};

Math.minMax = function(a, b, c) {
	b = (isNaN(b))? parseFloat(b) : b;
	return  (b < a)? a : ((b > c)? c : b); 
};

var getCoords = function( e ) {
	if ( e.touches && e.touches.length > 0 ) {
		return { 
			x: Math.round(e.touches[0].clientX),
			y: Math.round(e.touches[0].clientY)
		};
	} else if ( e.clientX != null ) {
		return {
			x: Math.round(e.clientX),
			y: Math.round(e.clientY)
		};
	}
	return { 
		x: UNDEF,
		y: UNDEF
	};
};

// checkFlash: Flash plugin detection from SWFObject.js
checkFlash = function( rv ) {
	var n = navigator, v = [ 1, 0, 0 ], d;
	rv = rv? rv.split('.') : [ 0, 0, 0 ];
	if (typeof n.plugins != UNDEF && typeof n.plugins[SHOCKWAVE_FLASH] == OBJECT) {
		d = n.plugins[SHOCKWAVE_FLASH].description;
		if (d && !(typeof n.mimeTypes != UNDEF && n.mimeTypes[FLASH_MIME_TYPE] && !n.mimeTypes[FLASH_MIME_TYPE].enabledPlugin)) { 
			d = d.replace(/^.*\s+(\S+\s+\S+$)/, "$1");
			v[0] = parseInt(d.replace(/^(.*)\..*$/, "$1"), 10);
			v[1] = parseInt(d.replace(/^.*\.(.*)\s.*$/, "$1"), 10);
			v[2] = /[a-zA-Z]/.test(d) ? parseInt(d.replace(/^.*[a-zA-Z]+(.*)$/, "$1"), 10) : 0;
		}
	}
	else if (typeof window.ActiveXObject != UNDEF) {
		try {
			var a = new ActiveXObject(SHOCKWAVE_FLASH_AX);
			if (a && typeof a.GetVariable != UNDEF) {
				d = a.GetVariable("$version");
				if ( d ) {
					d = d.split(" ")[1].split(",");
					v[0] = parseInt(d[0], 10);
					v[1] = parseInt(d[1], 10);
					v[2] = parseInt(d[2], 10);
				}
			}
		}
		catch(e) {}
	}
	return (v[0] > rv[0]) || 
		(v[0] == rv[0] && v[1] > rv[1]) || 
		(v[0] == rv[0] && v[1] == rv[1] && v[2] >= rv[2]);
};

(function($) {

	// vendor prefixes
	
	var vend = $.browser.msie && 'ms' || 
		$.browser.webkit && 'webkit' || 
		$.browser.mozilla && 'moz' || 
		$.browser.opera && 'o' || '';
		
	var vendor = vend? ('-' + vend + '-') : '';
	
	// log: logging function
	
	var _logel, _logover = false, _lastlog, _lastcnt = 1;
	log = function(c) {
		if ( !DEBUG || _logover ) return;
		if ( !_logel ) {
			_logel = $('<div id="log" style="position:fixed;left:0;top:0;width:200px;bottom:0;overflow:auto;padding:10px;background-color:rgba(0,0,0,0.5);color:#fff;font-size:15px;z-index:99999"></div>').hover(function(){
				_logover = true;
			},function(){
				_logover = false;
			}).appendTo('body');
		}
		if (c === _lastlog) {
			_logel.children(':first').empty().html(_lastlog + ' (' + (++_lastcnt) + ')');
		} else {
			$('<div style="height:2em;overflow:hidden;">' + c + '</div>').prependTo(_logel);
			_lastlog = c;
			_lastcnt = 1;
		}
	};
		
	// Search :: searching throughout all the album pages
	
	if ( typeof Search !== UNDEF ) {
		Search.start = function( source ) {

			var t = (source && source.tagName && source.nodeName)? 
				((source.nodeName === 'FORM')? $(source).find('input[type=search]').val().trim() : $(source).text().trim()) : String(source);
			var el = $('<div>', { 
					'class': 'searchresults' 
				}),
				found = 0, c,
				i, j, k, a, p, r, s, re = new RegExp('('+t.replace(/\s/g, '|')+')', 'i');
		
			if ( !Search.data || !$.isArray(Search.data) || !Search.data.length || !t || t.length < 2 )
				return;
				
			el.append($('<h4>', { html: Search.text.headln + ' &quot;<b>' + t + '</b>&quot;' }));
			
			for ( i = 0; i < Search.data.length; i++ ) {
				for ( j = 0; j <  Search.data[i][1].length; j++ ) {
					if ( re.test(Search.data[i][1][j]) ) {
						
						s = Search.data[i][1][j].split(Search.sep);
						r = (Search.rootPath && Search.rootPath !== '.')? (Search.rootPath + '/') : ''; 
						p = r + (Search.data[i][0]? (Search.data[i][0] + '/') : '');
						
						a = $('<a>', { 
							href: p + (s[0].startsWith('#')? Search.indexName : '') + s[0] // s[0].replace(/%/g,'%25') 
						}).on('click', function(e) {
							if ( !window.location.href.endsWith($(this).attr('href')) ) {
								cookie('lastSearch', t, 8);
								return true;
							}
							e.cancelBubble();
							return false;
						}).appendTo(el);
						
						a.append($('<aside>').append($('<img>', { 
							src: s[0].startsWith('#')? 
								(s[0].toLowerCase().match(/.+\.(jpg|png)$/)? 
									(p + 'thumbs/' + s[0].substr(1).replace(/%25/g, '%')) : 
									(r + 'res/unknown.png')
								) : 
								(p + Search.folderThumb)
						})));
						
						if ( s[1] ) { 							// Title
							a.append($('<h5>').append(s[1]));
						}
						if ( s[2] && s[2] !== s[1] ) { 			// Comment
							a.append($('<p>').append(s[2].trunc(192)));
						}
						for ( k = 3; k < s.length; k++ ) { 		// Keywords, Faces, ...
							if ( s[k] && s[k].trim().length )
								a.append($('<p>').append(s[k].trunc(192)));
						}
						
						if ( window.location.hash === s[0] ) {
							c = found; 
						}
						
						found++;
					}
				}
			}
			
			$(source).parents('.hint:first').fadeOut(100, function() {
				$(this).remove();
			});
			
			if ( !found ) {
				el.append($('<p>', { 
					text: Search.text.notFound 
				}));
			} else {
				setTimeout(function() {
					$('.searchresults a').eq(c || 0).focus();
				}, 250);
			}
			
			$('body').addModal( el, {
				uid: 'searchres',
				darkenBackground: false,
				title: Search.text.title
			});
						
			return false;
		};
		
		Search.init = function() {
			var t = cookie('lastSearch');
			if ( t && t.length ) {
				cookie('lastSearch', null);
				Search.start( t );
			}
		};
	}

	// logEvents :: debugging events
	
	$.fn.logEvents = function( e ) {
		var events = e || 'mousedown mouseup mouseover mouseout mousewheel dragstart click blur focus, load unload reset submit change abort cut copy paste selection drag drop orientationchange touchstart touchmove touchend touchcancel gesturestart gesturechange gestureend';

		return this.each(function() {
			$(this).on(events, function(e) {
				if (e.target.id !== 'log') 
					log(e.type + ' <span style="padding:0 4px;font-size:0.8em;background-color:#000;border-radius:4px;"><b>' + e.target.nodeName.toLowerCase() + '</b>' + (e.target.id? (':'+e.target.id) : '') + '</span>' + 
					(e.relatedTarget? (' <span style="padding:0 4px;font-size:0.8em;background-color:#800;border-radius:4px;"><b>' + e.relatedTarget.nodeName.toLowerCase() + '</b>' + (e.relatedTarget.id? (':'+e.relatedTarget.id) : '') + '</span>') : ''));
				return true;
			});
		});
	};
	
	// trackCss :: tracks css values until the element is live
	
	$.fn.trackCss = function( p, dur, step ) {
		step = step || 20;
		var t0 = new Date();
		var max = (dur || 3000) / step; 
		return this.each(function() {
			var el = $(this);
			var n = 0;
			var show = function( nm ) {
				var t = new Date() - t0;
				log(t + '&nbsp;::&nbsp;' + nm + ' = ' + el.css(nm));
				if (t > dur) {
					clearInterval(iv);
				}
			};
			var iv = setInterval(function() {
				if ( $.isArray(p) ) {
					for (var i = 0; i < p.length; i++) {
						show(p[i]);
					}
				}
				else {
					show(p);
				}
			}, step);
		});
	};
	
	// Reading keys: k="name1,name2,... from attr="data-k" into m
	
	$.fn.readData = function(m, k) {
		if ( m == null || k == null ) {
			return this;
		}
		k = k.split(',');
		var i, l = k.length, v;
		return this.each(function() {
			for (i = 0; i < l; i++) {
				if ((v = $(this).data(k[i])) != null) {
					m[k[i]] = v;
				}
			}
		});
	};
	
	// Extending $.support jQuery variable
	
	$.extend( $.support, {
		orientation: "orientation" in window,
		touch: "ontouchend" in document,
		cssTransitions: "WebKitTransitionEvent" in window,
		cssTable: (!$.browser.msie || $.browser.version >= 8),
		cssFilter: ($.browser.msie && $.browser.version <= 8),
		flash: checkFlash('9.0.0')
	});
	
	// Easing functions for animations by George Smith
	
	$.extend( jQuery.easing, {
		easeOutBack: function (x,t,b,c,d,s) { 
			if (s == null) s = 1.70158;
			return c*((t=t/d-1)*t*((s+1)*t+s)+1)+b;
		},
		easeOutCubic: function (x,t,b,c,d) {
			return c*((t=t/d-1)*t*t+1)+b;
		}
	});
	
	// showin :: shows elements, like show() but display:inline-block;
	
	$.fn.showin = function() {
		return this.each(function() { 
			$(this).css('display', 'inline-block'); 
		});
	};
	
	// showin :: shows elements, like show() but display:inline-block;
	
	$.fn.togglein = function() {
		return this.each(function() {
			$(this).css('display', $(this).is(':visible')? 'inline-block' : 'none'); 
		});
	};
	// getDim :: get dimensions of hidden layers
	
	$.fn.getDim = function() {
		var el = $(this).eq(0);
		var dim = { 
			width: el.width(), 
			height: el.height() 
		};
		
		if ( (dim.width === 0 || dim.height === 0) && el.css('display') === 'none' ) {
			var bp = el.css('position');
			var bl = el.css('left');
			el.css({position: 'absolute', left: '-10000px', display: 'block'});
			dim.width = el.width();
			dim.height = el.height();
			el.css({display: 'none', position: bp, left: bl});
		}
		return dim;
	};
	
	// Mousewheel: Copyright (c) 2010 Brandon Aaron (http://brandonaaron.net)
	
	var mousewheelTypes = ['DOMMouseScroll', 'mousewheel'];

	if ($.event.fixHooks) {
		for ( var i = mousewheelTypes.length; i; ) {
			$.event.fixHooks[ mousewheelTypes[--i] ] = $.event.mouseHooks;
		}
	}
	
	$.event.special.mousewheel = {
		
		setup: function(){
			if ( this.addEventListener ) {
				for ( var i = mousewheelTypes.length; i; ) {
					this.addEventListener( mousewheelTypes[--i], mousewheelHandler, false );
				}
			} else { 
				this.onmousewheel = mousewheelHandler;
			}
		},
		
		teardown: function() {
			if ( this.removeEventListener ) {
				for ( var i = mousewheelTypes.length; i; ) {
					this.removeEventListener( mousewheelTypes[--i], mousewheelHandler, false );
				}
			} else { 
				this.onmousewheel = null;
			}
		}
	};

	$.fn.extend({
			
		mousewheel: function( fn ){
			return fn? this.bind( 'mousewheel', fn ) : this.trigger('mousewheel');
		},
		
		unmousewheel: function( fn ){
			return this.unbind( 'mousewheel', fn );
		}
	});
	
	var mousewheelHandler = function( event ) {
		var orgEvent = event || window.event, args = [].slice.call( arguments, 1 ), delta = 0, returnValue = true, deltaX = 0, deltaY = 0;
		event = $.event.fix( orgEvent );
		event.type = 'mousewheel';
		
		// old school
		if ( orgEvent.wheelDelta ) { 
			delta = orgEvent.wheelDelta / 120; 
		} else if ( orgEvent.detail ) { 
			delta = -orgEvent.detail / 3; 
		}
		
		// new school (touchpad)
		deltaY = delta;
		
		// Gecko
		if ( orgEvent.axis !== undefined && orgEvent.axis === orgEvent.HORIZONTAL_AXIS ) {
			deltaY = 0;
			deltaX = -1 * delta;
		}
		
		// Webkit
		if ( orgEvent.wheelDeltaY !== undefined ) { 
			deltaY = orgEvent.wheelDeltaY / 120; 
		}
		if ( orgEvent.wheelDeltaX !== undefined ) { 
			deltaX = -1 * orgEvent.wheelDeltaX / 120; 
		}
		args.unshift( event, delta, deltaX, deltaY );
		
		return ($.event.dispatch || $.event.handle).apply( this, args );
	};
	
	// cookie :: Cookie handling :: expire in seconds 
	
	var cookie = function( key, value, expire ) {
		if ( arguments.length > 1 ) { // write
			var d = new Date();
			// remove :: value = false, 0 or null
			if ( value === false || value === null ) { 
				document.cookie = encodeURIComponent( key ) + "=" + '; expires=' + d.toGMTString() + "; path=/";
			} else if ( /^(string|number|boolean)$/.test( typeof value ) ) {
				d.setTime(d.getTime() + (((typeof expire !== 'number')? 3600 : expire) * 1000));
				document.cookie = encodeURIComponent( key ) + "=" + String( value ) + '; expires=' + d.toGMTString() + "; path=/";
			}
			return value;
		} else if ( key ) { // read
			key += '=';
			var c = document.cookie.split(';');
			var v;
			for ( var i = 0; i < c.length; i++ ) {
				v = c[i].trim();
				if ( v.indexOf(key) === 0 ) {
					v = v.substring( key.length );
					return /^(true|yes)$/.test(v)? true : ( /^(false|no)$/.test(v)? false : ( /^([\d.]+)$/.test(v)? parseFloat(v) : v ) );
				}
			}
		}
		
		return null;
	};
	
	// history plugin :: The MIT License / Copyright (c) 2006-2009 Taku Sano (Mikage Sawatari) / Copyright (c) 2010 Takayuki Miwa
	
	(function(){
		var locationWrapper = {
			put: function(hash, win) {
				(win || window).location.hash = this.encoder(hash);
			},
			get: function(win) {
				var hash = ((win || window).location.hash).replace(/^#/, '');
				try {
					return $.browser.mozilla ? hash : decodeURIComponent(hash);
				}
				catch (error) {
					return hash;
				}
			},
			encoder: encodeURIComponent
		};
	
		var iframeWrapper = {
			id: "__jQuery_history",
			init: function() {
				var html = '<iframe id="'+ this.id +'" style="display:none" src="javascript:false;" />';
				$("body").prepend(html);
				return this;
			},
			_document: function() {
				return $("#"+ this.id)[0].contentWindow.document;
			},
			put: function(hash) {
				var doc = this._document();
				doc.open();
				doc.close();
				locationWrapper.put(hash, doc);
			},
			get: function() {
				return locationWrapper.get(this._document());
			}
		};
	
		function initObjects(options) {
			options = $.extend({
					unescape: false
				}, options || {});
	
			locationWrapper.encoder = encoder(options.unescape);
	
			function encoder(unescape_) {
				if(unescape_ === true) {
					return function(hash){ return hash; };
				}
				if(typeof unescape_ == "string" &&
				   (unescape_ = partialDecoder(unescape_.split("")))
				   || typeof unescape_ == "function") {
					return function(hash) { return unescape_(encodeURIComponent(hash)); };
				}
				return encodeURIComponent;
			}
	
			function partialDecoder(chars) {
				var re = new RegExp($.map(chars, encodeURIComponent).join("|"), "ig");
				return function(enc) { return enc.replace(re, decodeURIComponent); };
			}
		}
	
		var implementations = {};
	
		implementations.base = {
			callback: undefined,
			type: undefined,
			check: function() {},
			load:  function(hash) {},
			init:  function(callback, options) {
				initObjects(options);
				self.callback = callback;
				self._options = options;
				self._init();
			},
	
			_init: function() {},
			_options: {}
		};
	
		implementations.timer = {
			_appState: undefined,
			_init: function() {
				var current_hash = locationWrapper.get();
				self._appState = current_hash;
				self.callback(current_hash);
				setInterval(self.check, 100);
			},
			check: function() {
				var current_hash = locationWrapper.get();
				if(current_hash != self._appState) {
					self._appState = current_hash;
					self.callback(current_hash);
				}
			},
			load: function(hash) {
				if(hash != self._appState) {
					locationWrapper.put(hash);
					self._appState = hash;
					self.callback(hash);
				}
			}
		};
	
		implementations.iframeTimer = {
			_appState: undefined,
			_init: function() {
				var current_hash = locationWrapper.get();
				self._appState = current_hash;
				iframeWrapper.init().put(current_hash);
				self.callback(current_hash);
				setInterval(self.check, 100);
			},
			check: function() {
				var iframe_hash = iframeWrapper.get(),
					location_hash = locationWrapper.get();
	
				if (location_hash != iframe_hash) {
					if (location_hash == self._appState) {	  // user used Back or Forward button
						self._appState = iframe_hash;
						locationWrapper.put(iframe_hash);
						self.callback(iframe_hash); 
					} else {							  // user loaded new bookmark
						self._appState = location_hash;	 
						iframeWrapper.put(location_hash);
						self.callback(location_hash);
					}
				}
			},
			load: function(hash) {
				if(hash != self._appState) {
					locationWrapper.put(hash);
					iframeWrapper.put(hash);
					self._appState = hash;
					self.callback(hash);
				}
			}
		};
	
		implementations.hashchangeEvent = {
			_init: function() {
				self.callback(locationWrapper.get());
				$(window).on('hashchange', self.check);
			},
			check: function() {
				self.callback(locationWrapper.get());
			},
			load: function(hash) {
				locationWrapper.put(hash);
			}
		};
	
		var self = $.extend({}, implementations.base);
	
		if($.browser.msie && ($.browser.version < 8 || document.documentMode < 8)) {
			self.type = 'iframeTimer';
		} else if("onhashchange" in window) {
			self.type = 'hashchangeEvent';
		} else {
			self.type = 'timer';
		}
	
		$.extend(self, implementations[self.type]);
		$.history = self;
	})();
	
	/* addModal :: adding modal window to any layer (typically 'body')
		content = text or jQuery element [required]
		buttons = [ { 
			t: 'string',		// title 
			h: function(){} 	// handler
		} , ... ] [optional]
		settings = { see below } [optional]
	*/
	
	$.fn.addModal = function( content, buttons, settings  ) {
		
		if (typeof content === 'string') {
			content = $(content);
		}
		
		if (!(content instanceof jQuery && content.length)) {
			return;
		}
				
		if ( !$.isArray(buttons) ) { 
			settings = buttons; 
			buttons = null;
		}
		
		settings = $.extend( {}, $.fn.addModal.defaults, settings );
		settings.savePosition = settings.savePosition && (typeof settings.uid != UNDEF);
		
		var id = {
			w: '_m_window',
			p: '_m_panel',
			h: '_m_head',
			c: '_m_cont',
			ci: '_m_cont_i',
			x: 'close',
			r: 'resize'
		};
				
		var w, p, h, x, c, ci, 
			dh = 0, // diff in height betweent the whole window and the content
			to; // to = timeout for autoFade
		
		w = $('<div>', {
			'class': id.w,
			role: 'modal'
		}).css({
			opacity: 0
		}).appendTo( $(this) );
		
		$(this).css({
			position: 'relative'
		});
		
		if ( !settings.darkenBackground ) {
			w.css({
				backgroundImage: 'none',
				backgroundColor: 'transparent'
			});
		}
		
		// Adding unique id (can only be one of this window)
		
		if ( settings.uid ) {
			w.find('#' + settings.uid).remove();
		}
		
		// Panel
		
		p = $('<div>', {
			id: settings.uid || ('_mod_' + Math.floor(Math.random()*10000)),
			'class': id.p
		}).css({
			width: settings.width
		}).appendTo( w );
					
		// Header
		
		h = $('<header>', {
			'class': id.h
		}).appendTo( p );
		
		h.append($('<h5>', {
			text: settings.title
		}));
		
		// Close
		
		var closePanel = function(e) {
			x.trigger('removeHint');
			to = clearTimeout(to);
			w.animate({
				opacity: 0
			}, settings.speed, function() {
				w.remove();
			});
			return false;
		}
		
		// Closing by clicking outside the window
		
		if ( settings.closeOnClickOut && settings.darkenBackground ) {
			w.on('click', function(e) {
				if ( $(e.target).hasClass(id.w) ) {
					closePanel(e);
				}
				return true;
			});
		}
		
		// Close button
		
		x = $('<a>', {
			href: NOLINK,
			'class': id.x
		}).appendTo( h );
		
		if ($.support.touch) {
			x[0].ontouchend = closePanel;
		} else {
			x.on('click', closePanel);
			x.addHint(settings.closeWindow);
		}
		
		// Drag moving
		
		var dragStart = function(e) {
			var x0 = p.position().left, 
				y0 = p.position().top,
				ec0 = getCoords(e);
				lm = w.width() - p.width() - settings.pad,
				tm = w.height() - p.height() - settings.pad,
				oc = h.css('cursor');
							
			h.css({
				cursor: 'move'
			});
			
			var dragMove = function(e) {
				var ec = getCoords(e);
				
				p.css({
					left: Math.minMax( settings.pad, x0 + ec.x - ec0.x, lm ),
					top: Math.minMax( settings.pad, y0 + ec.y - ec0.y, tm )
				});
	
				return false;
			};
			
			var dragStop = function(e) {
				$(document).off({
					mousemove: dragMove,
					mouseup: dragStop
				});
				
				h.css('cursor', oc);
				
				if ( settings.savePosition ) {
					savePosition();
				}
				
				return false;
			};
			
			if ($.support.touch) {
				this.ontouchmove = dragMove;
				this.ontouchend = dragStop;
				//return true;
			} else {
				$(document).on({
					mousemove: dragMove,
					mouseup: dragStop
				});
			}
			return false;
		};

		if ( $.support.touch ) {
			h[0].ontouchstart = dragStart;
		} else {
			h.on('mousedown', dragStart);
		}
			
		// Adding content inside a wrap element
		
		c = $('<div>', {
			'class': id.c
		}).appendTo( p );
		
		ci = $('<div>', {
			'class': id.ci
		}).append( content ).appendTo( c );
		
		// Dialog panel (has buttons)
		
		if ( buttons && buttons.length ) {
			
			var btns, btn = $('<div>', { 
				'class': 'buttons' 
			}).appendTo( ci );	
			
			var select = function(n) { 
				btns.each(function(i) { 
					$(this).toggleClass('active', i === n); 
				}); 
			};
			
			var close = function() {
				$(document).off('keydown', handler);
				closePanel();
			};

			var handler = function(e) {
				if ( document.activeElement && document.activeElement.nodeName === 'input' || 
					( $.isFunction(settings.enableKeyboard) && !settings.enableKeyboard()) ) {
					return true;
				}
				var k = e? e.keyCode : window.event.keyCode;
				if ( k === 27 ) {
					close();
					return false;
				} else if ( btn ) {
					var a = btn.find('a.active'), 
						i = btns.index(a);
					switch (k) {
						case 13: 
						case 10: 
							if ( $.isFunction(a[0].handler) ) {
								a[0].handler.call();
								close();
								break;
							}
						case 39: 
							select( (i + 1) % btns.length ); 
							break;
						case 37: 
							select( i? (i - 1) : (btns.length - 1) );
							break;
						default:
							e.returnValue = true;
							return true;
					}
					return false;
				}
				e.returnValue = true;
				return true;
			};

			var a;
			for ( var i = 0; i < buttons.length; i++ ) {
				if ( i ) {
					btn.append(' ');
				}
				a = $('<a>', { 
					href: NOLINK,
					html: buttons[i].t
				}).appendTo(btn);
				
				if ( $.isFunction(buttons[i].h) ) {
					a[0].handler = buttons[i].h;
				}
				
				a.on('click', function() { 
					if ( this.handler != null ) {
						this.handler.call();
					}
					close();
					return false;
				});
			}
			
			var btns = btn.children('a');
			btns.last().addClass('active');
			
			if ( $.isFunction(settings.enableKeyboard) || settings.enableKeyboard ) {
				$(document).on('keydown', handler);
			}
		}
		
		// Resizing the window
		
		if ( settings.resizable ) {
			
			// Double-click functionality (maximize / previous state)
			
			h.on('dblclick', function() {
				var cp = [ p.position().left, p.position().top, p.width(), p.height() ],
					mp = [ settings.pad, settings.pad, w.width() - 2 * settings.pad, w.height() - 2 * settings.pad ];
				
				var setPos = function( np ) {		
					p.css({
						left: Math.minMax( settings.gap, np[0], w.width() - np[2] - settings.gap ),
						top: Math.minMax( settings.gap, np[1], w.height() - np[3] - settings.gap ),
						width: np[2],
						height: np[3]
					});
					ci.css({
						height: np[3] - dh
					});			
				};
				
				if ( cp[0] == mp[0] && cp[1] == mp[1] && cp[2] == mp[2] && cp[3] == mp[3] ) {
					setPos( p.data('wpos') );
				} else {
					setPos( mp );
					p.data( 'wpos', cp );
				}
				
				if ( settings.savePosition ) {
					savePosition();
				}
				
				return false;
			});
			
			// Resize handle
		
			var r = $('<a>', {
				'class': id.r
			}).appendTo( p );

			var resizeStart = function(e) {
				var w0 = p.width(), 
					h0 = p.height(),
					ec0 = getCoords(e);
					
				var resizeMove = function(e) {
					var ec = getCoords(e),
						nh = Math.max(h0 + ec.y - ec0.y - dh, 20);
					
					p.css({
						width: Math.max(w0 + ec.x - ec0.x, 60),
						height: nh + dh
					});
					ci.css({
						height: nh
					});
	
					return false;
				};
				
				var resizeStop = function(e) {
					$(document).off({
						mousemove: resizeMove,
						mouseup: resizeStop
					});
					
					if ( settings.savePosition ) {
						savePosition();
					}
					
					return false;
				};
			
				if ($.support.touch) {
					this.ontouchmove = resizeMove;
					this.ontouchend = resizeStop;
				} else {
					$(document).on({
						mousemove: resizeMove,
						mouseup: resizeStop
					});
				}
				return false;
			};
			
			if ( $.support.touch ) {
				r[0].ontouchstart = resizeStart;
			} else {
				r.on('mousedown', resizeStart);
			}
		}
		
		// placing the window at center
		
		var centerPanel = function() {
						
			var pw = p.width(),
				ph = p.height(),
				ww = w.width(),
				wh = w.height();
			
			dh = ph - ci.height();
			
			if ( pw && ph && ww && wh ) {
				
				if ( pw + 2 * settings.pad > ww ) {
					p.css({
						width: pw = ww - 2 * settings.pad
					});
				}
				
				if ( ph + 2 * settings.pad > wh ) {
					p.css({
						height: ph = wh - 2 * settings.pad
					});
					ci.css({
						height: wh - 2 * settings.pad - dh
					});
				}
				
				p.css({
					left: Math.max( Math.round((ww - pw) / 2), settings.pad ),
					top: Math.max( Math.round((wh - ph) / 2), settings.pad )
				});
				
			}
		};
		
		// placing the window at a given position
		
		var placePanel = function( pos ) {
			
			var ww = w.width(),
				wh = w.height(),
				l = parseInt(pos[0]),
				t = parseInt(pos[1]),
				pw = parseInt(pos[2]),
				ph = parseInt(pos[3]);
				
			if ( isNaN(l) || isNaN(t) || isNaN(pw) || isNaN(ph) ) {
				centerPanel();
			}

			dh = h.outerHeight() + parseInt(c.css('padding-top')) + parseInt(c.css('padding-bottom')) + 
				parseInt(ci.css('padding-top')) + parseInt(ci.css('padding-bottom')) + parseInt(c.css('border-top-width'));

			p.css({ 
				position: 'absolute',
				left: Math.minMax(settings.pad, l, ww - settings.pad - 60),
				top: Math.minMax(settings.pad, t, wh - settings.pad - 60),
				width: Math.minMax(60, pw, ww - l - settings.pad),
				height: ph = Math.minMax(60, ph, wh - t - settings.pad)
			});
			
			ci.css({
				height: ph - dh
			});
		};
		
		// Saving the position
		
		var savePosition = function() {
			cookie('modalPosition' + settings.uid, (p.position().left + ',' + p.position().top + ',' + p.width() + ',' + p.height()) );
		};
				
		// Showing the window
		
		var showPanel = function( pos ) {
			
			w.css({
				opacity: 0
			}).show();
			
			// leave enough time to create content
			
			setTimeout( function() {
				
				if (pos && (pos = pos.split(',')) && $.isArray(pos) && pos.length > 3) {
					placePanel(pos);
				} else {
					centerPanel();
				}
				
				w.animate({
					opacity: 1
				}, settings.speed);
				
				if ( settings.savePosition ) {
					savePosition();
				}
				
				if ( settings.autoFade ) {
					to = setTimeout(closePanel, settings.autoFade);
				}
				
			}, 40);			
		}
		
		// showing at center or retrieving the previous position / size
		
		showPanel( settings.savePosition? cookie('modalPosition' + settings.uid) : null );
		
		return this;
	};
	
	$.fn.addModal.defaults = {
		// uid:							// unique identifier, will be used as <div id="">
		// title:						// the title of the window displayed in the header
		speed: 250,						// transition speed in ms
		autoFade: 0,					// automaticcaly disappearing after X ms, 0 = remain
		width: 400,						// default width
		resizable: true,				// user can resize the window
		enableKeyboard: true,			// enable button selection with keyboard (left, right, enter, esc)
		closeOnClickOut: true,			// closing the modal window on clicking outside the window
		closeWindow: 'Close window',	// 'close window' tooltip text
		darkenBackground: true,			// darken the background behind the window
		savePosition: true,				// save window position and size and re-apply fot the windows with the same 'uid'
		pad: 6							// padding to the edges
	};
	
	// addScroll :: adding custom vertical scrollbar to layer
	
	$.fn.addScroll = function( settings ) {
		
		settings = $.extend( {}, $.fn.addScroll.defaults, settings );
		
		return this.each(function() {
			var to, cont = $(this), wrap = $(this).parent(),
				sup, sdn, sbar, shan, ctrls, cheight, wheight, scroll,
				ey = 0, y0, tY, ltT, tY1, speed, dist, min, max;
			
			cont.css({
				position: 'absolute', 
				width: wrap.width - 20
			});
			wrap.css({
				overflow: 'hidden'
			});
			
			if ( wrap.css('position') !== 'absolute' ) {
				wrap.css({ position: 'relative' });
			}
			
			sup = $('<div>', { 'class': settings.upbtn }).appendTo(wrap);
			sdn = $('<div>', { 'class': settings.dnbtn }).appendTo(wrap);
			sbar = $('<div>', { 'class': settings.scbar }).appendTo(wrap);
			shan = $('<div>').appendTo(sbar);
			ctrls = sup.add(sdn).add(sbar);
			ctrls.hide();
			
			var getHeights = function() {
				cheight = cont.height();
				wheight = wrap.height();
			};
			
			var getTop = function() { 
				return cont.position().top; 
			};
			
			var getSt = function(t) { 
				return Math.round( (sbar.height() - 6) * (-((t == null)? getTop() : t)) / cheight ) + 3; 
			};
			
			var getSh = function() { 
				return Math.max( Math.round( (sbar.height() - 6) * wheight / cheight ), settings.dragMinSize ); 
			};
			
			var setCtrl = function(t) {
				if ( t == null ) {
					t = getTop();
				}
				sup.css({opacity: (t? 1 : settings.disabledOpacity)});
				sdn.css({opacity: (t === wheight - cheight)? settings.disabledOpacity : 1});
			};
			
			var noSelect = function() {
				return false;
			};
			
			var matchScr = function() {
				var bc = cheight, bw = wheight;
				getHeights();
				if ( bc !== cheight || bw !== wheight ) {  
					if ( cheight <= wheight ) { 
						cont.css({
							top: 0
						}).off('selectstart', noSelect); 
						ctrls.hide();
						return;
					}
					if ( cont.position().top < (wheight - cheight) ) {
						cont.css({
							top: wheight - cheight
						});
					}
					shan.css({
						top: getSt(), 
						height: getSh()
					});
					cont.on('selectstart', noSelect);
					ctrls.show();
					setCtrl();
				}
			};
			
			var matchCnt = function() { 
				cont.css({top: Math.minMax(wheight - cheight, -Math.round((shan.position().top - 3) * cheight / (sbar.height() - 6)), 0)}); 
				setCtrl(); 
			};
			
			var animateTo = function(t) {
				clearInterval(scroll);
				if ( wheight >= cheight ) {
					return;
				}
				t = Math.minMax(wheight - cheight, t, 0);
				shan.stop(true,true).animate({top: getSt(t)}, settings.speed, settings.effect);
				cont.stop(true,true).animate({top: t}, settings.speed, settings.effect, function() {
					setCtrl(t);
				});
			};
			
			sup.on('click', function() { 
				animateTo(getTop() + wheight); 
				return false; 
			});
			
			sdn.on('click', function() { 
				animateTo(getTop() - wheight); 
				return false; 
			});
			
			sbar.on('click', function(e) {
				if (e.pageY < shan.offset().top) {
					animateTo(getTop() + wheight);
				} else if (e.pageY > (shan.offset().top + shan.height())) {
					animateTo(getTop() - wheight);
				}
				return false;
			});
			
			if ( settings.enableMouseWheel ) {
				cont.on('mousewheel', function(e, d) {
					if (d) {
						animateTo(getTop() + settings.wheelIncr * ((d < 0)? -1 : 1));
					}
					return false;
				});
			}
			
			var dragSh = function(e) {
				shan.css({top: Math.minMax(2, Math.round(e.pageY - shan.data('my')), sbar.height() - shan.height() - 2)}); 
				matchCnt();
				return false;
			};
			
			var dragShStop = function(e) {
				$(document).off('mousemove', dragSh).off('mouseup', dragShStop);
				return false;
			};
			
			shan.on('mousedown', function(e) { 
				$(this).data('my', Math.round(e.pageY) - $(this).position().top);
				$(document).on({
					'mousemove': dragSh,
					'mouseup': dragShStop
				});
				return false;
			});
			
			var getY = function(e) {
				return ey = ( e.touches && e.touches.length > 0 )? e.touches[0].clientY : ( e.clientY ? e.clientY : ey );
			};
			
			var dragExtra = function() {
				dist += Math.round(speed / 20);
				var nY = tY1 + dist;
				if (nY > 0 || nY < min) {
					clearInterval(scroll);
					return;
				}
				cont.css({top: nY});
				shan.css({top:getSt(), height:getSh()});
				speed *= .8;
				if (Math.abs(speed) < 10) {
					speed = 0;
					clearInterval(scroll);
				}
			};
			
			var dragMove = function(e) {
				if ( tY ) {
					var dY = getY(e) - tY;
					if ( dY ) {
						cont.data('dragOn', true);
						cont.css({top: Math.minMax(min, y0 + dY, 0)});
						shan.css({top: getSt(), height: getSh()});
					}
				} else {
					tY = getY(e);
				}
				return false;
			};
			
			var dragStop = function(e) {
				tY1 = getTop();
				var dY = getY(e) - tY;
				var dT = new Date().getTime() - tT;
				speed = 1000 * dY / dT;
				scroll = setInterval(dragExtra, 50);
				if ($.support.touch) {
					this.ontouchmove = null;
					this.ontouchend = null;
				} else {
					$(document).off({
						mousemove: dragMove,
						mouseup: dragStop
					});
				}
				setTimeout(function() {
					cont.data('dragOn', false);
				}, 20 );
				return (Math.abs(dY) < 4) && (dT < 300);
			};
			
			var dragStart = function(e) { // idea from quirsksmode.org
				if ( wheight >= cheight ||
					((e.type === 'touchstart' || e.type === 'touchmove') && 
					(!e.touches || e.touches.length > 1 || cont.is(':animated'))) ) {
					return true;
				}
				clearInterval(scroll);
				te = e;
				y0 = getTop();
				tY = getY(e);
				tT = new Date().getTime();
				dist = 0;
				min = wheight - cheight;
				if ($.support.touch) {
					$(e.target).closest('a').focus();
					this.ontouchmove = dragMove;
					this.ontouchend = dragStop;
					return true;
				} else {
					$(document).on({
						mousemove: dragMove,
						mouseup: dragStop
					});
					return false;
				}
			};
			
			if ( $.support.touch ) {
				cont[0].ontouchstart = dragStart;
			} else {
				cont.on('mousedown', dragStart);
			}
						
			$(window).on('resize', function() { 
				clearTimeout(to); 
				to = setTimeout(matchScr, 50);
			});
			
			to = setTimeout(matchScr, 10);
			
			if ( settings.refresh ) {
				setInterval(function() {
					if ( !$('[role=gallery]').is(':visible') ) // patch for Turtle skin
						matchScr();
				}, settings.refresh);
			}
			
			cont.attr('role', 'scroll').data('dragOn', false).on('adjust', matchScr);
			
			ctrls.on('selectstart', noSelect); 
			
			cont.find('a').on('setactive', function() {
				var e = ($(this).parent() === cont)? $(this) : $(this).parent(),
					et = e.position().top, 
					eh = e.outerHeight(true),
					ct = cont.position().top,
					wh = wrap.height();
				
				if ( wh > cont.height() ) {
					return;
				} else if ((et + eh) > (wh - ct)) {
					ct = Math.max(wh - eh - et, wh - cont.height());
				} else if (et < -ct) {
					ct = -et;
				} else { 
					return;
				}
				
				animateTo(ct);
			});

			if ( $.isFunction(settings.enableKeyboard) || settings.enableKeyboard ) {
				$(document).on('keydown', function(e) {
					if (document.activeElement && document.activeElement.nodeName === 'INPUT' || 
						( $.isFunction(settings.enableKeyboard) && !settings.enableKeyboard() ) ) {
						return true;
					}
					var k = e? e.keyCode : window.event.keyCode;
					switch( k ) {
						case 33: 
							animateTo( getTop() + wheight ); 
							return false;
						case 34: 
							animateTo( getTop() - wheight ); 
							return false;
					}
					e.returnValue = true;
					return true;
				});
			}
		});
	};
	
	$.fn.addScroll.defaults = {
		upbtn: 'scrup',
		dnbtn: 'scrdn',
		scbar: 'scrbar',
		dragMinSize: 10,
		speed: 300,
		effect: 'swing', //'easeOutBack',
		disabledOpacity: 0.3,
		wheelIncr: 50,
		enableKeyboard: true,
		enableMouseWheel: true,
		refresh: 0
	};
	
	// fixMenus :: adds scroll to long menus
	/*
	$.fn.fixMenus = function(settings) {
		
		settings = $.extend( {}, $.fn.fixMenus.defaults, settings );
		
		return this.each(function() {
			
			var t = $(this), w = $('[role]=main') || $(body);
			if ( t.offset().top + t.outerHeight() > w.height() ) {
				t.height(w.height() - t.offset().top - 40);
				t.css({
					width: t.width() + 24, 
					overflow: 'auto'
				});
			}
		});
	};
	
	$.fn.fixMenus.defaults = {
	};
	*/
	
	// thumbScroll :: horizontal scrollbar to layer
	
	$.fn.scrollThumbs = function(settings) {
		
		settings = $.extend( {}, $.fn.scrollThumbs.defaults, settings );
		
		return this.each(function() {
			var co = $(this), wr = $(this).parent();
			var ex = 0, x0, tX, tT, tX1, speed, dist, min, scroll;
			var scleft = $('<div>', { 'class': settings.scleft }).insertAfter(wr);
			var scright = $('<div>', { 'class': settings.scright }).insertAfter(wr);
			
			var setCtrl = function( x ) {
				x = (x == null)? co.position().left : x;
				scleft.css( { opacity: (x < 0)? 1 : settings.disabledOpacity } );
				scright.css( { opacity: (wr.width() < (x + co.width()))? 1 : settings.disabledOpacity } );
			};
			
			var animateTo = function( x ) {
				var w = wr.width(), c = co.width();
				if ( !w || !c || w >= c || !$.isNumeric(x) ) {
					return;
				} else if ( x > 0 ) {
					x = 0;
				} else if ( x < w - c ) {
					x = w - c;
				}
				setCtrl(x);
				co.stop(true, false).animate( { left: x }, settings.speed, settings.effect );
			};	
			
			scleft.on('click', function() { 
				animateTo(co.position().left + wr.width()); 
				return false; 
			});
			
			scright.on('click', function() { 
				animateTo(co.position().left - wr.width()); 
				return false; 
			});
			
			co.find('a').on('setactive', function() {
				var e = ($(this).parent() === co)? $(this) : $(this).parent(),
					el = e.position().left, 
					ew = e.outerWidth(true),
					hr = Math.round(ew * settings.headRoom),
					cl = co.position().left,
					ww = wr.width();
				
				co.find('a.active').removeClass('active');
				$(this).addClass('active');
				
				if ( ww > co.width() ) {
					return;
				} else if (el > (ww - ew - hr - cl)) {
					cl = Math.max(ww - ew - hr - el, ww - co.width());
				} else if (el < -cl + hr) {
					cl = -el + hr;
				} else { 
					return;
				}
				
				animateTo(cl);
			});
			
			if ( settings.enableMouseWheel ) {
				co.on('mousewheel', function(e, d) {
					if ( d ) {
						animateTo(co.position().left + wr.width() * ((d < 0)? -1 : 1));
					}
					return false;
				});
			}
			
			setCtrl();
			
			var noClick = function(e) {
				e.stopPropagation();
				e.preventDefault();
				return false;
			};
			
			var getX = function( e ) {
				return ex = ( e.touches && e.touches.length > 0 )? e.touches[0].clientX : ( e.clientX ? e.clientX : ex );
			};
			
			var dragExtra = function() {
				dist += Math.round(speed / 20);
				var nX = tX1 + dist;
				if (nX > 0 || nX < min) {
					clearInterval(scroll);
					return;
				}
				co.css({left: nX});
				speed *= .8;
				if (Math.abs(speed) < 10) {
					speed = 0;
					clearInterval(scroll);
				}
			};
			
			var dragMove = function(e) {
				if ( tX ) {
					var dX = getX(e) - tX;
					if ( dX ) {
						co.data('dragOn', true);
						co.css({left: Math.minMax(min, x0 + dX, 0)});
					}
				} else {
					tX = getX(e);
				}
				return false;
			};
			
			var dragStop = function( e ) {
				tX1 = co.position().left;
				var dX = getX(e) - tX;
				var dT = new Date().getTime() - tT;
				speed = 1000 * dX / dT;
				scroll = setInterval(dragExtra, 50);
				if ($.support.touch) {
					this.ontouchmove = null;
					this.ontouchend = null;
				} else {
					$(document).off({
						mousemove: dragMove,
						mouseup: dragStop
					});
				}
				setTimeout(function(){
					co.data('dragOn', false);
				}, 20 );
				return (Math.abs(dX) < 4) && (dT < 300);
			};
			
			var dragStart = function(e) {
				if ((e.type === 'touchstart' || e.type === 'touchmove') && 
					(!e.touches || e.touches.length > 1 || co.is(':animated'))) {
					return true;
				}
				clearInterval(scroll);
				te = e;
				x0 = co.position().left;
				tX = getX(e);
				tT = new Date().getTime();
				dist = 0;
				min = wr.width() - co.width();
				if ($.support.touch) {
					$(e.target).closest('a').focus();
					this.ontouchmove = dragMove;
					this.ontouchend = dragStop;
					return true;
				} else {
					$(document).on({
						'mousemove': dragMove,
						'mouseup': dragStop
					});
					return false;
				}
			};
			
			if ( $.support.touch ) {
				co[0].ontouchstart = dragStart;
			} else {
				co.on('mousedown', dragStart);
			}
			
			co.attr('role', 'scroll').data('dragOn', false);
			
			co.add(scleft).add(scright).on('selectstart', function(e){ 
				e.preventDefault(); 
				return false; 
			});
		});
	};
	
	$.fn.scrollThumbs.defaults = {
		scleft: 'scleft',
		scright: 'scright',
		speed: 1500,
		incr: 100,
		effect: 'easeOutBack',
		headRoom: 0.67,
		disabledOpacity: 0.3,
		enableMouseWheel: true
	};
	
	// Swipe gesture support
	
	$.fn.addSwipe = function( leftFn, rightFn, settings ) {
		
		settings = $.extend( {}, $.fn.addSwipe.defaults, settings );
		
		return this.each(function() {
			
			var t = $(this);
			var ex = 0, ey = 0, // event coords
				tx = 0, ty = 0,  // layer coords
				x0, y0, 	// original
				tt, 		// touch time
				cw, ch, 	// window width
				cr, cl, 	// swipe left / right boundary
				tw, th, 	// layer dimensions
				xm, ym, 	// min left / top
				cax;		// constrain axis
				
			t.attr('draggable', 'true');
			
			var getPos = function(e) {
				if ( e.touches && e.touches.length > 0 ) {
					ex = e.touches[0].clientX;
					ey = e.touches[0].clientY;
				} else if ( e.clientX ) {
					ex = e.clientX;
					ey = e.clientY;
				}
			};
			
			var setPos = function(e) {
				getPos(e);
				tx = ex;
				ty = ey;
			};
			
			var dragMove = function(e) {
				if ( !tx ) {
					setPos(e);
				} else {
					getPos(e);
					if ( cax )
						t.css({
							left:  ex - tx + x0
						});
					else
						t.css({
							left: ex - tx + x0,
							top: ey - ty + y0
						});
				}
				return false;
			};
			
			var noAction = function(e) {
				return false;
			};
			
			var dragStop = function(e) {
				getPos(e);
				var ts = new Date().getTime() - tt; 
				var dx = ex - tx;
				
				if ( $.support.touch ) {
					this.ontouchmove = null;
					this.ontouchend = null;
				} else {
					$(document).off('mousemove', dragMove).off('mouseup click', dragStop);
				}
				
				if ( tw < cw ) {
					if ( Math.abs(dx) < settings.treshold ) {
						if ( cax ) {
							t.animate({
								left: x0
							}, 200);
						} else {
							t.animate({
								left: x0,
								top: y0
							}, 200);
						}
						t.trigger('click');
					} else {
						if ( cax ) {
							t.animate({
								left: t.position().left + Math.round(333 * (ex - tx) / ts)
							}, 500, 'easeOutCubic');
						} else {
							t.animate({
								left: t.position().left + Math.round(333 * (ex - tx) / ts),
								top: t.position().top + Math.round(333 * (ey - ty) / ts)
							}, 500, 'easeOutCubic');
						}	
						if ( dx < 0 ) {
							if ( $.isFunction(leftFn) ) {
								leftFn.call(); 
							}
						} else {
							if ( $.isFunction(rightFn) ) {
								rightFn.call();
							}
						}
					}
				} else {
					
					if ( cax )
						t.animate({
							left: Math.minMax(xm, t.position().left + Math.round(333 * (ex - tx) / ts), settings.margin)
						}, 500, 'easeOutCubic');
					else
						t.animate({
							left: Math.minMax(xm, t.position().left + Math.round(333 * (ex - tx) / ts), settings.margin),
							top: Math.minMax(ym, t.position().top + Math.round(333 * (ey - ty) / ts), settings.margin)
						}, 500, 'easeOutCubic');
						
					var tx1 = t.position().left;
					if ( dx < 0 ) {
						if ( ((tx1 + tw) < cr) && $.isFunction(leftFn) ) {
							leftFn.call(); 
						}
					} else {
						if ( (tx1 > cl) && $.isFunction(rightFn) ) {
							rightFn.call();
						}
					}					
				}
				
				return false;
			};
			
			var touchStart = function(e) {
				if ((e.type === 'touchstart' || e.type === 'touchmove') && (!e.touches || e.touches.length > 1 || t.is(':animated'))) {
					// >= 2 finger flick
					return true;
				}
				setPos(e);
				dragStart(e);
			};
			
			var dragStart = function(e) {
				
				t.stop(true, false);
				x0 = t.position().left;
				y0 = t.position().top;
				tt = new Date().getTime();
				cw = t.parent().outerWidth(); 
				ch = t.parent().outerHeight();
				cr = cw * (1 - settings.oversizeTreshold);
				cl = cw * settings.oversizeTreshold;
				tw = t.outerWidth();
				th = t.outerHeight();
				xm = cw - settings.margin - tw;
				ym = ch - settings.margin - th;
				cax = th <= ch;
				
				if ( $.support.touch ) {
					this.ontouchmove = dragMove;
					this.ontouchend = dragStop;
					return true;
				} else {
					t.off('click');
					t.click(noAction);
					$(document).on({
						'mousemove': dragMove,
						'mouseup': dragStop
					});
					e.cancelBubble = true;
					return false;
				}
			};
			
			if ($.support.touch) {
				this.ontouchstart = touchStart;
			} else {
				t.on({
					'dragstart': dragStart,
					'mousedown': setPos
				});
			}
			
			t.on('dragcancel', function() {
				t.stop(true, false).animate({
					left: x0,
					top: y0
				}, 200);
				return false;
			});
			
			t.on('unswipe', function() {
				if ( $.support.touch ) {
					this.ontouchmove = null;
					this.ontouchend = null;
					this.ontouchstart = null;
				} else {
					if ( $.isFunction(t.noAction) ) {
						t.off(noAction);
					}
					if ( $.isFunction(t.dragStart) ) {
						t.off(dragStart);
					}
					$(document).off('mousemove', dragMove).off('mouseup', dragStop);
				}
			});
			
			t.on('selectstart', noAction); 

		});
	};
	
	$.fn.addSwipe.defaults = {
		treshold: 40,			// Considering as click instead of move
		oversizeTreshold: 0.15,	// The proportion of screen size moving within this boundary still don't trigger prev/next action 
		margin:15				// Re-align to this margin, when moved over
	};
	
	// alignTo :: align a layer to another

	var ALIGN_LEFT = ALIGN_TOP = 0,
		ALIGN_CENTER = ALIGN_MIDDLE = 1,
		ALIGN_RIGHT = ALIGN_BOTTOM = 2;
	
	$.fn.alignTo = function( el, settings ) {
		
		settings = $.extend( {}, $.fn.alignTo.defaults, settings );
		
		if (typeof el === 'string') {
			el = $(el);
		}
		if (!(el instanceof $ && el.length)) {
			return;
		}
		
		var to = el.offset(),
			tw = el.outerWidth(),
			th = el.outerHeight();
		
		return $(this).each( function() {
			var w = $(this).outerWidth(),
				h = $(this).outerHeight(),
				rx = Math.round(to.left + settings.toX * tw / 2 + 
					(settings.toX - 1) * settings.gap);
				ry = Math.round(to.top + settings.toY * th / 2 + 
					(settings.toY - 1) * settings.gap);
				l = Math.round(rx - settings.posX * w / 2),
				t = Math.round(ry - settings.posY * h / 2);
			
			if ( t < 0 ) {
				if ( settings.toX !== ALIGN_CENTER ) {
					t = 0;
				} else if ( settings.toY !== ALIGN_BOTTOM  ) {
					t = to.top + el.outerHeight() + settings.gap;
				}
			} else if ( (t + h) > $(window).height() ) {
				if ( settings.toX !== ALIGN_CENTER ) {
					t = $(window).height() - h;
				} else if ( settings.toY !== ALIGN_TOP ) {
					t = to.top - h - settings.gap;
				}
			}
			
			if ( l < 0 ) {
				if ( settings.toY !== ALIGN_MIDDLE ) {
					l = 0;
				} else if ( settings.toX != ALIGN_RIGHT ) {
					l = to.left + el.outerWidth() + settings.gap;
				}
			} else if ( (l + w) > $(window).width() ) {
				if ( settings.toY !== ALIGN_MIDDLE ) {
					l = $(window).width() - w;
				} else if ( settings.toX != ALIGN_LEFT ) {
					l = to.left - w - settings.gap;
				}
			}
			
			$(this).css({
				position: 'absolute',
				left: l, 
				top: t 
			});
		});
	};

	$.fn.alignTo.defaults = {
		gap: 5,
		posX: ALIGN_CENTER,
		posY: ALIGN_BOTTOM,
		toX: ALIGN_CENTER,
		toY: ALIGN_TOP
	};
	
	// addHint :: little Popup displaying 'title' text, or passed text (can be HTML)
	
	$.fn.addHint = function(txt, settings) {
		
		if ( txt && typeof txt !== 'string' && !txt.jquery ) {
			settings = txt;
			txt = null;
		}
		settings = $.extend( {}, $.fn.addHint.defaults, settings );
		
		var getPop = function() {
			var c = $('#' + settings.id);
			if ( !c.length ) {
				c = $('<div>', { 
					'class': settings.id, 
					id: settings.id 
				}).hide().appendTo('body');
			}
			return c;
		};
		
		return this.each(function() {
			var t = $(this), 
				tx = txt || t.attr('title'), 
				to, 
				over = false,
				focus = false,
				dyn = !(tx && tx.jquery), 
				pop;
			
			if ( !tx || !tx.length ) {
				return;
			}
			
			var enter = function(e) {
				// Inserting dynamic content
				if ( dyn ) {
					pop = getPop();
					pop.empty().html( tx );
				} else {
					pop = tx.show();
				}
				
				pop.off('mouseover', getFocus);
				pop.off('mouseout', lostFocus);
				
				// getFocus, lostFocus
				var getFocus =  function() {
					to = clearTimeout(to);
					over = true;
					pop.stop(true, true).css({opacity: 1}).show();
				};
				var lostFocus = function() {
					if ( focus ) {
						return;
					}
					to = clearTimeout(to);
					over = false;
					fade();
				};
				
				// Keep the popup live while the mouse is over, or an input box has focus
				pop.on('mouseover', getFocus);
				pop.on('mouseout', lostFocus);
				pop.find('input').on({
					focus: function() {
						focus = true;
						getFocus();
					},
					blur: function() {
						focus = false;
					}
				});
				
				// Aligning and fading in
				pop.stop(true, true).alignTo(t, { 
					posX: settings.posX,
					posY: settings.posY,
					toX: settings.toX,
					toY: settings.toY 
				});
				pop.css({
					opacity: 0
				}).show().animate({ 
					opacity: 1 
				}, 200);
				
				// Remove hint automatically on touch devices, because there's no explicit mouse leave event is triggered
				if ( $.support.touch ) {
					to = setTimeout(fade, settings.stay);
				} else {
					over = true;
				}
			};
			
			// Force removing the hint
			t.on('removeHint', function() {
				leave();
			});
			
			// Leaving the trigger element
			var leave = function(e) {
				over = false;
				to = clearTimeout(to);
				fade();
			};
			
			// Fading the popup
			var fade = function() {
				if ( !over && pop && pop.length ) {
					pop.stop(true, false).animate({
						opacity: 0
					}, 200, function() { 
						$(this).hide(); 
					});
				}
			};
			
			if ( tx.jquery ) {
				tx.addClass( settings.id );
			} else {
				t.removeAttr('title');
			}
			
			t.on($.support.touch? {
				'touchstart': enter
			} : {
				'focus mouseenter': enter,
				'blur mouseleave': leave
			});
		});
	};
	
	$.fn.addHint.defaults = {
		id: 'hint',
		stay: 3000,
		posX: ALIGN_CENTER,
		posY: ALIGN_BOTTOM,
		toX: ALIGN_CENTER,
		toY: ALIGN_TOP
	};
	
	// $('Message to display in HTML').popupBox( settings )
	
	$.fn.popupBox = function( settings ) { 
		
		settings = $.extend( {}, $.fn.popupBox.defaults, settings );
		
		$('#' + settings.id).remove();
		
		var to;
		var el = $('<div>', { id: settings.id }).appendTo('body');
		var pn = $('<div>', { 'class': 'panel' }).appendTo(el);
		pn.css({ width: settings.width }).append(this);

		var close = function() { 
			el.fadeOut(250, function(){ 
				$(this).remove(); 
			}); 
		};

		el.fadeIn(250, function() {
			to = setTimeout(close, settings.length);	
		});
		
		pn.css({
			marginTop: Math.max(Math.round(($(window).height() - pn.outerHeight()) * 0.4), 0)
		}).on({
			mouseover: function() {
				to = clearTimeout(to);
				$(this).stop(true, false).css('opacity', 1);
			},
			mouseout: function() {
				to = setTimeout(close, settings.length);
			}
		});
		
		return this;
	};
	
	$.fn.popupBox.defaults = {
		id: 'modal',
		width: 200,
		length: 500
	};
	
	// $('Message to display in HTML').alertBox([{ t:'button1', h:function(){ handler; } },...], {options});
	
	$.fn.alertBox = function( buttons, settings ) { 
		
		if ( !$.isArray(buttons) ) { 
			settings = buttons; 
			buttons = null;
		}
		
		settings = $.extend( {}, $.fn.alertBox.defaults, settings );
		
		$('#' + settings.id).remove();
		
		var el = $('<div>', { 
				id: settings.id, 
				role: 'alertBox' 
			}).appendTo('body'),
			pn = $('<div>', { 
				'class': 'panel' 
			}).appendTo(el),
			btn, btns;
			
		pn.append(this);
		pn.append( $('<a>', { 
			'class': 'close', 
			href: NOLINK, 
			text: ' ' 
		}).on('click', function() {
			close();
			return false;
		}) );
		
		if ( buttons ) {
			btn = $('<div>', { 
				'class': 'buttons' 
			}).appendTo( pn );	
		}
		
		pn.css({ width: settings.width });
		
		var handler = function(e) {
			if ( document.activeElement && document.activeElement.nodeName === 'input' || 
				( $.isFunction(settings.enableKeyboard) && !settings.enableKeyboard()) ) {
				return true;
			}
			var k = e? e.keyCode : window.event.keyCode;
			if ( k === 27 ) {
				close(); 
			} else if ( btn ) {
				var a = btn.find('a.active'), i = btns.index(a);
				switch (k) {
					case 13: case 10: 
						if ( $.isFunction(a[0].handler) ) {
							a[0].handler.call();
							close();
							return false;
						}
					case 39: 
						select( (i + 1) % btns.length ); 
						return false;
					case 37: 
						select( i? (i - 1) : (btns.length - 1) ); 
						return false;
				}
			}
			e.returnValue = true;
			return true;
		};
		
		var close = function() { 
			$(document).off('keydown', handler);
			el.fadeOut(250, function(){ 
				$(this).remove(); 
			}); 
		};
		
		var select = function(n) { 
			btns.each(function(i) { 
				$(this).toggleClass('active', i === n); 
			}); 
		};
	
		if ( buttons && buttons.length ) {
			var a;
			for ( var i = 0; i < buttons.length; i++ ) {
				if ( i ) {
					btn.append(' ');
				}
				a = $('<a>', { href: NOLINK }).appendTo(btn);
				a.html(buttons[i].t)
				if ( $.isFunction(buttons[i].h) ) {
					a[0].handler = buttons[i].h;
				}
				a.on('click', function() { 
					if ( this.handler != null ) {
						this.handler.call();
					}
					close();
					return false;
				});
			}
			var btns = btn.children('a');
			btns.last().addClass('active');
		}
		
		if ( $.isFunction(settings.enableKeyboard) || settings.enableKeyboard ) {
			w.on('keydown', keyhandler);
		}
		
		el.fadeIn(250);
		
		pn.css({
			marginTop: Math.max(Math.round(($(window).height() - pn.outerHeight()) * 0.4), 0)
		});
		
		return this;
	};
	
	$.fn.alertBox.defaults = {
		id: 'modal',
		width: 420,
		enableKeyboard: true
	};
	
	// equalHeight :: adjust elements in the same row to equal height 
	
	$.fn.equalHeight = function() {			
		var t, el, y = 0, h = 0, n;
		
		if ( (n = $(this).length) < 2 ) {
			return this;
		}
		
		return this.each(function(i) {
			t = $(this);
			if ( t.offset().top === y ) { 
				el = el? el.add(t) : t;
				h = Math.max(h, t.height());
				if ( i === n - 1 && h ) {
					el.height( h );
				}
			} else {
				if ( el && h ) {
					el.height( h );
				}
				el = t; 
				h = t.height();
				y = t.offset().top;
			}
		});
	};
	
	//	shareIt :: adds a popup box to the div to share the current page over various sharing sites
	
	var tumblr_photo_source = "";
	var tumblr_photo_caption = "";
	var tumblr_photo_click_thru = "";
	
	$.fn.shareIt = function( settings ) {
		
		settings = $.extend( {}, $.fn.shareIt.defaults, settings );
		
		var u = settings.useHash? window.location.href : window.location.href.split('\#')[0];
		/*if ( u.endsWith('\/') ) {
			u += 'index.html';
		}*/
		var ti = encodeURIComponent( settings.title || $('meta[name=title]').attr('content') || $('title').text() );
		var tx = encodeURIComponent( settings.callTxt );
		var im = u.substring(0, u.lastIndexOf('\/') + 1) + (settings.image || encodeURIComponent($('link[rel=image_src]').attr('href')));
		
		return this.each(function() {
			var a = $(this);
			
			if ( this.nodeName === 'a' ) {
				a.attr('href', NOLINK);
			}
			
			var e = $('<div>', { 
				'class': settings.id 
			}).hide();
			
			if ( location.protocol.startsWith('file:') && !DEBUG ) {
				e.html(settings.localWarning);
			} else {
				if ( settings.facebookLike && !settings.useHash ) {
					e.append('<div class="likebtn"><iframe src="http://www.facebook.com/plugins/like.php?href=' + u + '&amp;layout=button_count&amp;show_faces=false&amp;width=110&amp;action=like&amp;font=arial&amp;colorscheme=' + settings.likeBtnTheme + '&amp;height=20" scrolling="no" frameborder="0" style="border:none; overflow:hidden; width:110px; height:20px;" allowTransparency="true"></iframe></div>');
				}
				if ( settings.twitterTweet && !settings.useHash ) {
					e.append('<div class="likebtn"><iframe allowtransparency="true" frameborder="0" scrolling="no" src="http://platform.twitter.com/widgets/tweet_button.html?url=' + u + '&text=' + ti + '" style="width:55px; height:20px;"></iframe></div>');
				}
				if ( settings.googlePlus && gapi && !settings.useHash ) {
					var po = $('<div class="g-plusone likebtn" data-size="medium" data-annotation="inline" data-href="' + u + '" data-width="110"></div>').appendTo(e);
					gapi.plusone.render(po[0]);
				}
				if ( settings.tumblrBtn ) {
					e.append('<div class="likebtn" id="tumblr"><a href="http://www.tumblr.com/share/' + (settings.image? 'photo?source=' : 'link?url=') + encodeURIComponent(u) + '&name=' + ti + '" title="Share on Tumblr" style="display:inline-block; text-indent:-9999px; overflow:hidden; width:81px; height:20px; background:url(http://platform.tumblr.com/v1/share_1.png) top left no-repeat transparent;">Tumblr</a></div>');
				}
				if ( settings.pinItBtn ) {
					e.append('<div class="likebtn" id="pinitbtn"><iframe src="http://pinit-cdn.pinterest.com/pinit.html?url=' + u + '&amp;media=' + im + '&amp;description=' + ti + '&amp;layout=horizontal" scrolling="no" frameborder="0" style="border:none;width:110px;height:20px;"></iframe></div>');
				}
				
				if ( settings.facebook  && !settings.useHash ) {
					e.append('<a href="http://www.facebook.com/sharer.php?u=' + u + '&t=' + ti + '" class="facebook">Facebook</a>');
				}
				if ( settings.twitter ) {
					e.append('<a href="http://twitter.com/home?status=' + tx + ': ' + u + '" class="twitter">Twitter</a>');
				}
				if ( settings.gplus ) {
					e.append($('<a>', {
						'class': 'gplus',
						href: 'https://plus.google.com/share?url=' + u,
						title: 'Share on Google+',
						text: 'Google+'
					}).on('click', function() {
						window.open(this.href, '', 'menubar=no,toolbar=no,resizable=yes,scrollbars=yes,height=980,width=760');
						return false;
					}));
				}
				if ( settings.digg ) {
					e.append('<a href="http://digg.com/submit?url=' + u + '" class="digg">Digg</a>');
				}
				if ( settings.delicious ) {
					e.append('<a href="http://delicious.com/save?url=' + u + '&title=' + ti + '&v=5" class="delicious">Delicious</a>');
				}
				if ( settings.myspace ) {
					e.append('<a href="http://www.myspace.com/index.cfm?fuseaction=postto&t=' + ti + '&u=' + u + '&l=3" class="myspace">MySpace</a>');
				}
				if ( settings.stumbleupon ) {
					e.append('<a href="http://www.stumbleupon.com/submit?url=' + u + '&title=' + ti + '" class="stumbleupon">StumbleUpon</a>');
				}
				if ( settings.reddit ) {
					e.append('<a href="http://www.reddit.com/submit?url=' + u + '" class="reddit">Reddit</a>');
				}
				e.children('a').attr('target', '_blank');
				
				if ( settings.email ) {
					e.append('<a href="mailto:?subject=' + tx + '&body=' + ti + '%0D%0A' + u + '" class="email">Email</a>');
				}
			}
			a.addHint( e.appendTo('body'), settings.pos ).on('destroy', function() {
				e.remove();
			});
		});
	};
	
	$.fn.shareIt.defaults = {
		id: 'shares',
		useHash: true,
		likeBtnTheme: 'light',
		facebookLike: true,
		twitterTweet: true,
		googlePlus: true,
		tumblrBtn: true,
		facebook: true,
		twitter: true,
		gplus: true,
		digg: true,
		delicious: true,
		myspace: true,
		stumbleupon: true,
		reddit: true,
		email: true,
		callTxt: 'Found this page',
		pos: { 
			posX: 1,
			posY: 2,
			toX: 1,
			toY: 0
		},
		localWarning: 'Can\'t share local albums. Please upload your album first!'
	};
	
	// addRegions :: adds area markers
	
	$.fn.addRegions = function( el, regions, settings ) {
		
		if (!el || !el.length || !regions) {
			return;
		}
		
		settings = $.extend( {}, $.fn.addRegions.defaults, settings );
		
		var iw = el.width(),
			ih = el.height();
			
		var regs = [];
		
		var parseRegions = function() {
			var i, v, n, x, y, w, h, r = regions.split('::');
			for ( i = 0; i < r.length; i++ ) {
				v = r[i].split(';');
				if (v.length > 4 && v[0].length && 
					(x = parseFloat(v[1])) != null &&
					(y = parseFloat(v[2])) != null &&
					(w = parseFloat(v[3])) != null &&
					(h = parseFloat(v[4])) != null) {
					//regs.push([ v[0], (x - w / 2) * 100 + '%', (y - h / 2) * 100 + '%', w * 100 + '%', h * 100 + '%' ]);
					regs.push([ v[0], x * 100 + '%', y * 100 + '%', w * 100 + '%', h * 100 + '%' ]);
				}
			}
		};
		
		parseRegions();
		
		if ( !regs.length )
			return this;
				
		return this.each(function() {
			var t = $(this), a, ra, pw = parseInt(t.css('padding-top'));
			
			if ( this.nodeName === 'a' ) {
				t.attr('href', NOLINK);
			}
			
			var e = $('<div>', { 'class': settings.id }).hide();
			var r = $('<div>', { 'class': settings.id + '-cont' }).css({
				left: pw,
				top: pw,
				right: pw,
				bottom: pw
			});
			
			for ( i = 0; i < regs.length; i++ ) {
				a = $('<a href="' + NOLINK + '">' + regs[i][0] + '</a>').appendTo(e);
				ra = $('<a>').css({
					left: regs[i][1],
					top: regs[i][2],
					width: regs[i][3],
					height: regs[i][4]
				}).append($('<span>', { text: regs[i][0] })).appendTo(r);
				
				a.on({
					mouseover: function() {
						r.children('a').eq($(this).index()).addClass(settings.active);
					}, 
					mouseout: function() {
						r.children('a').eq($(this).index()).removeClass(settings.active);
					}
				});
				
				if ( typeof Search !== UNDEF ) {
					ra.on('click', function() {
						Search.start(this);
						return false;
					});
				}
			}
			
			t.addHint( e.appendTo('body'), settings.pos ).on('destroy', function() {
				e.remove();
			});
			
			if ( t.hasClass(settings.active) ) {
				r.addClass(settings.active);
			}
				
			t.on('click', function() {
				$(this).add(r).toggleClass(settings.active);
			});
			
			el.append(r);
		});
	};
	
	$.fn.addRegions.defaults = {
		id: 'regions',
		active: 'active',
		pos: { 
			posX: 1,
			posY: 2,
			toX: 1,
			toY: 0
		}
	};
	
	// Adding Video player, using HTML5 Video as fallback
	
	var playerType = { 
		flashVideo: [ '.flv.3gp.3g2', 24 ],
		flash: [ '.swf', 0 ],
		video: [ '.mp4.f4v.m4v', 24 ],
		html5Video: [ '.ogv.webm', 30 ],
		qtVideo: [ '.qt.mov.mpg.mpeg.mpe', 16 ],
		wmVideo: [ '.avi.wmv.asf.asx.wvx.mkv', 64 ],
		audio: [ '.mp3.aac.m4a', 24 ],
		html5audio: [ '.ogg.wav.ram.rm', 30 ]
	};
		
	var getPlayerType = function( fn ) {
		var x = fn.getExt();
		if ( !x.length ) {
			return null;
		}
		for ( var t in playerType ) {
			if ( playerType[t][0].indexOf(x) >= 0 ) {
				return t;
			}
		}
		return null;
	};
	
	var getPlayerControlHeight = function( fn ) {
		var t = getPlayerType( fn );
		return t && playerType[t][1] || 0;
	};
	
	$.fn.addPlayer = function( settings ) {
		
		settings = $.extend( {}, $.fn.addPlayer.defaults, settings );
		
		var num = 0;
		var res = settings.resPath? (settings.resPath + '/') : '';
		
		var addParam = function( p ) {
			var s = '', o;
			for ( o in p ) {
				s += '<param name="' + o + '" value="' +  p[o] + '">';
			}
			return s;
		};
		
		var removePlayerIE = function( o ) {
			if ( !o ) {
				return;
			}
			for (var i in o) {
				if (typeof o[i] === "function") {
					o[i] = null;
				}
			}
			o.remove();
		};
		
		var removePlayer = function( e ) {
			var o = $(e.target);
			if ( !o ) {
				return;
			}
			if ( $.browser.msie ) {
				o.hide();
				(function(){
					if (o.readyState == 4) {
						removePlayerIE( o );
					}
					else {
						setTimeout(arguments.callee, 10);
					}
				})();
			}
			else {
				o.remove();
			}
		};
		
		var embedFlash = function(t, f, w, h, p, fo) {
			var i = 'media' + (num++);
			t.addClass('flplayer').css({
				width: w,
				height: h + playerType['flashVideo'][1]
			});
			var fv = 
				'netstreambasepath=' + encodeURIComponent(window.location.href.split('\#')[0]) + 
				'&id=' + i + 
				'&file=' + encodeURIComponent(f) + 
				'&image=' + encodeURIComponent(p) + 
				((fo && fo.length)? ('&folder=' + encodeURIComponent(fo)) : '') + 
				'&autostart=' + settings.auto + 
				'&loop=' + settings.loop +
				'&screencolor=' + encodeURIComponent(settings.bgcolor) + 
				'&controlbar.position=bottom';
				
			var html = '<object id="' + i + '" name="' + i + '" width="100%" height="100%" bgcolor="' + settings.bgcolor + '" tabindex="0" ';
			
			if ( $.browser.msie ) {
				html += 'classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000">';
				html += addParam({ 
					movie: res + settings.swf 
				});
			} else {
				html += 'type="application/x-shockwave-flash" data="' + res + settings.swf + '">';
			}
			html += addParam({
				allowfullscreen: true, 
				allowscriptaccess: 'always',
				seamlesstabbing: true,
				wmode: 'opaque',
				flashvars: fv
			});
			var el = $(html).appendTo(t);
			return el;
		};
		
		var embedFlashAudio = function(t, f, w, h, fo) {
			t.addClass('flplayer').css({
				width: w,
				height: h
			});
			var fv = 
				'file=' + encodeURIComponent(f) + 
				((fo && fo.length)? ('&folder=' + encodeURIComponent(fo)) : '') + 
				'&autostart=' + settings.auto + 
				'&loop=' + settings.loop;
				
			var html = '<object width="100%" height="100%" bgcolor="' + settings.bgcolor + '" tabindex="0" ';
			
			if ( $.browser.msie ) {
				html += 'classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000">';
				html += addParam({ 
					movie: res + settings.swf 
				});
			} else {
				html += 'type="application/x-shockwave-flash" data="' + res + settings.swf + '">';
			}
			html += addParam({
				wmode: 'opaque',
				flashvars: fv
			});
			var el = $(html).appendTo(t);
			return el;
		};

		var embed = function(t, f, w, h) {
			var i = 'em' + (num++);
			t.addClass('emplayer');
			return $('<embed class="otherplayer" id="' + i + 
				'" src="' + f + 
				'" autostart="' + settings.auto +
				'" loop="' + settings.loop +
				'" width="' + w +
				'" height="' + h + '">').appendTo(t);
		};
		
		var embedHtml5 = function(t, f, w, h, p, a) {
			a = a !== UNDEF && a;
			if ( (a && !Modernizr.audio) || (!a && !Modernizr.video) ) {
				return embed(t, f, w, h);
			}
			var i = 'ht' + (num++), el, ch = playerType['html5Video'][1];
			t.addClass('h5player').css({			
				width: w,
				height: h + ch
			});
			el = $( (a? '<audio>' : '<video>'), {
				id: i,
				src: f,
				width: w,
				height: h,
				controls: true, 
				preload: 'auto',
				poster: p,
				autoplay: settings.auto,
				loop: settings.loop
			}).appendTo(t);
			if ( $.isFunction(settings.complete) ) {
				el.on('ended', settings.complete);
			}
			return el;
		};
		
		var embedQt = function(t, f, w, h) {
			var i = 'qt' + (num++), ch = playerType['qtVideo'][1], el;
			t.addClass('qtplayer').css({
				width: w,
				height: h + ch
			});
			var html = '<object id="' + i + '" width="' + w + '" height="' + (h + ch) + '" ' +
				($.browser.msie?
					'classid="clsid:02BF25D5-8C17-4B23-BC80-D3488ABDDC6B" codebase="http://www.apple.com/qtactivex/qtplugin.cab#version=6,0,2,0">'
					:
					'type="video/quicktime" data="' + f + '">');
			html += addParam({
				src: f,
				autoplay: settings.auto,
				scale: settings.fit? 'tofit':'1',
				enablejavascript: true,
				postdomevents: true
			});
			el = $(html).appendTo(t);
			if ( $.isFunction(settings.complete) ) {
				el.on('qt_ended', settings.complete);
			}
			return el;
		};
		
		var embedWm = function(t, f, w, h) {
			var i = 'wm' + (num++), ch = playerType['wmVideo'][1];
			t.addClass('wmplayer').css({ 
				width: w,
				height: h + ch
			});
			var html = '<object id="' + i + '" width="' + w + '" height="' + h + '" ' +
				($.browser.msie? 
					'classid="CLSID:6BF52A52-394A-11D3-B153-00C04F79FAA6">'
					:
					'type="application/x-ms-wmp" data="' + f + '">');
			html += addParam({
				URL: f,
				SendPlayStateChangeEvents: true,
				AutoStart: settings.auto,
				StretchToFit: settings.fit
			});
			if ( !$.browser.msie ) {
				html += '<a></a>';
			}
			el = $(html).appendTo(t);
			if ( $.isFunction(settings.complete) ) {
				el.on('playStateChange', function(e) {
					settings.complete.call(this);
				});
			}
			return el;
		};
			
		return this.each(function() {
			var t = $(this), e = null;
			t.readData(settings, 'file,folder,width,height,poster');
			if ( !settings.file ) {
				return;
			}
			/*t.on('click mousedown mouseup dragstart dragmove', function(e) {
				e.preventDefault();
				return false;
			});*/
			switch ( getPlayerType(settings.file) ) {
				case 'flashVideo':
					if ( !$.support.flash ) {
						t.append(settings.flashInstall);
						break;
					}
				case 'video':
					if ( $.support.flash ) {
						e = embedFlash( t, settings.file, settings.width, settings.height, settings.poster );
						break;
					}
				case 'html5Video':
					e = embedHtml5( t, settings.file, settings.width, settings.height, settings.poster );
					break;
				case 'qtVideo':
					e = embedQt( t, settings.file, settings.width, settings.height );
					break;
				case 'wmVideo':
					e = embedWm( t, settings.file, settings.width, settings.height );
					break;
				case 'audio':
					if ( $.support.flash ) {
						if ( settings.swf == $.fn.addPlayer.defaults.swf )
							e = embedFlash( t, settings.file, settings.width, settings.height, settings.poster, settings.folder );
						else
							e = embedFlashAudio( t, settings.file, settings.width, settings.height, settings.folder );
						break;
					}
				case 'html5audio':
					e = embedHtml5( t, settings.file, settings.width, settings.height, settings.poster, true );
					break;
				default:
					e = embed( t, settings.file, settings.width, settings.height );
			}
			e.on('destroy', removePlayer);					
		});
	};
	
	$.fn.addPlayer.defaults = {
		complete: null, // function(e) { log('complete event on '+e.target.nodeName+'['+e.target.id+']'); },
		swf: 'player.swf',
		width: 640,
		height: 480,
		bgcolor: '#000000',
		auto: false,
		loop: false,
		fit: true,
		poster: '',
		folder: '',
		flashInstall: '<a href="http://get.adobe.com/flashplayer/">Get Adobe Flash Player!</a>'
	};

	// centerThis :: centers an image and fits optionally into its containing element 
	
	$.fn.centerThis = function( settings ) {
		
		settings = $.extend({}, $.fn.centerThis.defaults, settings);
				
		return this.each(function() {
						
			var c = $(this),
				el = c.find(settings.selector);
				
			if ( !el.length ) {
				return;
			}
			
			var	cw, ch, tw, th, tl, tt, ow, oh, bw, pw,
				ml = settings.marginLeft + settings.padding,
				mr = settings.marginRight + settings.padding,
				mt = settings.marginTop + settings.padding,
				mb = settings.marginBottom + settings.padding;
			
			// original dimensions
			ow = el.data('ow');
			oh = el.data('oh');
			if ( !ow || !oh ) {
				el.data('ow', ow = el.width());
				el.data('oh', oh = el.height());
			}

			// border width :: assuming equal border widths
			if ( !(bw = el.data('bw')) ) {
				el.data( 'bw', bw = parseInt(el.css('border-top-width')) || 0 );
			}
			
			// padding :: assuming uniform padding
			if ( !(pw = el.data('pw')) ) {
				el.data( 'pw', pw = parseInt(el.css('padding-top')) || 0 );
			}
			
			// target boundaries
			cw = (c.innerWidth() || $('body').width()) - 2 * (bw + pw) - ml - mr;
			ch = (c.innerHeight() || $('body').height()) - 2 * (bw + pw) - mt - mb;
			
			// target dimensions
			if ( settings.fit && (ow > cw || oh > ch || settings.enlarge) ) {
				var r = Math.min(cw / ow, ch / oh);
				tw = Math.round(ow * r),
				th = Math.round(oh * r);
			} else {
				tw = ow;
				th = oh;
			}
			tl = Math.round((cw - tw) / 2) + ml;
			tt = Math.round((ch - th) / 2) + mt;
			
			if ( !settings.animate ) {
				
				// simply set the position and size
				el.css({
					left: tl,
					top: tt,
					width: tw,
					height: th
				});
				
				if ( $.isFunction(settings.complete) ) { 
					settings.complete.call(this);
				}
				
			} else {
				
				el.stop(true, false);
				// set prescale dimensions
				if ( settings.preScale && settings.preScale !== 1.0 ) {
					var sw = tw * settings.preScale,
						sh = th * settings.preScale;
					el.css({
						left: Math.round((cw - sw) / 2) + ml,
						top: Math.round((ch - sh) / 2) + mt,
						width: Math.round(sw),
						height: Math.round(sh)
					});
				} else if ( settings.init ) {
					el.css({
						left: tl,
						top: tt
					});
				}
				
				// animating attributes
				el.animate({
					left: tl,
					top: tt,
					width: tw,
					height: th
				}, { 
					duration: settings.speed, 
					easing: settings.effect, 
					complete: settings.complete 
				});
			}
		});
	};
	
	$.fn.centerThis.defaults = {
		selector: '.main',
		speed: 500,
		fit: true,
		enlarge: true,
		marginTop: 0,
		marginBottom: 0,
		marginLeft: 0,
		marginRight: 0,
		padding: 0,
		init: false,
		animate: false,
		effect: 'swing',
		complete: null
		// complete: function() { log('final: left='+$(this).css('left')+' top='+$(this).css('top')); }
	};
	
	// setupShop :: setting up the shopping cart
	
	$.fn.setupShop = function(settings) {

		settings = $.extend( {}, $.fn.setupShop.defaults, settings );
		var i, f, k, s;
		
		$.fn.addInput = function( n, v, t, a ) {
			var i;
			if ( !n || v == null ) {
				return this;
			}
			
			return this.each(function() {
				i = $('<input>', { 
					type: (t || 'text') 
				}).appendTo($(this));
				
				i.attr('name', n); 
				i.addClass(n); 
				
				i.val((typeof v === 'string')? v.stripQuote() : v);
				
				if ( a ) {
					i.prop(a, a);
				}
			});
		};
		
		$.fn.addSelect = function( o, currency, changeFn ) {
			
			if ( !o.length ) {
				return this;
			}
			
			return this.each(function() {
				var t = $(this);
				var e = $('<select>').appendTo(t);
				
				for ( i = 0; i < o.length; i++ ) {
					e.append($('<option>', {
						val: o[i].val,
						text: o[i].key + ' (' + currency + ' ' + o[i].val + ')'
					}));
				}
				
				if ( $.isFunction( changeFn ) ) {
					e.change( changeFn );
				}
			});
		};
		
		var readOptions = function(s) {
			var v = s.split('::'), k;
			var o = new Array();
			
			for ( i = 0; i < v.length; i++ ) {
				k = v[i].split('=');
				if ( k.length > 1 ) {
					o.push( { key: k[0], val: k[1] } );
				}
			}
			
			return o;
		};
		
		return this.each(function() {
			var t = $(this), f, fs, fv;
			
			t.readData(settings, 'gateway,id,currency,handling,options,file');
			
			if ( settings.id == null || settings.options == null || settings.file == null ) {
				return;
			}
			
			id = ( settings.gateway == 'paypal' )? {
				'form': 	'paypal',
				'seller': 	'business',
				'currency':	'currency_code',
				'title': 	'item_name',
				'select': 	'item_number',
				'price': 	'amount',
				'copies': 	'quantity',
				'shipprice':'shipping',
				'shipprice2':'shipping2',
				'handling':	'handling_cart',
				'shopUrl':	'shopping_url'
			} : {
				'form':		'google_checkout',
				'currency':	'item_currency_1',
				'title':	'item_name_1',
				'select':	'item_description_1',
				'price':	'item_price_1',
				'copies':	'item_quantity_1',
				'shipmethod': 	'ship_method_name_1',
				'shipprice':	'ship_method_price_1',
				'shipcurrency': 'ship_method_currency_1'
			};
			
			var o = readOptions( settings.options );
			settings.id = settings.id.replace('|','@');
			
			var adjustShipping = function( v ) {
				var el = fs.children('[name^='+id.shipprice+']');
				if (v === null || v === false || !$.isNumeric(v)) {
					if ( settings.gateway === 'paypal' )
						el.remove();
					else
						el.val(0);
				} else {
					if ( el.length ) {
						el.val(v);
					} else if ( settings.gateway === 'paypal' ) {
						fs.addInput(id.shipprice, v, 'hidden');
						if ( !settings.shippingFlat ) {
							fs.addInput(id.shipprice2, v, 'hidden');
						}
					}
				}					
			};
			
			var changed = function( e ) {
				var s = f.length? f.children('select').eq(0) : false ;
				if ( s && s.length ) {
					var el, a = s.val().split('+');
					q = f.children('[name=copies]').val() || 1;
					if ( settings.quantityCap && q > settings.quantityCap ) {
						f.children('[name=copies]').val(q = settings.quantityCap);
					}
					if ( el = f.children('[name=total]') ) {
						el.val( (a[0] * q).toFixed(2) );
					}
					if ( el = fs.children('[name='+id.price+']') ) {
						el.val( a[0] );
					}
					if ( el = fs.children('[name='+id.copies+']') ) {
						el.val( q );
					}
					adjustShipping( (a.length > 1)? a[1] : null );
					if ( el = fs.children('[name='+id.select+']') ) {
						el.val( f.find('option:selected').text() );
					}
				}
			};
			
			f = $('<form>', {
				name: 'shopping',
				method: 'post'
			}).appendTo(t);
			
			f.addSelect(o, settings.currency, changed);
			if ( settings.quantityCap != 1 ) {
				f.append('x').addInput('copies', 1);
			}
			f.append('=').addInput('total', o[0].val.split('+')[0], 'text', 'readonly');
			f.children('[name=copies]').css({ width: '3em' }).change(changed);
			f.children('[name=total]').css({ width: '5em' });
			f.append(settings.currency);
			
			if ( settings.gateway === 'paypal' ) {
				
				var a = o[0].val.split('+');
				fs = $('<form>', {
					name: id.form,
					target: settings.target,
					action: 'https://www.paypal.com/cgi-bin/webscr/',
					method: 'post'
				}).appendTo(t);
				
				fs.addInput('cmd', '_cart', 'hidden');
				fs.addInput('add', 1, 'hidden');
				fs.addInput(id.seller, settings.id, 'hidden');
				fs.addInput(id.copies, 1, 'hidden');
				fs.addInput(id.price, a[0], 'hidden');
				fs.addInput(id.currency, settings.currency, 'hidden');
				adjustShipping( (a.length > 1)? a[1] : null );
				if ( settings.handling != null && $.isNumeric(settings.handling) ) {
					fs.addInput(id.handling, settings.handling, 'hidden');
				}
				fs.addInput(id.title, decodeURIComponent(settings.path + settings.file), 'hidden');
				fs.addInput(id.select, o[0].key + ' (' + settings.currency + ' ' + o[0].val + ')', 'hidden');
				fs.addInput(id.shopUrl, window.location.href, 'hidden');
				fs.addInput('charset', 'utf-8', 'hidden');
				fs.addInput('lc', settings.locale, 'hidden');
				
				fs.append($('<input>', {
					id: 'shopAdd',
					type: 'image',
					name: 'submit',
					src: 'https://www.paypal.com/en_US/i/btn/btn_cart_SM.gif',
					alt: 'Add to Cart'
				}));
			
				fv = $('<form>', {
					'class': 'view',
					name: 'paypalview',
					target: settings.target,
					action: 'https://www.paypal.com/cgi-bin/webscr/',
					method: 'post'
				}).appendTo(t);
				fv.addInput('cmd', '_cart', 'hidden');
				fv.addInput('display', 1, 'hidden');
				fv.addInput(id.seller, settings.id, 'hidden');
				fv.addInput('lc', settings.locale, 'hidden');
				fv.append($('<input>', {
					id: 'shopView',
					type: 'image',
					name: 'submit',
					src: 'https://www.paypal.com/en_US/i/btn/btn_viewcart_SM.gif',
					alt: 'View Cart'
				}));
				
			} else if ( settings.gateway === 'google' ) {
				var merchant = settings.id.match(/(\d+)/)[0];
				fs = $('<form>', {
					name: id.form,
					target: settings.target,
					action: 'https://checkout.google.com/cws/v2/Merchant/' + merchant + '/checkoutForm',
					//action: 'https://sandbox.google.com/checkout/cws/v2/Merchant/' + merchant + '/checkoutForm', // sandbox
					method: 'post',
					'accept-charset': 'utf-8'
				}).appendTo(t);
				
				fs.addInput(id.title, decodeURIComponent(settings.path + settings.file), 'hidden');
				fs.addInput(id.select, o[0].key, 'hidden');
				fs.addInput(id.copies, 1, 'hidden');
				fs.addInput(id.price, o[0].val.split('+')[0], 'hidden');
				fs.addInput(id.currency, settings.currency, 'hidden');
				if ( settings.shipping != null && $.isNumeric(settings.shipping) ) {
					fs.addInput(id.shipmethod, 'normal', 'hidden');
					fs.addInput(id.shipprice, settings.shipping, 'hidden');
					fs.addInput(id.shipcurrency, settings.currency, 'hidden');
				}
				fs.addInput('_charset_', '', 'hidden');

				fs.append($('<input>', {
					id: 'shopAdd',
					type: 'image',
					name: 'Google Checkout',
					alt: 'Fast checkout through Google',
					src: 'http://checkout.google.com/buttons/checkout.gif?merchant_id=' + merchant + '&w=160&h=43&style=trans&variant=text&loc=en_US',
					//src:'http://sandbox.google.com/checkout/buttons/checkout.gif?merchant_id=' + merchant + '&w=160&h=43&style=trans&variant=text&loc=en_US', // sandbox
					height: 43,
					width: 160
				}));
			}
			
			fs.add(fv).find('input[name=submit]').on( 'submit', function() {
				window.open('', settings.target, 'width=960,height=600,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,directories=no,status=no,copyhistory=no');
				return true;
			});
				
		});
	};
	
	$.fn.setupShop.defaults = {
		target: 'ShoppingCart',
		currency: 'EUR',
		gateway: 'paypal',
		locale: 'US',
		quantityCap: 0,
		shippingFlat: false
	};

	// getLatLng :: returns google.maps position from formatted string "lat,lon" or Array(lat, lon)
	
	var getLatLng = function( p ) { 
		if ( p == null ) 
			return null;
		if ( typeof p === 'string' ) {
			p = /^(-?[\d.]+),\s?(-?[\d.]+)$/.exec(p);
			return new google.maps.LatLng(p[1], p[2]);
		}
		return new google.maps.LatLng(p[0], p[1]);
	};
	
	// setupMap :: preprocessing Google Maps map
	
	$.fn.setupMap = function( settings ) {
		
		if ( !(google && google.maps) ) 
			return this;
		
		settings = $.extend( {}, $.fn.setupMap.defaults, settings );
				
		var markerCurr = (settings.markerPath == null) ? {} : {
			icon: 	new google.maps.MarkerImage(settings.markerPath, new google.maps.Size(17,24), new google.maps.Point(0,0), new google.maps.Point(8,24)),
			shadow:	new google.maps.MarkerImage(settings.markerPath, new google.maps.Size(28,24), new google.maps.Point(17,0), new google.maps.Point(8,24)),
			zIndex:	9999
		};
		var markerEtc = (settings.markerPath == null) ? {} : {
			icon: 	new google.maps.MarkerImage(settings.markerPath, new google.maps.Size(17,21), new google.maps.Point(45,3), new google.maps.Point(8,24)),
			shadow:	new google.maps.MarkerImage(settings.markerPath, new google.maps.Size(28,21), new google.maps.Point(62,3), new google.maps.Point(8,24))
		};
		
		return this.each(function() {
			var t = $(this), ll, label, map, tmp, to;
			
			t.readData( settings, "type,zoom,map,label,resPath,markers" );
			
			var adjust = function() {
				if ( t.data('fresh') ) {
					if ( t.is(':visible') && !t.parents(':hidden').length && t.width() && t.height() ) {
						clearTimeout(to);
						t.width(t.parents('.cont').width() - 30);
						google.maps.event.trigger( map, 'resize' );
						map.setCenter( ll );
						t.data('fresh', false);
					} else {
						to = setTimeout(adjust, 200);
					}
				}
			};
			
			if ( tmp && tmp.length ) {
				tmp.remove();
			}
			tmp = $('<div>').css({ 
				position: 'absolute', 
				top: '-9000px', 
				width: t.width(), 
				height: t.height() 
			}).appendTo('body');
			
			t.data('fresh', true).on({
				adjust: adjust,
				destroy: function() {
					// No remove function with Google Maps?
					map.getParentNode().removeChild(map);
					$(window).unbind('resize', adjust);
				}
			});
			
			if ( settings.markers && settings.markers.length && settings.curr != null ) {
				ll = settings.markers[settings.curr].map;
			} else if ( settings.map ) {
				ll = getLatLng(settings.map);
				label = settings.label;
			} else { 
				return;
			}
			
			// Leaving 20ms to get the DOM ready before adding the Map
			
			setTimeout( function() {
				
				var m0 = new google.maps.Map(
					tmp[0], 
					{
						zoom: settings.zoom, 
						center: ll, 
						mapTypeId: settings.type.toLowerCase() 
					}
				);				
				
				google.maps.event.addListener(m0, 'maptypeid_changed', function() { 
					$.fn.setupMap.defaults.type = m0.getMapTypeId(); 
				});
				
				google.maps.event.addListener(m0, 'zoom_changed', function() { 
					$.fn.setupMap.defaults.zoom = m0.getZoom(); 
				});
				
				if ( settings.markers && settings.markers.length > 1 ) {
					var m, mo, mk, mx = Math.min(settings.curr + settings.range, settings.markers.length);
					
					for (var i = Math.max(settings.curr - settings.range, 0); i < mx; i++) {
						mk = settings.markers[i];
						mo = { 
							position: mk.map, 
							map: m0, 
							title: mk.label,
							zIndex: i
						};
			
						if (i == settings.curr) {
							m = new google.maps.Marker( $.extend(mo, markerCurr) );
						} else {
							m = new google.maps.Marker( $.extend(mo, markerEtc) );
							if ( jQuery.isFunction(settings.click) && mk.link ) {
								m.link = mk.link;
								google.maps.event.addListener(m, 'click', function() { 
									settings.click.call(this); 
								});
							}
						}
					}
				} else {
					var m = new google.maps.Marker( $.extend({
							position: ll, 
							map: m0, 
							title: label
						}, markerCurr ) 
					);
				}
				
				tmp.css({ top: 0 }).appendTo(t);
				
				map = m0;
				
			}, 20 ); 
			
			$(window).on('resize', function() {
				clearTimeout(to); 
				t.data('fresh', true);
				to = setTimeout(adjust, 100);
			});
		});
	};
	
	$.fn.setupMap.defaults = {
		type: 'roadmap',		// 'roadmap', 'Satellite', 'Hybrid', 'Terrain'
		zoom: 16,				// 0 .. 20
		range: 30				// restricting the number of markers :: 30 means display markers from curr - 30 to curr + 30
		// markerPath: :: path to custom marker graphics folder
		// markers :: array of markers to display
		// curr :: current marker (center map here)
		// click :: function to be called upon marker click
	};
	
	// markNewFolders :: marking the folders containing new pictures
	
	$.fn.markFoldersNew = function( settings ) {
		
		settings = $.extend( {}, $.fn.markFoldersNew.defaults, settings );
		
		if ( !settings.markNewDays )
			return;
		
		var today = Math.round((new Date()).getTime() / 86400000);
		
		return this.each(function() {
			if ( (today - parseInt($(this).data('modified') || 0)) <= settings.markNewDays ) {
				$(this).after( settings.newLabel );
			}
		});
	};
			
	$.fn.markFoldersNew.defaults = {
		markNewDays: 7,		// day count :: 0 = no mark
		newLabel: 'NEW'
	};

	// goFullScreen :: makes an element full-screen or cancels full screen
	
	$.fn.fullScreen = function( v ) {
		
		var getFn = function( e, m ) {
			if ( m === 'FullScreen' && vend === 'webkit' )
				m = vend + 'Is' + m;
			else
				m = vend && (vend + m) || (m.substr(0,1).toLowerCase() + m.substr(1));
			
			if ( typeof e[m] === 'function' ) {
				return e[m]();
			}
			return e[m];
		};
		
		// no state supplied :: returning the first element's fullscreen status
		if ( typeof v === UNDEF ) {
			return getFn(this[0], 'FullScreen');
		}
		
		return this.each(function() {
			s = getFn(this, 'FullScreen');
			if ( v ) {
				if ( !s ) getFn(this, 'RequestFullScreen');
			} else if ( s ) {
				getFn(this, 'CancelFullScreen');
			}
		});		
	};
	
	// turtleHelp :: sets up help for button and keyboard's F1 key
	
	$.fn.turtleHelp = function( settings, text ) {
		
		settings = $.extend( {}, $.fn.turtleHelp.defaults, settings );
		text = $.extend( {}, $.fn.turtleHelp.texts, text );
		
		var helpWindow = $(settings.templ.template(text.help));
		
		var showHelp = function() {
			$('body').addModal(helpWindow, {
				uid: 'help',
				title: settings.title.template(text.help),
				width: 720
			});
		};
		
		if ( settings.useF1 && !$.support.touch ) {
			$(document).on('keydown', function(e) {
				if ( document.activeElement && document.activeElement.nodeName === 'INPUT' || 
					( $.isFunction(settings.enableKeyboard) && !settings.enableKeyboard()) || 
				$('#help:visible').length ) 
					return true;
				var k = e? e.keyCode : window.event.keyCode;
				if ( k === 112 ) {
					showHelp();
					return false;
				}
				e.returnValue = true;
				return true;
			});
		}
		
		return this.each(function() {
			$(this).on('click', function() {
				showHelp();
				return false;
			});			
		});	
	};
	
	$.fn.turtleHelp.defaults = {
		useF1: true
	};
	
	$.fn.turtleHelp.texts = {
		help: [
			'Using Turtle gallery',
			'Top <b>navigation</b> bar with <b>Home</b> button',
			'<b>Up</b> one level <em>Up arrow</em>',
			'Author or company <b>information</b>',
			'<b>Share</b> and <b>Like</b> buttons for social networking',
			'<b>Search</b> button',
			'Start slideshow <em>Numpad *</em>',
			'Previous image <em>Left arrow</em>', 
			'Back to index page <em>Esc</em>', 
			'Toggle zoom (fit/1:1) <em>Numpad +</em>',
			'Toggle info window <em>Numpad -</em>',
			'Toggle thumbnail scoller',
			'Start / Stop slideshow <em>Numpad *</em>', 
			'Next image <em>Right arrow</em>',
			'Swipe for previous / next image'
		]
	};
	
	
	/* *******************************************************
	*
	*	             Turtle gallery main
	*
	******************************************************** */
	
	$.fn.turtleGallery = function( settings, text, id ) {
		
		settings = $.extend( {}, $.fn.turtleGallery.defaults, settings );
		text = $.extend( {}, $.fn.turtleGallery.texts, text );
		id = $.extend( {}, $.fn.turtleGallery.ids, id );
		setTimeout(function() {
			if ( !settings.licensee && (typeof _jaShowAds == UNDEF || _jaShowAds) && 
				location.protocol.startsWith('http') && !cookie('ls') ) {
				var logo = settings.resPath + '/logo.png';
				var img = $(new Image());
				img.load(function() {
					var p = $('<div>').css({ 
						background: 'url(' + logo + ') 10px top no-repeat', 
						textAlign: 'left', 
						minHeight: '60px', 
						paddingLeft: '90px' 
					}).html('<h3>Turtle skin</h3><p>Unlicensed</p>');
					$('body').addModal(p, {
						width: 220,
						autoFade: 500
					});
					cookie('ls', true);
				}).attr('src', logo);
			}
		}, 1000); 
		
		// Settings to retain between sessions
		var sn = [ 'thumbsOn', 'infoOn', 'metaOn', 'mapOn', 'regionsOn', 'shopOn', 'shareOn', 'printOn', 'fitImage' ];
		
		// Saving one key into the settings object and as cookie
		var saveSetting = function( n, s ) {
			if ( !location.protocol.startsWith('file') ) {
				cookie(n, s);
			}
			settings[n] = s;
		};
		
		// Loading one key
		var loadSetting = function( n ) {
			var c = cookie(n);
			return (c)? (c === 'true') : settings[n];
		};
		
		// Loading all the settings to retain from cookies
		for ( var c, i = 0; i < sn.length; i++) { 
			if ( c = cookie(sn[i]) ) {
				settings[sn[i]] = c;
			}
		}
				
		if ( $.support.touch ) {
			settings.preScale = false;
		}
		
		// Setting up default view for the map
		$.fn.setupMap.defaults.zoom = settings.mapZoom;
		$.fn.setupMap.defaults.type = settings.mapType;
		$.fn.setupMap.defaults.markerPath = settings.markerPath;
		
		// Setting up addShop defaults
		$.fn.setupShop.defaults.gateway = settings.shopGateway;
		$.fn.setupShop.defaults.id = settings.shopId;
		$.fn.setupShop.defaults.path = (settings.albumName || '') + ': ' + settings.relPath;
		$.fn.setupShop.defaults.currency = settings.shopCurrency || 'EUR';
		$.fn.setupShop.defaults.handling = settings.shopHandling || null;
		$.fn.setupShop.defaults.locale = settings.shopLocale || 'US';
		$.fn.setupShop.defaults.quantityCap = settings.shopQuantityCap || 0;
		
		// Setting up addPlayer defaults
		$.fn.addPlayer.defaults.bgcolor = $('body').css('background-color').rgb2hex(),
		$.fn.addPlayer.defaults.fit = settings.videoFit,
		$.fn.addPlayer.defaults.auto = settings.videoAuto,
		
		// Setting up image fitting and centering options
		$.fn.centerThis.defaults.fit = settings.fitImage;
		$.fn.centerThis.defaults.animate = settings.transitions;
		$.fn.centerThis.defaults.padding = settings.fitPadding;
		$.fn.centerThis.defaults.enlarge = !settings.fitShrinkonly;
		$.fn.centerThis.defaults.selector = '.' + id.main;
		
		// Setting up share options
		for ( var i in settings.shares ) {
			$.fn.shareIt.defaults[i] = settings.shares[i];
		}
		$.fn.shareIt.defaults.callTxt = text.checkOutThis;
		settings.shareSlides = settings.shares && (settings.shares['pinItBtn'] || settings.shares['twitter'] || settings.shares['gplus'] || 
			settings.shares['digg'] || settings.shares['delicious'] || settings.shares['myspace'] || settings.shares['stumbleupon'] || 
			settings.shares['reddit'] || settings.shares['email']);
		
		var getLabel = function( el ) {
			var l = el.data(id.caption);
			if ( l ) {
				return l.stripHTML();
			} else {
				el = el.closest('a');
				return el? el.attr('href').replace(new RegExp('^' + settings.slides + '\\/'), '') : '';
			}
		};
		
		var newLabel = '<span class="' + id.newItem + '">' + text.newItem + '</span>';
		var today = Math.round((new Date()).getTime() / 86400000);
		
		return this.each( function() {
			var images = $(this).find('li > a'); 					// all the images as passed to turtleGallery
			var gallery, wait, navigation, controls, bottom;		// Structural elements
			var ctrl = {};											// Controls
			var scrollbox, thumbs;									// Thumbnail scroller box
			var smo, cmo, cto;										// Scroll and Control layer over state and timeout
			var cimg = null, pimg = null; 							// Current and Previous image layer
			var curr = 0; 											// current image
			var to, rto; 											// timeout for slideshow and window resize
			var rlw = $(window).width(), rlh = $(window).height(); 	// last window sizes
			var markers = new Array();								// all GPS markers
			
			// Keyboard handler
			
			var keyhandler = function(e) {
				if ( (document.activeElement && (document.activeElement.nodeName === 'INPUT' || 
						document.activeElement.nodeName === 'TEXTAREA')) || 
					($.isFunction(settings.enableKeyboard) && !settings.enableKeyboard()) ) {
					return true;
				}
				
				var k = e? e.keyCode : window.event.keyCode;

				if ( gallery.is(':visible') ) {
					switch( k ) {
						case 27: 
							backToIndex(); 
							break; 
						case 37: 
							leftArrow(); 
							break;
						case 38: 
							upArrow(); 
							break;
						case 39: 
							rightArrow(); 
							break;
						case 40: 
							downArrow(); 
							break;
						case 97: case 35: 
							showImg(images.length - 1); 
							break;
						case 103: case 36: 
							showImg(0); 
							break;
						case 106: case 179: 
							if (to) { 
								stopAuto(); 
							} else { 
								if ( settings.slideshowFullScreen )  {
									cmo = false;
									$('html').fullScreen(true);
								}
								startAuto(); 
							} 
							break;
						case 107: 
							zoomToggle(); 
							break;
						case 109: 
							togglePanels(); 
							break;
						default:
							e.returnValue = true;
							return true;
					}
				} else {
					switch( k ) {
						case 13: case 10: 
							showImg(); 
							break;
						case 27: 
							goUp(); 
							break;
						case 37: 
							curr = (curr? curr : images.length) - 1; 
							setActive(); 
							break;
						case 38: 
							if (curr && settings.cols) 
								curr = Math.max(0, curr - settings.cols); 
							setActive(); 
							break;
						case 39: 
							curr = (curr + 1) % images.length; 
							setActive();
							break;
						case 40: 
							if (curr < images.length - 1 && settings.cols) 
								curr = Math.min(images.length - 1, curr + settings.cols); 
							setActive(); 
							break;
						case 97: case 35: 
							curr = images.length - 1; 
							setActive(); 
							break;
						case 103: case 36: 
							curr = 0; 
							setActive(); 
							break;
						case 106: case 179: 
							if ( settings.slideshowFullScreen ) {
								cmo = false;
								$('html').fullScreen(true);
							}
							showImg(); 
							startAuto(); 
							break;
						default:
							e.returnValue = true;
							return true;
					}
				}
			};
			
			// Going up one level
			
			var goUp = function() {
				var t = (settings.level > 0)? window : parent;
				t.location.href = settings.uplink || '../';
			};
			
			// Hiding gallery
			
			var backToIndex = function() {
				var i = $('[role=main]');
				if ( gallery.is(':visible') ) {
					stopAuto();
					if ( settings.slideshowFullScreen ) {
						$('html').fullScreen(false);
					}
					if ( settings.skipIndex ) {
						goUp();
					} else {
						if ( i.length && i.is(':hidden') ) {
							i.children().andSelf().css( { 
								visibility: 'visible', 
								display: 'block' 
							} );
							i.find('.folders>ul>li').equalHeight();
							if ( i.find('.thumbs>ul>li p').length ) {
								i.find('.thumbs>ul>li').equalHeight();
							}
							i.find('[role=scroll]').trigger('adjust');
						}
						
						if ( settings.transitions ) {
							gallery.fadeOut(settings.speed);
						} else {
							gallery.hide();
						}
						
						if ( settings.hash !== 'no' ) {
							$.history.load('');
						}
					}
				} else if ( i.length && i.is(':hidden') ) {
					i.children().andSelf().css({ 
						visibility: 'visible', 
						display: 'block' 
					});
				}
				i.find('[role=scroll]').data('dragOn', false);
			};
						
			// Getting an image number based on its name or a jQuery element
			
			var getImg = function( n ) {
				var i;
				if ( n == null ) {
					i = curr;
				} else if ( typeof n === 'number' ) {
					i = Math.minMax(0, n, images.length);
				} else if ( (i = images.index(n)) < 0 ) {
					i = thumbs.index(n);
				}
				return i;
			};
			
			// Find image by number
			
			var findImg = function( n ) {
				var i, s;
				for ( i = 0; i < images.length; i++ ) {
					s = images.eq( i ).children('img:first').data(id.src);
					if ( s && s.substring(s.lastIndexOf('/') + 1) === n ) {
						return( i );
					}
				}
				return -1;
			};
			
			// Get the current filename
			
			var getCurrFile = function() {
				var p = images.eq(curr).children('img:first').data(id.src);
				return p && p.substr(p.lastIndexOf('/') + 1);
			};
			
			// Setting active image on both the thumb scroller and the source 
			
			var setActive = function( nofocus ) {
				images.filter('.' + id.active).removeClass(id.active);
				images.eq(curr).addClass(id.active);
				if ( !settings.skipIndex && (typeof nofocus === UNDEF || nofocus === false) )
					images.eq(curr).trigger('setactive');
				thumbs.eq(curr).trigger('setactive');
			};
						
			// Right arrow pressed
			
			var rightArrow = function() {
				var el = $('.' + id.main), w = $('.' + id.img);
				if ( !el.length ) {
					return;
				}
				if ( el.position().left + el.outerWidth() <= w.width() - settings.fitPadding ) {
					nextImg();
				} else {
					var d = Math.round(w.width() * 0.8);
					el.animate({
						left: Math.max( (el.position().left - d), w.width() - settings.fitPadding - el.outerWidth() )
					}, settings.scrollDuration );
				}
			};
			
			// Left arrow pressed
			
			var leftArrow = function() {
				var el = $('.' + id.main), w = $('.' + id.img);
				if ( !el.length ) {
					return;
				}
				if ( el.position().left >= settings.fitPadding ) {
					previousImg();
				} else {
					var d = Math.round(w.width() * 0.8);
					el.animate({
						left: Math.min( (el.position().left + d), settings.fitPadding )
					}, settings.scrollDuration ); 
				}
			};
						
			// Up arrow pressed
			
			var upArrow = function() {
				var el = $('.' + id.main), w = $('.' + id.img);
				if ( !el.length || el.position().top > settings.fitPadding ) {
					return;
				}
				var d = Math.round(w.width() * 0.8);
				el.animate({
					top: Math.min( (el.position().top + d), settings.fitPadding )
				}, settings.scrollDuration ); 
			};
			
			// Down arrow pressed
			
			var downArrow = function() {
				var el = $('.' + id.main), w = $('.' + id.img);
				if ( !el.length || el.position().top + el.outerHeight() <= w.height() - settings.fitPadding ) {
					return;
				}
				var d = Math.round(w.width() * 0.8);
				el.animate({
					top: Math.max( (el.position().top - d), w.height() - settings.fitPadding - el.outerHeight() )
				}, settings.scrollDuration );
			};
			
			// Previous image
			
			var previousImg = function() {
				stopAuto();
				if ( curr ) {
					showImg(curr - 1);
				}
				else if ( settings.afterLast === 'startover' ) {
					showImg(images.length - 1);
				}
				else {
					cimg.find('.' + id.main).trigger('dragcancel');
				}
			};
			
			// Next image
			
			var nextImg = function() {
				if ( curr < images.length - 1 ) {
					reLoop();
					showImg(curr + 1);
					return;
				} else {
					if ( settings.afterLast === 'startover' || to && settings.slideshowLoop ) {
						reLoop();
						showImg(0);
						return;
					} else if ( settings.afterLast === 'onelevelup' ) {
						if ( settings.uplink ) {
							goUp();
							return;
						}
					} else if ( settings.afterLast === 'backtoindex' ) {
						if ( !settings.skipIndex ) {
							backToIndex();
							return;
						}
					} else if ( settings.afterLast === 'ask' ) {
						stopAuto();
						var buttons = new Array({ 	// Start over 
								t: text.startOver,
								h: function() { 
									showImg(0); 
								}
							}
						);
						if ( settings.uplink ) {
							buttons.push({	// Up one level
								t: (settings.level > 0)? text.upOneLevel : (text.homepageLinkText || text.backToHome), 
								h: function() { 
									goUp(); 
								}
							});
						}
						if ( !settings.skipIndex ) {
							buttons.push( {	// Back to thumbnails
								t: text.backToIndex, 
								h: function() { 
									backToIndex(); 
								}
							});
						}
						
						$('body').addModal($('<p>', { 
							text: text.atLastPageQuestion
						}), buttons, {
							uid: 'dialog',
							title: text.atLastPage,
							width: 480,
							resizable: false
						});
						
					}
					cimg.find('.' + id.main).trigger('dragcancel');
				}
			};

			// Restarts counting down for the next image in slideshow mode
			
			var reLoop = function() {
				if ( to ) {
					clearInterval(to);
					to = setInterval(nextImg, settings.slideshowDelay);
				}
			};
			
			// Starts slideshow mode
			
			var startAuto = function() {
				ctrl.play.hide();
				ctrl.pause.showin();
				to = setInterval(nextImg, settings.slideshowDelay);
				fadeCtrl();
			};
			
			// Stops slideshow mode
			
			var stopAuto = function() {
				ctrl.pause.hide();
				ctrl.play.showin();
				to = clearInterval(to);
				fadeCtrl();
			};
			
			// Showing controls
			
			var showCtrl = function() { 
				if ( cmo ) {
					return;
				}
				
				controls.stop(true,false).fadeTo(200, 1, function() {
					if ( $.support.cssFilter ) {
						controls.css('filter', null);
					}
				});
				cto = setTimeout(function() { 
					fadeCtrl();
				}, 1500);
			};
			
			// Fading controls
			
			var fadeCtrl = function() {
				if ( cmo ) { 
					cto = setTimeout(function() { 
						fadeCtrl();
					}, 750);
				} else {
					cto = clearTimeout(cto);
					controls.fadeTo(500, settings.controlOutOpacity);
				}
			};
			
			// Toggle controls
			
			var toggleCtrl = function() {
				if ( parseFloat(controls.css('opacity')) > settings.controlOutOpacity ) {
					cto = clearTimeout(cto);
					controls.fadeTo(500, settings.controlOutOpacity);
				} else {
					showCtrl();
				}					
			};
			
			// Hiding bottom panel (info)
			
			var hideCaption = function() {
				
				if ( !settings.infoOn ) {
					return;
				}
				
				ctrl.hideInfo.hide();
				ctrl.showInfo.showin();
				
				if ( settings.transitions ) {
					bottom.animate({bottom: -bottom.outerHeight()}, 500, function() { 
						bottom.hide(); 
					});
				} else {
					bottom.css({bottom: -bottom.outerHeight()}).hide();
				}

				fadeCtrl();
				saveSetting('infoOn', false);
			};
			
			// Showing bottom panel
			
			var showCaption = function() {

				if ( settings.infoOn ) {
					return;
				}
				
				ctrl.showInfo.hide();
				ctrl.hideInfo.showin();
				
				if ( bottom.is(':hidden') ) {
					bottom.show().css({ bottom: -bottom.outerHeight() });
				}
				
				var ma = function() {
					bottom.children('.' + id.map).trigger('adjust');
				};
				if ( settings.transitions ) {
					bottom.animate({bottom: 0}, 500, ma);
				} else {
					bottom.show().css({bottom: 0});
					ma();
				}
				
				fadeCtrl();
				saveSetting('infoOn', true);
			};
			
			// Hiding scroll box
			
			var hideScrollbox = function() {
				
				if ( !settings.thumbsOn ) {
					return;
				}
				
				ctrl.hideThumbs.hide();
				ctrl.showThumbs.showin();
				
				if ( settings.transitions ) {
					navigation.animate({top: -scrollbox.outerHeight() - 10}, 500);
				} else {
					navigation.css({top: -scrollbox.outerHeight() - 10});
				}
				
				if ( cimg && settings.fitFreespace ) { 
					cimg.centerThis( {
						fit: settings.fitImage,
						marginTop: 0
					});
				}
				
				fadeCtrl();
				saveSetting('thumbsOn', false);
			};
			
			// Showing scroll box
			
			var showScrollbox = function() {
				
				if ( settings.thumbsOn ) {
					return;
				}
				
				ctrl.showThumbs.hide();
				ctrl.hideThumbs.showin();
				
				if ( settings.transitions ) {
					navigation.animate({top: 0}, 500);
				} else {
					navigation.css({top: 0});
				}
				
				if (cimg && settings.fitFreespace) { 
					cimg.centerThis( { 
						fit: settings.fitImage,
						marginTop: scrollbox.outerHeight()
					});
				}
				
				fadeCtrl();
				saveSetting('thumbsOn', true);
			};
			
			// Toggling panels
			
			var togglePanels = function() {
				if ( settings.infoOn || settings.thumbsOn ) {
					hideCaption();
					hideScrollbox();
				} else {
					showCaption();
					showScrollbox();
				}
			};
			
			// Scroll box height to calculate the free space for fitting the main image
			
			var scrollboxHeight = function() {
				return (settings.fitFreespace && navigation.position().top >= 0)? (scrollbox.outerHeight() || 0) : 0;
			};
			
			// Realigning the main picture to fit and center the free space
			
			var recenter = function() {
				if (cimg) { 
					cimg.centerThis( { 
						fit: settings.fitImage,
						marginTop: scrollboxHeight()
					});
				}
			};
			
			// Handling zoom
			
			var zoomToggle = function() {
				if ( settings.fitImage ) {
					zoomReset();
				} else {
					zoomFit();
				}
			};
			
			var zoomReset = function() {
				ctrl.noresize.hide();
				ctrl.resize.showin();
				cimg.centerThis( {
					fit: false, 
					marginTop: scrollboxHeight()
				});
				
				fadeCtrl();
				saveSetting('fitImage', false);
			};
			
			var zoomFit = function() {
				ctrl.resize.hide();
				ctrl.noresize.showin();
				cimg.centerThis( { 
					fit: true, 
					marginTop: scrollboxHeight()
				});

				fadeCtrl();
				saveSetting('fitImage', true);
			};
			
			// Preloading the next picture
			
			var preload = function( n ) {
				if ( n < 0 || n >= images.length) {
					return;
				}
				var i = images.eq(n).children('img').eq(0);
				if ( !i.data(id.isvideo) && !i.data(id.isother) && !i.data('cached') && (s = i.data(id.src)) ) {
					$('<img>').on('load', function() {
						i.data('cached', true);
					}).attr({
						src: s
					});
				}
			};
			
			var cleanupImg = function( el ) {
				el.trigger('destroy');
				el.find('.' + id.share + '-' + id.icon).trigger('destroy');
				el.find('.' + id.map).trigger('destroy');
			};
			
			var showImg = function( n ) {	
				
				if ( gallery.is(':hidden') ) {
					if ( settings.transitions ) {
						gallery.fadeIn(settings.speed);
					} else {
						gallery.show();
					}
				}

				n = ( typeof n !== UNDEF && n != null )? getImg( n ) : curr;
								
				if ( cimg && cimg.data('curr') === n ) {
					return;
				}
				
				var e, im = images.eq( n ), src, img;
				im = im.children('img').eq(0);
				
				if ( !im.length ) {
					return;
				}
				
				if ( cimg ) {
					if ( pimg && pimg.length ) {
						pimg.stop();
						cleanupImg(pimg);
						pimg.remove();
					}
					pimg = cimg;
					pimg.css( {zIndex: 0} );
					pimg.find('.' + id.main).trigger('unswipe').off('touchstart');
					pimg.unmousewheel();
				}
				
				if ( (e = gallery.children('.' + id.img).not(cimg)).length ) {
					e.stop().remove();
				}
				
				var w, h;
				
				cimg = $('<div>', { 
					'class': id.img 
				}).css({
					zIndex: 1, 
					display: 'none'
				}).data({
					curr: n
				}).on('click', function(e) {
					if ( $(e.target).hasClass('img') ) {
						backToIndex();
						return false;
					}
				}).appendTo(gallery);

				wait.css({
					opacity: 0, 
					display: 'block'
				}).animate({
					opacity: 1
				});

				curr = n; 
				setActive();
				
				var wr = $('<div>', { 
					'class': id.main 
				});
				
				if ( im.data(id.isother) || !(src = im.data(id.src)) ) {
					
					w = Math.max(im.data(id.width) || gallery.width() - 160, 280);
					h = Math.max(im.data(id.height) || gallery.height() - 120, 200);
					
					img = im.clone();
					wr.addClass(id.other);
					var cont = im.data(id.content);
					if ( cont && (cont = cont.trim()).length ) {
						wr.css({
							width: w,
							height: h
						}).append(
							cont.startsWith('http://')?
							$('<iframe>', { 
								width: '100%',
								height: '100%',
								src: cont,
								frameborder: 0,
								allowfullscreen: 'allowfullscreen'
							}) : cont 
						);
					} else {
						wr.append( $('<a>', { 
							href: im.data(id.link), 
							target: '_blank' 
						}) );
						wr.append( $('<p>', { 
							text: text.clickToOpen 
						}) );
						wr.children('a:first').append(img);
					}
					imgReady( wr );
					
				} else if ( im.data(id.isvideo) || im.data(id.isaudio) ) {
					
					w = im.data(id.width) || gallery.width() - 160;
					h = im.data(id.height) || gallery.height() - 120;
					
					var sus = to;
					
					if ( sus ) {
						stopAuto();
					}
						
					if ( im.data(id.isvideo) ) {
						var gw = gallery.width() - 40, gh = gallery.height() - 40;
						h += getPlayerControlHeight(im.data(id.link));
						if ( w > gw || h > gh ) {
							var r = Math.min(gw / w, gh / h);
							w = Math.round(w * r);
							h = Math.round(h * r);
						}
					} else {
						w = Math.max(280, im.attr('width') || 0);
						h = Math.max(280, im.attr('height') || 0);
					}
					
					var nm = 'media' + curr;
					wr.addClass(id.other).css({
						width: w,
						height: h
					}).data({
						ow: w, 
						oh: h 
					});
					
					var onComplete = function() {
						if ( sus ) {
							nextImg();
							startAuto();
						}
					};
					
					el = wr.addPlayer({
						complete: onComplete,
						file: im.data(id.link),
						resPath: settings.resPath,
						poster: im.data(id.poster) || im.attr('src'),
						auto: settings.videoAuto,
						fit: settings.videoFit,
						width: w,
						height: h
					});
					
					wr.data( 'media', el );
					imgReady( wr );
					
				} else {
					
					w = im.data(id.width);
					h = im.data(id.height);
					
					img = $(new Image());
					wr.addClass(id.image).append(img).css({
						width: w,
						height: h
					}).data({
						ow: w, 
						oh: h 
					});
					img.on('load', function() { 
						im.data('cached', true);
						imgReady( wr );
					}).attr({
						src: src, 
						width: w || 'auto', 
						height: h || 'auto' 
					});
				}
				
				createInfo(im, n);
			};
			
			// Creating regions
			
			var createRegions = function( curr ) {
				var ra = cimg.find('nav a.' + id.regions + '-icon').eq(0);
				if ( ra.length ) {
					var im = images.eq(curr).find('img:first');
					ra.addRegions( cimg.find('.' + id.main).eq(0), im.data(id.regions) );
				}
			};
			
			// Image is ready, attaching event listeners, and placing it
			
			var imgReady = function( o ) {
				
				if ( settings.transitions ) {
					wait.stop(true, false).animate({
						opacity: 0
					}, {
						duration: 100,
						complete: function() { 
							$(this).hide(); 
						}
					});
					
					// Stopping previous image
					
					if ( pimg ) {
						var p = pimg;
						pimg.stop(true, false).animate({ 
							opacity: 0	
						}, {
							duration: settings.speed / 2, 
							complete: function() { 
								cleanupImg(p);
								p.remove();
							}
						});
						pimg = null;
					}
				} else {
					wait.hide();
					if ( pimg ) {
						pimg.stop();
						cleanupImg(pimg);
						pimg.remove();
					}
				}
				
				var isimg = o.hasClass(id.image);
				
				cimg.children().not('.' + id.bottom).remove();
				cimg.append(o);
				
				// Prevent right click
				
				if ( settings.rightClickProtect ) {
					o.on('contextmenu', function(e) {
						e.preventDefault();
						return false;
					});
				}
				
				// Mouse wheel -> prev / next image
				
				if ( settings.enableMouseWheel ) {
					cimg.on('mousewheel', function(e, d) {
						if (d > 0) { 
							previousImg(); 
						}
						else { 
							nextImg(); 
						}
						return false;
					});
				}
				
				// Actions attached to images, delayed by half transition speed
				
				setTimeout(function() {
						
					if ( $.support.touch ) {
						
						// Touch image -> control box toggle
						o.on('touchstart', toggleCtrl);
						
					} else if (images.length > 1) {
						
						// Click -> next image
						if ( isimg ) {
							o.on('click', function() { 
								nextImg();
								return false;
							});
						}
					}
					
					// Swipe -> prev / next image
					if ( images.length > 1 ) {
						o.addSwipe(function() {
							$(this).trigger('unswipe');
							nextImg();
						}, function() {
							$(this).trigger('unswipe');
							previousImg();
						});
					}
					
				}, settings.speed / 2);
				
				if ( settings.transitions ) {
					cimg.css({ 
						opacity: 0, 
						display: 'block' 
					}).animate({ 
						opacity: 1
					}, {
						duration: settings.speed,
						complete: $.browser.cssFilter? function() { 
							cimg.css({ filter: '' });
						} : null
					}).centerThis({
						init: true,
						speed: Math.round(settings.speed * 0.75),
						marginTop: scrollboxHeight(),
						preScale: isimg && settings.preScale,
						animate: isimg && settings.preScale && settings.preScale != 1.0,
						fit: settings.fitImage
					});
				} else {
					cimg.show().centerThis({
						init: true,
						marginTop: scrollboxHeight(),
						fit: settings.fitImage
					});
				}
				
				//cimg.trackCss([ 'opacity', 'display', 'visibility' ], settings.speed + 300);
				
				createRegions( curr );
				
				preload( curr + 1 );
				preload( curr - 1 );
				
				if ( settings.hash === 'number' ) {
					$.history.load(curr + 1);
				} else if ( settings.hash === 'fileName' ) {
					var h = getCurrFile();
					if ( h ) {
						$.history.load( h );
					}
				}
			};
			
			// Creating bottom info panel
			
			var createInfo = function(im, n) {
				
				bottom = $('<div>', { 
					'class': id.bottom 
				});
				
				// Appending to current image layer
				
				cimg.append( bottom );
				
				var c = $('<div>', { 
						'class': id.cont 
					}).appendTo(bottom),
					m = $('<nav>').appendTo(c),
					d, h, tw = Math.round(cimg.width() * 0.8) - 30;
				
				if ( c.width() > tw ) {
					c.width( tw );
				}
				
				if ( settings.showImageNumbers ) {
					c.append('<div class="nr"><strong>' + (n + 1) + '</strong> / ' + images.length + '</div>');
				}
				
				// Adding caption
				
				if ( d = im.data(id.caption) ) {
					c.append(d);
				}
				
				// Creating panels
				
				var a, e, t, panel = [ id.meta, id.map, id.shop, id.share, id.print, id.comment ];

				for ( var i = 0; i < panel.length; i++ ) {
					t = panel[i];
					
					if ( im.data(t) != null ) {
						e = $('<div>', { 
							'class': id.panel + ' ' + id[t] 
						}).data('rel', t).appendTo(c);
						
						e.append( $('<div>', { 
							'class': id.icon 
						}) );
						
						a = $('<a>', { 
							href: NOLINK, 
							'class': t + '-' + id.icon, text: ' ' 
						}).appendTo(m);
						
						a.data('rel', t).addHint( text[t + 'Btn'] || t );
						
						a.on('click', function() {
							var t = $(this).data('rel'),
								e = c.children('.' + t),
								o = e.is(':hidden');
							
							$(this).toggleClass( id.active, o );
							
							if ( t === id.map ) {
								var ma = function() {
									if ( o ) {
										e.children('.' + id.mapcont).trigger('adjust'); 
									}
								};
								if ( settings.transitions ) {
									e.slideToggle('fast', ma);
								} else {
									e.toggle();
									setTimeout(ma, 50);
								}
							} else {
								if ( settings.transitions ) {
									e.slideToggle('fast');
								} else {
									e.toggle();
								}
							}
							
							saveSetting(t + 'On', o);
						});
					}
				}
				
				if ( !(im.data(id.isvideo) || im.data(id.isaudio) || im.data(id.isother)) ) {
					
					// Adding 'fotomoto' button
					
					if ( settings.fotomotoOn ) {
						var fa = $('<a>', { 
							href: NOLINK, 
							'class': id.fotomoto + '-' + id.icon, 
							text: ' '
						}).appendTo(m);
						
						fa.addHint(location.protocol.startsWith('file:')? text.locationWarning : text.fotomotoHint);
						setTimeout(function() {
							if ( typeof FOTOMOTO !== UNDEF && !location.protocol.startsWith('file:') ) {
								fa.on('click', function() {
									FOTOMOTO.API.showWindow( 10, im.attr('src').replace(settings.thumbs + '/', settings.slides + '/') );
									return false;
								});
							}
						}, settings.speed);
					}
					
					// Adding 'regions' button
					
					if ( im.data(id.regions) ) {
						var ra =  $('<a>', { 
							href: NOLINK, 
							'class': id.regions + '-' + id.icon, 
							text: ' ' 
						}).appendTo(m);
						
						if ( settings[id.regions + 'On'] ) {
							ra.addClass( id.active );
						}
						
						ra.on('click', function() { 
							saveSetting(id.regions + 'On', !$(this).hasClass( id.active ));
						});
					}
				}
				
				// Adding 'original' button
				
				if ( !settings.rightClickProtect && (d = im.data(id.link)) ) {
					a = $('<a>', { 
						href: d, 
						'class': id.link + '-' + id.icon, 
						target: '_blank', 
						text: ' ' 
					}).appendTo(m);
					
					a.addHint( '<strong>' + (im.data(id.isoriginal)? text.original : text.hiRes) + '</strong><br><small>' + text.saveTip + '</small>' );
				}
				
				// Adding 'share' button
				
				if ( settings.shareSlides ) {
					var sha =  $('<a>', { 
						href: NOLINK, 
						'class': id.share + '-' + id.icon, 
						text: ' ' 
					}).appendTo(m);
					
					h = ( settings.hash === 'number' )? (curr + 1) : getCurrFile();
					
					setTimeout( function() {
						sha.shareIt( { 
							hash: h,
							title: (im.data(id.caption) || '').stripHTML(),
							image: im.data(id.src)
						} );
					}, settings.speed );
				}
				
				// Appending to current image layer
				
				cimg.append( bottom );
				
				// Adding content
				
				c.children( '.' + id.panel ).each(function() {
					
					e = $(this);
					t = e.data('rel');
					
					if ( t && (d = im.data(t)) != null ) {
						if ( t === id.map ) {
							var mc = $('<div>', { 
								'class': id.mapcont 
							}).appendTo(e);
							
							mc.width(c.width() - 30);
							
							if ( settings.mapAll ) {
								mc.setupMap({
									click: function() { showImg( this.link ); },
									markers: markers,
									curr: parseInt(im.data(id.mapid))
								});
							} else {
								mc.setupMap({
									map: d,
									label: getLabel(im)
								});
							}
							
							setTimeout(function() {
								mc.trigger('adjust');
							}, settings.speed );

						} else if ( t === id.shop ) {
							e.addClass('clearfix').setupShop({
								file: im.data(id.src), //.replace('thumbs/', ''),
								options: d
							});
						} else {
							e.append(d);
						}
						
						// Setting up visibility
						
						if ( !settings[t + 'On'] ) {
							e.hide();
						} else {
							m.children('a.' + t + '-icon').addClass(id.active);
						}
					}
				});
								
				// No buttons added? > Remove menu
				
				if ( !m.html().length ) {
					m.remove();
				}
				
				// Hide the whole panel
				
				if ( !settings.infoOn ) {
					bottom.hide();
				}
				
			};
			
			// Setting up the header on the original page
			
			var setupHeader = function() {
				
				if ( settings.header == null ) {
					return;
				}
				
				var hd = $(settings.header);
				
				if ( !hd.length ) {
					return;
				}
				
				// Creating the start slideshow button
				
				if ( settings.showStart ) {
					
					var stb = $('<div>', {
							'class': id.startShow
						}).appendTo(hd),
					
						tx = $('<div>', {
							'class': id.startTxt,
							width: 'auto',
							text: text.startSlideshow 
						}).appendTo('body'),
						
						ow = stb.width(),
						
						mw = tx.outerWidth();
						
					stb.append(tx);
					
					// Showing text only on mouse over the button (only if not visible by default)
					
					if ( ow < mw ) {
						tx.on({
							mouseenter: function() {
								stb.stop(true, false).animate({
									width: mw
								},500);
							},
							mouseleave: function() {
								stb.stop(true, false).animate({
									width: ow
								}, 500);
							}
						});
					}
					
					// Starting slideshow
					
					stb.on({
						click: function() {
							if ( settings.slideshowFullScreen ) {
								$('html').fullScreen(true);
							}
							showImg();
							startAuto(); 
							return false;
						}
					});
				}
				
				// Storing the up link
				
				settings.uplink = hd.find('.' + id.parent + '>a').attr('href') || '';
				
			};
			
			// Creating the control strip
			
			var setupControls = function( t ) {
				
				var e = $('<nav>', { 
					'class': 'controls clearfix'
				}).appendTo(t);
				
				// Previous button
				
				ctrl.prev = $('<a>', { 
					'class': id.prev, 
					title: text.previousPicture 
				}).appendTo(e);
				
				ctrl.prev.on('click', function() { 
					stopAuto(); 
					previousImg(); 
					return false; 
				});
				
				// Up button
				
				ctrl.up = $('<a>', { 
					'class': id.up, 
					title: settings.skipIndex? text.upOneLevel : text.backToIndex 
				}).appendTo(e);
				
				ctrl.up.on('click', function() { 
					stopAuto();
					backToIndex(); 
					return false; 
				});
				
				// Fit / 1:1 button
				
				ctrl.noresize = $('<a>', { 
					'class': id.noresize, 
					title: text.oneToOneSize 
				}).appendTo(e);
				
				ctrl.noresize.on('click', function() { 
					zoomReset(); 
					return false; 
				});
				
				ctrl.resize = $('<a>', { 
					'class': id.resize, 
					title: text.fitToScreen 
				}).appendTo(e);
				
				ctrl.resize.on('click', function() { 
					zoomFit(); 
					return false; 
				});
				
				if ( settings.fitImage ) { 
					ctrl.resize.hide(); 
					ctrl.noresize.showin(); 
				} else { 
					ctrl.noresize.hide();
					ctrl.resize.showin(); 
				}
				
				// Info panel toggle button		
				
				ctrl.hideInfo = $('<a>', { 
					'class': id.hideInfo, 
					title: text.hideInfo 
				}).appendTo(e);
				
				ctrl.hideInfo.on('click', function() { 
					hideCaption(); 
					return false; 
				});
				
				ctrl.showInfo = $('<a>', { 
					'class': id.showInfo, 
					title: text.showInfo 
				}).appendTo(e);
				
				ctrl.showInfo.on('click', function() { 
					showCaption(); 
					return false; 
				});
				
				if ( settings.infoOn ) { 
					ctrl.showInfo.hide(); 
					ctrl.hideInfo.showin(); 
				} else { 
					ctrl.hideInfo.hide(); 
					ctrl.showInfo.showin(); 
				}
				
				// Thumbnail panel toggle button		
				
				ctrl.hideThumbs = $('<a>', { 
					'class': id.hideThumbs, 
					title: text.hideThumbs 
				}).appendTo(e);
				
				ctrl.hideThumbs.on('click', function() { 
					hideScrollbox(); 
					return false; 
				});
				
				ctrl.showThumbs = $('<a>', { 
					'class': id.showThumbs, 
					title: text.showThumbs 
				}).appendTo(e);
				
				ctrl.showThumbs.on('click', function() { 
					showScrollbox(); 
					return false; 
				});
				
				if ( settings.thumbsOn ) { 
					ctrl.showThumbs.hide(); 
					ctrl.hideThumbs.showin(); 
				} else { 
					ctrl.hideThumbs.hide(); 
					ctrl.showThumbs.showin(); 
				}
				
				// Play / pause button		

				ctrl.play = $('<a>', { 
					'class': id.play, 
					title: text.startAutoplay 
				}).appendTo(e);
				
				ctrl.play.on('click', function() {
					if ( settings.slideshowFullScreen ) {
						cmo = false;
						$('html').fullScreen( true );
					}
					startAuto(); 
					return false; 
				});
				
				ctrl.pause = $('<a>', { 
					'class': id.pause, 
					title: text.stopAutoplay 
				}).appendTo(e);
				
				ctrl.pause.on('click', function() { 
					stopAuto(); 
					return false; 
				});
				
				if ( settings.slideshowAuto ) { 
					ctrl.play.hide(); 
					ctrl.pause.showin(); 
				} else { 
					ctrl.pause.hide(); 
					ctrl.play.showin(); 
				}
				
				// Next image button		

				ctrl.next = $('<a>', { 
					'class': id.next, 
					title: text.nextPicture 
				}).appendTo(e);
				
				ctrl.next.on('click', function() { 
					reLoop(); 
					nextImg(); 
					return false; 
				});
				
				// Calculating width
				
				var w = 0;
				
				e.children().each(function() { 
					if ( $(this).css('display') !== 'none' ) {
						w += $(this).outerWidth();
					}
				});
				
				e.width(w);
				
				e.children('a').addHint();
				
				return e;
			};
			
			// Setting up thumbnails
			
			var setupThumbs = function( t ) {
				var t, h, a, i, im, l, lc, tl, w = 0, e, tc;
				
				e = $('<div>', { 
					'class': id.scrollbox 
				}).appendTo(t);
				
				tc = $('<div>', { 
					'class': 'wrap' 
				}).appendTo(e);
				
				tc = $('<ul>', { 
					'class': id.cont 
				}).appendTo(tc);
				
				images.each( function(n) {
					
					t = $(this);
					
					// right-click protection
					
					if ( settings.rightClickProtect ) {
						t.on('contextmenu', function(e) {
							e.preventDefault();
							return false;
						});
					}
					
					// current image
					
					im = t.find('img').eq(0);
					l = t.attr('href');
					if ( !l || !im.length ) {
						return;
					}
					
					// saving the closeup link
					
					if ( settings.linkOriginals ) {
						lc = im.data(id.closeup);
						lc = lc.length? lc : l.replace(settings.slides + '/', '');
					} else {
						lc = l;
					}
					im.data(id.src,	lc.replaceExt(im.data(id.ext) || 'jpg'));
					
					// thumbPath
					
					tl = settings.thumbs + '/' + 
						l.substring(l.lastIndexOf('/') + 1, l.lastIndexOf('.')) + '.' + 
						(im.data(id.thumbExt) || im.data(id.ext));
					
					// creating the thumbnail scroller pair
					
					a = $('<a>', { 
						href: NOLINK 
					}).appendTo( $('<li>').appendTo(tc) );
					
					i = $('<img>').appendTo(a);
					
					// Loadng the image, handling preload
					
					if ( im.attr('src').endsWith('/' + settings.loadImg) ) {
						im.add(i).attr('src', tl);
					}
					else {
						i.attr('src', im.attr('src'));
					}

					// Adding mouse over hint
					
					h = t.attr('title');
					if ( h && h.length ) {
						t.add(a).addHint( h );
					} else {
						h = t.next();
						if ( h.length ) {
							a.addHint( h.html() );
						}
					}
					
					if ( settings.markNewDays && (today - parseInt(im.data(id.modified) || 0)) <= settings.markNewDays ) {
						t.add(a).append( newLabel );
					}
					
					// Setting click handlers
					
					t.on('click', function(e) {
						if ( $(this).parents('[role=scroll]').data('dragOn') === true ) {
							return false;
						}
						if ( !$(this).hasClass(id.active) ) {
							if ( cimg && cimg.length ) {
								cimg.stop();
								cleanupImg(cimg);
								cimg.remove();
							}
						}
						showImg( images.eq(n) ); 
						return false; 
					});
					
					a.on('click', function(e) {
						if ( $(this).parents('[role=scroll]').data('dragOn') === true ) {
							return false;
						}
						if ( !$(this).hasClass(id.active) ) {
							showImg( images.eq(n) );
						}
						$(this).trigger('active');
						return false;
					});
					
					w += a.outerWidth(true);
				});
								
				tc.width(w).scrollThumbs({
					enableMouseWheel: settings.enableMouseWheel
				});
				
				return e;
			};

			if ( !images.length ) {
				return;
			}
			
			setupHeader();
			
			gallery = $('<div>', { 
				'class': id.gallery 
			}).attr('role', 'gallery').appendTo('body');
			
			wait = $('<div>', { 
				'class': id.wait 
			}).appendTo(gallery);
			
			navigation = $('<div>', { 
				'class': id.navigation 
			}).appendTo(gallery);
			
			scrollbox = setupThumbs(navigation);
			thumbs = scrollbox.find('.cont a');
			controls = setupControls(navigation);
			
			if ( !settings.thumbsOn ) {
				navigation.css('top', -scrollbox.outerHeight() - 10);
			}
			
			// Show / hide the control strip on mouse move
			
			scrollbox.on({
				mouseenter: function() { 
					fadeCtrl(); 
					smo = true; 
				},
				mouseleave: function() { 
					smo = false; 
				}
			});
			
			controls.on({
				mouseenter: function() { 
					cmo = true; 
					$(this).stop(true, false).fadeTo(200, 1.0);
				},
				mouseleave: function() { 
					cmo = false;
					$(this).stop(true, false).fadeTo(200, 0.8);
				}
			});
			
			var mly = 0, mlx = 0;
			if ( !$.support.touch ) {
				gallery.on('mousemove', function(e) {
					if (!smo && ((mly - e.clientY) || (mlx - e.clientX))) {
						showCtrl(); 
						mlx = e.clientX;
						mly = e.clientY; 
					}
				});
			}
			
			// Collect all coordinates for the map
			
			if ( settings.mapAll ) {
				var c, i, m, t;
				images.each(function(i) {
					c = $(this).find('img:first');
					if ( c.length && (m = c.data('map')) && (m = getLatLng(m)) ) {
						t = getLabel(c);
						markers.push({ 
							map: m, 
							label: (i + 1) + (t? (': ' + t.stripHTML()) : ''), 
							link: $(this) 
						});
					}
				});
			}
			
			// Installing keyboard listener
			
			if ( !$.support.touch && ($.isFunction(settings.enableKeyboard) || settings.enableKeyboard) ) {
				$(window).on('keydown', keyhandler);
			}
			
			// Jumping to the hash image
			
			if ( settings.hash && settings.hash !== 'no' ) {
				$.history.init(function(hash) {
					var n;
					if ( hash && hash.length && 
						(n = (settings.hash === 'number')? ((parseInt( hash ) || 1) - 1) : findImg( hash )) >= 0 && n < images.length) {
						showImg( n );
						settings.slideshowAuto = false;
					} else {
						backToIndex();
						if ( $.browser.msie ) { 
							setTimeout(function() {
								$('[role=main]').show();
								$('.folders>ul>li').equalHeight();
								$('[role=scroll]').trigger('adjust');
							}, 10 );
						}
					}
				});
			}
			
			setActive( true );
			
			// Starting slideshow
			
			if ( settings.slideshowAuto ) {
				if ( settings.slideshowFullScreen ) {
					$('html').fullScreen( true );
				}
				showImg( curr );
				startAuto();
			} else if ( settings.skipIndex ) {
				showImg( curr );
			}
						
			$(window).on('resize', function() {
				clearTimeout(rto);
				rto = setTimeout(function() {
					var rw = $(window).width(), rh = $(window).height();
					if (rw !== rlw || rh !== rlh) {
						recenter();
						rlw = rw;
						rlh = rh;
					}
				}, 100);
			});
		});
	};
	
	/* *******************************************************
	*
	*	             Turtle standalone slide page
	*
	******************************************************** */
	
	$.fn.turtleSlide = function( settings, text, id ) {
		
		settings = $.extend( {}, $.fn.turtleGallery.defaults, settings );
		text = $.extend( {}, $.fn.turtleGallery.texts, text );
		id = $.extend( {}, $.fn.turtleGallery.ids, id );
				
		var im = $(this), 
			img = im.find('.main img').eq(0); 
		
		var showImg = function() {
			im.centerThis({
				init: true,
				animate: true,
				fit: false, 
				enlarge: false
			}).fadeIn(500);
			im.on('click', function() {
				window.location.href = $('nav>a.up').attr('href');
			});
		};
		
		if (img.length && !img.width) {
			img.on('load', showImg);
		} else {
			showImg();
		}
		
		$('.controls .resize').on('click', function() {
			im.centerThis({
				init: false,
				animate: true,
				fit: true, 
				enlarge: true,
				padding: 15
			}).fadeIn(500);
			$(this).hide();
			$('.controls .noresize').showin();
		});
		
		$('.controls .noresize').on('click', function() {
			im.centerThis({
				init: false,
				animate: true,
				fit: false, 
				padding: 15
			}).fadeIn(500);
			$(this).hide();
			$('.controls .resize').showin();
		});

		$('.controls a').addHint();
		
		return this;
	};
	
	$.fn.turtleGallery.defaults = {
		hash: 'fileName',			// Hash type: 'no' || 'number' || 'fileName'
		resPath: '',				// relative path to '/res' folder
		relPath: '',				// relative path from '/res' back to current folder
		level: 0,					// gallery level (0 = top level)
		skipIndex: false,			// skip the index (thumbnail) page and goes straight to gallery
		showStart: true,			// Show "Start slideshow" button
		speed: 600,					// picture transition speed
		controlOutOpacity: 0,		// opacity of control bar when the mouse is not over
		transitions: true,			// Use transitions?
		preScale: 0.95,				// size of the image before the transitions starts
		slideshowDelay: 3000, 		// slideshow delay 3 s
		slideshowLoop: false, 		// automatically starts over
		slideshowAuto: false,		// automatically starts with the first image
		slideshowFullScreen: false, // go Full screen during slideshows?
		markNewDays: 30,			// : days passed by considered a picture is 'new'
		afterLast: 'ask',			// Deafult action after the last frame ( ask|backtoindex|onelevelup|startover )
		infoOn: true,				// Show the captions by default?
		showImageNumbers: true,		// Show the actual image number on the info panel?
		thumbsOn: false,			// Show the thumbnail scroller by default?
		fitImage: true,				// Fit the images to window size by default or use 1:1?
		fitShrinkonly: true,		// Fit only by shrinking (no enlarging)
		fitFreespace: true,			// Fit only the space below the thumbnail scroller
		fitPadding: 15,				// Distance from the window border
		borderWidth: 10,			// Image border width
		rightClickProtect: false,	// No right-click menu on main images
		metaOn: false,				// Show Metadatas by default?
		mapOn: false,				// : Map?
		shopOn: false,				// : Shopping panel?
		fotomotoOn: false,			// : Fotomoto panel?
		shareOn: false,				// : Sharing panel?
		printOn: false,				// : Printing panel?
		enableKeyboard: true,		// Enable keyboard controls?
		enableMouseWheel: true,		// Enable mouse wheel?
		numberLinks: false,			// Use #1 or #IMG_0001.JPG as internal links?
		videoAuto: true,			// Automatic play of videos
		videoFit: true,				// Stretch to player size
		videoWidth: 640,			// Video player dimensions
		videoHeight: 480,
		scrollDuration: 1000		// Image scroll duration when controlled from keyboard
	};
	
	$.fn.turtleGallery.texts = {
		startSlideshow: 'Start slideshow',
		close: 'Close',
		atLastPage: 'At last page', 
		atLastPageQuestion: 'Where to go next?', 
		startOver: 'Start over', 
		backToHome: 'Back to home',
		stop: 'Stop', 
		upOneLevel: 'Up one level',
		backToIndex: 'Back to index page',
		previousPicture: 'Previous picture',
		nextPicture: 'Next picture',
		oneToOneSize: '1:1 size',
		fitToScreen: 'Fit to screen',
		showInfo: 'Show caption / info',
		hideInfo: 'Hide caption / info',
		showThumbs: 'Show thumbnails',
		hideThumbs: 'Hide thumbnails',
		startAutoplay: 'Start autoplay',
		stopAutoplay: 'Stop autoplay',
		closeWindow: 'Close window',
		clickToOpen: 'Click to open this document with the associated viewer',
		download: 'Download', 
		original: 'Original', 
		hiRes: 'Hi res.',
		saveTip: 'Use Right click -> Save link as... to download',
		metaBtn: 'Photo data', 
		metaLabel: 'Display photograpic (Exif/Iptc) data', 
		mapBtn: 'Map',
		mapLabel: 'Show the photo location on map',
		shopBtn: 'Buy',
		shopLabel: 'Show options to buy this item',
		shareBtn: 'Share',
		shareLabel: 'Share this photo over social sites',
		locationWarning: 'Works only when uploaded'
	};
	
	$.fn.turtleGallery.ids = {		// Class names and data- id's
		gallery: 'gallery',			// The container for gallery
		navigation: 'navigation',	// Navigation at top
		scrollbox: 'scrollbox',		// Thumbnail scroller box
		active: 'active',			// active state
		parent: 'parent',			// up link
		bottom: 'bottom',			// bottom section
		img: 'img',					// one image
		main: 'main',				// the main image class
		image: 'image',				// image class
		video: 'video',				// video class
		audio: 'audio',				// audio class
		other: 'other',				// other file panel class 
		wait: 'wait',				// wait animation
		cont: 'cont',				// inside containers generated by the script
		panel: 'panel',				// general panel on the bottom
		icon: 'icon',				// icon container
		caption: 'caption',			// caption markup
		meta: 'meta',				// metadata container / also the name of data attr
		map: 'map',					// map container class
		mapcont: 'mapcont',			// map inside wrapper
		mapid: 'mapid',				// map marker unique id
		shop: 'shop',				// shop container class
		fotomoto: 'fotomoto',		// fotomoto class
		share: 'share',				// share container class
		print: 'print',				// print container class
		comment: 'comment',			// commenting container class 
		link: 'link',				// link to original / hi res.
		poster: 'poster',			// high res poster for audio and video
		isoriginal: 'isoriginal',	// link points to original or hi res.?
		content: 'content',			// content : iframe, html or link
		width: 'width',				// width attribute
		height: 'height',			// herght attribute
		src: 'src',					// source link
		ext: 'ext',					// file extension
		thumbExt: 'thumbext',		// thumbnail extension
		regions: 'regions',			// Area tagging
		isvideo: 'isvideo',			// is video attr
		isaudio: 'isaudio',			// is audio attr
		isother: 'isother',			// is other attr
		modified: 'modified',		// modified x days ago attr
		startShow: 'startshow',		// Start Slideshow button
		startBtn: 'startbtn',		// Button class
		startTxt: 'starttxt',		// Start text class
		prev: 'prev',				// control strip classes
		next: 'next',
		up: 'up',
		noresize: 'noresize',
		resize: 'resize',
		hideInfo: 'hideinfo',
		showInfo: 'showinfo',
		hideThumbs: 'hidethumbs',
		showThumbs: 'showthumbs',
		play: 'play',
		pause: 'pause',
		newItem: 'newlabel',
		showHint: 'showhint'
	};


})(jQuery);		
