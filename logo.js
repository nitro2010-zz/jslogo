//
// Logo Interpreter in Javascript
//

// Copyright (C) 2011 Joshua Bell
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//----------------------------------------------------------------------
function LogoInterpreter(turtle, stream, savehook)
//----------------------------------------------------------------------
{
  var self = this;

  var UNARY_MINUS = '<UNARYMINUS>'; // Must not match regexIdentifier

  //----------------------------------------------------------------------
  //
  // Utilities
  //
  //----------------------------------------------------------------------

  function format(string, params) {
    return string.replace(/{(\w+)(:[UL])?}/g, function(m, n, o) {
      switch (o) {
        case ':U': return String(params[n]).toUpperCase();
        case ':L': return String(params[n]).toLowerCase();
        default: return params[n];
      }
    });
  }

  function __(string) {
    // TODO: look up string in translation table
    return string;
  }

  // Based on: http://www.jbouchard.net/chris/blog/2008/01/currying-in-javascript-fun-for-whole.html
  function to_arity(func, arity) {
    var parms = [];

    if (func.length === arity) {
      return func;
    }

    for (var i = 0; i < arity; i += 1) {
      parms.push('a' + i);
    }

    var f = eval('(function ' + func.name + '(' + parms.join(',') + ')' +
                 '{ return func.apply(this, arguments); })');
    return f;
  }


  // Adapted from:
  // http://stackoverflow.com/questions/424292/how-to-create-my-own-javascript-random-number-generator-that-i-can-also-set-the-s
  function PRNG(seed) {
    var S = seed & 0x7fffffff, // seed
        A = 48271, // const
        M = 0x7fffffff, // const
        Q = M / A, // const
        R = M % A; // const

    this.next = function PRNG_next() {
      var hi = S / Q,
          lo = S % Q,
          t = A * lo - R * hi;
      S = (t > 0) ? t : t + M;
      this.last = S / M;
      return this.last;
    };
    this.seed = function PRNG_seed(x) {
      S = x & 0x7fffffff;
    };
    this.next();
  }

  function StringMap(case_fold) {
    var map = Object.create(null);
    return {
      get: function(key) {
        if (case_fold) key = String(key).toLowerCase();
        return map['$' + key];
      },
      set: function (key, value) {
        if (case_fold) key = String(key).toLowerCase();
        map['$' + key] = value;
      },
      has: function (key) {
        if (case_fold) key = String(key).toLowerCase();
        return (('$' + key) in map);
      },
      'delete': function (key) {
        if (case_fold) key = String(key).toLowerCase();
        return delete map['$' + key];
      },
      keys: function () {
        return Object.keys(map).map(
          function (key) {
            return key.substring(1);
          }
        );
      },
      empty: function() {
        return Object.keys(map).length === 0;
      },
      forEach: function(fn) {
        return Object.keys(map).forEach(function(key) {
          fn(key.substring(1), map[key]);
        });
      }
    };
  }

  function LogoArray(init, origin) {
    if (typeof init === 'object' && init && 'length' in init) {
      this.array = [].slice.call(init);
    } else {
      this.array = new Array(Number(init));
      for (var i = 0; i < this.array.length; ++i) {
        this.array[i] = '';
      }
    }
    this.origin = origin;
  }
  LogoArray.prototype = {
    item: function(i) {
      i = Number(i)|0;
      i -= this.origin;
      if (i < 0 || i >= this.array.length) {
        throw new Error(__("Indeks poza zakresem"));
      }
      return this.array[i];
    },
    setItem: function(i, v) {
      i = Number(i)|0;
      i -= this.origin;
      if (i < 0 || i >= this.array.length) {
        throw new Error(__("Indeks poza zakresem"));
      }
      this.array[i] = v;
    },
    list: function() {
      return this.array.slice();
    },
    count: function() {
      return this.array.length;
    }
  };

  //----------------------------------------------------------------------
  //
  // Interpreter State
  //
  //----------------------------------------------------------------------

  self.turtle = turtle;
  self.stream = stream;
  self.routines = new StringMap(true);
  self.scopes = [new StringMap(true)];
  self.plists = new StringMap(true);
  self.prng = new PRNG(Math.random() * 0x7fffffff);

  //----------------------------------------------------------------------
  //
  // Parsing
  //
  //----------------------------------------------------------------------

  // Used to return values from routines (thrown/caught)
  function Output(output) { this.output = output; }
  Output.prototype.toString = function() { return this.output; };
  Output.prototype.valueOf = function() { return this.output; };

  // Used to stop processing cleanly
  function Bye() { }

  function Type(atom) {
    if (atom === undefined) {
      // TODO: Should be caught higher upstream than this
      throw new Error(__("Brak wyj\u015Bcia z procedury"));
    } else if (typeof atom === 'string') {
      return 'word';
    } else if (typeof atom === 'number') {
      return 'number';
    } else if (Array.isArray(atom)) {
      return 'list';
    } else if (atom instanceof LogoArray) {
      return 'array';
    } else if (!atom) {
      throw new Error(__("Nieoczekiwana warto\u015B\u0107: pusty"));
    } else {
      throw new Error(__("Nieoczekiwana warto\u015B\u0107: nieznany typ"));
    }
  }

  // Note: U+2190 ... U+2193 are arrows
  var regexIdentifier = /^(\.?[A-Za-z\u00A1-\u1FFF][A-Za-z0-9_.\?\u00A1-\u1FFF]*|[\u2190-\u2193])/;
  var regexStringLiteral = /^(["'][^ \[\]\(\)\{\}]*)/;
  var regexVariable = /^(:[A-Za-z\u00A1-\u1FFF][A-Za-z0-9_\u00A1-\u1FFF]*)/;
  var regexNumberLiteral = /^([0-9]*\.?[0-9]+(?:[eE]\s*[\-+]?\s*[0-9]+)?)/;
  var regexOperator = /^(\+|\-|\*|\/|%|\^|>=|<=|<>|=|<|>|\[|\]|\{|\}|\(|\))/;
  var regexInfix = /^(\+|\-|\*|\/|%|\^|>=|<=|<>|=|<|>)$/;

  //
  // Tokenize into atoms / lists
  //
  // Input: string
  // Output: atom list (e.g. "to", "jump", "repeat", "random", 10, [ "fd", "10", "rt", "10" ], "end"
  //

  function parse(string) {
    if (string === undefined) {
      return undefined; // TODO: Replace this with ...?
    }

    var atoms = [],
        prev, r;

    // Handle escaping and filter out comments
    string = string.replace(/^(([^;\\\n]|\\.)*);.*$/mg, '$1').replace(/\\(.)/g, '$1');

    // Treat newlines as whitespace (so \s will match)
    string = string.replace(/\r/g, '').replace(/\n/g, ' ');
    string = string.replace(/^\s+/, '').replace(/\s+$/, '');

    while (string !== undefined && string !== '') {
      var atom;

      // Ignore (but track) leading space - needed for unary minus disambiguation
      var leading_space = /^\s+/.test(string);
      string = string.replace(/^\s+/, '');

      if (string.match(regexIdentifier) ||
          string.match(regexStringLiteral) ||
          string.match(regexVariable) ||
          string.match(regexNumberLiteral)) {

        atom = RegExp.$1;
        string = string.substring(atom.length);

      } else if (string.charAt(0) === '[') {
        r = parseList(string.substring(1));
        atom = r.list;
        string = r.string;

      } else if (string.charAt(0) === '{') {
        r = parseArray(string.substring(1));
        atom = r.array;
        string = r.string;

      } else if (string.match(regexOperator)) {
        atom = RegExp.$1;
        string = string.substring(atom.length);

        // From UCB Logo:

        // Minus sign means infix difference in ambiguous contexts
        // (when preceded by a complete expression), unless it is
        // preceded by a space and followed by a nonspace.

        // Minus sign means unary minus if the previous token is an
        // infix operator or open parenthesis, or it is preceded by
        // a space and followed by a nonspace.

        if (atom === '-') {

          var trailing_space = /^\s+/.test(string);

          if (prev === undefined ||
              (Type(prev) === 'word' && regexInfix.test(prev)) ||
              (Type(prev) === 'word' && prev === '(') ||
              (leading_space && !trailing_space)
             ) {
               atom = UNARY_MINUS;
          }

        }
      } else {
        throw new Error(format(__("Nie mo\u017Cna przetworzy\u0107: '{string}'"), { string: string }));
      }

      atoms.push(atom);
      prev = atom;
    }

    return atoms;
  }

  function isNumber(s) {
    return String(s).match(/^-?([0-9]*\.?[0-9]+(?:[eE]\s*[\-+]?\s*[0-9]+)?)$/);
  }

  function isWS(c) {
    return c === ' ' || c === '\t' || c === '\r' || c === '\n';
  }

  function parseList(string) {
    var index = 0,
        list = [],
        atom = '',
        c, r;

    while (true) {
      do {
        c = string.charAt(index++);
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = string.charAt(index++);
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c) {
        throw new Error(__("Oczekiwano ']'"));
      }
      if (isWS(c)) {
        continue;
      }
      if (c === ']') {
        return { list: list, string: string.substring(index) };
      }
      if (c === '[') {
        r = parseList(string.substring(index));
        list.push(r.list);
        string = r.string;
        index = 0;
        continue;
      }
      if (c === '{') {
        r = parseArray(string.substring(index));
        list.push(r.array);
        string = r.string;
        index = 0;
        continue;
      }
      throw new Error(format(__("Nieoczekiwany '{c}'"), {c: c}));
    }
  }

  function parseArray(string) {
    var index = 0,
        list = [],
        atom = '',
        c, r;

    while (true) {
      do {
        c = string.charAt(index++);
      } while (isWS(c));

      while (c && !isWS(c) && '[]{}'.indexOf(c) === -1) {
        atom += c;
        c = string.charAt(index++);
      }

      if (atom.length) {
        list.push(atom);
        atom = '';
      }

      if (!c) {
        throw new Error(__("Oczekiwano '}'"));
      }
      if (isWS(c)) {
        continue;
      }
      if (c === '}') {
        string = string.substring(index);
        var origin = 1;
        if (string.match(/^(\s*@\s*)(.*)$/)) {
          string = RegExp.$2;
          if (!string.match(/^(-?\d+)(.*)$/))
            throw new Error(__('Oczekiwano liczby po @'));
          origin = RegExp.$1;
          string = RegExp.$2;
        }
        return { array: new LogoArray(list, origin), string: string };
      }
      if (c === '[') {
        r = parseList(string.substring(index));
        list.push(r.list);
        string = r.string;
        index = 0;
        continue;
      }
      if (c === '{') {
        r = parseArray(string.substring(index));
        list.push(r.array);
        string = r.string;
        index = 0;
        continue;
      }
      throw new Error(format(__("Nieoczekiwany '{c}'"), {c: c}));
    }
  }

  function reparse(list) {
    return parse(stringify_nodecorate(list).replace(/([\\;])/g, '\\$1'));
  }

  function maybegetvar(name) {
    var lval = lvalue(name);
    return lval ? lval.value : undefined;
  }

  function getvar(name) {
    var value = maybegetvar(name);
    if (value !== undefined) {
      return value;
    }
    throw new Error(format(__("Nic nie wiadomo o zmiennej {name:U}"), { name: name }));
  }

  function lvalue(name) {
    for (var i = self.scopes.length - 1; i >= 0; --i) {
      if (self.scopes[i].has(name)) {
        return self.scopes[i].get(name);
      }
    }
    return undefined;
  }

  function setvar(name, value) {
    value = copy(value);

    // Find the variable in existing scope
    var lval = lvalue(name);
    if (lval) {
      lval.value = value;
    } else {
      // Otherwise, define a global
      lval = {value: value};
      self.scopes[0].set(name, lval);
    }
  }

  //----------------------------------------------------------------------
  //
  // Expression Evaluation
  //
  //----------------------------------------------------------------------

  // Expression               := RelationalExpression
  // RelationalExpression     := AdditiveExpression [ ( '=' | '<' | '>' | '<=' | '>=' | '<>' ) AdditiveExpression ... ]
  // AdditiveExpression       := MultiplicativeExpression [ ( '+' | '-' ) MultiplicativeExpression ... ]
  // MultiplicativeExpression := PowerExpression [ ( '*' | '/' | '%' ) PowerExpression ... ]
  // PowerExpression          := UnaryExpression [ '^' UnaryExpression ]
  // UnaryExpression          := ( '-' ) UnaryExpression
  //                           | FinalExpression
  // FinalExpression          := string-literal
  //                           | number-literal
  //                           | list
  //                           | variable-reference
  //                           | procedure-call
  //                           | '(' Expression ')'

  //----------------------------------------------------------------------
  // Peek at the list to see if there are additional atoms from a set
  // of options.
  //----------------------------------------------------------------------
  function peek(list, options)
  //----------------------------------------------------------------------
  {
    if (list.length < 1) { return false; }
    var next = list[0];
    return options.some(function(x) { return next === x; });

  }

  function evaluateExpression(list) {
    return (expression(list))();
  }

  function expression(list) {
    return relationalExpression(list);
  }

  function relationalExpression(list) {
    var lhs = additiveExpression(list);
    var op;
    while (peek(list, ['=', '<', '>', '<=', '>=', '<>'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = additiveExpression(list);

        switch (op) {
          case "<": return function() { return (aexpr(lhs()) < aexpr(rhs())) ? 1 : 0; };
          case ">": return function() { return (aexpr(lhs()) > aexpr(rhs())) ? 1 : 0; };
          case "=": return function() { return equal(lhs(), rhs()) ? 1 : 0; };

          case "<=": return function() { return (aexpr(lhs()) <= aexpr(rhs())) ? 1 : 0; };
          case ">=": return function() { return (aexpr(lhs()) >= aexpr(rhs())) ? 1 : 0; };
          case "<>": return function() { return !equal(lhs(), rhs()) ? 1 : 0; };
          default: throw new Error(__("Wewn\u0119trzny b\u0142\u0105d w przetwarzaniu wyra\u017Cenia"));
        }
      } (lhs);
    }

    return lhs;
  }

  function additiveExpression(list) {
    var lhs = multiplicativeExpression(list);
    var op;
    while (peek(list, ['+', '-'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = multiplicativeExpression(list);
        switch (op) {
          case "+": return function() { return aexpr(lhs()) + aexpr(rhs()); };
          case "-": return function() { return aexpr(lhs()) - aexpr(rhs()); };
          default: throw new Error(__("Wewn\u0119trzny b\u0142\u0105d w przetwarzaniu wyra\u017Cenia"));
        }
      } (lhs);
    }

    return lhs;
  }

  function multiplicativeExpression(list) {
    var lhs = powerExpression(list);
    var op;
    while (peek(list, ['*', '/', '%'])) {
      op = list.shift();

      lhs = function(lhs) {
        var rhs = powerExpression(list);
        switch (op) {
          case "*": return function() { return aexpr(lhs()) * aexpr(rhs()); };
          case "/": return function() {
            var n = aexpr(lhs()), d = aexpr(rhs());
            if (d === 0) { throw new Error(__("Dzielenie przez zero")); }
            return n / d;
          };
          case "%": return function() {
            var n = aexpr(lhs()), d = aexpr(rhs());
            if (d === 0) { throw new Error(__("Dzielenie przez zero")); }
            return n % d;
          };
          default: throw new Error(__("Wewn\u0119trzny b\u0142\u0105d w przetwarzaniu wyra\u017Cenia"));
        }
      } (lhs);
    }

    return lhs;
  }

  function powerExpression(list) {
    var lhs = unaryExpression(list);
    var op;
    while (peek(list, ['^'])) {
      op = list.shift();
      lhs = function(lhs) {
        var rhs = unaryExpression(list);
        return function() { return Math.pow(aexpr(lhs()), aexpr(rhs())); };
      } (lhs);
    }

    return lhs;
  }

  function unaryExpression(list) {
    var rhs, op;

    if (peek(list, [UNARY_MINUS])) {
      op = list.shift();
      rhs = unaryExpression(list);
      return function() { return -aexpr(rhs()); };
    } else {
      return finalExpression(list);
    }
  }

  function finalExpression(list) {
    if (!list.length) {
      throw new Error(__("Nieoczekiwany koniec instrukcji"));
    }

    var atom = list.shift();

    var result, literal, varname;

    switch (Type(atom)) {
      case 'number':
        throw new Error(__("Nieoczekiwany atomowy typ: liczba"));

      case 'array':
      case 'list':
        return function() { return atom; };

      case 'word':
        if (isNumber(atom)) {
          // number literal
          atom = parseFloat(atom);
          return function() { return atom; };
        } else if (atom.charAt(0) === '"' || atom.charAt(0) === "'") {
          // string literal
          literal = atom.substring(1);
          return function() { return literal; };
        } else if (atom.charAt(0) === ':') {
          // variable
          varname = atom.substring(1);
          return function() { return getvar(varname); };
        } else if (atom === '(') {
          // parenthesized expression/procedure call
          if (list.length && Type(list[0]) === 'word' &&
              self.routines.has(String(list[0]))) {

            // Lisp-style (procedure input ...) calling syntax
            atom = list.shift();
            return self.dispatch(atom, list, false);
          } else {
            // Standard parenthesized expression
            result = expression(list);

            if (!list.length) {
              throw new Error(format(__("Oczekiwano ')'")));
            } else if (!peek(list, [')'])) {
              throw new Error(format(__("Oczekiwano ')', zobaczono {word}"), { word: list.shift() }));
            }
            list.shift();
            return result;
          }
        } else {
          // Procedure dispatch
          return self.dispatch(atom, list, true);
        }
      break;
        default: throw new Error(__("Wewn\u0119trzny b\u0142\u0105d w przetwarzaniu wyra\u017Cenia"));
    }
  }

  self.dispatch = function(name, tokenlist, natural) {
    var procedure = self.routines.get(name);
    if (!procedure) {
      throw new Error(format(__("Nic nie wiadomo na temat: {name:U}"), { name: name }));
    }

    if (procedure.special) {
      // Special routines are built-ins that get handed the token list:
      // * workspace modifiers like TO that special-case varnames
      procedure(tokenlist);
      return function() { };
    }

    var args = [];
    if (natural) {
      // Natural arity of the function
      for (var i = 0; i < procedure.length; ++i) {
        args.push(expression(tokenlist));
      }
    } else {
      // Caller specified argument count
      while (tokenlist.length && !peek(tokenlist, [')'])) {
        args.push(expression(tokenlist));
      }
      tokenlist.shift(); // Consume ')'
    }

    if (procedure.noeval) {
      return function() {
        return procedure.apply(null, args);
      };
    } else {
      return function() {
        return procedure.apply(null, args.map(function(a) { return a(); }));
      };
    }
  };

  //----------------------------------------------------------------------
  // Arithmetic expression convenience function
  //----------------------------------------------------------------------
  function aexpr(atom) {
    if (atom === undefined) {
      throw new Error(__("Oczekiwano liczby"));
    }
    switch (Type(atom)) {
    case 'number':
      return atom;
    case 'word':
      if (isNumber(atom))
        return parseFloat(atom);
      break;
    }
    throw new Error(__("Oczekiwano liczby"));
  }

  //----------------------------------------------------------------------
  // String expression convenience function
  //----------------------------------------------------------------------
  function sexpr(atom) {
    if (atom === undefined) { throw new Error(__("Oczekiwano \u0142a\u0144cucha znak\u00F3w")); }
    if (atom === UNARY_MINUS) { return '-'; }
    switch (Type(atom)) {
    case 'word':
      return atom;
    case 'number':
      return String(atom);
    }

    throw new Error(__("Oczekiwano \u0142a\u0144cucha znak\u00F3w"));
  }

  //----------------------------------------------------------------------
  // List expression convenience function
  //----------------------------------------------------------------------
  function lexpr(atom) {
    // TODO: If this is an input, output needs to be re-stringified

    if (atom === undefined) { throw new Error(__("Oczekiwano listy")); }
    switch (Type(atom)) {
    case 'word':
      return [].slice.call(atom);
    case 'list':
      return copy(atom);
    }

    throw new Error(__("Oczekiwano listy"));
  }

  //----------------------------------------------------------------------
  //----------------------------------------------------------------------
  function copy(value) {
    switch (Type(value)) {
    case 'list': return value.map(copy);
    default: return value;
    }
  }

  //----------------------------------------------------------------------
  // Deep compare of values (numbers, strings, lists)
  // (with optional epsilon compare for numbers)
  //----------------------------------------------------------------------
  function equal(a, b, epsilon) {
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) {
        return false;
      }
      if (a.length !== b.length) {
        return false;
      }
      for (var i = 0; i < a.length; i += 1) {
        if (!equal(a[i], b[i])) {
          return false;
        }
      }
      return true;
    } else if (typeof a !== typeof b) {
      return false;
    } else if (epsilon !== undefined && typeof a === 'number') {
      return Math.abs(a - b) < epsilon;
    } else {
      return a === b;
    }
  }

  //----------------------------------------------------------------------
  //
  // Execute a script
  //
  //----------------------------------------------------------------------

  //----------------------------------------------------------------------
  // Execute a sequence of statements
  //----------------------------------------------------------------------
  self.execute = function(statements, options) {
    options = Object(options);
    // Operate on a copy so the original is not destroyed
    statements = statements.slice();

    var result;
    while (statements.length) {
      result = evaluateExpression(statements);

      if (result !== undefined && !options.returnResult) {
        throw new Error(format(__("Nie wiadomo co zrobi\u0107 z: {result}"), {result: result}));
      }
    }

    // Return last result
    return result;
  };


  self.run = function(string, options) {
    options = Object(options);
    if (self.turtle) { self.turtle.begin(); }

    try {
      // Parse it
      var atoms = parse(string);

      // And execute it!
      return self.execute(atoms, options);
    } catch (e) {
      if (e instanceof Bye) {
        // clean exit
        return undefined;
      } else {
        throw e;
      }
    } finally {
      if (self.turtle) { self.turtle.end(); }
    }
  };


  self.definition = function(name, proc) {

    function defn(atom) {
      switch (Type(atom)) {
        case 'word': return atom;
        case 'number': return String(atom);
        case 'list': return '[ ' + atom.map(defn).join(' ') + ' ]';
        case 'array': return '{ ' + atom.list().map(defn).join(' ') + ' }' +
          (atom.origin === 1 ? '' : '@' + atom.origin);
      default: throw new Error(__("Nieoczekiwana warto\u015B\u0107: nieznany typ"));
      }
    }

    var def = "oto " + name;
    if (proc.inputs.length) {
      def += " ";
      def += proc.inputs.map(function(a) { return ":" + a; }).join(" ");
    }
    def += "\n";
    def += "  " + proc.block.map(defn).join(" ").replace(new RegExp(UNARY_MINUS + ' ', 'g'), '-');
    def += "\n" + "ju\u017C";

    return def;
  };

  // API to allow pages to persist definitions
  self.procdefs = function() {
    var defs = [];
    self.routines.forEach(function(name, proc) {
      if (!proc.primitive) {
        defs.push(self.definition(name, proc));
      }
    });
    return defs.join("\n\n");
  };


  //----------------------------------------------------------------------
  //
  // Built-In Proceedures
  //
  //----------------------------------------------------------------------

  // Basic form:
  //
  //  def("procname", function(input1, input2, ...) { ... return output; });
  //   * inputs are JavaScript strings, numbers, or Arrays
  //   * output is string, number, Array or undefined/no output
  //
  // Special forms:
  //
  //  def("procname", function(tokenlist) { ... }, {special: true});
  //   * input is Array (list) of tokens (words, numbers, Arrays)
  //   * used for implementation of special forms (e.g. TO inputs... statements... END)
  //
  //  def("procname", function(fin, fin, ...) { ... return op; }, {noeval: true});
  //   * inputs are arity-0 functions that evaluate to string, number Array
  //   * used for short-circuiting evaluation (AND, OR)
  //   * used for repeat evaluation (DO.WHILE, WHILE, DO.UNTIL, UNTIL)
  //


  function mapreduce(list, mapfunc, reducefunc, initial) {
    // NOTE: Uses Array.XXX format to handle array-like types: arguments and strings
    if (initial === undefined) {
      return [].reduce.call(
        [].map.call(list, mapfunc), reducefunc);
    } else {
      return [].reduce.call(
        [].map.call(list, mapfunc), reducefunc, initial);
    }
  }

  function stringify(thing) {
    switch (Type(thing)) {
    case 'list':
      return "[" + thing.map(stringify).join(" ") + "]";
    case 'array':
      return "{" + thing.list().map(stringify).join(" ") + "}" +
        (thing.origin === 1 ? '' : '@' + thing.origin);
    default:
      return sexpr(thing);
    }
  }

  function stringify_nodecorate(thing) {
    switch (Type(thing)) {
    case 'list':
      return thing.map(stringify).join(" ");
    case 'array':
      return thing.list().map(stringify).join(" ");
    default:
      return sexpr(thing);
    }
  }

  function def(name, fn, props) {
    if (props) {
      Object.keys(props).forEach(function(key) {
        fn[key] = props[key];
      });
    }
    fn.primitive = true;
    if (Array.isArray(name)) {
      name.forEach(function(name) {
        self.routines.set(name, fn);
      });
    } else {
      self.routines.set(name, fn);
    }
  }

  //
  // Procedures and Flow Control
  //
  def("oto", function(list) {
    var name = sexpr(list.shift());
    if (!name.match(regexIdentifier)) {
      throw new Error(__("Oczekiwano identyfikatora"));
    }

    if (self.routines.has(name) && self.routines.get(name).primitive) {
      throw new Error(format(__("Nie mo\u017Cna przedefiniowa\u0107 nazwy {name:U}"), { name: name }));
    }

    var inputs = [];
    var block = [];

    // Process inputs, then the statements of the block
    var state_inputs = true, sawEnd = false;
    while (list.length) {
      var atom = list.shift();
      if (Type(atom) === 'word' && atom.toUpperCase() === 'JU\u017b') {
        sawEnd = true;
        break;
      } else if (state_inputs && Type(atom) === 'word' && atom.charAt(0) === ':') {
        inputs.push(atom.substring(1));
      } else {
        state_inputs = false;
        block.push(atom);
      }
    }
    if (!sawEnd) {
      throw new Error(__("Oczekiwano JU\u017b"));
    }

    // Closure over inputs and block to handle scopes, arguments and outputs
    var func = function() {

      // Define a new scope
      var scope = new StringMap(true);
      for (var i = 0; i < inputs.length && i < arguments.length; i += 1) {
        scope.set(inputs[i], {value: arguments[i]});
      }
      self.scopes.push(scope);

      try {
        // Execute the block
        try {
          return self.execute(block);
        } catch (e) {
          // From OUTPUT
          if (e instanceof Output) {
            return e.output;
          } else {
            throw e;
          }
        }
      } finally {
        // Close the scope
        self.scopes.pop();
      }
    };

    var proc = to_arity(func, inputs.length);
    self.routines.set(name, proc);

    // For DEF de-serialization
    proc.inputs = inputs;
    proc.block = block;

    if (savehook) {
      savehook(name, self.definition(name, proc));
    }
  }, {special: true});

  def(["procedura","proc"], function(list) {

    var name = sexpr(list);
    var proc = self.routines.get(name);
    if (!proc) {
      throw new Error(format(__("Nic nie wiadomo na temat: {name:U}"), { name: name }));
    }
    if (!proc.inputs) {
      throw new Error(format(__("Nie mo\u017Cna pokaza\u0107 definicji: {name:U}"), { name: name }));
    }

    return self.definition(name, proc);
  });


  //----------------------------------------------------------------------
  //
  // 2. Data Structure Primitives
  //
  //----------------------------------------------------------------------

  //
  // 2.1 Constructors
  //

  def("s\u0142owo", function(word1, word2) {
    return arguments.length ?
      mapreduce(arguments, sexpr, function(a, b) { return a + b; }) : "";
  });

  def("lista", function(thing1, thing2) {
    return [].map.call(arguments, function(x) { return x; }); // Make a copy
  });

  def(["zdanie", "zd"], function(thing1, thing2) {
    var list = [];
    for (var i = 0; i < arguments.length; i += 1) {
      var thing = arguments[i];
      if (Type(thing) === 'list') {
        thing = lexpr(thing);
        list = list.concat(thing);
      } else {
        list.push(thing);
      }
    }
    return list;
  });

  def("nap", function(thing, list) { list = lexpr(list); list.unshift(thing); return list; });

  def("nak", function(thing, list) { list = lexpr(list); list.push(thing); return list; });

  def("tablica", function(size) {
    size = aexpr(size);
    if (size < 1) { throw new Error(__("Tablica musi mie\u0107 rozmiar dodatni")); }
    var origin = 1;
    if (arguments.length > 1) {
      origin = aexpr(arguments[1]);
    }
    return new LogoArray(size, origin);
  });

  // NOT SUPPORTED: mdarray

  def("listadotablicy", function(list) {
    list = lexpr(list);
    var origin = 1;
    if (arguments.length > 1) {
      origin = aexpr(arguments[1]);
    }
    return new LogoArray(list, origin);
  });

  def("tablicadolisty", function(array) {
    if (Type(array) !== 'array') {
      throw new Error(__("Oczekiwano tablicy"));
    }
    return array.list();
  });

  def("po\u0142\u0105cz", function(thing1, thing2) {
    if (Type(thing2) !== 'list') {
      return self.routines.get('s\u0142owo')(thing1, thing2);
    } else {
      return self.routines.get('nap')(thing1, thing2);
    }
  });

  def("wspak", function(list) { return lexpr(list).reverse(); });

  var gensym_index = 0;
  def("generujg", function() {
    gensym_index += 1;
    return 'G' + gensym_index;
  });

  //
  // 2.2 Data Selectors
  //

  def(["pierwszy", "pierw"], function(list) { return lexpr(list)[0]; });

  def("pierwsze", function(list) {
    return lexpr(list).map(function(x) { return x[0]; });
  });

  def(["ostatni", "ost"], function(list) { list = lexpr(list); return list[list.length - 1]; });

  def(["bezpierw", "bp"], function(list) { return lexpr(list).slice(1); });

  def(["bezpierwszych", "bps"], function(list) {
    return lexpr(list).map(function(x) { return lexpr(x).slice(1); });
  });

  def(["bezost", "bo"], function(list) { return lexpr(list).slice(0, -1); });

  def("element", function(index, thing) {
    index = aexpr(index);
    switch (Type(thing)) {
    case 'list':
      if (index < 1 || index > thing.length) {
        throw new Error(__("Indeks poza zakresem"));
      }
      return thing[index - 1];
    case 'array':
      return thing.item(index);
    default:
      return sexpr(thing).charAt(index);
    }
  });

  // Not Supported: mditem

  def("los", function(list) {
    list = lexpr(list);
    var i = Math.floor(self.prng.next() * list.length);
    return list[i];
  });

  def("usu\u0144", function(thing, list) {
    return lexpr(list).filter(function(x) { return !equal(x, thing); });
  });

  def("usu\u0144zdup", function(list) {
    var dict = Object.create(null);
    return lexpr(list).filter(function(x) {
      if (!dict[x]) { dict[x] = true; return true; } else { return false; }
    });
  });

  // TODO: quoted

  //
  // 2.3 Data Mutators
  //

  def("ustawelement", function(index, array, value) {
    index = aexpr(index);
    if (Type(array) !== 'array') {
      throw new Error(__("Oczekiwano tablicy"));
    }
    array.setItem(index, value);
  });

  // Not Supported: mdsetitem
  // Not Supported: .setfirst
  // Not Supported: .setbf
  // Not Supported: .setitem

  def("umieść", function(stackname, thing) {
    var stack = lexpr(getvar(stackname));
    stack.unshift(thing);
    setvar(stackname, stack);
  });

  def("zdejmij", function(stackname) {
    return getvar(stackname).shift();
  });

  def("dokolejki", function(stackname, thing) {
    var stack = lexpr(getvar(stackname));
    stack.push(thing);
    setvar(stackname, stack);
  });

  def("zkolejki", function(stackname) {
    return getvar(stackname).pop();
  });

  //
  // 2.4 Predicates
  //


  def(["s\u0142owop", "s\u0142owo?"], function(thing) { return Type(thing) === 'word' ? 1 : 0; });
  def(["listap", "lista?"], function(thing) { return Type(thing) === 'list' ? 1 : 0; });
  def(["tablicap", "tablica?"], function(thing) { return Type(thing) === 'array' ? 1 : 0; });
  def(["liczbap", "liczba?"], function(thing) { return Type(thing) === 'number' ? 1 : 0; });
  def(["r\u00F3wnep", "r\u00F3wne?"], function(a, b) { return equal(a, b) ? 1 : 0; });
  def(["nier\u00F3wnep", "nier\u00F3wne?"], function(a, b) { return !equal(a, b) ? 1 : 0; });

  def(["pustep", "puste?"], function(thing) {
    switch (Type(thing)) {
    case 'word': return thing.length === 0 ? 1 : 0;
    case 'list': return thing.length === 0 ? 1 : 0;
    default: return 0;
    }
  });
  def(["przedp", "przed?"], function(word1, word2) {
    return sexpr(word1) < sexpr(word2) ? 1 : 0;
  });

  // Not Supported: .eq
  // Not Supported: vbarredp

  def(["element?", "zawiera?"], function(thing, list) {
    return lexpr(list).some(function(x) { return equal(x, thing); }) ? 1 : 0;
  });


  def(["podtekstp", "podtekst?"], function(word1, word2) {
    return sexpr(word2).indexOf(sexpr(word1)) !== -1 ? 1 : 0;
  });

  //
  // 2.5 Queries
  //

  def("d\u0142ugo\u015B\u0107", function(thing) {
    if (Type(thing) === 'array') { return thing.count(); }
    return lexpr(thing).length;
  });
  def("ascii", function(chr) { return sexpr(chr).charCodeAt(0); });
  // Not Supported: rawascii
  def("znak", function(integer) { return String.fromCharCode(aexpr(integer)); });
  def("zma\u0142ejlitery", function(word) { return sexpr(word).toLowerCase(); });
  def("zdu\u017Cejlitery", function(word) { return sexpr(word).toUpperCase(); });
  def("standardowewyj\u015Bcie", function(word) { return sexpr(word); }); // For compat
  // Not Supported: parse
  // Not Supported: runparse

  //----------------------------------------------------------------------
  //
  // 3. Communication
  //
  //----------------------------------------------------------------------

  // 3.1 Transmitters

  def(["pisz", "ps"], function(thing) {
    var s = [].map.call(arguments, stringify_nodecorate).join(" ");
    self.stream.write(s, "\n");
  });
  def("wpisz", function(thing) {
    var s = [].map.call(arguments, stringify_nodecorate).join("");
    self.stream.write(s);
  });
  def("poka\u017C", function(thing) {
    var s = [].map.call(arguments, stringify).join(" ");
    self.stream.write(s, "\n");
  });

  // 3.2 Receivers

  // Not Supported: readlist

  def(["czytajs\u0142owo","csw"], function() {
    if (arguments.length > 0) {
      return stream.read(stringify_nodecorate(arguments[0]));
    } else {
      return stream.read();
    }
  });


  // Not Supported: readrawline
  // Not Supported: readchar
  // Not Supported: readchars
  // Not Supported: shell

  // 3.3 File Access

  // Not Supported: setprefix
  // Not Supported: prefix
  // Not Supported: openread
  // Not Supported: openwrite
  // Not Supported: openappend
  // Not Supported: openupdate
  // Not Supported: close
  // Not Supported: allopen
  // Not Supported: closeall
  // Not Supported: erasefile
  // Not Supported: dribble
  // Not Supported: nodribble
  // Not Supported: setread
  // Not Supported: setwrite
  // Not Supported: reader
  // Not Supported: writer
  // Not Supported: setreadpos
  // Not Supported: setwritepos
  // Not Supported: readpos
  // Not Supported: writepos
  // Not Supported: eofp
  // Not Supported: filep

  // 3.4 Terminal Access

  // Not Supported: keyp

  def(["zma\u017Ctekst", "zt"], function() {
    self.stream.clear();
  });

  // Not Supported: setcursor
  // Not Supported: cursor
  // Not Supported: setmargins
  // Not Supported: settextcolor
  // Not Supported: increasefont
  // Not Supported: settextsize
  // Not Supported: textsize
  // Not Supported: setfont
  // Not Supported: font

  //----------------------------------------------------------------------
  //
  // 4. Arithmetic
  //
  //----------------------------------------------------------------------
  // 4.1 Numeric Operations


  def("suma", function(a, b) {
    return mapreduce(arguments, aexpr, function(a, b) { return a + b; }, 0);
  });

  def("r\u00F3\u017Cnica", function(a, b) {
    return aexpr(a) - aexpr(b);
  });

  def("ujemny", function(a) { return -aexpr(a); });

  def("iloczyn", function(a, b) {
    return mapreduce(arguments, aexpr, function(a, b) { return a * b; }, 1);
  });

  def("iloraz", function(a, b) {
    if (b !== undefined) {
      return aexpr(a) / aexpr(b);
    } else {
      return 1 / aexpr(a);
    }
  });

  def("reszta", function(num1, num2) {
    return aexpr(num1) % aexpr(num2);
  });
  def("mod", function(num1, num2) {
    num1 = aexpr(num1);
    num2 = aexpr(num2);
    return Math.abs(num1 % num2) * (num2 < 0 ? -1 : 1);
  });

  def("pot\u0119ga", function(a, b) { return Math.pow(aexpr(a), aexpr(b)); });
  def("pwk", function(a) { return Math.sqrt(aexpr(a)); });
  def("exp", function(a) { return Math.exp(aexpr(a)); });
  def("log10", function(a) { return Math.log(aexpr(a)) / Math.LN10; });
  def("ln", function(a) { return Math.log(aexpr(a)); });


  function deg2rad(d) { return d / 180 * Math.PI; }
  function rad2deg(r) { return r * 180 / Math.PI; }

  def("arctg", function(a) {
    if (arguments.length > 1) {
      var x = aexpr(arguments[0]);
      var y = aexpr(arguments[1]);
      return rad2deg(Math.atan2(y, x));
    } else {
      return rad2deg(Math.atan(aexpr(a)));
    }
  });

  def("sin", function(a) { return Math.sin(deg2rad(aexpr(a))); });
  def("cos", function(a) { return Math.cos(deg2rad(aexpr(a))); });
  def("tg", function(a) { return Math.tan(deg2rad(aexpr(a))); });

  def("radarctan", function(a) {
    if (arguments.length > 1) {
      var x = aexpr(arguments[0]);
      var y = aexpr(arguments[1]);
      return Math.atan2(y, x);
    } else {
      return Math.atan(aexpr(a));
    }
  });

  def("radsin", function(a) { return Math.sin(aexpr(a)); });
  def("radcos", function(a) { return Math.cos(aexpr(a)); });
  def("radtan", function(a) { return Math.tan(aexpr(a)); });

  def("abs", function(a) { return Math.abs(aexpr(a)); });


  function truncate(x) { return parseInt(x, 10); }

  def("int", function(a) { return truncate(aexpr(a)); });
  def("zaokr", function(a) { return Math.round(aexpr(a)); });

  def("isekw", function(a, b) {
    a = truncate(aexpr(a));
    b = truncate(aexpr(b));
    var step = (a < b) ? 1 : -1;
    var list = [];
    for (var i = a; (step > 0) ? (i <= b) : (i >= b); i += step) {
      list.push(i);
    }
    return list;
  });


  def("rsekw", function(from, to, count) {
    from = aexpr(from);
    to = aexpr(to);
    count = truncate(aexpr(count));
    var step = (to - from) / (count - 1);
    var list = [];
    for (var i = from; (step > 0) ? (i <= to) : (i >= to); i += step) {
      list.push(i);
    }
    return list;
  });

  // 4.2 Numeric Predicates

  def(["wi\u0119kszep", "wi\u0119ksze?"], function(a, b) { return aexpr(a) > aexpr(b) ? 1 : 0; });
  def(["wi\u0119kszer\u00F3wnep", "wi\u0119kszer\u00F3wne?"], function(a, b) { return aexpr(a) >= aexpr(b) ? 1 : 0; });
  def(["mniejszep", "mniejsze?"], function(a, b) { return aexpr(a) < aexpr(b) ? 1 : 0; });
  def(["mniejszer\u00F3wnep", "mniejszer\u00F3wne?"], function(a, b) { return aexpr(a) <= aexpr(b) ? 1 : 0; });

  // 4.3 Random Numbers

  def("losowa", function(max) {
    max = aexpr(max);
    return Math.floor(self.prng.next() * max);
  });

  def("startlos", function() {
    var seed = (arguments.length > 0) ? aexpr(arguments[0]) : 2345678901;
    return self.prng.seed(seed);
  });

  // 4.4 Print Formatting

  def("posta\u0107", function(num, width, precision) {
    num = aexpr(num);
    width = aexpr(width);
    precision = aexpr(precision);

    var str = num.toFixed(precision);
    if (str.length < width) {
      str = Array(1 + width - str.length).join(' ') + str;
    }
    return str;
  });

  // 4.5 Bitwise Operations


  def("biti", function(num1, num2) {
    return mapreduce(arguments, aexpr, function(a, b) { return a & b; }, -1);
  });
  def("bitlub", function(num1, num2) {
    return mapreduce(arguments, aexpr, function(a, b) { return a | b; }, 0);
  });
  def("bitalbo", function(num1, num2) {
    return mapreduce(arguments, aexpr, function(a, b) { return a ^ b; }, 0);
  });
  def("bitnie", function(num) {
    return ~aexpr(num);
  });


  def(["przesu\u0144arytmetyczniewlewo", "pawl"], function(num1, num2) {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >> -num2;
  });

  def(["przesu\u0144logiczniewlewo", "plwl"], function(num1, num2) {
    num1 = truncate(aexpr(num1));
    num2 = truncate(aexpr(num2));
    return num2 >= 0 ? num1 << num2 : num1 >>> -num2;
  });


  //----------------------------------------------------------------------
  //
  // 5. Logical Operations
  //
  //----------------------------------------------------------------------

  def("prawda", function() { return 1; });
  def("fa\u0142sz", function() { return 0; });

  def("i", function(a, b) {
    return [].every.call(arguments, function(f) { return f(); }) ? 1 : 0;
  }, {noeval: true});

  def("lub", function(a, b) {
    return [].some.call(arguments, function(f) { return f(); }) ? 1 : 0;
  }, {noeval: true});

  def("albo", function(a, b) {
    return mapreduce(arguments, aexpr,
                     function(a, b) { return Boolean(a) !== Boolean(b); }, 0) ? 1 : 0;
  });
  def("nie", function(a) {
    return !aexpr(a) ? 1 : 0;
  });

  //----------------------------------------------------------------------
  //
  // 6. Graphics
  //
  //----------------------------------------------------------------------
  // 6.1 Turtle Motion

  def(["naprz\u00F3d", "np"], function(a) { turtle.move(aexpr(a)); });
  def(["wstecz", "ws"], function(a) { turtle.move(-aexpr(a)); });
  def(["lewo", "lw"], function(a) { turtle.turn(-aexpr(a)); });
  def(["prawo", "pw"], function(a) { turtle.turn(aexpr(a)); });

  // Left arrow:
  def(["\u2190"], function() { turtle.turn(-15); });
  // Right arrow:
  def(["\u2192"], function() { turtle.turn(-15); });
  // Up arrow:
  def(["\u2191"], function() { turtle.move(10); });
  // Down arrow:
  def(["\u2193"], function() { turtle.turn(-10); });


  def(["ustalpoz", "napoz"], function(l) {
    l = lexpr(l);
    if (l.length !== 2) { throw new Error(__("Oczekiwano listy o d\u0142ugo\u015Bci 2")); }
    turtle.setposition(aexpr(l[0]), aexpr(l[1]));
  });
  def(["ustalpozxy", "nowexy"], function(x, y) { turtle.setposition(aexpr(x), aexpr(y)); });
  def(["ustalx", "nowex"], function(x) { turtle.setposition(aexpr(x), undefined); }); // TODO: Replace with ...?
  def(["ustaly", "nowey"], function(y) { turtle.setposition(undefined, aexpr(y)); });
  def(["ustalkierunek", "skieruj"], function(a) { turtle.setheading(aexpr(a)); });

  def("wr\u00F3\u0107", function() { turtle.home(); });

  def("arc", function(angle, radius) { turtle.arc(aexpr(angle), aexpr(radius)); });

  //
  // 6.2 Turtle Motion Queries
  //

  def("poz", function() { var l = turtle.getxy(); return [l[0], l[1]]; });
  def("pozx", function() { var l = turtle.getxy(); return l[0]; });
  def("pozy", function() { var l = turtle.getxy(); return l[1]; });
  def("kierunek", function() { return turtle.getheading(); });
  def("azymut", function(l) {
    l = lexpr(l);
    if (l.length !== 2) { throw new Error(__("Oczekiwano listy o d\u0142ugo\u015Bci 2")); }
    return turtle.towards(aexpr(l[0]), aexpr(l[1]));
  });

  // Not Supported: scrunch

  //
  // 6.3 Turtle and Window Control
  //

  def(["poka\u017Cmnie", "p\u017C"], function() { turtle.showturtle(); });
  def(["schowajmnie", "s\u017C"], function() { turtle.hideturtle(); });
  def("czy\u015B\u0107", function() { turtle.clear(); });
  def(["czy\u015B\u0107ekran", "cs"], function() { turtle.clearscreen(); });

  def("sklej", function() { turtle.setturtlemode('wrap'); });
  def("okno", function() { turtle.setturtlemode('window'); });
  def("p\u0142ot", function() { turtle.setturtlemode('fence'); });

  def(["zamaluj", "zam"], function() { turtle.fill(); });

  def("wype\u0142nij", function(fillcolor, statements) {
    fillcolor = sexpr(fillcolor);
    statements = reparse(lexpr(statements));
    turtle.beginpath();
    try {
      self.execute(statements);
    } finally {
      turtle.fillpath(fillcolor);
    }
  });

  def("wpisztekst", function(a) {
    var s = [].map.call(arguments, stringify_nodecorate).join(" ");
    turtle.drawtext(s);
  });

  def("ustalwysoko\u015B\u0107tekstu", function(a) { turtle.setfontsize(aexpr(a)); });

  // Not Supported: textscreen
  // Not Supported: fullscreen
  // Not Supported: splitscreen
  // Not Supported: setscrunch
  // Not Supported: refresh
  // Not Supported: norefresh

  //
  // 6.4 Turtle and Window Queries
  //

  def(["widocznyp", "widoczny?"], function() {
    return turtle.isturtlevisible() ? 1 : 0;
  });

  // Not Supported: screenmode

  def("tryb\u017C\u00F3\u0142wia", function() {
    return turtle.getturtlemode().toUpperCase();
  });

  def("rozmiartekstu", function() {
    return [turtle.getfontsize(), turtle.getfontsize()];
  });

  //
  // 6.5 Pen and Background Control
  //
  def(["opu\u015B\u0107", "opu"], function() { turtle.pendown(); });
  def(["podnie\u015B", "pod"], function() { turtle.penup(); });

  def(["pisanie", "pis"], function() { turtle.setpenmode('paint'); });
  def(["\u015Bcieranie", "\u015Bcier"], function() { turtle.setpenmode('erase'); });
  def(["odwracanie", "odwr"], function() { turtle.setpenmode('reverse'); });

  def(["ustalkolpis", "ukp", "ustalkolor", "ukm"], function(color) {
    function adjust(n) {
      // Clamp into 0...99
      n = Math.min(99, Math.max(0, Math.floor(n)));
      // Scale to 0...255
      return Math.floor(n * 255 / 99);
    }
    if (Type(color) === 'list') {
      var r = adjust(aexpr(color[0]));
      var g = adjust(aexpr(color[1]));
      var b = adjust(aexpr(color[2]));
      var rr = (r < 16 ? "0" : "") + r.toString(16);
      var gg = (g < 16 ? "0" : "") + g.toString(16);
      var bb = (b < 16 ? "0" : "") + b.toString(16);
      turtle.setcolor('#' + rr + gg + bb);
    } else {
      turtle.setcolor(sexpr(color));
    }
  });

  // Not Supported: setpallete

  def(["ustalrozmiarpisaka", "ustalszeroko\u015B\u0107", "ustalgrubo\u015B\u0107", "ugp"], function(a) {
    if (Type(a) === 'list') {
      turtle.setwidth(aexpr(a[0]));
    } else {
      turtle.setwidth(aexpr(a));
    }
  });

  // Not Supported: setpenpattern
  // Not Supported: setpen
  // Not Supported: setbackground

  //
  // 6.6 Pen Queries
  //

  def(["opuszczonyp", "opuszczony?"], function() {
    return turtle.ispendown() ? 1 : 0;
  });

  def("trybpis", function() {
    return turtle.getpenmode().toUpperCase();
  });

  def(["kolpis", "kp"], function() {
    return turtle.getcolor();
  });

  // Not Supported: palette

  def("rozmiarpis", function() {
    return [turtle.getwidth(), turtle.getwidth()];
  });

  // Not Supported: pen
  // Not Supported: background

  // 6.7 Saving and Loading Pictures

  // Not Supported: savepict
  // Not Supported: loadpict
  // Not Supported: epspict

  // 6.8 Mouse Queries

  // Not Supported: mousepos
  // Not Supported: clickpos
  // Not Supported: buttonp
  // Not Supported: button

  //----------------------------------------------------------------------
  //
  // 7. Workspace Management
  //
  //----------------------------------------------------------------------
  // 7.1 Procedure Definition

  def("kopiujdef", function(newname, oldname) {

    newname = sexpr(newname);
    oldname = sexpr(oldname);

    if (!self.routines.has(oldname)) {
      throw new Error(format(__("Nic nie wiadomo na temat: {name:U}"), { name: oldname }));
    }

    if (self.routines.has(newname)) {
      if (self.routines.get(newname).special) {
        throw new Error(format(__("Nie mo\u017Cna nadpisa\u0107 specjalnej postaci {name:U}"), { name: newname }));
      }
      if (self.routines.get(newname).primitive && !maybegetvar("redefp")) {
        throw new Error(__("Nie mo\u017Cna nadpisa\u0107 wyra\u017Cenia pierwotnego chyba PRZEDEFP jest PRAWD\u0104"));
      }
    }

    self.routines.set(newname, self.routines.get(oldname));
    if (savehook) {
      // TODO: This is broken if copying a built-in, so disable for now
      //savehook(newname, self.definition(newname, self.routines.get(newname)));
    }
  });


  // 7.2 Variable Definition

  def(["przypisz", "przyp"], function(varname, value) {
    setvar(sexpr(varname), value);
  });

  def("nazwij", function(value, varname) {
    setvar(sexpr(varname), value);
  });

  def("lokalna", function(varname) {
    var localscope = self.scopes[self.scopes.length - 1];
    [].forEach.call(arguments, function(name) { localscope.set(sexpr(name), {value: undefined}); });
  });

  def("tw\u00F3rzlokaln\u0105", function(varname, value) {
    var localscope = self.scopes[self.scopes.length - 1];
    localscope.set(sexpr(varname), {value: value});
  });

  def("niech", function(varname) {
    return getvar(sexpr(varname));
  });

  def("globalna", function(varname) {
    var globalscope = self.scopes[0];
    [].forEach.call(arguments,
                    function(name) { globalscope.set(sexpr(name), {value: undefined}); });
  });

  //
  // 7.3 Property Lists
  //

  def("przyw\u0142a\u015B\u0107", function(plistname, propname, value) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = self.plists.get(plistname);
    if (!plist) {
      plist = new StringMap(true);
      self.plists.set(plistname, plist);
    }
    plist.set(propname, value);
  });

  def("lw\u0142", function(plistname, propname) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = self.plists.get(plistname);
    if (!plist || !plist.has(propname)) {
      return [];
    }
    return plist.get(propname);
  });

  def("usw\u0142a\u015B", function(plistname, propname) {
    plistname = sexpr(plistname);
    propname = sexpr(propname);
    var plist = self.plists.get(plistname);
    if (plist) {
      plist['delete'](propname);
      if (plist.empty()) {
        // TODO: Do this? Loses state, e.g. unburies if buried
        self.plists['delete'](plistname);
      }
    }
  });

  def("w\u0142a\u015Bciwo\u015B\u0107", function(plistname) {
    plistname = sexpr(plistname);
    var plist = self.plists.get(plistname);
    if (!plist) {
      return [];
    }

    var result = [];
    plist.forEach(function (key, value) {
      result.push(key);
      result.push(copy(value));
    });
    return result;
  });

  //
  // 7.4 Workspace Predicates
  //

  def(["procedurap", "procedura?"], function(name) {
    name = sexpr(name);
    return self.routines.has(name) ? 1 : 0;
  });

  def(["pierwotnep", "pierwotne?"], function(name) {
    name = sexpr(name);
    return (self.routines.has(name) &&
            self.routines.get(name).primitive) ? 1 : 0;
  });

  def(["okre\u015Blonep", "okre\u015Blone?"], function(name) {
    name = sexpr(name);
    return (self.routines.has(name) &&
            !self.routines.get(name).primitive) ? 1 : 0;
  });

  def(["zmiennap", "zmienna?"], function(varname) {
    try {
      return getvar(sexpr(varname)) !== undefined ? 1 : 0;
    } catch (e) {
      return 0;
    }
  });

  def(["w\u0142p", "w\u0142?"], function(plistname) {
    plistname = sexpr(plistname);
    return self.plists.has(plistname) ? 1 : 0;
  });

  //
  // 7.5 Workspace Queries
  //

  def("zawarto\u015Bci", function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && !self.routines.get(x).buried; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return !scope.get(x).buried; })); },
        []),
      self.plists.keys().filter(function(x) { return !self.plists.get(x).buried; })
    ];
  });

  def("pochowane", function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && self.routines.get(x).buried; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).buried; })); },
        []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).buried; })
    ];
  });

  def("\u015Bledzone", function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && self.routines.get(x).traced; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).traced; })); },
        []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).traced; })
    ];
  });

  def(["krocz\u0105ce"], function() {
    return [
      self.routines.keys().filter(function(x) {
        return !self.routines.get(x).primitive && self.routines.get(x).stepped; }),
      self.scopes.reduce(
        function(list, scope) {
          return list.concat(scope.keys().filter(function(x) { return scope.get(x).stepped; })); },
        []),
      self.plists.keys().filter(function(x) { return self.plists.get(x).stepped; })
    ];
  });

  def("procedury", function() {
    return self.routines.keys().filter(function(x) {
      return !self.routines.get(x).primitive && !self.routines.get(x).buried;
    });
  });

  def("pierwotne", function() {
    return self.routines.keys().filter(function(x) {
      return self.routines.get(x).primitive & !self.routines.get(x).buried;
    });
  });

  def("globalne", function() {
    var globalscope = self.scopes[0];
    return globalscope.keys().filter(function (x) {
      return !globalscope.get(x).buried;
    });
  });

  def("nazwy", function() {
    return [
      [],
      self.scopes.reduce(function(list, scope) {
        return list.concat(scope.keys().filter(function(x) {
          return !scope.get(x).buried; })); }, [])
    ];
  });

  def("w\u0142a\u015Bciwo\u015Bci", function() {
    return [
      [],
      [],
      self.plists.keys().filter(function(x) {
        return !self.plists.get(x).buried; })
    ];
  });

  def("listanazw", function(varname) {
    if (Type(varname) === 'list') {
      varname = lexpr(varname);
    } else {
      varname = [sexpr(varname)];
    }
    return [[], varname];
  });

  def("listaw\u0142", function(plname) {
    if (Type(plname) === 'list') {
      plname = lexpr(plname);
    } else {
      plname = [sexpr(plname)];
    }
    return [[], [], plname];
  });


  // Not Supported: arity
  // Not Supported: nodes

  // 7.6 Workspace Inspection

  //
  // 7.7 Workspace Control
  //

  def(["wyma\u017C", "w\u017C"], function(list) {
    list = lexpr(list);

    // Delete procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (self.routines.has(name)) {
          if (self.routines.get(name).special) {
            throw new Error(format(__("Nie mo\u017Cna wymaza\u0107 specjalnej postaci {name:U}"), { name: name }));
          }
          if (!self.routines.get(name).primitive || maybegetvar("redefp")) {
            self.routines['delete'](name);
            if (savehook) savehook(name);
          } else {
            throw new Error(__("Nie mo\u017Cna wymaza\u0107 wyra\u017Cenia pierwotnego chyba \u017Ce PRZEDEFP jest PRAWD\u0104"));
          }
        }
      });
    }

    // Delete variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          scope['delete'](name);
        });
      });
    }

    // Delete property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        self.plists['delete'](name);
      });
    }
  });

  // TODO: lots of redundant logic here -- clean this up
  def(["usu\u0144wszystko", "usw"], function() {
    self.routines.keys().filter(function(x) {
      return !self.routines.get(x).primitive && !self.routines.get(x).buried;
    }).forEach(function(name) {
      self.routines['delete'](name);
      if (savehook) savehook(name);
    });

    self.scopes.forEach(function(scope) {
      scope.keys().filter(function(x) {
        return !scope.get(x).buried;
      }).forEach(function(name) {
        scope['delete'](name);
      });
    });

    self.plists.keys().filter(function(x) {
      return !self.plists.get(x).buried;
    }).forEach(function (name) {
      self.plists['delete'](name);
    });
  });

  def("w\u017Cproc", function() {
    self.routines.keys().filter(function(x) {
      return !self.routines.get(x).primitive && !self.routines.get(x).buried;
    }).forEach(function(name) {
      self.routines['delete'](name);
      if (savehook) savehook(name);
    });
  });

  def("w\u017Cnazwy", function() {
    self.scopes.forEach(function(scope) {
      scope.keys().filter(function(x) {
        return !scope.get(x).buried;
      }).forEach(function(name) {
        scope['delete'](name);
      });
    });
  });

  def("w\u017Cw\u0142", function() {
    self.plists.keys().filter(function(x) {
      return !self.plists.get(x).buried;
    }).forEach(function (key) {
      self.plists['delete'](key);
    });
  });

  def("w\u017Clistanazw", function(varname) {
    var varnamelist;
    if (Type(varname) === 'list') {
      varnamelist = lexpr(varname);
    } else {
      varnamelist = [sexpr(varname)];
    }

    self.scopes.forEach(function(scope) {
      varnamelist.forEach(function(name) {
        name = sexpr(name);
        scope['delete'](name);
      });
    });
  });

  def("w\u017Clistaw\u0142", function(plname) {
    var plnamelist;
    if (Type(plname) === 'list') {
      plnamelist = lexpr(plname);
    } else {
      plnamelist = [sexpr(plname)];
    }

    plnamelist.forEach(function(name) {
      name = sexpr(name);
      self.plists['delete'](name);
    });
  });

  def("pochowaj", function(list) {
    list = lexpr(list);

    // Bury procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (self.routines.has(name)) {
          self.routines.get(name).buried = true;
        }
      });
    }

    // Bury variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          if (scope.has(name)) {
            scope.get(name).buried = true;
          }
        });
      });
    }

    // Bury property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        if (self.plists.has(name)) {
          self.plists.get(name).buried = true;
        }
      });
    }
  });

  def("pochowajwszystko", function() {
    self.routines.forEach(function(name, proc) {
      proc.buried = true;
    });

    self.scopes.forEach(function(scope) {
      scope.forEach(function(name, entry) {
        entry.buried = true;
      });
    });

    self.plists.forEach(function(name, entry) {
      entry.buried = true;
    });
  });

  // Not Supported: buryname

  def("odgrzeb", function(list) {
    list = lexpr(list);

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      procs.forEach(function(name) {
        name = sexpr(name);
        if (self.routines.has(name)) {
          self.routines.get(name).buried = false;
        }
      });
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      // TODO: global only?
      self.scopes.forEach(function(scope) {
        vars.forEach(function(name) {
          name = sexpr(name);
          if (scope.has(name)) {
            scope.get(name).buried = false;
          }
        });
      });
    }

    // Property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      plists.forEach(function(name) {
        name = sexpr(name);
        if (self.plists.has(name)) {
          self.plists.get(name).buried = false;
        }
      });
    }
  });

  def("odgrzebwszystko", function() {
    self.routines.forEach(function(name, proc) {
      proc.buried = false;
    });

    self.scopes.forEach(function(scope) {
      scope.forEach(function(name, entry) {
        entry.buried = false;
      });
    });

    self.plists.forEach(function(name, entry) {
      entry.buried = false;
    });
  });

  // Not Supported: unburyname

  def(["pochowanyp", "pochowany?"], function(list) {
    list = lexpr(list);
    var name;

    // Procedures
    if (list.length) {
      var procs = lexpr(list.shift());
      if (procs.length) {
        name = sexpr(procs[0]);
        return (self.routines.has(name) && self.routines.get(name).buried) ? 1 : 0;
      }
    }

    // Variables
    if (list.length) {
      var vars = lexpr(list.shift());
      if (vars.length) {
        name = sexpr(vars[0]);
        // TODO: global only?
        return (self.scopes[0].has(name) && self.scopes[0].get(name).buried) ? 1 : 0;
      }
    }

    // Property lists
    if (list.length) {
      var plists = lexpr(list.shift());
      if (plists.length) {
        name = sexpr(plists[0]);
        return (self.plists.has(name) && self.plists.get(name).buried) ? 1 : 0;
      }
    }

    return 0;
  });

  //----------------------------------------------------------------------
  //
  // 8. Control Structures
  //
  //----------------------------------------------------------------------

  //
  // 8.1 Control
  //


  def("zapu\u015B\u0107", function(statements) {
    statements = reparse(lexpr(statements));
    return self.execute(statements);
  });

  def("zapu\u015B\u0107raportuj", function(statements) {
    statements = reparse(lexpr(statements));
    var result = self.execute(statements, {returnResult: true});
    if (result !== undefined) {
      return [result];
    } else {
      return [];
    }
  });

  def("powt\u00F3rz", function(count, statements) {
    count = aexpr(count);
    statements = reparse(lexpr(statements));
    for (var i = 1; i <= count; ++i) {
      var old_repcount = self.repcount;
      self.repcount = i;
      try {
        self.execute(statements);
      } finally {
        self.repcount = old_repcount;
      }
    }
  });

  def("p\u0119tla", function(statements) {
    statements = reparse(lexpr(statements));
    for (var i = 1; true; ++i) {
      var old_repcount = self.repcount;
      self.repcount = i;
      try {
        self.execute(statements);
      } finally {
        self.repcount = old_repcount;
      }
    }
  });

  def(["numpow", "npw"], function() {
    return self.repcount;
  });

  def("je\u015Bli", function(test, statements) {
    test = aexpr(test);
    statements = reparse(lexpr(statements));

    if (test) { self.execute(statements); }
  });

  def("je\u015Bliinaczej", function(test, statements1, statements2) {
    test = aexpr(test);
    statements1 = reparse(lexpr(statements1));
    statements2 = reparse(lexpr(statements2));

    self.execute(test ? statements1 : statements2);
  });

  def("test", function(tf) {
    tf = aexpr(tf);
    // NOTE: A property on the scope, not within the scope
    self.scopes[self.scopes.length - 1]._test = tf;
  });

  def(["je\u015Blitak", "je\u015Blit"], function(statements) {
    statements = reparse(lexpr(statements));
    var tf = self.scopes[self.scopes.length - 1]._test;
    if (tf) { self.execute(statements); }
  });

  def(["je\u015Blinie", "je\u015Blin"], function(statements) {
    statements = reparse(lexpr(statements));
    var tf = self.scopes[self.scopes.length - 1]._test;
    if (!tf) { self.execute(statements); }
  });

  def("stopmnie", function() {
    throw new Output();
  });

  def(["wynik", "wy"], function(atom) {
    throw new Output(atom);
  });

  // TODO: catch
  // TODO: throw
  // TODO: error
  // Not Supported: pause
  // Not Supported: continue
  // Not Supported: wait

  def("do\u015B\u0107", function() {
    throw new Bye();
  });

  def(".mo\u017Cewynik", function(value) {
    if (value !== undefined) {
      throw new Output(value);
    } else {
      throw new Output();
    }
  });

  // Not Supported: goto
  // Not Supported: tag

  def("ignoruj", function(value) {
  });

  // Not Supported: `

  def("dla", function(control, statements) {
    control = reparse(lexpr(control));
    statements = reparse(lexpr(statements));

    function sign(x) { return x < 0 ? -1 : x > 0 ? 1 : 0; }

    var varname = sexpr(control.shift());
    var start = aexpr(evaluateExpression(control));
    var limit = aexpr(evaluateExpression(control));

    var step;
    var current = start;
    while (sign(current - limit) !== sign(step)) {
      setvar(varname, current);
      self.execute(statements);

      step = (control.length) ?
        aexpr(evaluateExpression(control.slice())) : sign(limit - start);
      current += step;
    }
  });

  function checkevalblock(block) {
    block = block();
    if (Type(block) === 'list') { return block; }
    throw new Error(__("Oczekiwano bloku"));
  }

  def("wykonuj.dop\u00F3ki", function(block, tf) {
    block = checkevalblock(block);

    do {
      self.execute(block);
    } while (tf());
  }, {noeval: true});

  def("dop\u00F3ki", function(tf, block) {
    block = checkevalblock(block);

    while (tf()) {
      self.execute(block);
    }
  }, {noeval: true});

  def("wykonuj.dop\u00F3kinie", function(block, tf) {
    block = checkevalblock(block);

    do {
      self.execute(block);
    } while (!tf());
  }, {noeval: true});

  def("dop\u00F3kinie", function(tf, block) {
    block = checkevalblock(block);

    while (!tf()) {
      self.execute(block);
    }
  }, {noeval: true});

  def("wybierz", function(value, clauses) {
    clauses = lexpr(clauses);

    for (var i = 0; i < clauses.length; ++i) {
      var clause = lexpr(clauses[i]);
      var first = clause.shift();
      if (Type(first) === 'word' && first.toUpperCase() === 'INACZEJ') {
        return evaluateExpression(clause);
      }
      if (lexpr(first).some(function(x) { return equal(x, value); })) {
        return evaluateExpression(clause);
      }
    }
    return undefined;
  });

  def("warunki", function(clauses) {
    clauses = lexpr(clauses);

    for (var i = 0; i < clauses.length; ++i) {
      var clause = lexpr(clauses[i]);
      var first = clause.shift();
      if (Type(first) === 'word' && first.toUpperCase() === 'INACZEJ') {
        return evaluateExpression(clause);
      }
      if (evaluateExpression(lexpr(first))) {
        return evaluateExpression(clause);
      }
    }
    return undefined;
  });

  //
  // 8.2 Template-based Iteration
  //


  //
  // Higher order functions
  //

  // TODO: multiple inputs

  def("odnie\u015B", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Nie wiadomo nic na temat: {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Nie mo\u017Cna zastosowa\u0107 {proc} do specjalnej nazwy {name:U}"),
                             { proc: "APPLY", name: procname }));
    }

    return routine.apply(null, lexpr(list));
  });

  def("odwo\u0142aj", function(procname, input1) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Nie wiadomo nic na temat: {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Nie mo\u017Cna zastosowa\u0107 {proc} do specjalnej nazwy {name:U}"),
                             { proc: "INVOKE", name: procname }));
    }

    var args = [];
    for (var i = 1; i < arguments.length; i += 1) {
      args.push(arguments[i]);
    }

    return routine.apply(null, args);
  });

  def("dlaka\u017Cdego", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Nie wiadomo nic na temat: {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Nie mo\u017Cna zastosowa\u0107 {proc} do specjalnej nazwy {name:U}"),
                             { proc: "FOREACH", name: procname }));
    }

    lexpr(list).forEach(function(n) { return routine(n); });
  });


  def("mapa", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Nie wiadomo nic na temat: {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Nie mo\u017Cna zastosowa\u0107 {proc} do specjalnej nazwy {name:U}"),
                             { proc: "MAP", name: procname }));
    }

    return lexpr(list).map(routine);
  });

  // Not Supported: map.se

  def("filtr", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Nie wiadomo nic na temat: {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Nie mo\u017Cna zastosowa\u0107 {proc} do specjalnej nazwy {name:U}"),
                             { proc: "FILTER", name: procname }));
    }

    return lexpr(list).filter(function(x) { return routine(x); });
  });

  def("znajd\u017A", function(procname, list) {
    procname = sexpr(procname);

    var routine = self.routines.get(procname);
    if (!routine) {
      throw new Error(format(__("Nie wiadomo nic na temat: {name:U}"), { name: procname }));
    }
    if (routine.special || routine.noeval) {
      throw new Error(format(__("Nie mo\u017Cna zastosowa\u0107 {proc} do specjalnej nazwy {name:U}"),
                             { proc: "FIND", name: procname }));
    }

    list = lexpr(list);
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (routine(item)) {
        return item;
      }
    }
    return [];
  });

  def("skr\u00F3\u0107", function(procname, list) {
    procname = sexpr(procname);
    list = lexpr(list);
    var value = arguments[2] !== undefined ? arguments[2] : list.shift();

    var procedure = self.routines.get(procname);
    if (!procedure) {
      throw new Error(format(__("Nie wiadomo nic na temat: {name:U}"), { name: procname }));
    }
    if (procedure.special || procedure.noeval) {
      throw new Error(format(__("Nie mo\u017Cna zastosowa\u0107 {proc} do specjalnej nazwy {name:U}"),
                             { proc: "REDUCE", name: procname }));
    }

    // NOTE: Can't use procedure directly as reduce calls
    // targets w/ additional args and defaults initial value to undefined
    return list.reduce(function(a, b) { return procedure(a, b); }, value);
  });

  // Not Supported: crossmap
  // Not Supported: cascade
  // Not Supported: cascade.2
  // Not Supported: transfer
}