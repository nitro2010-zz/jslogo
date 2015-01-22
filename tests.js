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

var canvas_element = document.getElementById("sandbox"), canvas_ctx;
var turtle_element = document.getElementById("turtle"), turtle_ctx;

module("Logo - Testy Jednostkowe", {
  setup: function() {

    // TODO: Replace with mock
    canvas_ctx = canvas_ctx || canvas_element.getContext('2d');
    turtle_ctx = turtle_ctx || turtle_element.getContext('2d');

    this.turtle = new CanvasTurtle(
      canvas_ctx,
      turtle_ctx,
      canvas_element.width, canvas_element.height);

    this.stream = {
      inputbuffer: "",

      read: function(prompt) {
        this.last_prompt = prompt;
        var res = this.inputbuffer;
        this.inputbuffer = "";
        return res;
      },

      outputbuffer: "",

      write: function() {
        for (var i = 0; i < arguments.length; i += 1) {
          this.outputbuffer += arguments[i];
        }
      },

      clear: function() {
        this.outputbuffer = "";
        this.last_prompt = undefined;
      }
    };

    this.interpreter = new LogoInterpreter(this.turtle, this.stream);

    var EPSILON = 1e-12;

    this.assert_equals = function (expression, expected) {
      var actual = this.interpreter.run(expression, {returnResult: true});
      if (typeof expected === 'object') {
        deepEqual(actual, expected, expression);
      } else if (typeof expected === 'number' && typeof actual === 'number') {
        ok(Math.abs(actual - expected) < EPSILON, expression);
      } else {
        strictEqual(actual, expected, expression);
      }
    };

    this.assert_stream = function (expression, expected) {
      this.stream.clear();
      this.interpreter.run(expression, {returnResult: true});
      var actual = this.stream.outputbuffer;
      this.stream.clear();
      equal(actual, expected, expression);
    };

    this.assert_prompt = function (expression, expected) {
      this.stream.clear();
      this.interpreter.run(expression, {returnResult: true});
      var actual = this.stream.last_prompt;
      this.stream.clear();
      equal(actual, expected, expression);
    };

    this.assert_predicate = function(expression, predicate) {
      ok(predicate(this.interpreter.run(expression, {returnResult: true})), expression);
    };

    this.assert_error = function(expression, expected) {
      raises(
        function() {
          this.interpreter.run(expression);
        }.bind(this),
        function(e) {
          if (e.message !== expected) {
            console.log("niepasujący: ", e.message, expected);
          }
          return e.message === expected;
        },
        expression
      );
    };
  }
});

test("Parser", function () {

  //
  // Types
  //

  this.assert_equals('"test', 'test');
  this.assert_equals('1', 1);
  this.assert_equals('[ a b c ]', ["a", "b", "c"]);
  this.assert_equals('[ 1 2 3 ]', ["1", "2", "3"]);
  this.assert_equals('[ 1 -2 3 ]', ["1", "-2", "3"]);
  this.assert_equals('[ 1-2 3 ]', ["1-2", "3"]);
  this.assert_equals('[ 1 2 [ 3 ] 4 *5 ]', ["1", "2", [ "3" ], "4", "*5"]);

  //
  // Unary Minus
  //

  this.assert_equals('-4', -4); // unary
  this.assert_equals('- 4 + 10', 6); // unary
  this.assert_equals('10 + - 4', 6); // unary
  this.assert_equals('(-4)', -4); // unary
  this.assert_equals('przypisz "t 10 -4 :t', 10); // unary - the -4 is a statement
  this.assert_equals('przypisz "t 10 - 4 :t', 6); // infix
  this.assert_equals('przypisz "t 10-4 :t', 6); // infix
  this.assert_equals('przypisz "t 10- 4 :t', 6); // infix
  this.assert_equals('suma 10 -4', 6); // unary
  this.assert_error('suma 10 - 4', 'Nieoczekiwany koniec instrukcji'); // infix - should error
  this.assert_equals('suma 10 (-4)', 6); // unary
  this.assert_equals('suma 10 ( -4 )', 6); // unary
  this.assert_equals('suma 10 ( - 4 )', 6); // unary
  this.assert_equals('suma 10 (- 4)', 6); // unary

  //
  // Case insensitive
  //

  this.assert_equals('przypisz "t 1 :t', 1);
  this.assert_equals('PRZYPISZ "t 1 :t', 1);
  this.assert_equals('przyPISZ "t 1 :t', 1);

  this.assert_equals('przypisz "t 2 :t', 2);
  this.assert_equals('przypisz "T 3 :t', 3);
  this.assert_equals('przypisz "t 4 :T', 4);
  this.assert_equals('przypisz "T 5 :T', 5);

  this.assert_equals('oto foo wynik 6 już  foo', 6);
  this.assert_equals('oto FOO wynik 7 już  foo', 7);
  this.assert_equals('oto foo wynik 8 już  FOO', 8);
  this.assert_equals('oto FOO wynik 9 już  FOO', 9);

  //
  // Lists
  //

  this.assert_stream('pisz [ Hello World ]', 'Hello World\n');

  //
  // Numbers
  //

  this.assert_stream('wpisz .2 + .3', '0.5');

  //
  // Arrays
  //

  this.assert_equals('długość { a b c }', 3);
  this.assert_equals('długość { a b c }@0', 3);
  this.assert_equals('długość { a b c }@123', 3);
  this.assert_equals('długość { a b c } @ 0', 3);
  this.assert_error('przypisz "a długość { 1 2 3 }@1.5', "Nie wiadomo co zrobić z: 0.5");

  //
  // Nested Structures
  //

  this.assert_equals('długość [ a b [ c d e ] f ]', 4);
  this.assert_equals('długość { a b { c d e } f }', 4);
  this.assert_equals('długość { a b [ c d e ] f }', 4);
  this.assert_equals('długość [ a b { c d e } f ]', 4);
});


