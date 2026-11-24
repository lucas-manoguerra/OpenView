import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.astro']);
const sourceRoots = ['apps', 'packages'];
const failures = [];

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }

      return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat();
};

const report = (filePath, rule, detail) => {
  failures.push({ filePath, rule, detail });
};

const getModuleSpecifiers = (sourceFile) => {
  const moduleSpecifiers = [];

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      moduleSpecifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      moduleSpecifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return moduleSpecifiers;
};

const containsEffectHook = (sourceFile) => {
  let found = false;

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings) {
      const bindings = node.importClause.namedBindings;

      if (
        ts.isNamedImports(bindings) &&
        bindings.elements.some((element) => element.name.text === 'useEffect')
      ) {
        found = true;
      }
    }

    if (
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === 'useEffect') ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'useEffect'))
    ) {
      found = true;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
};

for (const root of sourceRoots) {
  const files = await collectFiles(root);

  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    const extension = path.extname(filePath);
    const scriptKind =
      extension === '.tsx' || extension === '.jsx'
        ? ts.ScriptKind.TSX
        : extension === '.js' || extension === '.mjs' || extension === '.cjs'
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );
    const scanner = ts.createScanner(
      ts.ScriptTarget.Latest,
      false,
      ts.LanguageVariant.JSX,
      content,
    );

    let token = scanner.scan();

    while (token !== ts.SyntaxKind.EndOfFileToken) {
      if (
        token === ts.SyntaxKind.SingleLineCommentTrivia ||
        token === ts.SyntaxKind.MultiLineCommentTrivia
      ) {
        report(filePath, 'no-comments', 'Source code must not contain comments.');
      }

      token = scanner.scan();
    }

    if (containsEffectHook(sourceFile)) {
      report(filePath, 'no-use-effect', 'useEffect is prohibited in application and package code.');
    }

    if (extension === '.astro') {
      continue;
    }

    const imports = getModuleSpecifiers(sourceFile);
    const normalizedPath = filePath.split(path.sep).join('/');

    if (normalizedPath.startsWith('packages/')) {
      if (imports.some((specifier) => specifier.startsWith('apps/'))) {
        report(filePath, 'package-direction', 'Packages must not import application modules.');
      }
    }

    if (normalizedPath.startsWith('packages/chart-engine/')) {
      const forbiddenImports = imports.filter((specifier) =>
        /^(preact|astro|tailwindcss|@tailwindcss|@astrojs)(\/|$)/.test(specifier),
      );

      if (forbiddenImports.length > 0) {
        report(
          filePath,
          'chart-engine-isolation',
          `Chart engine imports framework or styling modules: ${forbiddenImports.join(', ')}.`,
        );
      }
    }

    if (normalizedPath.startsWith('packages/market-domain/')) {
      const forbiddenImports = imports.filter(
        (specifier) =>
          specifier.startsWith('@openview/') ||
          /^(preact|astro|tailwindcss|@tailwindcss|@astrojs)(\/|$)/.test(specifier),
      );

      if (forbiddenImports.length > 0) {
        report(
          filePath,
          'domain-isolation',
          `Market domain imports forbidden modules: ${forbiddenImports.join(', ')}.`,
        );
      }
    }

    if (normalizedPath.startsWith('packages/market-data/')) {
      const forbiddenImports = imports.filter((specifier) =>
        /^@openview\/(chart-engine|terminal)(\/|$)/.test(specifier),
      );

      if (forbiddenImports.length > 0) {
        report(
          filePath,
          'market-data-direction',
          `Market data imports forbidden modules: ${forbiddenImports.join(', ')}.`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(
      `${failure.filePath} [${failure.rule}] ${failure.detail}\n`,
    );
  }

  process.exitCode = 1;
} else {
  process.stdout.write('Architecture boundaries, effect policy, and comment policy verified.\n');
}
