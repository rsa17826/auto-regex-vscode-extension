import * as vscode from "vscode"
const fs = vscode.workspace.fs
import * as afs from "fs"
import * as path from "path"
import { createHash } from "crypto"

Object.assign(global, console)
declare global {
  function log(...args: any[]): void
  function error(...args: any[]): void
  function warn(...args: any[]): void
  function info(...args: any[]): void
  function clear(...args: any[]): void
}
const regexCache = new Map<string, string>()
const jsCache = new Map<
  string,
  { start: number; end: number; text: string }[]
>()
const tokenCache = new Map<
  string,
  { token: string; value: string; string: string }[]
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
function runJs(
  code: string,
  text: string,
): { start: number; end: number; text: string }[] {
  const key = code + "||" + text

  if (jsCache.has(key)) {
    return jsCache.get(key)!
  }

  const fn = new Function("text", code)
  const result = fn(text)
  if (!Array.isArray(result)) {
    throw new Error(
      `@js block must return an array of {start, end, text}, got ${typeof result}`,
    )
  }
  for (const m of result) {
    if (
      typeof m?.start !== "number" ||
      typeof m?.end !== "number" ||
      typeof m?.text !== "string"
    ) {
      throw new Error(
        `@js block returned an invalid match: ${JSON.stringify(
          m,
        )} — each match needs a numeric start, numeric end, and string text`,
      )
    }
    if (
      !Number.isInteger(m.start) ||
      !Number.isInteger(m.end) ||
      m.start < 0 ||
      m.end < m.start ||
      m.end > text.length
    ) {
      throw new Error(
        `@js block returned an out-of-range match: ${JSON.stringify(
          m,
        )} — start and end are absolute offsets into text (length ${text.length}) with 0 <= start <= end <= text.length; end is exclusive`,
      )
    }
  }
  jsCache.set(key, result)
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
  context.subscriptions.push(output)
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
          if (
            document.uri.scheme !== "file" ||
            isTempJs(document.uri)
          ) {
            return []
          }
          const uriString = document.uri.toString()
          if (selfSaved[uriString]) {
            delete selfSaved[uriString]
            return []
          }

          const comments = detectComments(
            document.getText(),
            document.languageId,
          )
          log(comments)
          let text = document.getText().replaceAll("\r\n", "\n")

          let newText = await modifyText(
            text,
            comments,
            document,
            diagnosticCollection,
            false,
          )
          if (isRegexFile(document)) {
            newText = await formatJsBlocks(
              document.uri,
              newText,
              options,
            )
          }

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
  const jsDiagnosticCollection =
    vscode.languages.createDiagnosticCollection("auto-regex-js")
  context.subscriptions.push(jsDiagnosticCollection)
  const shadowDir = vscode.Uri.joinPath(
    context.globalStorageUri,
    SHADOW_DIR_NAME,
  )
  const shadowCreated = new Set<string>()
  const shadowToOriginal = new Map<string, vscode.TextDocument>()
  const shadowUriFor = (document: vscode.TextDocument) =>
    vscode.Uri.joinPath(
      shadowDir,
      createHash("md5").update(document.uri.fsPath).digest("hex") +
        ".js",
    )
  /**
   * Keeps a real .js document in sync with the @js blocks of a .regex
   * document (see buildShadow). tsserver and every JS extension treat it
   * as ordinary JavaScript, so requests for the blocks can be forwarded to
   * it. Its text is changed through edits and never saved, and it never
   * has an editor, so it is invisible.
   */
  async function ensureShadow(document: vscode.TextDocument) {
    const uri = shadowUriFor(document)
    const key = uri.toString()
    if (!shadowCreated.has(key)) {
      await fs.createDirectory(shadowDir)
      await fs.writeFile(uri, new Uint8Array())
      shadowCreated.add(key)
    }
    shadowToOriginal.set(key, document)
    const shadow = await vscode.workspace.openTextDocument(uri)
    const want = buildShadow(document.getText())
    if (shadow.getText() !== want) {
      const edit = new vscode.WorkspaceEdit()
      edit.replace(
        uri,
        new vscode.Range(
          shadow.positionAt(0),
          shadow.positionAt(shadow.getText().length),
        ),
        want,
      )
      if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error(
          "could not update the @js shadow document " + key,
        )
      }
    }
    return shadow
  }
  function publishJsDiagnostics(document: vscode.TextDocument) {
    const { unclosed } = findJsBlocks(
      document.getText().split(/\r?\n/),
    )
    const result: vscode.Diagnostic[] = unclosed.map(
      (line) =>
        new vscode.Diagnostic(
          document.lineAt(line).range,
          "@js is never closed with @endjs",
          vscode.DiagnosticSeverity.Error,
        ),
    )
    for (const d of vscode.languages.getDiagnostics(
      shadowUriFor(document),
    )) {
      const code = typeof d.code === "object" ? d.code.value : d.code
      // "return outside a function": returning the matches is how a @js
      // block works
      if (code === 1108) continue
      const range = fromShadowRange(d.range, document.lineCount)
      if (!range) continue // the head/tail the shadow adds
      const mapped = new vscode.Diagnostic(
        range,
        d.message,
        d.severity,
      )
      mapped.source = d.source ? `@js (${d.source})` : "@js"
      mapped.code = d.code
      mapped.tags = d.tags
      result.push(mapped)
    }
    output.appendLine(
      `@js lint: ${result.length} diagnostics for ${path.basename(document.uri.fsPath)}`,
    )
    jsDiagnosticCollection.set(document.uri, result)
  }
  function reportError(what: string, err: unknown) {
    const msg =
      err instanceof Error ? (err.stack ?? err.message) : String(err)
    output.appendLine(`${what} failed: ${msg}`)
    vscode.window.showErrorMessage(
      `auto-regex: ${what} failed: ${msg}`,
    )
  }
  async function lintJs(document: vscode.TextDocument) {
    await ensureShadow(document)
    // tsserver publishes its results through onDidChangeDiagnostics below
    publishJsDiagnostics(document)
  }
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      for (const uri of e.uris) {
        const original = shadowToOriginal.get(uri.toString())
        if (original) publishJsDiagnostics(original)
      }
    }),
  )

  // ---- forward the language features of the JS extension ----
  const regexFiles = { pattern: "**/*.regex" }
  async function forward<T>(
    document: vscode.TextDocument,
    position: vscode.Position,
    command: string,
    ...extra: unknown[]
  ): Promise<T | undefined> {
    // outside the @js blocks this is a plain regex file
    if (
      !jsBlockAt(
        document.getText(),
        position.line,
        position.character,
      )
    )
      return undefined
    const shadow = await ensureShadow(document)
    return vscode.commands.executeCommand<T>(
      command,
      shadow.uri,
      toShadow(position),
      ...extra,
    )
  }
  const mapLocation = (
    l: vscode.Location | vscode.LocationLink,
    document: vscode.TextDocument,
  ): vscode.LocationLink | undefined => {
    const shadow = shadowUriFor(document).toString()
    const link: vscode.LocationLink =
      "targetUri" in l ? l : (
        { targetUri: l.uri, targetRange: l.range }
      )
    if (link.targetUri.toString() !== shadow) return link
    const targetRange = fromShadowRange(
      link.targetRange,
      document.lineCount,
    )
    if (!targetRange) return undefined
    return {
      originSelectionRange:
        link.originSelectionRange ?
          fromShadowRange(
            link.originSelectionRange,
            document.lineCount,
          )
        : undefined,
      targetUri: document.uri,
      targetRange,
      targetSelectionRange:
        link.targetSelectionRange ?
          fromShadowRange(
            link.targetSelectionRange,
            document.lineCount,
          )
        : undefined,
    }
  }
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(regexFiles, {
      provideHover: async (document, position) => {
        const hovers = await forward<vscode.Hover[]>(
          document,
          position,
          "vscode.executeHoverProvider",
        )
        if (!hovers?.length) return undefined
        const first = hovers.find((h) => h.range)?.range
        return new vscode.Hover(
          hovers.flatMap((h) => h.contents),
          first ?
            fromShadowRange(first, document.lineCount)
          : undefined,
        )
      },
    }),
    vscode.languages.registerDefinitionProvider(regexFiles, {
      provideDefinition: async (document, position) => {
        const found = await forward<
          (vscode.Location | vscode.LocationLink)[]
        >(document, position, "vscode.executeDefinitionProvider")
        return found
          ?.map((l) => mapLocation(l, document))
          .filter((l) => l !== undefined)
      },
    }),
    vscode.languages.registerReferenceProvider(regexFiles, {
      provideReferences: async (document, position) => {
        const found = await forward<vscode.Location[]>(
          document,
          position,
          "vscode.executeReferenceProvider",
        )
        return found
          ?.map((l) => mapLocation(l, document))
          .filter((l) => l !== undefined)
          .map((l) => new vscode.Location(l.targetUri, l.targetRange))
      },
    }),
    vscode.languages.registerSignatureHelpProvider(
      regexFiles,
      {
        provideSignatureHelp: (document, position, _token, ctx) =>
          forward<vscode.SignatureHelp>(
            document,
            position,
            "vscode.executeSignatureHelpProvider",
            ctx.triggerCharacter,
          ),
      },
      "(",
      ",",
    ),
    vscode.languages.registerCompletionItemProvider(
      regexFiles,
      {
        provideCompletionItems: async (
          document,
          position,
          _token,
          ctx,
        ) => {
          const list = await forward<vscode.CompletionList>(
            document,
            position,
            "vscode.executeCompletionItemProvider",
            ctx.triggerCharacter,
          )
          if (!list) return undefined
          for (const item of list.items) {
            const r = item.range
            if (!r) continue
            if ("inserting" in r) {
              const inserting = fromShadowRange(
                r.inserting,
                document.lineCount,
              )
              const replacing = fromShadowRange(
                r.replacing,
                document.lineCount,
              )
              item.range =
                inserting && replacing ?
                  { inserting, replacing }
                : undefined
            } else {
              item.range = fromShadowRange(r, document.lineCount)
            }
          }
          return list
        },
      },
      ".",
    ),
  )

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
    function gettoken(
      match: string,
    ): { token: string; value: string; string: string }[] {
      if (tokenCache.has(match)) {
        return tokenCache.get(match)!
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
        }
      })
      tokenCache.set(match, result)
      return result
    }
    // clear()
    var tokens: (
      | { token: string; value: string; end: number }
      | { token: "!reset"; value: undefined; end: undefined }
    )[] = []
    function pushChunkTokens(
      chunk: { match: string; start: number; length: number },
      startsAfterChunk: boolean,
    ) {
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
      // A rule written in the document being processed (or in the rule
      // file that is itself the document) only applies to the text after
      // the chunk that defines it, so it can never rewrite its own
      // definition. A rule from any other file has no position in this
      // document, so it applies to all of it.
      const end = startsAfterChunk ? chunk.start + chunk.length : 0
      for (const t of gettoken(chunk.match)) {
        tokens.push({ token: t.token, value: t.value, end })
      }
    }
    const docIsFile = (uri: vscode.Uri) =>
      uri.fsPath === document.uri.fsPath
    for (var comment of comments) pushChunkTokens(comment, true)
    error(tokens, "tokens")
    const regFilePath: string =
      (vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "") +
      "/replace.regex"
    if (vscode.workspace.workspaceFolders) {
      const workspaceRuleUri = vscode.Uri.file(regFilePath)
      try {
        // when the rule file is the document, use the live text rather
        // than the saved copy so the offsets match
        const ruleText =
          docIsFile(workspaceRuleUri) ? text : (
            new TextDecoder("utf-8").decode(
              await fs.readFile(workspaceRuleUri),
            )
          )
        for (var part of detectComments(ruleText, null))
          pushChunkTokens(part, docIsFile(workspaceRuleUri))
      } catch (err) {
        log("Unable to read replace.regex", err)
      }
    }
    const globalRuleText =
      docIsFile(globalRegexFilePath) ? text : (
        await getGlobalSettings()
      )
    for (var part of detectComments(globalRuleText, null))
      pushChunkTokens(part, docIsFile(globalRegexFilePath))
    var flags: string = "gm"
    var name: string = "unnamed regex"
    var untilfail: boolean = false
    var full: boolean = false
    var isJs: boolean = false
    var jsCode: string = ""
    var fileMatchRequirement: string | undefined
    var diagSeverity: vscode.DiagnosticSeverity | undefined
    var diagMessage: string = ""
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
        isJs = false
        startreg = value
      } else if (mode === "inactive" && token == "js") {
        mode = "started"
        flags = "gm"
        untilfail = false
        full = false
        isJs = true
        startreg = ""
        jsCode = value
      } else if (mode === "started" && isJs && token === "endjs") {
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
          isJs = false
          continue
        }
        if (noReplace) {
          name = "unnamed regex"
          mode = "inactive"
          isJs = false
          continue
        }
        log(fileMatchRequirement, document.uri.fsPath)
        try {
          // offsets returned by the js are absolute within the text it
          // was given, which starts at `from`
          const from = full ? 0 : end
          const target = newText.substring(from)
          const jsMatches = runJs(jsCode, target)
          if (jsMatches.length) {
            let replaced = target
            let limit = target.length
            // last to first so earlier offsets stay valid
            for (const m of [...jsMatches].sort(
              (a, b) => b.start - a.start,
            )) {
              if (m.end > limit) {
                throw new Error(
                  `@js matches overlap: ${JSON.stringify(m)} runs into a later match starting at ${limit}`,
                )
              }
              replaced =
                replaced.substring(0, m.start) +
                m.text +
                replaced.substring(m.end)
              limit = m.start
            }
            newText = newText.substring(0, from) + replaced
          }
        } catch (e: any) {
          mode = "inactive"
          isJs = false
          showError(
            name,
            `@error ${name}\n@js\n${jsCode}\n${e.message}`,
          )
          error(`@error ${name}: @js\n`, e.message)
          continue
        }
        name = "unnamed regex"
        mode = "inactive"
        isJs = false
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
          var searchOffset = full ? 0 : end
          var textAfterEnd = newText.substring(searchOffset)

          var regex = new RegExp(
            startreg,
            flags.replace("d", "") + "d",
          )
          var newDiagnostics: vscode.Diagnostic[] = []
          const hasbr = text.includes("\r")
          for (const match of textAfterEnd.matchAll(regex)) {
            const indices = match.indices?.[errgroup]
            if (!indices) {
              throw new Error(
                `regex group ${errgroup} has no indices for match ${JSON.stringify(match[0])} — check errgroup in the "diagnosing" config`,
              )
            }
            var [startidx, endidx] = indices
            const crlfCount =
              hasbr ?
                (text.slice(0, startidx).match(/\n/g) || []).length
              : 0
            const correctedIndex = startidx + crlfCount
            const startPos = document.positionAt(
              searchOffset + correctedIndex,
            )
            const endPos = document.positionAt(searchOffset + endidx)
            const newDiagMessage = diagMessage.replace(
              /(?<!\w)!ln\.(\d)(?!\w)/g,
              (_, ln) => {
                const groupIndices = match.indices![Number(ln)]
                if (!groupIndices) {
                  throw new Error(
                    `regex group ${ln} referenced in "!ln.${ln}" has no indices for match ${JSON.stringify(match[0])}`,
                  )
                }
                const lineNumber = text
                  .slice(0, groupIndices[0])
                  .split("\n").length
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
        const from = full ? 0 : end
        let body = newText.substring(from)
        let iterations = 0
        do {
          const replaced = regrep(body, regex, replace)
          if (replaced === body) break
          body = replaced
          if (++iterations >= 3000) {
            error("too many replacements")
            break
          }
        } while (untilfail)
        newText = newText.substring(0, from) + body
        name = "unnamed regex"
        mode = "inactive"
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

    const comments = detectComments(
      document.getText(),
      document.languageId,
    )
    log(comments)
    let text = document.getText()
    let newText = await modifyText(
      text,
      comments,
      document,
      diagnosticCollection,
      noReplace,
    )
    if (!noReplace && isRegexFile(document)) {
      const editor = vscode.workspace.getConfiguration(
        "editor",
        document,
      )
      newText = await formatJsBlocks(document.uri, newText, {
        tabSize: editor.get<number>("tabSize")!,
        insertSpaces: editor.get<boolean>("insertSpaces")!,
      })
    }
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
      if (document.uri.scheme !== "file" || isTempJs(document.uri)) {
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
        if (
          !document ||
          document.uri.scheme !== "file" ||
          isTempJs(document.uri)
        )
          return
        const uri = document.uri.toString()

        if (pending.has(uri)) {
          clearTimeout(pending.get(uri)!)
        }

        pending.set(
          uri,
          setTimeout(async () => {
            pending.delete(uri)
            await applyRegex(document, true)
            if (isRegexFile(document)) {
              await lintJs(document).catch((e) =>
                reportError("@js lint", e),
              )
            }
          }, 300), // 200-500ms is typical
        )
      }),
    ),
  )

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { pattern: "**/*.regex" },
      {
        provideCompletionItems(document, position) {
          // 1. Get the text of the document up to the cursor
          const fullText = document.getText(
            new vscode.Range(new vscode.Position(0, 0), position),
          )

          // 2. Helper to check what the "latest" tag is
          const lastTag = (tag: string) => {
            log(fullText.lastIndexOf(tag))
            return fullText.lastIndexOf(tag)
          }

          const isAfterName =
            lastTag("@name") > lastTag("@file") &&
            lastTag("@name") > lastTag("@regex") &&
            lastTag("@name") > lastTag("@js")
          const isAfterFile =
            lastTag("@file") > lastTag("@regex") &&
            lastTag("@file") > lastTag("@js")
          const isAfterRegex = lastTag("@regex") > -1
          const isAfterJs =
            lastTag("@js") > lastTag("@regex") && lastTag("@js") > -1

          function item(
            label: string,
            insert: string,
            detail: string,
            priority: string,
          ) {
            const c = new vscode.CompletionItem(
              label,
              vscode.CompletionItemKind.Keyword,
            )
            c.insertText = new vscode.SnippetString(insert)

            c.sortText = `${priority}_${label}`

            const md = new vscode.MarkdownString()
            md.appendMarkdown(`Type: **${detail}**\n\n`)
            md.appendCodeblock(label, "regex")
            c.documentation = md
            return c
          }

          // TODO make work fully how it should
          // 3. Logic-based Sorting
          let pName = "50",
            pFile = "51",
            pRegex = "52",
            pJs = "53",
            pSuffix = "54",
            pEnd = "99",
            pEndJs = "99"

          if (
            fullText.trim() === "" ||
            lastTag("@endregex") > lastTag("@name") ||
            lastTag("@endjs") > lastTag("@name")
          ) {
            pName = "01"
          } else if (isAfterName) {
            pFile = "01"
            pRegex = "02"
            pJs = "02"
          } else if (isAfterFile) {
            pRegex = "01"
            pJs = "01"
          } else if (isAfterRegex) {
            pSuffix = "01"
            pEnd = "02"
          } else if (isAfterJs) {
            pEndJs = "01"
          }

          return [
            item(
              "@name",
              "@name $0",
              "Start a new regex block",
              pName,
            ),
            item("@file", "@file $0", "File pattern (regex)", pFile),
            item("@regex", "@regex $0", "Match pattern", pRegex),
            item(
              "@js",
              "@js $0",
              "JavaScript match/replace block",
              pJs,
            ),

            item(
              "@replace",
              "@replace $0",
              "Replacement string",
              pSuffix,
            ),
            item("@flags", "@flags $0", "Regex flags", pSuffix),
            item("@error", "@error $0", "Error message", pSuffix),
            item("@warn", "@warn $0", "Warning message", pSuffix),
            item("@info", "@info $0", "Info message", pSuffix),

            item("@endregex", "@endregex", "End of block", pEnd),
            item("@endjs", "@endjs", "End of @js block", pEndJs),
          ]
        },
      },
      "@\n",
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
    const blockCommentRegex = /(?:^(?!\s*$).+\n?)+/gm
    log("blockCommentRegex", blockCommentRegex)
    const countOpens = (str: string) =>
      (str.match(/(?:^|\n)@(?:regex|js)\b/g) || []).length
    const countCloses = (str: string) =>
      (str.match(/(?:^|\n)@(?:endregex|endjs)\b/g) || []).length
    const raw = [...(text + "\n").matchAll(blockCommentRegex)].map(
      (match) => ({
        match: match[0],
        length: match[0].length,
        start: match.index!,
      }),
    )
    // Blank lines normally split one block from the next, but a blank
    // line landing inside an unclosed @regex ... @endregex or
    // @js ... @endjs body must not sever it — that would silently
    // drop everything from the next chunk's first line up to its next
    // @-tag. So keep merging consecutive blocks, blank-line gap
    // included (however many blank lines in a row), for as long as
    // the accumulated text has more block-opening tags than closing
    // ones.
    const merged: { match: string; length: number; start: number }[] =
      []
    for (const chunk of raw) {
      const last = merged[merged.length - 1]
      if (last && countOpens(last.match) > countCloses(last.match)) {
        const gap = text.slice(last.start + last.length, chunk.start)
        last.match += gap + chunk.match
        last.length += gap.length + chunk.length
        continue
      }
      merged.push({ ...chunk })
    }
    comments.push(...merged)
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