test("Wbudowane Struktury Danych", function () {

  //
  // 2.1 Constructors
  //

  this.assert_equals('słowo "hello "world', 'helloworld');
  this.assert_equals('(słowo "a "b "c)', 'abc');
  this.assert_equals('(słowo)', '');

  this.assert_equals('lista 1 2', [1, 2]);
  this.assert_equals('(lista 1 2 3)', [1, 2, 3]);

  this.assert_stream('przypisz "a (tablica 5 0) ' +
                     'powtórz 5 [ ustawelement numpow-1 :a numpow*numpow ] ' +
                     'pokaż :a', '{1 4 9 16 25}@0\n');
  this.assert_stream('przypisz "a { 1 2 3 } ' +
                     'pokaż :a', '{1 2 3}\n');
  this.assert_stream('przypisz "a { 1 2 3 } @ 10' +
                     'pokaż :a', '{1 2 3}@10\n');

  this.assert_stream('pokaż (listadotablicy [ 1 2 3 ])', '{1 2 3}\n');
  this.assert_stream('pokaż (listadotablicy [ 1 2 3 ] 0)', '{1 2 3}@0\n');

  this.assert_equals('tablicadolisty {1 2 3}', ['1', '2', '3']);
  this.assert_equals('tablicadolisty {1 2 3}@0', ['1', '2', '3']);

  this.assert_equals('zdanie 1 2', [1, 2]);
  this.assert_equals('zd 1 2', [1, 2]);
  this.assert_equals('(zdanie 1)', [1]);
  this.assert_equals('(zdanie 1 2 3)', [1, 2, 3]);
  this.assert_equals('zdanie [a] [b]', ["a", "b"]);
  this.assert_equals('zdanie [a b] [c d]', ["a", "b", "c", "d"]);
  this.assert_equals('zdanie 1 [2 3]', [1, "2", "3"]);

  this.assert_equals('nap 0 ( lista 1 2 3 )', [0, 1, 2, 3]);
  this.assert_equals('nak 0 ( lista 1 2 3 )', [1, 2, 3, 0]);

  this.assert_equals('połącz "a "b', 'ab');
  this.assert_equals('połącz "a [b]', ["a", "b"]);

  this.assert_equals('wspak [ a b c ]', ["c", "b", "a"]);

  this.assert_equals('generujg <> generujg', 1);

  //
  // 2.2 Data Selectors
  //

  this.assert_equals('pierwszy (lista 1 2 3 )', 1);
  this.assert_equals('pierwsze [ [ 1 2 3 ] [ "a "b "c] ]', ["1", '"a']);
  this.assert_equals('ostatni [ a b c ]', "c");
  this.assert_equals('bezpierw [ a b c ]', ["b", "c"]);
  this.assert_equals('bp [ a b c ]', ["b", "c"]);
  this.assert_equals('bezpierwszych [ [ 1 2 3 ] [ "a "b "c] ]', [["2", "3"], ['"b', '"c']]);
  this.assert_equals('bps [ [ 1 2 3 ] [ "a "b "c] ]', [["2", "3"], ['"b', '"c']]);
  this.assert_equals('bezost  [ a b c ]', ["a", "b"]);
  this.assert_equals('bo [ a b c ]', ["a", "b"]);

  this.assert_equals('pierwszy "123', '1');
  this.assert_equals('ostatni  "123', '3');
  this.assert_equals('pierwszy "abc', 'a');
  this.assert_equals('ostatni  "abc', 'c');
  //assert_equals('bezpierw "123', '23');
  //assert_equals('bezost  "123', '12');

  this.assert_error('element 0 [ a b c ]', 'Indeks poza zakresem');
  this.assert_equals('element 1 [ a b c ]', "a");
  this.assert_equals('element 2 [ a b c ]', "b");
  this.assert_equals('element 3 [ a b c ]', "c");
  this.assert_error('element 4 [ a b c ]', 'Indeks poza zakresem');

  this.assert_error('element 0 { a b c }', 'Indeks poza zakresem');
  this.assert_equals('element 1 { a b c }', "a");
  this.assert_equals('element 2 { a b c }', "b");
  this.assert_equals('element 3 { a b c }', "c");
  this.assert_error('element 4 { a b c }', 'Indeks poza zakresem');

  this.assert_equals('element 0 { a b c }@0', 'a');
  this.assert_equals('element 1 { a b c }@0', 'b');
  this.assert_equals('element 2 { a b c }@0', 'c');
  this.assert_error('element 3 { a b c }@0', 'Indeks poza zakresem');

  this.assert_stream('przypisz "a { a b c } ' +
                     'ustawelement 2 :a "q ' +
                     'pokaż :a', '{a q c}\n');
  this.assert_stream('przypisz "a { a b c }@0 ' +
                     'ustawelement 2 :a "q ' +
                     'pokaż :a', '{a b q}@0\n');


  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('los [ 1 2 3 4 ]', function(x) { return 1 <= x && x <= 4; });
  }
  this.assert_equals('usuń "b [ a b c ]', ["a", "c"]);
  this.assert_equals('usuń "d [ a b c ]', ["a", "b", "c"]);
  this.assert_equals('usuńzdup [ a b c a b c ]', ["a", "b", "c"]);

  //
  // 2.3 Data Mutators
  //

  this.assert_equals('przypisz "s [] powtórz 5 [ umieść "s numpow ] :s', [5, 4, 3, 2, 1]);
  this.assert_equals('przypisz "s [ a b c ] (lista zdejmij "s zdejmij "s zdejmij "s)', ["a", "b", "c"]);
  this.assert_equals('przypisz "q [] powtórz 5 [ dokolejki "q numpow ] :q', [1, 2, 3, 4, 5]);
  this.assert_equals('przypisz "q [ a b c ] (lista zkolejki "q zkolejki "q zkolejki "q)', ["c", "b", "a"]);

  //
  // 2.4 Predicates
  //

  this.assert_equals('słowop "a', 1);
  this.assert_equals('słowop 1', 0);
  this.assert_equals('słowop [ 1 ]', 0);
  this.assert_equals('słowop { 1 }', 0);
  this.assert_equals('słowo? "a', 1);
  this.assert_equals('słowo? 1', 0);
  this.assert_equals('słowo? [ 1 ]', 0);
  this.assert_equals('słowo? { 1 }', 0);

  this.assert_equals('listap "a', 0);
  this.assert_equals('listap 1', 0);
  this.assert_equals('listap [ 1 ]', 1);
  this.assert_equals('listap { 1 }', 0);
  this.assert_equals('lista? "a', 0);
  this.assert_equals('lista? 1', 0);
  this.assert_equals('lista? [ 1 ]', 1);
  this.assert_equals('lista? { 1 }', 0);

  this.assert_equals('tablicap "a', 0);
  this.assert_equals('tablicap 1', 0);
  this.assert_equals('tablicap [ 1 ]', 0);
  this.assert_equals('tablicap { 1 }', 1);
  this.assert_equals('tablica? "a', 0);
  this.assert_equals('tablica? 1', 0);
  this.assert_equals('tablica? [ 1 ]', 0);
  this.assert_equals('tablica? { 1 }', 1);

  this.assert_equals('równep 3 4', 0);
  this.assert_equals('równep 3 3', 1);
  this.assert_equals('równep 3 2', 0);
  this.assert_equals('równe? 3 4', 0);
  this.assert_equals('równe? 3 3', 1);
  this.assert_equals('równe? 3 2', 0);
  this.assert_equals('3 = 4', 0);
  this.assert_equals('3 = 3', 1);
  this.assert_equals('3 = 2', 0);
  this.assert_equals('nierównep 3 4', 1);
  this.assert_equals('nierównep 3 3', 0);
  this.assert_equals('nierównep 3 2', 1);
  this.assert_equals('nierówne? 3 4', 1);
  this.assert_equals('nierówne? 3 3', 0);
  this.assert_equals('nierówne? 3 2', 1);
  this.assert_equals('3 <> 4', 1);
  this.assert_equals('3 <> 3', 0);
  this.assert_equals('3 <> 2', 1);

  this.assert_equals('równep "a "a', 1);
  this.assert_equals('równep "a "b', 0);
  this.assert_equals('"a = "a', 1);
  this.assert_equals('"a = "b', 0);
  this.assert_equals('równep [1 2] [1 2]', 1);
  this.assert_equals('równep [1 2] [1 3]', 0);
  this.assert_equals('[ 1 2 ] = [ 1 2 ]', 1);
  this.assert_equals('[ 1 2 ] = [ 1 3 ]', 0);

  this.assert_equals('równep "a 1', 0);
  this.assert_equals('równep "a [ 1 ]', 0);
  this.assert_equals('równep 1 [ 1 ]', 0);


  this.assert_equals('liczbap "a', 0);
  this.assert_equals('liczbap 1', 1);
  this.assert_equals('liczbap [ 1 ]', 0);
  this.assert_equals('liczbap { 1 }', 0);
  this.assert_equals('liczba? "a', 0);
  this.assert_equals('liczba? 1', 1);
  this.assert_equals('liczba? [ 1 ]', 0);
  this.assert_equals('liczba? { 1 }', 0);

  this.assert_equals('pustep []', 1);
  this.assert_equals('puste? []', 1);
  this.assert_equals('pustep [ 1 ]', 0);
  this.assert_equals('puste? [ 1 ]', 0);
  this.assert_equals('pustep "', 1);
  this.assert_equals('puste? "', 1);
  this.assert_equals('pustep "a', 0);
  this.assert_equals('puste? "a', 0);

  this.assert_equals('pustep {}', 0);

  this.assert_equals('przedp "a "b', 1);
  this.assert_equals('przedp "b "b', 0);
  this.assert_equals('przedp "c "b', 0);
  this.assert_equals('przed? "a "b', 1);
  this.assert_equals('przed? "b "b', 0);
  this.assert_equals('przed? "c "b', 0);

  this.assert_equals('podtekstp "a "abc', 1);
  this.assert_equals('podtekstp "z "abc', 0);
  this.assert_equals('podtekst? "a "abc', 1);
  this.assert_equals('podtekst? "z "abc', 0);

  this.assert_equals('zawiera? "b [ a b c ]', 1);
  this.assert_equals('zawiera? "e [ a b c ]', 0);
  this.assert_equals('zawiera? [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);
  this.assert_equals('element? "b [ a b c ]', 1);
  this.assert_equals('element? "e [ a b c ]', 0);
  this.assert_equals('element? [ "b ] [ [ "a ] [ "b ] [ "c ] ]', 1);

  //
  // 2.5 Queries
  //

  this.assert_equals('długość [ ]', 0);
  this.assert_equals('długość [ 1 ]', 1);
  this.assert_equals('długość [ 1 2 ]', 2);
  this.assert_equals('długość { 1 2 }@0', 2);
  this.assert_equals('długość "', 0);
  this.assert_equals('długość "a', 1);
  this.assert_equals('długość "ab', 2);

  this.assert_equals('ascii "A', 65);
  this.assert_equals('znak 65', 'A');

  this.assert_equals('zmałejlitery "ABcd', 'abcd');
  this.assert_equals('zdużejlitery "ABcd', 'ABCD');
  this.assert_equals('standardowewyjście "whatever', 'whatever');

});


