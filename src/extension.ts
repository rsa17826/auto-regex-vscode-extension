// @name remove ai comments
// @regex \n *(//) [A-Z].*
// @replace
// @endregex
// @regex  (//) [A-Z].*
// @replace
// @endregex

import * as vscode from "vscode"
const fs = vscode.workspace.fs
import * as afs from "fs"
import * as path from "path"

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

function regrep(a: string, s: RegExp, d: string) {
  const key = a + "||" + s.source + "||" + s.flags + "||" + d

  if (regexCache.has(key)) {
    return regexCache.get(key)!
  }

  const result = a.replace(s, d)
  regexCache.set(key, result)
  return result
}
function getlang(
  editor: vscode.TextEditor | undefined = vscode.window
    .activeTextEditor,
) {
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
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { pattern: "**/*" },
      new CustomFoldingProvider(),
    ),
  )
  context.subscriptions.push(
    vscode.languages.registerDocumentRangeFormattingEditProvider(
      "*",
      {
        provideDocumentRangeFormattingEdits: async (
          document: vscode.TextDocument,
          range: vscode.Range,
          options: vscode.FormattingOptions,
          token: vscode.CancellationToken,
        ): Promise<vscode.TextEdit[]> => {
          if (document.uri.scheme !== "file") {
            return []
          }
          const uriString = document.uri.toString()
          if (selfSaved[uriString]) {
            delete selfSaved[uriString]
            return []
          }

          const comments = detectComments(document.getText())
          log(comments)
          let text = document.getText().replaceAll("\r\n", "\n")

          let newText = await modifyText(
            text,
            comments,
            document,
            diagnosticCollection,
            false,
          )

          if (newText !== document.getText()) {
            const edit = vscode.TextEdit.replace(
              new vscode.Range(
                0,
                0,
                document.lineCount,
                document.lineAt(document.lineCount - 1).range.end
                  .character,
              ),
              newText,
            )
            return [edit]
          }

          return []
        },
      },
    ),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "autoRegex.applyRegexesToAllFiles",
      async () => {
        const editor = vscode.window.activeTextEditor
        if (editor) {
          for (const document of vscode.workspace.textDocuments) {
            await applyRegex(document)
          }
        }
        const workspaceFolders = vscode.workspace.workspaceFolders
        if (workspaceFolders) {
          for (const folder of workspaceFolders) {
            await findAndReplaceInDirectory(folder.uri.fsPath)
          }
        }
      },
    ),
  )
  async function findAndReplaceInDirectory(directory: string) {
    const files = afs.readdirSync(directory)
    for (const file of files) {
      const filePath = path.join(directory, file)
      const stat = afs.statSync(filePath)
      if (stat.isDirectory()) {
        await findAndReplaceInDirectory(filePath)
      } else {
        const document =
          await vscode.workspace.openTextDocument(filePath)
        await applyRegex(document)
      }
    }
  }
  const settingsDir = path.resolve(
    context.globalStorageUri.fsPath,
    "..",
    "..",
  )
  const globalRegexFilePath = vscode.Uri.file(
    path.join(settingsDir, "replace.regex"),
  )
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("auto-regex")
  context.subscriptions.push(diagnosticCollection)

  const activeMessages = new Map()

  function showError(messageName: string, message: string) {
    const config = vscode.workspace.getConfiguration("auto-regex")
    if (activeMessages.has(messageName)) {
      return
    }
    // const outputChannel = vscode.window.createOutputChannel("Error Details")
    // outputChannel.show()
    // outputChannel.appendLine("\x1b[31m" + message)
    const errorMessage = vscode.window.showErrorMessage(message, {
      modal: !!config.get("show regex errors as popup"),
    })
    if (messageName !== "unnamed regex") {
      activeMessages.set(messageName, errorMessage)

      errorMessage.then(() => {
        activeMessages.delete(messageName)
      })
    }
  }
  log("Auto Regex extension is now active!")
  interface SelfSaved {
    [key: string]: any
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "autoRegex.openRegexFile",
      async () => {
        const content = await getGlobalSettings()

        if (content !== null) {
          await vscode.window.showTextDocument(
            await vscode.workspace.openTextDocument(
              globalRegexFilePath,
            ),
          )
        } else {
          vscode.window.showErrorMessage(
            "Could not find replace.regex file.",
          )
        }
      },
    ),
  )

  async function getGlobalSettings() {
    try {
      const buffer = await fs.readFile(globalRegexFilePath)
      const decoder = new TextDecoder("utf-8")
      return decoder.decode(buffer)
    } catch (err) {
      fs.writeFile(globalRegexFilePath, new Uint8Array())
      log("Unable to read global replace.regex", err)
    }
    return ""
  }

  const selfSaved: SelfSaved = {}
  async function modifyText(
    text: string,
    comments: { match: string; start: number; length: number }[],
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection,
    noReplace: boolean = false,
  ): Promise<string> {
    diagnosticCollection.delete(document.uri)
    let mode = "inactive"
    let startreg = ""
    let replace = ""
    // clear()
    // text = text.replaceAll("\\", "☺")
    // log(3, [text.substring(0, 100)], 3)
    // log(3, [text.substring(0, 100)], 3)
    text = text.replaceAll("\r\n", "\n")
    // log(3, [text.substring(0, 100)], 3)
    // text = text.replaceAll("☺", "\\")
    // log(3, [text.substring(0, 100)], 3)
    let newText = text

    // let lastCommentEnd = 0
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
    // clear()
    var tokens: (
      | { token: string; value: string; end: number }
      | { token: "!reset"; value: undefined; end: undefined }
    )[] = []
    for (var comment of comments) tokens.push(...gettoken(comment))
    var fileRegStartIdx = tokens.length
    error(tokens, "tokens")
    let regexFileContents: string
    const regFilePath: string =
      (vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "") +
      "/replace.regex"
    if (vscode.workspace.workspaceFolders) {
      try {
        const buffer = await fs.readFile(vscode.Uri.file(regFilePath))
        const decoder = new TextDecoder("utf-8")
        regexFileContents = decoder.decode(buffer)
        for (var part of detectComments(regexFileContents, null))
          tokens.push(...gettoken(part))
      } catch (err) {
        log("Unable to read replace.regex", err)
      }
    }
    for (var part of detectComments(await getGlobalSettings(), null))
      tokens.push(...gettoken(part), {
        token: "!reset",
        value: undefined,
        end: undefined,
      })
    var flags: string = "gm"
    var name: string = "unnamed regex"
    var untilfail: boolean = false
    var full: boolean = false
    var fileMatchRequirement: string | undefined
    var diagSeverity: vscode.DiagnosticSeverity | undefined
    var diagMessage: string = ""
    var regCounter = 0
    var errgroup = 0
    for (const { token, value, end } of tokens) {
      if (token === "!reset" && value === undefined) {
        fileMatchRequirement = undefined
        name = "unnamed regex"
        continue
      }
      if (token == "noregex") break
      if (
        (mode == "replacing" || mode == "started") &&
        token == "untilfail"
      ) {
        untilfail = true
      } else if (
        (mode === "inactive" ||
          mode == "replacing" ||
          mode == "started") &&
        token == "file"
      ) {
        fileMatchRequirement = value
      } else if (
        (mode == "replacing" || mode == "started") &&
        token == "full"
      ) {
        full = true
      } else if (
        (mode == "replacing" || mode == "started") &&
        token == "flags"
      ) {
        flags = value
      } else if (mode === "inactive" && token == "name") {
        name = value
      } else if (mode === "inactive" && token == "regex") {
        mode = "started"
        flags = "gm"
        untilfail = false
        full = false
        startreg = value
      } else if (mode === "started" && token === "replace") {
        mode = "replacing"
        replace = value
      } else if (
        mode === "started" &&
        (token === "info" || token === "warn" || token === "error")
      ) {
        mode = "diagnosing"
        diagMessage = value
        diagSeverity =
          token === "info" ? vscode.DiagnosticSeverity.Information
          : token === "warn" ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Error
      } else if (mode === "diagnosing" && token === "errgroup") {
        errgroup = Number(value)
      } else if (mode === "diagnosing" && token === "endregex") {
        // startreg = startreg.replaceAll("\\\\", "\\")
        regCounter++
        if (
          fileMatchRequirement &&
          !new RegExp(fileMatchRequirement, "i").test(
            document.uri.fsPath.replaceAll("\\", "/"),
          )
        ) {
          warn(
            "fileMatchRequirement",
            fileMatchRequirement,
            "does not match the current file",
            document.uri.fsPath,
          )
          mode = "inactive"
          continue
        }
        log(fileMatchRequirement, document.uri.fsPath)
        try {
          if (
            document.uri.fsPath.replace("\\", "/") !==
              regFilePath.replace("\\", "/") &&
            regCounter > fileRegStartIdx
          )
            full = true
          var textAfterEnd = full ? newText : newText.substring(end)

          var regex = new RegExp(
            startreg,
            flags.replace("d", "") + "d",
          )
          var newDiagnostics: vscode.Diagnostic[] = []
          var searchOffset = full ? 0 : end
          const hasbr = text.includes("\r")
          for (const match of textAfterEnd.matchAll(regex)) {
            var [startidx, endidx] = match.indices![errgroup]
            const crlfCount =
              hasbr ?
                (text.slice(0, startidx).match(/\n/g) || []).length
              : 0
            const correctedIndex = startidx + crlfCount
            const startPos = document.positionAt(
              searchOffset + correctedIndex!,
            )
            const endPos = document.positionAt(searchOffset + endidx)
            const newDiagMessage = diagMessage.replace(
              /(?<!\w)!ln\.(\d)(?!\w)/g,
              (_, ln) => {
                const lineNumber = text
                  .slice(0, match.indices![Number(ln)][0])
                  .split('\n').length
                return lineNumber.toString()
              },
            )
            newDiagnostics.push(
              new vscode.Diagnostic(
                new vscode.Range(startPos, endPos),
                regrep(match[0], regex, newDiagMessage) || name,
                diagSeverity,
              ),
            )
          }
          diagnosticCollection.set(document.uri, [
            ...(diagnosticCollection.get(document.uri) ?? []),
            ...newDiagnostics,
          ])
        } catch (e: any) {
          mode = "inactive"
          showError(
            name,
            `@error ${name}\n/${startreg}/${flags}\n${e.message}`,
          )
          error(`@error ${name}: /${startreg}/${flags}\n`, e.message)
          continue
        }
        mode = "inactive"
        errgroup = 0
        diagSeverity = undefined
        diagMessage = ""
      } else if (mode === "replacing" && token === "endregex") {
        if (noReplace) {
          name = "unnamed regex"
          mode = "inactive"
          continue
        }
        // startreg = startreg.replaceAll("\\\\", "\\")
        regCounter++
        if (
          fileMatchRequirement &&
          !new RegExp(fileMatchRequirement, "i").test(
            document.uri.fsPath.replaceAll("\\", "/"),
          )
        ) {
          warn(
            "fileMatchRequirement",
            fileMatchRequirement,
            "does not match the current file",
            document.uri.fsPath,
          )
          name = "unnamed regex"
          mode = "inactive"
          continue
        }
        log(fileMatchRequirement, document.uri.fsPath)
        try {
          var regex = new RegExp(startreg, flags)
          if (untilfail && regrep("", regex, "TEMP") === "TEMP") {
            showError(
              name,
              `Regex /${startreg}/ matches empty strings. 'untilfail' disabled to prevent freeze.`,
            )
            untilfail = false
          }
        } catch (e: any) {
          mode = "inactive"
          showError(
            name,
            `@error ${name}\n/${startreg}/${flags}\n${e.message}`,
          )
          error(`@error ${name}: /${startreg}/${flags}\n`, e.message)
          continue
        }
        var i = 0
        if (
          document.uri.fsPath.replace("\\", "/") !==
            regFilePath.replace("\\", "/") &&
          regCounter > fileRegStartIdx
        )
          full = true
        var textAfterEnd = full ? newText : newText.substring(end)

        while (i++ == 0 || untilfail) {
          if (regex.test(textAfterEnd)) {
            warn(
              regCounter,
              fileRegStartIdx,
              regCounter > fileRegStartIdx,
              "replacing...",
              [regex, replace],
            )
            if (full) newText = regrep(newText, regex, replace)
            else
              newText =
                newText.substring(0, end) +
                (textAfterEnd = regrep(textAfterEnd, regex, replace))
            // warn("newText", newText)
            if (i > 3000) {
              error("too many replacements")
              break
            }
          } else {
            warn(
              regCounter,
              fileRegStartIdx,
              regCounter > fileRegStartIdx,
              document.uri.fsPath !== regFilePath,
              document.uri.fsPath,
              regFilePath,
              "not replacing...",
              [regex, replace],
            )
            break
          }
        }
        name = "unnamed regex"
        mode = "inactive"
        fileMatchRequirement = undefined
      }
    }
    return newText
  }
  async function applyRegex(
    document: vscode.TextDocument,
    noReplace = false,
  ) {
    const uriString = document.uri.toString()
    if (selfSaved[uriString]) {
      delete selfSaved[uriString]
      return
    }

    const comments = detectComments(document.getText())
    log(comments)
    let text = document.getText()
    let newText = await modifyText(
      text,
      comments,
      document,
      diagnosticCollection,
      noReplace,
    )
    if (!noReplace && newText !== text) {
      const edit = new vscode.WorkspaceEdit()
      edit.replace(
        document.uri,
        new vscode.Range(
          0,
          0,
          document.lineCount,
          document.lineAt(document.lineCount - 1).range.end.character,
        ),
        newText,
      )
      vscode.workspace.applyEdit(edit).then(async () => {
        log(`Replacement successful.`)
        selfSaved[uriString] = 1
        // await vscode.commands.executeCommand("workbench.action.files.saveWithoutFormatting")
        if (!(await document.save())) {
          delete selfSaved[uriString]
        }
      })
    }
  }
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme !== "file") {
        return
      }
      applyRegex(document)
    }),
  )
  const pending = new Map<string, NodeJS.Timeout>()

  context.subscriptions.push(
    ...[
      vscode.workspace.onDidChangeTextDocument,
      vscode.workspace.onDidOpenTextDocument,
      vscode.window.onDidChangeActiveTextEditor,
    ].map((e) =>
      e((event) => {
        function getDocument(
          event:
            | vscode.TextDocument
            | vscode.TextEditor
            | vscode.TextDocumentChangeEvent
            | undefined,
        ): vscode.TextDocument | undefined {
          if (!event) return undefined

          if ("document" in event) {
            return event.document
          }

          return event
        }
        let document = getDocument(event)
        if (!document || document.uri.scheme !== "file") return
        const uri = document.uri.toString()

        if (pending.has(uri)) {
          clearTimeout(pending.get(uri)!)
        }

        pending.set(
          uri,
          setTimeout(async () => {
            pending.delete(uri)
            await applyRegex(document, true)
          }, 300), // 200-500ms is typical
        )
      }),
    ),
  )
}

function detectComments(
  text: string,
  LANG: string | null = getlang(),
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
    const blockCommentRegex = new RegExp(`(^(?!\n).*$\n)+$`, "gm")
    log("blockCommentRegex", blockCommentRegex)
    let match
    while ((match = blockCommentRegex.exec(text)) !== null) {
      comments.push({
        match: match[0],
        length: match[0].length,
        start: match.index,
      })
    }
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

export function deactivate() {}

class CustomFoldingProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(
    document: vscode.TextDocument,
  ): vscode.FoldingRange[] {
    const blocks: vscode.FoldingRange[] = []
    var start = -1
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text

      if (line.startsWith("@name") && start == -1) {
        start = i
      }

      if (
        line.startsWith("@endregex") &&
        !document.lineAt(i + 1).text.startsWith("@")
      ) {
        blocks.push(new vscode.FoldingRange(start, i))
        start = -1
      }
    }

    return blocks
  }
}