const output = vscode.window.createOutputChannel("auto-regex")
let warnedNoDefaultFormatter = false
const TEMP_PREFIX = ".auto-regex-tmp-"
const SHADOW_DIR_NAME = "js-shadow"
const isTempJs = (uri: vscode.Uri) =>
  path.basename(uri.fsPath).startsWith(TEMP_PREFIX) ||
  uri.fsPath.split(path.sep).includes(SHADOW_DIR_NAME)
let tempCounter = 0

/**
 * Runs `use` on a real, short-lived .js file next to `near`. A real file
 * (unlike an untitled document) opens without an editor tab, is handled by
 * every JS formatter/linter, and lets them find the project's config.
 */
async function withTempJs<T>(
  near: vscode.Uri,
  content: string,
  use: (doc: vscode.TextDocument) => Promise<T>,
): Promise<T> {
  const uri = vscode.Uri.file(
    path.join(
      path.dirname(near.fsPath),
      `${TEMP_PREFIX}${process.pid}-${tempCounter++}.js`,
    ),
  )
  await fs.writeFile(uri, new TextEncoder().encode(content))
  try {
    return await use(await vscode.workspace.openTextDocument(uri))
  } finally {
    await fs.delete(uri)
  }
}

function isRegexFile(document: vscode.TextDocument) {
  return document.uri.fsPath.endsWith(".regex")
}

