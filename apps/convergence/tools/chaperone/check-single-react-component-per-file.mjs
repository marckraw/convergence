import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const DEFAULT_EXTENSIONS = new Set(['.tsx', '.jsx'])
const DEFAULT_EXCLUDED_SUFFIXES = [
  '.test.tsx',
  '.spec.tsx',
  '.stories.tsx',
  '.story.tsx',
]
const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'coverage',
])

function parseArgs(argv) {
  const scopes = []
  const excludeSuffixes = [...DEFAULT_EXCLUDED_SUFFIXES]
  const excludeDirs = new Set(DEFAULT_EXCLUDED_DIRS)
  const extensions = new Set(DEFAULT_EXTENSIONS)

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (argument === '--scope') {
      scopes.push(argv[index + 1])
      index += 1
      continue
    }

    if (argument === '--exclude-suffix') {
      excludeSuffixes.push(argv[index + 1])
      index += 1
      continue
    }

    if (argument === '--exclude-dir') {
      excludeDirs.add(argv[index + 1])
      index += 1
      continue
    }

    if (argument === '--extension') {
      extensions.add(argv[index + 1])
      index += 1
    }
  }

  return {
    scopes: scopes.length > 0 ? scopes : ['src'],
    excludeSuffixes,
    excludeDirs,
    extensions,
  }
}

function collectFiles(params) {
  const files = []

  function visit(pathname) {
    let stats
    try {
      stats = statSync(pathname)
    } catch {
      return
    }

    if (stats.isDirectory()) {
      const directoryName = pathname.split('/').pop() ?? ''
      if (params.excludeDirs.has(directoryName)) {
        return
      }

      for (const entry of readdirSync(pathname)) {
        visit(join(pathname, entry))
      }
      return
    }

    if (!stats.isFile()) {
      return
    }

    if (
      !Array.from(params.extensions).some((extension) =>
        pathname.endsWith(extension),
      )
    ) {
      return
    }

    if (params.excludeSuffixes.some((suffix) => pathname.endsWith(suffix))) {
      return
    }

    files.push(pathname)
  }

  for (const scope of params.scopes) {
    visit(resolve(process.cwd(), scope))
  }

  return files
}

function isPascalCase(name) {
  return /^[A-Z][A-Za-z0-9]*$/.test(name)
}

function isReactCreateElementCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'React' &&
    node.expression.name.text === 'createElement'
  )
}

function unwrapJsxCandidate(node) {
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return unwrapJsxCandidate(node.expression)
  }

  return node
}

function isJsxLikeExpression(node) {
  const unwrappedNode = unwrapJsxCandidate(node)

  return (
    ts.isJsxElement(unwrappedNode) ||
    ts.isJsxSelfClosingElement(unwrappedNode) ||
    ts.isJsxFragment(unwrappedNode) ||
    isReactCreateElementCall(unwrappedNode)
  )
}

function functionLikeReturnsJsx(node) {
  if (ts.isArrowFunction(node) && isJsxLikeExpression(node.body)) {
    return true
  }

  let hasRenderReturn = false

  function visit(currentNode) {
    if (hasRenderReturn) {
      return
    }

    if (
      currentNode !== node &&
      (ts.isFunctionDeclaration(currentNode) ||
        ts.isFunctionExpression(currentNode) ||
        ts.isArrowFunction(currentNode) ||
        ts.isMethodDeclaration(currentNode))
    ) {
      return
    }

    if (
      ts.isReturnStatement(currentNode) &&
      currentNode.expression &&
      isJsxLikeExpression(currentNode.expression)
    ) {
      hasRenderReturn = true
      return
    }

    ts.forEachChild(currentNode, visit)
  }

  ts.forEachChild(node, visit)

  return hasRenderReturn
}

function isComponentWrapperExpression(node) {
  if (ts.isIdentifier(node)) {
    return node.text === 'memo' || node.text === 'forwardRef'
  }

  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    return (
      node.expression.text === 'React' &&
      (node.name.text === 'memo' || node.name.text === 'forwardRef')
    )
  }

  return false
}