test("Komunikacja", function () {
  expect(22);

  // 3.1 Transmitters

  this.assert_stream('pisz "a', 'a\n');
  this.assert_stream('pisz 1', '1\n');
  this.assert_stream('pisz [ 1 ]', '1\n');
  this.assert_stream('pisz [ 1 [ 2 ] ]', '1 [2]\n');
  this.assert_stream('(pisz "a 1 [ 2 [ 3 ] ])', 'a 1 2 [3]\n');

  this.assert_stream('wpisz "a', 'a');
  this.assert_stream('(wpisz "a 1 [ 2 [ 3 ] ])', 'a12 [3]');

  this.assert_stream('(pisz "hello "world)', "hello world\n");
  this.assert_stream('(wpisz "hello "world)', "helloworld");

  this.assert_stream('pokaż "a', 'a\n');
  this.assert_stream('pokaż 1', '1\n');
  this.assert_stream('pokaż [ 1 ]', '[1]\n');
  this.assert_stream('pokaż [ 1 [ 2 ] ]', '[1 [2]]\n');
  this.assert_stream('(pokaż "a 1 [ 2 [ 3 ] ])', 'a 1 [2 [3]]\n');

  // 3.2 Receivers

  this.stream.inputbuffer = "test";
  this.assert_equals('czytajsłowo', 'test');

  this.stream.inputbuffer = "a b c 1 2 3";
  this.assert_equals('czytajsłowo', 'a b c 1 2 3');

  this.assert_prompt('czytajsłowo', undefined);
  this.assert_prompt('(czytajsłowo "query)', 'query');
  this.assert_prompt('(czytajsłowo "query "extra)', 'query');
  this.assert_prompt('(czytajsłowo [a b c])', 'a b c');

  // 3.3 File Access
  // 3.4 Terminal Access

  this.assert_stream('pisz "a zmażtekst', '');
  this.assert_stream('pisz "a zt', '');

  this.stream.clear();

});