interface JsBlock {
  tagLine: number
  endLine: number
  /** length of the "@js" tag plus its optional single separator */
  prefix: number
  /** code on the same line as @js */
  inline: string
  /** lines strictly between @js and @endjs */
  body: string[]
}

function findJsBlocks(lines: string[]) {
  const blocks: JsBlock[] = []
  const unclosed: number[] = []
  for (let i = 0; i < lines.length; i++) {
    const open = /^@js(?:[ \t]|$)/.exec(lines[i])
    if (!open) continue
    const endLine = lines.findIndex(
      (l, j) => j > i && /^@endjs\b/.test(l),
    )
    if (endLine === -1) {
      unclosed.push(i)
      continue
    }
    blocks.push({
      tagLine: i,
      endLine,
      prefix: open[0].length,
      inline: lines[i].slice(open[0].length),
      body: lines.slice(i + 1, endLine),
    })
    i = endLine
  }
  return { blocks, unclosed }
}

function applyTextEdits(
  doc: vscode.TextDocument,
  edits: vscode.TextEdit[],
) {
  let out = doc.getText()
  for (const e of [...edits].sort(
    (a, b) =>
      doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
  )) {
    out =
      out.slice(0, doc.offsetAt(e.range.start)) +
      e.newText +
      out.slice(doc.offsetAt(e.range.end))
  }
  return out
}

