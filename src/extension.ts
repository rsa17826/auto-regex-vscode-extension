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
function getlang(
  editor: vscode.TextEditor | undefined = vscode.window
    .activeTextEditor,
) {
  if (!editor) return "" // Return empty instead of showing a message to avoid popups in background tasks
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
  const scriptMatches = fulltext.matchAll(
    /(?<=<script\b[^>]*>)([\s\S]*?)(?=<\/script>)/g,
  )
  let isThisLineInsideScriptTag = false
  for (const match of scriptMatches) {
    const matchStartPosition = document.positionAt(match.index)
    const matchEndPosition = document.positionAt(
      match.index + match[1].length,
    )
    const matchEndLine = document.lineAt(matchEndPosition).lineNumber
    if (
      thisLine >= matchStartPosition.line &&
      thisLine <= matchEndLine
    ) {
      isThisLineInsideScriptTag = true
      break
    }
  }
  var langid = document.languageId
  if (langid == "html" && isThisLineInsideScriptTag)
    langid = "javascript"
  return langid
}
export function activate(context: vscode.ExtensionContext) {
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

          let newText = await modifyText(text, comments, document)

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

  const selfSaved: SelfSaved = {}
  async function modifyText(
    text: string,
    comments: { match: string; start: number; length: number }[],
    document: vscode.TextDocument,
  ): Promise<string> {
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
      return temparr.map((e) => {
        // log(e, e.match(/^@\w+ ([^]*)$/)?.[1])
        return {
          token: e.match(/^@(\w+)/)?.[1] ?? "",
          value: e.match(/^@\w+ ?([^]*)$/)?.[1] ?? "",
          string: e,
          end: start + length,
        }
      })
    }
    // clear()
    var tokens = []
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

    var flags: string = "gm"
    var name: string = "unnamed regex"
    var untilfail: boolean = false
    var full: boolean = false
    var fileMatchRequirement: string | undefined
    var regCounter = 0
    for (const { token, value, end } of tokens) {
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
      } else if (mode === "started" && token == "replace") {
        mode = "replacing"
        replace = value
      } else if (mode === "replacing" && token == "endregex") {
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
            if (full) newText = newText.replace(regex, replace)
            else
              newText =
                newText.substring(0, end) +
                (textAfterEnd = textAfterEnd.replace(regex, replace))
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
      }
    }
    return newText
  }
  async function applyRegex(document: vscode.TextDocument) {
    const uriString = document.uri.toString()
    if (selfSaved[uriString]) {
      delete selfSaved[uriString]
      return
    }

    const comments = detectComments(document.getText())
    log(comments)
    let text = document.getText()
    let newText = await modifyText(text, comments, document)

    if (newText !== text) {
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
  const disposable = vscode.workspace.onDidSaveTextDocument(
    (document) => {
      // 🛑 FIX: Prevent the regex logic from running on the settings file
      if (document.uri.scheme !== "file") {
        return
      }
      applyRegex(document)
    },
  )
  context.subscriptions.push(disposable)
}

function detectComments(
  text: string,
  LANG: string | null = getlang(),
): { match: string; start: number; length: number }[] {
  if (!LANG) return [] // 🛑 FIX: If no language is detected, don't try to regex comments
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
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function deactivate() {}