test("Arytmetyka", function () {
  expect(137);

  //
  // 4.1 Numeric Operations
  //

  this.assert_equals('suma 1 2', 3);
  this.assert_equals('(suma 1 2 3 4)', 10);
  this.assert_equals('1 + 2', 3);

  this.assert_equals('"3 + "2', 5);

  this.assert_equals('różnica 3 1', 2);
  this.assert_equals('3 - 1', 2);
  this.assert_equals('ujemny 3 + 4', -(3 + 4));
  this.assert_equals('- 3 + 4', (-3) + 4);
  this.assert_equals('ujemny 3', -3);
  this.assert_equals('- 3', -3);
  this.assert_equals('iloczyn 2 3', 6);
  this.assert_equals('(iloczyn 2 3 4)', 24);
  this.assert_equals('2 * 3', 6);
  this.assert_equals('iloraz 6 2', 3);
  this.assert_equals('(iloraz 2)', 1 / 2);
  this.assert_equals('6 / 2', 3);

  this.assert_equals('reszta 7 4', 3);
  this.assert_equals('reszta 7 -4', 3);
  this.assert_equals('reszta -7 4', -3);
  this.assert_equals('reszta -7 -4', -3);
  this.assert_equals('7 % 4', 3);
  this.assert_equals('7 % -4', 3);
  this.assert_equals('-7 % 4', -3);
  this.assert_equals('-7 % -4', -3);

  this.assert_equals('mod 7 4', 3);
  this.assert_equals('mod 7 -4', -3);
  this.assert_equals('mod -7 4', 3);
  this.assert_equals('mod -7 -4', -3);

  this.assert_equals('abs -1', 1);
  this.assert_equals('abs 0', 0);
  this.assert_equals('abs 1', 1);


  this.assert_equals('int 3.5', 3);
  this.assert_equals('int -3.5', -3);
  this.assert_equals('zaokr 2.4', 2);
  this.assert_equals('zaokr 2.5', 3);
  this.assert_equals('zaokr 2.6', 3);
  this.assert_equals('zaokr -2.4', -2);
  this.assert_equals('zaokr -2.5', -2);
  this.assert_equals('zaokr -2.6', -3);

  this.assert_equals('pwk 9', 3);
  this.assert_equals('potęga 3 2', 9);
  this.assert_equals('3 ^ 2', 9);

  this.assert_equals('exp 2', 7.38905609893065);
  this.assert_equals('log10 100', 2);
  this.assert_equals('ln 9', 2.1972245773362196);

  this.assert_equals('arctg 1', 45);
  this.assert_equals('2*(arctg 0 1)', 180);
  this.assert_equals('sin 30', 0.5);
  this.assert_equals('cos 60', 0.5);
  this.assert_equals('tg 45', 1);

  this.assert_equals('radarctan 1', Math.PI / 4);
  this.assert_equals('2*(radarctan 0 1)', Math.PI);
  this.assert_equals('radsin 0.5235987755982988', 0.5);
  this.assert_equals('radcos 1.0471975511965976', 0.5);
  this.assert_equals('radtan 0.7853981633974483', 1);

  this.assert_equals('isekw 1 4', [1, 2, 3, 4]);
  this.assert_equals('isekw 3 7', [3, 4, 5, 6, 7]);
  this.assert_equals('isekw 7 3', [7, 6, 5, 4, 3]);

  this.assert_equals('rsekw 3 5 9', [3, 3.25, 3.5, 3.75, 4, 4.25, 4.5, 4.75, 5]);
  this.assert_equals('rsekw 3 5 5', [3, 3.5, 4, 4.5, 5]);

  //
  // 4.2 Numeric Predicates
  //

  this.assert_equals('większep 3 4', 0);
  this.assert_equals('większep 3 3', 0);
  this.assert_equals('większep 3 2', 1);
  this.assert_equals('większe? 3 4', 0);
  this.assert_equals('większe? 3 3', 0);
  this.assert_equals('większe? 3 2', 1);
  this.assert_equals('3 > 4', 0);
  this.assert_equals('3 > 3', 0);
  this.assert_equals('3 > 2', 1);
  this.assert_equals('większerównep 3 4', 0);
  this.assert_equals('większerównep 3 3', 1);
  this.assert_equals('większerównep 3 2', 1);
  this.assert_equals('większerówne? 3 4', 0);
  this.assert_equals('większerówne? 3 3', 1);
  this.assert_equals('większerówne? 3 2', 1);
  this.assert_equals('3 >= 4', 0);
  this.assert_equals('3 >= 3', 1);
  this.assert_equals('3 >= 2', 1);
  this.assert_equals('mniejszep 3 4', 1);
  this.assert_equals('mniejszep 3 3', 0);
  this.assert_equals('mniejszep 3 2', 0);
  this.assert_equals('mniejsze? 3 4', 1);
  this.assert_equals('mniejsze? 3 3', 0);
  this.assert_equals('mniejsze? 3 2', 0);
  this.assert_equals('3 < 4', 1);
  this.assert_equals('3 < 3', 0);
  this.assert_equals('3 < 2', 0);
  this.assert_equals('mniejszerównep 3 4', 1);
  this.assert_equals('mniejszerównep 3 3', 1);
  this.assert_equals('mniejszerównep 3 2', 0);
  this.assert_equals('mniejszerówne? 3 4', 1);
  this.assert_equals('mniejszerówne? 3 3', 1);
  this.assert_equals('mniejszerówne? 3 2', 0);
  this.assert_equals('3 <= 4', 1);
  this.assert_equals('3 <= 3', 1);
  this.assert_equals('3 <= 2', 0);

  this.assert_equals('"3 < "22', 1);

  //
  // 4.3 Random Numbers
  //

  for (var i = 0; i < 10; i += 1) {
    this.assert_predicate('losowa 10', function(x) { return 0 <= x && x < 10; });
  }
  this.assert_equals('startlos  przypisz "x losowa 100  startlos  przypisz "y losowa 100  :x - :y', 0);
  this.assert_equals('(startlos 123) przypisz "x losowa 100  (startlos 123)  przypisz "y losowa 100  :x - :y', 0);

  //
  // 4.4 Print Formatting
  //

  this.assert_stream('wpisz postać 123.456 10 0', '       123');
  this.assert_stream('wpisz postać 123.456 10 1', '     123.5'); // note rounding
  this.assert_stream('wpisz postać 123.456 10 2', '    123.46'); // note rounding
  this.assert_stream('wpisz postać 123.456 10 3', '   123.456');
  this.assert_stream('wpisz postać 123.456 10 4', '  123.4560');
  this.assert_stream('wpisz postać 123.456 10 5', ' 123.45600');
  this.assert_stream('wpisz postać 123.456 10 6', '123.456000');
  this.assert_stream('wpisz postać 123.456 10 7', '123.4560000');
  this.assert_stream('wpisz postać 123.456 10 8', '123.45600000');

  //
  // 4.5 Bitwise Operations
  //

  this.assert_equals('biti 1 2', 0);
  this.assert_equals('biti 7 2', 2);
  this.assert_equals('(biti 7 11 15)', 3);

  this.assert_equals('bitlub 1 2', 3);
  this.assert_equals('bitlub 7 2', 7);
  this.assert_equals('(bitlub 1 2 4)', 7);

  this.assert_equals('bitalbo 1 2', 3);
  this.assert_equals('bitalbo 7 2', 5);
  this.assert_equals('(bitalbo 1 2 7)', 4);

  this.assert_equals('bitnie 0', -1);
  this.assert_equals('bitnie -1', 0);
  this.assert_equals('biti (bitnie 123) 123', 0);

  this.assert_equals('przesuńarytmetyczniewlewo 1 2', 4);
  this.assert_equals('przesuńarytmetyczniewlewo 8 -2', 2);
  this.assert_equals('przesuńlogiczniewlewo 1 2', 4);
  this.assert_equals('przesuńlogiczniewlewo 8 -2', 2);

  this.assert_equals('przesuńarytmetyczniewlewo -1024 -1', -512);
  this.assert_equals('przesuńarytmetyczniewlewo -1 -1', -1);
  this.assert_equals('przesuńlogiczniewlewo -1 -1', 0x7fffffff);

});


test("Operacje logiczne", function () {
  expect(29);

  this.assert_equals('prawda', 1);
  this.assert_equals('fałsz', 0);
  this.assert_equals('i 0 0', 0);
  this.assert_equals('i 0 1', 0);
  this.assert_equals('i 1 0', 0);
  this.assert_equals('i 1 1', 1);
  this.assert_equals('(i 0 0 0)', 0);
  this.assert_equals('(i 1 0 1)', 0);
  this.assert_equals('(i 1 1 1)', 1);
  this.assert_equals('lub 0 0', 0);
  this.assert_equals('lub 0 1', 1);
  this.assert_equals('lub 1 0', 1);
  this.assert_equals('lub 1 1', 1);
  this.assert_equals('(lub 0 0 0)', 0);
  this.assert_equals('(lub 1 0 1)', 1);
  this.assert_equals('(lub 1 1 1)', 1);
  this.assert_equals('albo 0 0', 0);
  this.assert_equals('albo 0 1', 1);
  this.assert_equals('albo 1 0', 1);
  this.assert_equals('albo 1 1', 0);
  this.assert_equals('(albo 0 0 0)', 0);
  this.assert_equals('(albo 1 0 1)', 0);
  this.assert_equals('(albo 1 1 1)', 1);
  this.assert_equals('nie 0', 1);
  this.assert_equals('nie 1', 0);

  // short circuits

  this.assert_stream('i 0 (pisz "nope)', '');
  this.assert_stream('lub 1 (pisz "nope)', '');

  this.assert_stream('i 1 (wpisz "yup)', 'yup');
  this.assert_stream('lub 0 (wpisz "yup)', 'yup');

});