/**
 * Formats JS with whatever formatter the user has set for JavaScript, by
 * handing it a throwaway .js file. The code is NOT
 * wrapped in a function: wrapping would indent it and the indent can't be
 * removed safely (template literals), and formatters accept a top-level
 * `return`.
 */
async function formatJsCode(
  near: vscode.Uri,
  code: string[],
  options: vscode.FormattingOptions,
): Promise<string[]> {
  return withTempJs(near, code.join("\n"), async (doc) => {
    // VS Code returns undefined when the formatter has nothing to change
    // (it also does so when it has no JavaScript formatter to pick)
    const edits = await vscode.commands.executeCommand<
      vscode.TextEdit[] | undefined
    >("vscode.executeFormatDocumentProvider", doc.uri, options)
    const formatter = vscode.workspace
      .getConfiguration("editor", { languageId: "javascript" })
      .get<string | null>("defaultFormatter")
    output.appendLine(
      `@js format: defaultFormatter=${formatter} edits=${edits?.length}`,
    )
    if (
      edits === undefined &&
      !formatter &&
      !warnedNoDefaultFormatter
    ) {
      warnedNoDefaultFormatter = true
      vscode.window.showWarningMessage(
        `auto-regex: VS Code returned no JavaScript formatting edits and no default JavaScript formatter is set. If it is not just already formatted, set "[javascript]": { "editor.defaultFormatter": "<formatter id>" } in settings.`,
      )
    }
    const lines = applyTextEdits(doc, edits ?? []).split("\n")
    while (lines.length && lines[lines.length - 1].trim() === "")
      lines.pop()
    return lines
  })
}

