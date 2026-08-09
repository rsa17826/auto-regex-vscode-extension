
Object.assign(global, console)
declare global {
  function log(...args: any[]): void
  function error(...args: any[]): void
  function warn(...args: any[]): void
  function info(...args: any[]): void
  function clear(...args: any[]): void
}
const regexCache = new Map<string, string>()
const tokenCache = new Map<
  string,
  {
    token: string
    value: string
    string: string
    end: any
  }[]
>()
function gettoken({
  match,
  start,
  length,
}: {
  match: string
  start: number
  length: number
}): {
  token: string
  value: string
  string: string
  end: any
}[] {
  const key = match + "||" + start + "||" + length

  if (tokenCache.has(key)) {
    return tokenCache.get(key)!
  }

  var strs = match
    .replaceAll("ƒ", "")
    // .replaceAll("\\", "☺")
    .split("\n")
  // .map((e) => e.replaceAll("☺", "\\"))
  var temparr: string[] = []
  for (var str of strs) {
    if (str.startsWith("@")) {
      temparr.push(str)
    } else {
      if (temparr.length > 0)
        temparr.push(temparr.pop() + "\n" + str)
    }
  }
  var result = temparr.map((e) => {
    // log(e, e.match(/^@\w+ ([^]*)$/)?.[1])
    return {
      token: e.match(/^@(\w+)/)?.[1] ?? "",
      value: e.match(/^@\w+ ?([^]*)$/)?.[1] ?? "",
      string: e,
      end: start + length,
    }
  })
  tokenCache.set(key, result)
  return result
}
var tokens: (
  | { token: string; value: string; end: number }
  | { token: "!reset"; value: undefined; end: undefined }
)[] = []
function pushChunkTokens(chunk: {
  match: string
  start: number
  length: number
}) {
  // Only reset carried-over state (like @file) when the previous
  // chunk ended with a completed @endregex — i.e. the blank line
  // that split this chunk off is a real gap *between* blocks, not
  // an incidental blank line sitting inside a block (e.g. right
  // before @endregex).
  const prevToken = tokens[tokens.length - 1]
  if (prevToken && prevToken.token === "endregex") {
    tokens.push({
      token: "!reset",
      value: undefined,
      end: undefined,
    })
  }
  tokens.push(...gettoken(chunk))
}

function detectComments(
  text: string,
  LANG: string | null = getlang(1),
): { match: string; start: number; length: number }[] {
  const comments = []
  text = text
    // .replaceAll("\\\\", "\\")
    .replaceAll("\r\n", "\n")
  // .replaceAll("\\", "\\\\")
  // const languageId = document.languageId
  let lineComment: string | undefined
  let blockCommentStart: string | undefined
  let blockCommentEnd: string | undefined
  log("languageId", LANG, getlang())

  switch (LANG) {
    case "typescript":
    case "javascript":
    case "java":
    case "c":
    case "cpp":
      lineComment = "//"
      blockCommentStart = "/*"
      blockCommentEnd = "*/"
      break
    case "css":
      blockCommentStart = "/*"
      blockCommentEnd = "*/"
      break
    case "python":
    case "gdscript":
      lineComment = "#"
      blockCommentStart = '"""'
      blockCommentEnd = '"""'
      break
    case "ahk":
    case "ahk2":
    case "ah2":
      lineComment = ";"
      break
    case "html":
      blockCommentStart = "<!--"
      blockCommentEnd = "-->"
      break
    case null:
      lineComment = ""
      break
  }
  if (LANG === null) {
    const blockCommentRegex = /(?:^(?!\s*$).+\n?)+/gm
    log("blockCommentRegex", blockCommentRegex)
    let match
    // while ((match = blockCommentRegex.exec(text + "\n")) !== null) {
    comments.push(
      ...[...(text + "\n").matchAll(/(?:^(?!\s*$).+\n?)+/gm)].map(
        (match) => {
          return {
            match: match[0],
            length: match[0].length,
            start: match.index,
          }
        },
      ),
    )
    // }
    return comments
  }
  if (lineComment !== undefined) {
    const lineCommentRegex = new RegExp(
      `^( *)(?:${escapeRegExp(lineComment)}$|${escapeRegExp(
        lineComment,
      )}${lineComment ? " " : ""}.*)(\\r?\\n\\1(?:${escapeRegExp(
        lineComment,
      )}$|${escapeRegExp(lineComment)} .*))*`,
      "gm",
    )
    log("lineCommentRegex", lineCommentRegex)
    var lastidx = 0
    for (var match of [...text.matchAll(lineCommentRegex)]) {
      lastidx += lineComment.length + 1 + match[0].length
      comments.push({
        match: String(match[0]).replaceAll(
          new RegExp(`^ *${escapeRegExp(lineComment)}(?: |$)`, "gm"),
          "",
        ),
        start: match.index,
        length: match[0].length,
      })
    }
  }

  if (blockCommentStart && blockCommentEnd) {
    const blockCommentRegex = new RegExp(
      `(?<=${escapeRegExp(
        blockCommentStart,
      )})[\\s\\S]*?(?=${escapeRegExp(blockCommentEnd)})`,
      "g",
    )
    log("blockCommentRegex", blockCommentRegex)
    let match
    while ((match = blockCommentRegex.exec(text)) !== null) {
      comments.push({
        match: match[0],
        length: match[0].length,
        start: match.index,
      })
    }
  }

  return comments
}