test("Grafika", function () {
  expect(69);

  // NOTE: test canvas is 300,300 (so -150...150 coordinates before hitting)
  // edge

  this.interpreter.run('czyśćekran');
  this.assert_equals('czyść wróć (lista kierunek pozx pozy)', [0, 0, 0]);

  //
  // 6.1 Turtle Motion
  //

  this.assert_equals('wróć naprzód 100 poz', [0, 100]);
  this.assert_equals('wróć np 100 poz', [0, 100]);
  this.assert_equals('wróć wstecz 100 poz', [0, -100]);
  this.assert_equals('wróć ws 100 poz', [0, -100]);
  this.assert_equals('wróć lewo 45 kierunek', -45);
  this.assert_equals('wróć lw 45 kierunek', -45);
  this.assert_equals('wróć prawo 45 kierunek', 45);
  this.assert_equals('wróć pw 45 kierunek', 45);

  this.assert_equals('ustalpoz [ 12 34 ] poz', [12, 34]);
  this.assert_equals('ustalpozxy 56 78 poz', [56, 78]);
  this.assert_equals('ustalpozxy 0 0 (lista pozx pozy)', [0, 0]);
  this.assert_equals('ustalx 123 pozx', 123);
  this.assert_equals('ustaly 45 pozy', 45);
  this.assert_equals('ustalkierunek 69 kierunek', 69);
  this.assert_equals('skieruj 13 kierunek', 13);

  this.assert_equals('naprzód 100 pw 90 wróć (lista kierunek pozx pozy)', [0, 0, 0]);

  this.assert_equals('wróć arc 123 456 (lista kierunek pozx pozy)', [0, 0, 0]);

  //
  // 6.2 Turtle Motion Queries
  //

  this.assert_equals('ustalpoz [ 12 34 ] poz', [12, 34]);
  this.assert_equals('ustalx 123 pozx', 123);
  this.assert_equals('ustaly 45 pozy', 45);
  this.assert_equals('ustalkierunek 69 kierunek', 69);
  this.assert_equals('skieruj 69 kierunek', 69);
  this.assert_equals('ustalpozxy -100 -100 azymut [ 0 0 ]', 45);

  //
  // 6.3 Turtle and Window Control
  //

  this.assert_equals('pokażmnie widocznyp', 1);
  this.assert_equals('pż widocznyp', 1);
  this.assert_equals('schowajmnie widocznyp', 0);
  this.assert_equals('sż widocznyp', 0);
  this.assert_equals('ustalpoz [ 12 34 ] czyść poz', [12, 34]);
  this.assert_equals('ustalpoz [ 12 34 ] czyśćekran (lista kierunek pozx pozy)', [0, 0, 0]);
  this.assert_equals('ustalpoz [ 12 34 ] cs (lista kierunek pozx pozy)', [0, 0, 0]);

  this.assert_equals('sklej trybżółwia', 'WRAP');

  this.assert_equals('ustalpozxy 0 0 ustalpozxy 160 160 (lista pozx pozy)', [-140, -140]);

  this.assert_equals('okno trybżółwia', 'WINDOW');
  this.assert_equals('ustalpozxy 0 0 ustalpozxy 160 160 (lista pozx pozy)', [160, 160]);

  this.assert_equals('płot trybżółwia', 'FENCE');
  this.assert_equals('ustalpozxy 0 0 ustalpozxy 160 160 (lista pozx pozy)', [150, 150]);

  this.assert_equals('sklej trybżółwia', 'WRAP');

  this.assert_equals('(wpisztekst "a 1 [ 2 [ 3 ] ])', undefined);
  this.assert_equals('ustalwysokośćtekstu 5 rozmiartekstu', [5, 5]);
  this.assert_equals('ustalwysokośćtekstu 10 rozmiartekstu', [10, 10]);

  //
  // 6.4 Turtle and Window Queries
  //

  this.assert_equals('pokażmnie widocznyp', 1);
  this.assert_equals('schowajmnie widocznyp', 0);

  this.assert_equals('sklej trybżółwia', 'WRAP');
  this.assert_equals('okno trybżółwia', 'WINDOW');
  this.assert_equals('płot trybżółwia', 'FENCE');
  this.assert_equals('sklej trybżółwia', 'WRAP');


  this.assert_equals('ustalwysokośćtekstu 5 rozmiartekstu', [5, 5]);

  //
  // 6.5 Pen and Background Control
  //

  this.assert_equals('opuść opuszczonyp', 1);
  this.assert_equals('podnieś opuszczonyp', 0);
  this.assert_equals('opu opuszczonyp', 1);
  this.assert_equals('pod opuszczonyp', 0);

  this.assert_equals('pisanie trybpis', 'PAINT');
  this.assert_equals('ścieranie trybpis', 'ERASE');
  this.assert_equals('odwracanie trybpis', 'REVERSE');

  this.assert_equals('ustalkolpis 0 kolpis', 'black');
  this.assert_equals('ukm 0 kolpis', 'black');
  this.assert_equals('ustalkolpis "#123456 kolpis', '#123456');
  this.assert_equals('ustalkolpis [0 50 99] kolpis', '#0080ff');

  this.assert_equals('ustalrozmiarpisaka 6 rozmiarpis', [6, 6]);
  this.assert_equals('ustalrozmiarpisaka [6 6] rozmiarpis', [6, 6]);

  //
  // 6.6 Pen Queries
  //

  this.assert_equals('opuść opuszczonyp', 1);
  this.assert_equals('podnieś opuszczonyp', 0);

  this.assert_equals('pisanie trybpis', 'PAINT');
  this.assert_equals('ścieranie trybpis', 'ERASE');
  this.assert_equals('odwracanie trybpis', 'REVERSE');

  this.assert_equals('ustalkolpis 0 kolpis', 'black');
  this.assert_equals('ustalkolpis "#123456 kolpis', '#123456');
  this.assert_equals('ustalrozmiarpisaka 6 rozmiarpis', [6, 6]);

  // 6.7 Saving and Loading Pictures
  // 6.8 Mouse Queries
});