async function formatJsBlocks(
  near: vscode.Uri,
  text: string,
  options: vscode.FormattingOptions,
) {
  const lines = text.split("\n")
  const { blocks } = findJsBlocks(lines)
  output.appendLine(
    `@js format: ${blocks.length} block(s) in ${path.basename(near.fsPath)}`,
  )
  // last block first so earlier line numbers stay valid
  for (const block of blocks.reverse()) {
    const hasInline = block.inline.trim() !== ""
    const src = hasInline ? [block.inline, ...block.body] : block.body
    // keep the blank lines the author left after @js / before @endjs
    let lead = 0
    while (lead < src.length && src[lead].trim() === "") lead++
    let trail = 0
    while (
      trail < src.length - lead &&
      src[src.length - 1 - trail].trim() === ""
    )
      trail++
    const core = src.slice(lead, src.length - trail)
    if (!core.length) continue
    const out = [
      ...src.slice(0, lead),
      ...(await formatJsCode(near, core, options)),
      ...src.slice(src.length - trail),
    ]
    if (hasInline) {
      lines[block.tagLine] =
        lines[block.tagLine].slice(0, block.prefix) + out.shift()
    }
    lines.splice(
      block.tagLine + 1,
      block.endLine - block.tagLine - 1,
      ...out,
    )
  }
  return lines.join("\n")
}