function unwrapComponentInitializer(node) {
  if (ts.isParenthesizedExpression(node)) {
    return unwrapComponentInitializer(node.expression)
  }

  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    return node
  }

  if (
    ts.isCallExpression(node) &&
    isComponentWrapperExpression(node.expression) &&
    node.arguments.length > 0
  ) {
    return unwrapComponentInitializer(node.arguments[0])
  }

  return null
}

function classComponentReturnsJsx(node) {
  for (const member of node.members) {
    if (
      ts.isMethodDeclaration(member) &&
      member.name &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'render'
    ) {
      return functionLikeReturnsJsx(member)
    }
  }

  return false
}

function extendsReactComponent(node) {
  if (!node.heritageClauses) {
    return false
  }

  return node.heritageClauses.some((clause) => {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
      return false
    }

    return clause.types.some((typeNode) => {
      if (ts.isIdentifier(typeNode.expression)) {
        return (
          typeNode.expression.text === 'Component' ||
          typeNode.expression.text === 'PureComponent'
        )
      }

      if (
        ts.isPropertyAccessExpression(typeNode.expression) &&
        ts.isIdentifier(typeNode.expression.expression) &&
        typeNode.expression.expression.text === 'React'
      ) {
        return (
          typeNode.expression.name.text === 'Component' ||
          typeNode.expression.name.text === 'PureComponent'
        )
      }

      return false
    })
  })
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind))
}

function collectReactComponents(sourceFile) {
  const candidates = []

  function pushCandidate(name, node) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    )
    candidates.push({
      name,
      line: line + 1,
    })
  }

  function visit(node) {
    if (ts.isFunctionDeclaration(node)) {
      const isDefaultAnonymous =
        !node.name &&
        hasModifier(node, ts.SyntaxKind.DefaultKeyword) &&
        hasModifier(node, ts.SyntaxKind.ExportKeyword)

      if (
        node.name &&
        isPascalCase(node.name.text) &&
        functionLikeReturnsJsx(node)
      ) {
        pushCandidate(node.name.text, node)
      } else if (isDefaultAnonymous && functionLikeReturnsJsx(node)) {
        pushCandidate('default export', node)
      }
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isPascalCase(node.name.text) &&
      node.initializer
    ) {
      const componentInitializer = unwrapComponentInitializer(node.initializer)
      if (
        componentInitializer &&
        functionLikeReturnsJsx(componentInitializer)
      ) {
        pushCandidate(node.name.text, node)
      }
    }

    if (ts.isClassDeclaration(node)) {
      const isDefaultAnonymous =
        !node.name &&
        hasModifier(node, ts.SyntaxKind.DefaultKeyword) &&
        hasModifier(node, ts.SyntaxKind.ExportKeyword)

      if (
        node.name &&
        isPascalCase(node.name.text) &&
        extendsReactComponent(node) &&
        classComponentReturnsJsx(node)
      ) {
        pushCandidate(node.name.text, node)
      } else if (
        isDefaultAnonymous &&
        extendsReactComponent(node) &&
        classComponentReturnsJsx(node)
      ) {
        pushCandidate('default export', node)
      }
    }

    if (ts.isExportAssignment(node)) {
      if (
        (ts.isArrowFunction(node.expression) ||
          ts.isFunctionExpression(node.expression)) &&
        functionLikeReturnsJsx(node.expression)
      ) {
        pushCandidate('default export', node)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return candidates
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const files = collectFiles(options)
  const violations = []

  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    const scriptKind = file.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TSX
    const sourceFile = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    )
    const components = collectReactComponents(sourceFile)

    if (components.length > 1) {
      violations.push({
        file: relative(process.cwd(), file),
        components,
      })
    }
  }

  if (violations.length === 0) {
    process.exit(0)
  }

  console.error('Found files with more than one React component definition:')

  for (const violation of violations) {
    const details = violation.components
      .map((component) => `${component.name} (line ${component.line})`)
      .join(', ')

    console.error(`- ${violation.file}: ${details}`)
  }

  process.exit(1)
}

main()