test("Zarządzanie obszarem roboczym", function () {
  expect(92);

  //
  // 7.1 Procedure Definition
  //

  this.assert_equals('oto square :x wynik :x * :x już  square 5', 25);
  this.assert_equals('oto foo wynik 5 już  foo', 5);
  this.assert_equals('oto foo :x :y wynik 5 już  foo 1 2', 5);
  this.assert_equals('oto foo :x :y wynik :x + :y już  foo 1 2', 3);
  this.assert_equals('oto foo :x :y wynik :x + :y już  proc "foo', 'oto foo :x :y\n  wynik :x + :y\njuż');
  this.assert_equals('oto foo :x bar 1 "a + :x [ 1 2 ] już  proc "foo', 'oto foo :x\n  bar 1 "a + :x [ 1 2 ]\njuż');
  this.assert_equals('oto foo 1 + 2 - 3 * 4 / 5 % 6 ^ -1 już  proc "foo', 'oto foo\n  1 + 2 - 3 * 4 / 5 % 6 ^ -1\njuż');

  this.assert_equals('oto square :x wynik :x * :x już  kopiujdef "multbyself "square  multbyself 5', 25);
  // TODO: copydef + redefp

  //
  // 7.2 Variable Definition
  //

  this.assert_equals('przypisz "foo 5 :foo', 5);
  this.assert_equals('przypisz "foo "a :foo', 'a');
  this.assert_equals('przypisz "foo [a b] :foo', ["a", "b"]);
  this.assert_equals('przypisz "n "alpha przypisz :n "beta :alpha', 'beta');

  // by default, make operates in global scope
  this.assert_equals('oto dofoo ' +
                '  przypisz "foo 456 ' +
                '  wynik :foo ' +
                'już ' +
                'przypisz "foo 123 ' +
                'dofoo + :foo', 456 + 456);

  this.assert_equals('oto dofoo2 :foo ' +
                '  przypisz "foo 456 ' +
                '  wynik :foo + :foo ' +
                'już ' +
                'przypisz "foo 123 ' +
                '(dofoo2 111) + :foo', 123 + 456 + 456);

  this.assert_equals('nazwij 5 "foo :foo', 5);
  this.assert_equals('nazwij "a "foo :foo', 'a');
  this.assert_equals('nazwij [a b] "foo :foo', ["a", "b"]);
  this.assert_equals('nazwij "gamma "m  nazwij "delta :m :gamma', 'delta');

  this.assert_equals('oto dofoo ' +
                '  lokalna "foo ' +
                '  przypisz "foo 456' +
                '  wynik :foo ' +
                'już ' +
                'przypisz "foo 123 ' +
                'dofoo + :foo', 456 + 123);

  this.assert_equals('oto dofoo ' +
                '  twórzlokalną "foo 456' +
                '  wynik :foo ' +
                'już ' +
                'przypisz "foo 123 ' +
                'dofoo + :foo', 456 + 123);

  this.assert_equals('przypisz "baz 321 niech "baz', 321);
  this.assert_equals('przypisz "baz "a niech "baz', 'a');
  this.assert_equals('przypisz "baz [a b c] niech "baz', ["a", "b", "c"]);

  this.assert_equals('globalna "foo 1', 1); // Doesn't actually test anything
  this.assert_equals('(globalna "foo "bar) 1', 1); // Doesn't actually test anything

  this.assert_equals('procedurap "notdefined', 0);
  this.assert_equals('oto foo już  procedurap "foo', 1);
  this.assert_equals('procedura? "notdefined', 0);
  this.assert_equals('oto foo już  procedura? "foo', 1);

  this.assert_equals('pierwotnep "notdefined', 0);
  this.assert_equals('oto foo już  pierwotnep "foo', 0);
  this.assert_equals('pierwotnep "zdanie', 1);
  this.assert_equals('pierwotne? "notdefined', 0);
  this.assert_equals('oto foo już  pierwotne? "foo', 0);
  this.assert_equals('pierwotne? "zdanie', 1);

  this.assert_equals('określonep "notdefined', 0);
  this.assert_equals('oto foo już  określonep "foo', 1);
  this.assert_equals('określonep "zdanie', 0);
  this.assert_equals('określone? "notdefined', 0);
  this.assert_equals('oto foo już  określone? "foo', 1);
  this.assert_equals('określone? "zdanie', 0);

  this.assert_equals('zmiennap "notdefined', 0);
  this.assert_equals('przypisz "foo 5 zmiennap "foo', 1);

  // 7.3 Property Lists

  this.assert_equals('włp "lname', 0);
  this.assert_equals('przywłaść "lname "pname 123  lwł "lname "pname', 123);
  this.assert_equals('lwł "lname "nosuchprop', []);
  this.assert_equals('właściwość "lname', ["pname", 123]);
  this.assert_equals('włp "lname', 1);
  this.assert_equals('uswłaś "lname "pname  właściwość "lname', []);
  this.assert_equals('włp "lname', 0);
  this.assert_equals('przywłaść "lname "pname 123  lwł "LNAME "PNAME', 123);

  // 7.4 Workspace Predicates
  // (tested above)

  //
  // 7.5 Workspace Queries
  //

  this.assert_equals('odgrzebwszystko usw  zawartości', [[], [], []]);

  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  zawartości', [['b'], ['a'], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  procedury', ['b']);
  // TODO: primitives
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  globalne', ['a']);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  nazwy', [[], ['a']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  właściwości', [[], [], ['c']]);

  this.assert_equals('listanazw "a', [[], ['a']]);
  this.assert_equals('listanazw [a]', [[], ['a']]);
  this.assert_equals('listanazw [a b c]', [[], ['a', 'b', 'c']]);
  this.assert_equals('listawł "a', [[], [], ['a']]);
  this.assert_equals('listawł [a]', [[], [], ['a']]);
  this.assert_equals('listawł [a b c]', [[], [], ['a', 'b', 'c']]);


  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  przypisz "b 2  oto a wynik 1 już  oto b wynik 2 już  wymaż [[a] [b]]  zawartości', [['b'], ['a'], []]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  przypisz "b 2  oto a wynik 1 już  oto b wynik 2 już  usw  zawartości', [[], [], []]);
  // TODO: erase + redefp

  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  wżproc [[b]]  zawartości', [[], ['a'], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  wżnazwy [[a]]  zawartości', [['b'], [], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  wżwł [[c]]  zawartości', [['b'], ['a'], []]);

  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  wżlistanazw "a  zawartości', [['b'], [], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  wżlistanazw [a]  zawartości', [['b'], [], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  wżlistawł "c  zawartości', [['b'], ['a'], []]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  wżlistawł [c]  zawartości', [['b'], ['a'], []]);

  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[b]]  zawartości', [[], ['a'], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [a]]  zawartości', [['b'], [], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [] [c]]  zawartości', [['b'], ['a'], []]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowajwszystko  zawartości', [[], [], []]);

  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowajwszystko odgrzeb [[b]]  zawartości', [['b'], [], []]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowajwszystko odgrzeb [[] [a]]  zawartości', [[], ['a'], []]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowajwszystko odgrzeb [[] [] [c]]  zawartości', [[], [], ['c']]);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowajwszystko  odgrzebwszystko  zawartości', [['b'], ['a'], ['c']]);

  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowanyp [[b]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[b]]  pochowanyp [[b]]', 1);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[b]]  pochowanyp [[] [a]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[b]]  pochowanyp [[] [] [c]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowanyp [[] [a]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [a]]  pochowanyp [[b]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [a]]  pochowanyp [[] [a]]', 1);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [a]]  pochowanyp [[] [] [c]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowanyp [[] [] [c]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [] [c]]  pochowanyp [[b]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [] [c]]  pochowanyp [[] [a]]', 0);
  this.assert_equals('odgrzebwszystko usw  przypisz "a 1  oto b wynik 2 już przywłaść "c "d "e  pochowaj [[] [] [c]]  pochowanyp [[] [] [c]]', 1);

  // 7.6 Workspace Inspection
  // 7.7 Workspace Control

});