function escapeRegExp(string: string): string {
  return regrep(string, /[.*+?^${}()|[\]\\]/g, "\\$&")
}
function regrep(a: string, s: RegExp, d: string) {
  const key = a + "||" + s.source + "||" + s.flags + "||" + d

  if (regexCache.has(key)) {
    return regexCache.get(key)!
  }

  const result = a.replace(s, d)
  regexCache.set(key, result)
  return result
}
function getlang(editor: any) {
  return null
  if (!editor) return ""
  // if (!editor) {
  //   vscode.window.showInformationMessage(
  //     "No active editor found. Please open a file.",
  //   )
  //   return ""
  // }
  const document = editor.document
  const cursorPosition = editor.selection.active
  const thisLine = cursorPosition.line
  var fulltext = document.getText().replaceAll("\r\n", "\n")
  var langid = document.languageId
  if (langid == "html") {
    const scriptMatches = fulltext.matchAll(
      /(?<=<script\b[^>]*>)([\s\S]*?)(?=<\/script>)/g,
    )
    let isThisLineInsideScriptTag = false
    for (const match of scriptMatches) {
      const matchStartPosition = document.positionAt(match.index)
      const matchEndPosition = document.positionAt(
        match.index + match[1].length,
      )
      const matchEndLine =
        document.lineAt(matchEndPosition).lineNumber
      if (
        thisLine >= matchStartPosition.line &&
        thisLine <= matchEndLine
      ) {
        isThisLineInsideScriptTag = true
        break
      }
    }
    if (isThisLineInsideScriptTag) langid = "javascript"
  }
  return langid
}