// The shadow document is the .regex text with everything that is not
// JavaScript blanked out, so a position in it is a position in the .regex
// file (except for the one added head line). Each block is wrapped in { }
// (written over the blanked @js / @endjs tags) so let/const in separate
// blocks don't collide. `text` is declared at the end, and `// @ts-check`
// makes the TypeScript service report semantic errors too.
const SHADOW_HEAD = "// @ts-check\n"
const SHADOW_TAIL = "\n/** @type {string} */\nvar text;\n"

export function buildShadow(text: string) {
  const lines = text.split(/\r?\n/)
  const out = lines.map((l) => " ".repeat(l.length))
  for (const b of findJsBlocks(lines).blocks) {
    out[b.tagLine] = "{" + " ".repeat(b.prefix - 1) + b.inline
    for (let i = b.tagLine + 1; i < b.endLine; i++) out[i] = lines[i]
    out[b.endLine] = "}" + " ".repeat(lines[b.endLine].length - 1)
  }
  return SHADOW_HEAD + out.join("\n") + SHADOW_TAIL
}

export function jsBlockAt(
  text: string,
  line: number,
  character: number,
) {
  return findJsBlocks(text.split(/\r?\n/)).blocks.find(
    (b) =>
      (line > b.tagLine && line < b.endLine) ||
      (line === b.tagLine && character >= b.prefix),
  )
}

const toShadow = (p: vscode.Position) =>
  new vscode.Position(p.line + 1, p.character)

/** undefined for the lines the shadow adds around the .regex text */
function fromShadowRange(r: vscode.Range, lineCount: number) {
  const start = r.start.line - 1
  const end = r.end.line - 1
  if (start < 0 || end >= lineCount) return undefined
  return new vscode.Range(
    start,
    r.start.character,
    end,
    r.end.character,
  )
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
        (line.startsWith("@endregex") || line.startsWith("@endjs")) &&
        !document.lineAt(i + 1).text.startsWith("@")
      ) {
        blocks.push(new vscode.FoldingRange(start, i))
        start = -1
      }
    }

    return blocks
  }
}