test("Struktury kontrolne", function () {
  expect(44);
  //
  // 8.1 Control
  //

  this.assert_equals('przypisz "c 0  zapuść [ ]  :c', 0);
  this.assert_equals('przypisz "c 0  zapuść [ przypisz "c 5 ]  :c', 5);

  this.assert_equals('zapuśćraportuj [ przypisz "x 1 ]', []);
  this.assert_equals('zapuśćraportuj [ 1 + 2 ]', [3]);

  this.assert_equals('przypisz "c 0  powtórz 5 [ przypisz "c :c + 1 ]  :c', 5);
  this.assert_equals('przypisz "c 0  powtórz 4 [ przypisz "c :c + numpow ]  :c', 10);

  this.assert_equals('przypisz "c 0  oto foo pętla [ przypisz "c :c + 1 jeśli numpow = 5 [ stopmnie ] ] już  foo  :c', 5);
  this.assert_equals('przypisz "c 0  oto foo pętla [ przypisz "c :c + numpow jeśli numpow = 4 [ stopmnie ] ] już  foo  :c', 10);
  this.assert_equals('jeśliinaczej 1 [ przypisz "r "a ] [ przypisz "r "b ]  :r', 'a');
  this.assert_equals('jeśliinaczej 0 [ przypisz "r "a ] [ przypisz "r "b ]  :r', 'b');

  this.assert_equals('oto foo jeśli 1 [ wynik "a ] wynik "b już  foo', 'a');
  this.assert_equals('oto foo jeśli 0 [ wynik "a ] wynik "b już  foo', 'b');

  this.assert_equals('przypisz "c 1  test 2 > 1  jeślitak  [ przypisz "c 2 ]  :c', 2);
  this.assert_equals('przypisz "c 1  test 2 > 1  jeślit  [ przypisz "c 2 ]  :c', 2);
  this.assert_equals('przypisz "c 1  test 2 > 1  jeślinie [ przypisz "c 2 ]  :c', 1);
  this.assert_equals('przypisz "c 1  test 2 > 1  jeślin [ przypisz "c 2 ]  :c', 1);

  this.assert_equals('oto foo pętla [ jeśli numpow = 5 [ przypisz "c 234 stopmnie ] ] już  foo  :c', 234);

  this.assert_equals('pętla [ jeśli numpow = 5 [ dość ] ]', undefined);

  this.assert_equals('oto foo wynik 123 już  foo', 123);
  this.assert_equals('oto foo wy 123 już  foo', 123);


  this.assert_equals('oto foo .możewynik 5 już  foo', 5);
  this.assert_equals('oto foo .możewynik przypisz "c 0 już  foo', undefined);


  this.assert_equals('ignoruj 1 > 2', undefined);

  this.assert_equals('przypisz "x 0  dla [ r 1 5 ] [ przypisz "x :x + :r ]  :x', 15);
  this.assert_equals('przypisz "x 0  dla [ r 0 10 2 ] [ przypisz "x :x + :r ]  :x', 30);
  this.assert_equals('przypisz "x 0  dla [ r 10 0 -2 ] [ przypisz "x :x + :r ]  :x', 30);
  this.assert_equals('przypisz "x 0  dla [ r 10 0 -2-2 ] [ przypisz "x :x + :r ]  :x', 18);

  this.assert_equals('przypisz "x 0  wykonuj.dopóki [ przypisz "x :x + 1 ] :x < 10  :x', 10);
  this.assert_equals('przypisz "x 0  dopóki :x < 10 [ przypisz "x :x + 1 ]     :x', 10);

  this.assert_equals('przypisz "x 0  wykonuj.dopókinie [ przypisz "x :x + 1 ] :x > 10  :x', 11);
  this.assert_equals('przypisz "x 0  dopókinie :x > 10 [ przypisz "x :x + 1 ]     :x', 11);

  this.assert_equals('oto vowelp :letter ' +
                     '  wynik wybierz :letter [ [[a e i o u] "true] [inaczej "false] ] ' +
                     'już ' +
                     '(lista vowelp "a vowelp "b', ['true', 'false']);

  this.assert_equals('oto evenp :n ' +
                     '  wynik nie biti :n 1 ' +
                     'już ' +
                     'oto evens :numbers ' +
                     '  wy warunki [ [ [pustep :numbers]      [] ] ' +
                     '            [ [evenp pierwszy :numbers] ' +
                     '              nap pierwszy :numbers evens bezpierw :numbers] '+
                     '            [ inaczej evens bezpierw :numbers] '+
                     ' ] ' +
                     'już ' +
                     'evens [ 1 2 3 4 5 6 ]', ['2', '4', '6']);

  //
  // 8.2 Template-based Iteration
  //

  this.assert_equals('odnieś "słowo ["a "b "c]', '"a"b"c');
  this.assert_equals('odwołaj "słowo "a', 'a');
  this.assert_equals('(odwołaj "słowo "a "b "c)', 'abc');
  this.assert_equals('(odwołaj "słowo)', '');
  this.assert_equals('przypisz "x 0  oto addx :a przypisz "x :x+:a już  dlakażdego "addx [ 1 2 3 4 5 ]  :x', 15);
  this.assert_equals('oto double :x wynik :x * 2 już  mapa "double [ 1 2 3 ]', [2, 4, 6]);
  this.assert_equals('oto odd :x wynik :x % 2 już  filtr "odd [ 1 2 3 ]', ["1", "3"]);
  this.assert_equals('znajdź "liczbap (lista "a "b "c 4 "e "f )', 4);
  this.assert_equals('znajdź "liczbap (lista "a "b "c "d "e "f )', []);
  this.assert_equals('skróć "suma [ 1 2 3 4 ]', 10);
  this.assert_equals('(skróć "suma [ 1 2 3 4 ] 10)', 20);

  // TODO: Order of operations
  // TODO: Structures, lists of lists

});