var t = `

@file start$
@regex ^(?:(?!#)|$)
@flags
@replace #!sh

@endregex


@regex ^(?:(?!#)|$)
@flags
@replace #!sh
ቃ
@endregex
@regex ^(#!sh\\n)ቃ
@flags
@replace $1
@endregex


@name a
@file \\.py$
@regex (?<=[^\\s])  #
@replace  #
@endregex

@name trin ending spaces
@file 
@regex  +(?<!@file )$
@replace
@endregex

@name trin end lines
@file \\.nix$
@regex ^\\n+([}\\]])
@replace $1
@endregex
@name trin start lines
@file \\.nix$
@regex ([{[])\\n{2,}
@replace $1

@endregex

@name no bin
@file \\.sh|/[^/.]+$
@regex ^(?:# )?#!/bin/(\\w+)
@replace #!/usr/bin/env $1
@endregex

@file \\.sh|/[^/.]+$
@regex #!((?:ba|z)?sh)
@replace #!/usr/bin/env $1
@endregex

@name use with
@file \\.nix$
@regex \\[\\n *(\\(?[\\w\\-_]+)\\..*\\n(\\s*\\1\\.\\(?[\\w\\-_]+)+\\n *\\];
@replace with $1; $&
@endregex
@regex (with ([\\w\\-_]+); \\[\\n(?:\\s*(?!\\(\\2\\.)(?!\\2\\.)\\S+\\n)*\\s*)(?:(\\()?\\2)\\.([\\w\\-_]+)
@untilfail
@replace $1$3$4
@endregex
@regex ps:\\s*\\[\\n(\\s*)ps\\.([\\w\\-_]+)\\n(\\s*)ps\\.([\\w\\-_]+)\\n(\\s*)\\]
@replace ps: with ps; [
$1$2
$3$4
$5]
@endregex
@regex \\[(\\s*\\n\\s*)(?:(\\([\\s\\S]*?\\))(\\s*\\n\\s*))?pkgs\\.([\\w\\-_]+)(\\s*\\n\\s*)pkgs\\.([\\w\\-_]+)(\\s*\\n\\s*)\\];
@replace with pkgs; [$1$2$3$4$5$6$7];
@endregex

GODOT


@name same line return
@file \\.gd$
@regex :\\s*(return|continue|break|pass)(\\s*(true|false|null|\\d+)?)$
@replace : $1$2
@flags gm
@endregex

@name python to gd casing
@file \\.gd$
@regex \\bTrue\\b
@replace true
@flags gm
@endregex
@file \\.gd$
@regex \\bFalse\\b
@replace false
@flags gm
@endregex

@name python casing
@file \\.py$
@regex \\btrue\\b
@replace True
@flags gm
@endregex
@file \\.py$
@regex \\bfalse\\b
@replace False
@flags gm
@endregex

@file \\.gd$
@regex Vector2\\(0, 0\\)
@replace Vector2.ZERO
@flags gm
@endregex

@file ###\\.gd$
@regex (?<=\\s)get_node\\("([\\w/]+)"\\)
@replace $$$1
@flags gm
@endregex

@name fix bad self spacings
@file \\.gd$
@regex \\bself ([,)])
@replace self$1
@flags gm
@endregex
@name fix bad super spacings
@file \\.gd$
@regex \\bsuper \\(
@replace super(
@flags gm
@endregex

@file \\.gd$
@regex func func
@replace func
@flags gm
@endregex

@file scenes/blocks/([^/]+)/\\1\\.gd(?<!textureRect\\.gd)$
@regex ^func ((?:_physics)?_process|_ready)
@replace func on$1
@flags gm
@endregex

@file scenes/blocks/([^/]+)/\\1\\.gd$
@regex ^func _(on_body_entered|on_body_exited)
@replace func $1
@flags gm
@endregex

@file scenes/blocks/([^/]+)/\\1\\.gd$
@regex func on_body_(entered|exited)\\(body: Node2D, real=true\\) -> void:
@replace func on_body_$1(body: Node2D) -> void:
@flags gm
@endregex

@file \\.gd$
@regex body == global\\.player
@replace body is Player
@flags gm
@endregex

@name replace ['a'] with .a
@file \\.gd$
@regex (?<=[\\w_\\]])\\[(['"])([\\w_]+)\\1\\]
@replace .$2
@flags gm
@endregex
@flags gm
@replace
@regex  +$
@file \\.gd$

@name replace print with log.pp
@endregex
@name replace print with log.pp
@endregex

@name extra end spaces
@endregex
@flags gm
@replace log.pp(
@regex (?<=  |^)print\\(
@file \\.gd$

@name instance to instantiate
@file \\.gd$
@regex \\.instance\\(\\)
@replace .instantiate()
@flags gm
@endregex

@name global.player to const
@file \\.gd$
@regex  global\\.player\\.(GRAVITY|States|MAX_PULLEY_NO_DIE_TIME|MOVESPEED|JUMP_POWER|MAX_WALL_SLIDE_FRAMES|MAX_SLIDE_RECOVER_TIME|MAX_WALL_BREAK_FROM_DOWN_FRAMES|MAX_KT_TIMER|MAX_WATER_KT_TIMER|WATER_TURNSPEED|WATER_MOVESPEED|WATER_EXIT_BOUNCE_FORCE|WALL_SLIDE_SPEED|MAX_BOX_KICK_RECOVER_TIME|MAX_POLE_COOLDOWN|MAX_ZIPLINE_COOLDOWN|SMALL)
@replace  Player.$1
@flags gm
@endregex


@name ||
@file \\.gd$
@regex  \\|\\|
@replace  or
@flags gm
@endregex

@name &&
@file \\.gd$
@regex  &&
@replace  and
@flags gm
@endregex

@name mo allowUnfree
@file \\.nix$
@regex ^( *)(?<!\\w)allowUnfree\\s*=\\s*true\\s*;
@replace $1#FIXME dont use allowUnfree
$1allowUnfree = false;
@flags gm
@endregex

@name fix enter key
@file /hyprland\\.conf$
@regex ENTER
@replace RETURN
@endregex

@name admin - ensure source= line exists
@file \\.sh$
@regex ^(?!# shellcheck source=)([^\\n]*)\\n(\\. admin[^\\n]*)$
@replace $1
# shellcheck source=/etc/profiles/per-user/nyix/bin/admin
$2
@endregex

@name admin - ensure requiresSudo appended
@file \\.sh$
@regex ^(\\. admin)(?! && requiresSudo "\\$@"$)[^\\n]*$
@replace $1 && requiresSudo "$@"
@endregex

`

for (var part of detectComments(t, null))
  pushChunkTokens(part)

log(tokens)
