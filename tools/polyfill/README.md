polyfill - JavaScript Polyfills, Shims and More
===============================================

* A *shim* lets you write the same code across all browsers by implementing a new API in downlevel browsers.
* A *polyfill* is a shim or collection of shims (and a catchy name).
* A *prollyfill* is a shim for a proposed API
* A *helper* helps write cross-browser code where a true API shim/polyfill is not possible.

Note that my general approach to polyfills is not to produce 100% compliant behavior, but to provide a broad subset of functionality so that, where possible, cooperative code can be written to take advantage of new APIs. No assumptions should be made about security or edge cases. It is preferrable to use a shim where it is possible to create one on supported browsers. If not possible, a helper should be used that lets the same code be used in all browsers.

I use these in various pages on my sites; most are by me, or I have at least tweaked them. A more comprehensive list can be found at [The All-In-One Entirely-Not-Alphabetical No-Bullshit Guide to HTML5 Fallbacks](https://github.com/Modernizr/Modernizr/wiki/HTML5-Cross-browser-Polyfills) by Paul Irish.


ECMAScript / JavaScript Polyfills
---------------------------------

[ECMAScript 5](es5.md) - Most recent standard, supported by all modern browsers. Frozen.

[ECMAScript 6](es6.md) - Based on nearly complete draft standard. Should be stable apart from bug fixes.

[ECMAScript 7](experimental/es7.md) - At the initial proposal/strawman stage. Here there be dragons.

[JavaScript 1.X String Extras](js.js) - [ref](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/String)
  * String prototype: `trimLeft`, `trimRight`, `quote`


Web Standards / Browser Compat
------------------------------
[script](web.js) -
[unit tests](http://inexorabletash.github.io/polyfill/tests/web.html)

Bundled together; nearly every page I create needs at least some of these. These will change over time,
and going forward I will only target IE8 and later. (Since IE7 and earlier did not support modifying
built-in object prototypes, helper functions used instead that can be used if IE7 compatibility is needed.)

* [HTML](https://html.spec.whatwg.org)
  * `document.head` (for IE8-)
  * 'shiv' of newer HTML elements (`section`, `aside`, etc), to fix parsing (for IE8-)
  * `dataset` and `data-*` attributes [spec](https://html.spec.whatwg.org/multipage/dom.html#embedding-custom-non-visible-data-with-the-data-*-attributes) (for IE8+, not available in IE7-)
    * `str = element.dataset[key]` - yields undefined if data-key attribute not present
    * `element.dataset[key] = str` - fails unless data-key attribute already present
  * [Base64 utility methods](https://html.spec.whatwg.org/multipage/webappapis.html#atob) (for IE9-)
    * `encodedString = window.btoa(binaryString)` - Base64 Encode
    * `binaryString = window.atob(encodedString)` - Base64 Decode
* [DOM](https://dom.spec.whatwg.org)
  * [Selectors](https://dom.spec.whatwg.org/#scope-match-a-selectors-string) (for IE7-) - adapted from [Paul Young](http://ajaxian.com/archives/creating-a-queryselector-for-ie-that-runs-at-native-speed)
    * `element = document.querySelector(selector)`
    * `elementArray = document.querySelectorAll(selector)`
  * `elementArray = document.getElementsByClassName(classNames)` (for IE8-)
  * Node constants: `Node.ELEMENT_NODE`, etc (for IE8-)
  * DOMException constants: `DOMException.INDEX_SIZE_ERR` (for IE8-)
  * [Events](https://dom.spec.whatwg.org/) (for IE8)
    * Where `EventTarget` is `window`, `document`, or any element:
      * `EventTarget.addEventListener(event, handler)` - for IE8+
      * `EventTarget.removeEventListener(event, handler)` - for IE8+
    * `Event.target`
    * `Event.currentTarget`
    * `Event.eventPhase`
    * `Event.bubbles`
    * `Event.cancelable`
    * `Event.timeStamp`
    * `Event.defaultPrevented`
    * `Event.stopPropagation()`
    * `Event.cancelBubble()`
  * Non-standard Event helpers for IE7- - adapted from 
[QuirksMode](http://www.quirksmode.org/blog/archives/2005/10/_and_the_winner_1.html)
    * `window.addEvent(EventTarget, event, handler)`
    * `window.removeEvent(EventTarget, event, handler)`
  * [DOMTokenList](https://dom.spec.whatwg.org/#interface-domtokenlist) - `classList`[spec](https://dom.spec.whatwg.org/#dom-element-classlist), `relList`[spec](https://html.spec.whatwg.org/multipage/semantics.html#the-link-element)
    * `tokenList = elem.classList` - for IE8+
    * `tokenList = elem.relList` - for IE8+
    * `tokenList.length`
    * `tokenList.item(index)`
    * `tokenList.contains(token)`
    * `tokenList.add(token)`
    * `tokenList.remove(token)`
    * `tokenList.toggle(token)`
    * Non-standard helpers for IE7-:
      * `tokenList = window.getClassList(element)`
      * `tokenList = window.getRelList(element)`
* [`XMLHttpRequest`](https://xhr.spec.whatwg.org/)
  * [`XMLHttpRequest`](https://xhr.spec.whatwg.org/#interface-xmlhttprequest) (for IE6-)
  * [`FormData`](https://xhr.spec.whatwg.org/#interface-formdata) (for IE9-)

* [W3C Timing control for script-based animations](http://www.w3.org/TR/animation-timing/) - [demo page](http://inexorabletash.github.io/polyfill/demos/raf.html)
  * `id = window.requestAnimationFrame()`
  * `window.cancelAnimationFrame(id)`
* [Efficient Script Yielding](https://dvcs.w3.org/hg/webperf/raw-file/tip/specs/setImmediate/Overview.html)
  * `id = setImmediate(callback, args...)`
  * `clearImmediate(id)`

URL API
-------
[script](url.js) -
[unit tests](http://inexorabletash.github.io/polyfill/tests/url.html) -
[living standard](https://url.spec.whatwg.org/)

```javascript
var url = new URL(url, base);
var value = url.searchParams.get(name);
var valueArray = url.searchParams.getAll(name);
url.searchParams.append(name, valueOrValues);
url.searchParams.delete(name);
```

URL objects have properties:
* `href`
* `origin`
* `protocol`
* `username`
* `password`
* `host`
* `hostname`
* `port`
* `pathname`
* `search`
* `searchParams`
  * `append(name, value)`
  * `delete(name)`
  * `get(name)`
  * `getAll(name)`
  * `has(name)`
  * `set(name, value)`
* `hash`

Keyboard Events
---------------
[script](keyboard.js) -
[demo page](http://inexorabletash.github.io/polyfill/demos/keyboard.html) -
[draft spec](https://dvcs.w3.org/hg/d4e/raw-file/tip/source_respec.htm#keyboard-events)

```javascript
// Adds the following properties to each KeyboardEvent:
event.code
event.location

// You can get a label for the key using:
KeyboardEvent.queryKeyCap(code);

// IE7- only: In your keydown/keyup handler, call this in your handler
// before accessing the `code` or `location` properties:
window.identifyKey(keyboardEvent);
```

Geolocation API
---------------
[script](geo.js) -
[demo page](http://inexorabletash.github.io/polyfill/demos/geo.html) -
[spec](http://www.w3.org/TR/geolocation-API/) -
uses [freegeoip.net](http://freegeoip.net/)

```javascript
navigator.geolocation.getCurrentPosition(successCallback, errorCallback, options);
var watchId = navigator.geolocation.watchPosition(successCallback, errorCallback, options);
navigator.geolocation.clearWatch(watchId);
```

Obsolete
--------
[Obsolete and Unmaintained Polyfills](obsolete/README.md)
