# d README

replaces regex based on comments or from a config file

```
// @noregex
   disables all regex below this line
// @untilfail
   repeats the regex until it fails to change content
// @file
   prevents this regex rule from running if the file path doesnt match the regex in this @file value
// @full
   can edit the entire document instead of just the content below the regex comment end - that means that it can edit itself
// @flags
   regex flags - default are gm
// @regex
   the regex to find the char alt+159 / "ƒ" is ignored and can be used to add */ to css comments like *ƒ/  - required
// @replace
   what to replace the found regex with - required
// @endregex
   must call at end to start regex - required
```

config file is **replace.regex**, same format is used, start with @name with no comment token before it.

# examples

```[html]
<!--
@name fix html comments in html
@regex (<!-ƒ-.*(?<!-ƒ->)) *$\n(?:( *) ?)
@replace $1 -ƒ->
$2<!-ƒ-
@untilfail
@endregex

@name fix css comments in html
@regex (/\*.*(?<!\*\/)) *$\n(?:( *) ?)
@replace $1 *ƒ/
$2/*
@untilfail
@endregex

-->
```
```[css]
/*
@name fix css comments in css
@regex (/\*.*(?<!\*ƒ/)) *$\n(?:( *) ?)
@replace $1 *ƒ/
$2/*
@untilfail
@endregex

*/
```
```[ahk]
; @name format includes
; @regex ^(#\w+ .*\n)\n+(#)
; @flags gim
; @untilfail
; @replace $1$2
; @endregex
; @regex ^#include .*(?=\n\w)
; @flags gim
; @replace $&
;
; @endregex

; @name max newlines
; @regex ^\n{3,}
; @flags gim
; @full
; @replace
;
;
; @endregex

; @name separate different regexes
; @regex ( *)(;.*)\n(\1; @name)
; @full
; @replace $1$2
;
; $3
; @endregex
```

# todo