test("Wiadomości błędów", function () {

  this.assert_error("oto foo już pokaż foo", "Brak wyjścia z procedury");
  this.assert_error("[ 1 2", "Oczekiwano ']'");
  this.assert_error("{ 1 2", "Oczekiwano '}'");
  this.assert_error("[ 1 2 }", "Nieoczekiwany '}'");
  this.assert_error("{ 1 2 ]", "Nieoczekiwany ']'");
  this.assert_error("!@#$", "Nie można przetworzyć: '!@#$'");
  this.assert_error("pokaż :nosuchvar", "Nic nie wiadomo o zmiennej NOSUCHVAR");
  this.assert_error("1 / 0", "Dzielenie przez zero");
  this.assert_error("1 % 0", "Dzielenie przez zero");
  this.assert_error("1 + -", "Nieoczekiwany koniec instrukcji");
  this.assert_error("( 1 + 2", "Oczekiwano ')'");
  this.assert_error("( 1 + 2 3", "Oczekiwano ')', zobaczono 3");
  this.assert_error("nosuchproc", "Nic nie wiadomo na temat: NOSUCHPROC");
  this.assert_error("1 + \"1+2", "Oczekiwano liczby");
  this.assert_error("1 + []", "Oczekiwano liczby");
  this.assert_error("(ujemny)", "Oczekiwano liczby");
  this.assert_error("przypisz [] 123", "Oczekiwano łańcucha znaków");
  this.assert_error("(proc)", "Oczekiwano łańcucha znaków");
  this.assert_error("(wymaż)", "Oczekiwano listy");
  this.assert_error("(mapa \"pokaż)", "Oczekiwano listy");
  this.assert_error("oto +", "Oczekiwano identyfikatora");
  this.assert_error("oto np :x ws :x już", "Nie można przedefiniować nazwy NP");
  this.assert_error("proc \"nosuchproc", "Nic nie wiadomo na temat: NOSUCHPROC");
  this.assert_error("proc \"proc", "Nie można pokazać definicji: PROC");
  this.assert_error("element 5 [ 1 2 ]", "Indeks poza zakresem");
  this.assert_error("kopiujdef \"newname \"nosuchproc", "Nic nie wiadomo na temat: NOSUCHPROC");
  this.assert_error("oto foo już  kopiujdef \"oto \"foo", "Nie można nadpisać specjalnej postaci OTO");
  this.assert_error("oto foo już  kopiujdef \"pokaż \"foo", "Nie można nadpisać wyrażenia pierwotnego chyba PRZEDEFP jest PRAWDĄ");
  this.assert_error("wymaż [ [ oto ] [ ] ]", "Nie można wymazać specjalnej postaci OTO");
  this.assert_error("wymaż [ [ pokaż ] [ ] ]", "Nie można wymazać wyrażenia pierwotnego chyba że PRZEDEFP jest PRAWDĄ");
  this.assert_error("wykonuj.dopóki 1 2", "Oczekiwano bloku");
  this.assert_error("dopóki 1 2", "Oczekiwano bloku");
  this.assert_error("wykonuj.dopókinie 1 2", "Oczekiwano bloku");
  this.assert_error("dopókinie 1 2", "Oczekiwano bloku");
  this.assert_error("odnieś \"nosuch [ 1 2 ]", "Nie wiadomo nic na temat: NOSUCH");
  this.assert_error("odnieś \"oto [ 1 2 ]", "Nie można zastosować APPLY do specjalnej nazwy OTO");
  this.assert_error("odnieś \"dopóki [ 1 2 ]", "Nie można zastosować APPLY do specjalnej nazwy DOPÓKI");
  this.assert_error("dlakażdego \"nosuch [ 1 2 ]", "Nie wiadomo nic na temat: NOSUCH");
  this.assert_error("dlakażdego \"oto [ 1 2 ]", "Nie można zastosować FOREACH do specjalnej nazwy OTO");
  this.assert_error("dlakażdego \"dopóki [ 1 2 ]", "Nie można zastosować FOREACH do specjalnej nazwy DOPÓKI");
  this.assert_error("odwołaj \"nosuch [ 1 2 ]", "Nie wiadomo nic na temat: NOSUCH");
  this.assert_error("odwołaj \"oto [ 1 2 ]", "Nie można zastosować INVOKE do specjalnej nazwy OTO");
  this.assert_error("odwołaj \"dopóki [ 1 2 ]", "Nie można zastosować INVOKE do specjalnej nazwy DOPÓKI");
  this.assert_error("mapa \"nosuch [ 1 2 ]", "Nie wiadomo nic na temat: NOSUCH");
  this.assert_error("mapa \"oto [ 1 2 ]", "Nie można zastosować MAP do specjalnej nazwy OTO");
  this.assert_error("mapa \"dopóki [ 1 2 ]", "Nie można zastosować MAP do specjalnej nazwy DOPÓKI");
  this.assert_error("filtr \"nosuch [ 1 2 ]", "Nie wiadomo nic na temat: NOSUCH");
  this.assert_error("filtr \"oto [ 1 2 ]", "Nie można zastosować FILTER do specjalnej nazwy OTO");
  this.assert_error("filtr \"dopóki [ 1 2 ]", "Nie można zastosować FILTER do specjalnej nazwy DOPÓKI");
  this.assert_error("znajdź \"nosuch [ 1 2 ]", "Nie wiadomo nic na temat: NOSUCH");
  this.assert_error("znajdź \"oto [ 1 2 ]", "Nie można zastosować FIND do specjalnej nazwy OTO");
  this.assert_error("znajdź \"dopóki [ 1 2 ]", "Nie można zastosować FIND do specjalnej nazwy DOPÓKI");
  this.assert_error("skróć \"nosuch [ 1 2 ]", "Nie wiadomo nic na temat: NOSUCH");
  this.assert_error("skróć \"oto [ 1 2 ]", "Nie można zastosować REDUCE do specjalnej nazwy OTO");
  this.assert_error("skróć \"dopóki [ 1 2 ]", "Nie można zastosować REDUCE do specjalnej nazwy DOPÓKI");
  this.assert_error("0", "Nie wiadomo co zrobić z: 0");
  this.assert_error("1 + 2", "Nie wiadomo co zrobić z: 3");
  this.assert_error("oto foo wynik 123 już  foo", "Nie wiadomo co zrobić z: 123");
  this.assert_error('pierwszy 123', 'Oczekiwano listy');
  this.assert_error('ostatni  123', 'Oczekiwano listy');
  this.assert_error('bezpierw 123', 'Oczekiwano listy');
  this.assert_error('bezost  123', 'Oczekiwano listy');
  this.assert_error('ustalpoz []', 'Oczekiwano listy o długości 2');
  this.assert_error('ustalpoz [1 2 3]', 'Oczekiwano listy o długości 2');
  this.assert_error('azymut []', 'Oczekiwano listy o długości 2');
  this.assert_error('przypisz "a { 1 2 3 }@1.5', "Nie wiadomo co zrobić z: 0.5");
});

test("Testy Regresyjne", function() {
  this.assert_equals('przypisz "x 0  powtórz 3 [ dla [ i 1 4 ] [ przypisz "x :x + 1 ] ]  :x', 12);
  this.assert_equals('przypisz "x 0  dla [i 0 100 :i + 1] [przypisz "x :x + :i]  :x', 120);
  this.assert_error("np 100 50 rt 90", "Nie wiadomo co zrobić z: 50");
  this.assert_equals("oto foo wynik 123 już  przypisz \"v foo", undefined);
  this.assert_equals("oto foo już", undefined);
  this.assert_equals("5;comment", 5);
  this.assert_equals("5;comment\n", 5);
  this.assert_equals("5 ; comment", 5);
  this.assert_equals("5 ; comment\n", 5);
  this.assert_equals("ustalpoz [ -1 0 ]  123", 123);
  this.assert_equals("oto foo wynik 234 już foo", 234);
  this.assert_equals("oto foo wynik 234 JUŻ foo", 234);
  this.assert_error("oto whatever np 100", "Oczekiwano JUŻ");
  this.assert_equals('"abc;def', "abc");
  this.assert_equals('"abc\\;def', "abc;def");
  this.assert_equals('"abc\\\\def', "abc\\def");
  this.assert_equals('powtórz 1 [ przypisz "v "abc\\;def ]  :v', "abc;def");
  this.assert_error('powtórz 1 [ przypisz "v "abc;def ]  :v', "Oczekiwano ']'");
  this.assert_equals('przypisz "a [ a b c ]  przypisz "b :a  zdejmij "a  :b', ["a", "b", "c"]);
  this.assert_equals('oto foo :BAR wynik :BAR już  foo 1', 1);
  this.assert_equals('(słowo "a (znak 10) "b)', 'a\nb');
});