import { ensureActiveProfilePath, getGlobalProfilePath } from './profileManager.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const PROFILE_DEPURATION_DIR = ensureActiveProfilePath('depuration');
const GLOBAL_DEPURATION_DIR = getGlobalProfilePath('depuration');

function depurationPaths(dir) {
  return {
    dir,
    depurators: join(dir, 'depurators.json'),
    rules: join(dir, 'rules', 'rules.json'),
    statements: join(dir, 'staments', 'staments.json'),
    rulesDir: join(dir, 'rules'),
    statementsDir: join(dir, 'staments'),
  };
}

const LOCAL = depurationPaths(PROFILE_DEPURATION_DIR);
const GLOBAL = depurationPaths(GLOBAL_DEPURATION_DIR);

// Agregado solo para que la función run sepa dónde está el archivo de datos
const COLLECTED_GROUPS_FILE = join(PROFILE_DEPURATION_DIR, '../collected_groups.json');

// =============================================
// INIT — crea la estructura de depuración (local o global)
// =============================================
const DEPURATORS_TEMPLATE = {
  depurators: {
    _comment: {
      description: "Los depuradores son el nivel final de filtrado. Concatenan rules existentes mediante AND implícito. Un grupo pasa el depurador solo si TODAS sus rules evalúan a true. Se invocan desde CLI con --depurator <nombre>.",
      structure: {
        rules: "Array de nombres de rules existentes en rules.json. Todas deben cumplirse (AND implícito)."
      },
      example: {
        "depurador_cuba_muebles": {
          "rules": ["rule_muebles_sin_habana", "rule_palabras_prohibidas"]
        }
      },
      output: "Cada grupo evaluado recibe una propiedad 'depuration.depurators.<nombre>.passed' con true/false. No se eliminan filas, solo se etiquetan."
    }
  }
};

const RULES_TEMPLATE = {
  rules: {
    _comment: {
      description: "Las rules combinan statements mediante operadores lógicos (AND/OR). Pueden contener N statements y anidar sub-reglas para lógica compleja.",
      structure: {
        operator: "Operador lógico que une todos los operands. Valores: 'AND' o 'OR'.",
        operands: "Array de elementos. Cada elemento puede ser: (1) un string con el nombre de un statement existente en statements.json, o (2) un objeto anidado con su propio operator y operands (actúa como paréntesis).",
      },
      example_simple: {
        operator: "AND",
        operands: ["has_muebles", "no_habana"]
      },
      example_complex: {
        operator: "OR",
        operands: [
          {
            operator: "AND",
            operands: ["has_muebles", "no_habana"]
          },
          "palabra_exacta_cuba"
        ]
      }
    }
  }
};

const STATEMENTS_TEMPLATE = {
  statements: {
    _comment: {
      description: "Los statements son las unidades atómicas de evaluación. Cada statement devuelve true o false al evaluar una propiedad de un grupo.",
      structure: {
        target: "Propiedad del grupo a evaluar (ej: 'name', 'url'). Por defecto: 'name'.",
        operation: "Tipo de comparación. Valores permitidos: 'includes' (contiene substring), 'excludes' (no contiene), 'whole_word' (palabra exacta con word boundaries), 'regex' (patrón regex personalizado).",
        value: "El string o patrón a comparar contra el target."
      },
      example: {
        has_muebles: {
          target: "name",
          operation: "includes",
          value: "muebles"
        }
      }
    }
  }
};

// Crea cada archivo SOLO si falta (nunca pisa uno que ya existe, aunque los
// otros dos de la misma carpeta falten) y detecta estructura corrupta sin
// tocarla — si un archivo existe pero no es JSON válido, avisa y no lo escribe,
// para no perder data real por un problema de formato.
function initDepurationAt(paths, label) {
  mkdirSync(paths.dir, { recursive: true });
  mkdirSync(join(paths.dir, 'rules'), { recursive: true });
  mkdirSync(join(paths.dir, 'staments'), { recursive: true });

  const targets = [
    { file: paths.depurators, template: DEPURATORS_TEMPLATE, name: 'depurators.json' },
    { file: paths.rules, template: RULES_TEMPLATE, name: 'rules/rules.json' },
    { file: paths.statements, template: STATEMENTS_TEMPLATE, name: 'staments/staments.json' },
  ];

  let createdAny = false;
  for (const { file, template, name } of targets) {
    if (!existsSync(file)) {
      writeFileSync(file, JSON.stringify(template, null, 2), 'utf-8');
      console.log(`✅ ${label}: creado ${name}`);
      createdAny = true;
      continue;
    }

    try {
      JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      console.warn(`⚠️ ${label}: ${name} existe pero no es JSON válido — no se toca, revisalo a mano`);
    }
  }

  if (!createdAny) {
    console.log(`🟡 ${label}: estructura ya inicializada`);
  }
}

function initDepuration() {
  initDepurationAt(LOCAL, 'Perfil activo');
  initDepurationAt(GLOBAL, 'Global');
}

// =============================================
// RESOLUCIÓN LOCAL → GLOBAL (el más específico gana)
// =============================================
function readJsonSafe(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

// Busca `name` primero en `localMap`, si no está cae a `globalMap`. Se usa
// igual para depuradores, rules y statements — el mismo criterio de cascada
// en los tres niveles.
function buildLookup(localMap, globalMap) {
  return function lookup(name) {
    if (localMap && Object.prototype.hasOwnProperty.call(localMap, name)) return localMap[name];
    if (globalMap && Object.prototype.hasOwnProperty.call(globalMap, name)) return globalMap[name];
    return null;
  };
}

function walkJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkJsonFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

// Escanea `dir` recursivamente (cualquier cantidad de carpetas/archivos .json,
// a cualquier profundidad) buscando objetos `{ [key]: { ... } }` en la raíz de
// cada archivo — así rules/ y staments/ dejan de depender de un único archivo
// con un nombre fijo. Si el MISMO nombre aparece en más de un archivo dentro de
// este mismo árbol, es un error: no hay forma correcta de "elegir el primero"
// para el usuario, así que se junta toda la evidencia (nombre + archivos) y se
// devuelve para que loadResolvers() aborte con el detalle completo.
function loadEntityMap(dir, key, label) {
  const occurrences = new Map(); // nombre -> [{ file, value }]

  for (const file of walkJsonFiles(dir)) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      console.warn(`⚠️ ${label}: ${relative(dir, file)} no es JSON válido, se ignora`);
      continue;
    }

    const entity = data?.[key];
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
      console.warn(`⚠️ ${label}: ${relative(dir, file)} no tiene "${key}" como objeto en la raíz, se ignora`);
      continue;
    }

    for (const name of Object.keys(entity)) {
      if (name === '_comment') continue;
      if (!occurrences.has(name)) occurrences.set(name, []);
      occurrences.get(name).push({ file, value: entity[name] });
    }
  }

  const map = {};
  const duplicates = [];
  for (const [name, entries] of occurrences) {
    if (entries.length > 1) {
      duplicates.push({ name, files: entries.map(e => relative(dir, e.file)) });
    } else {
      map[name] = entries[0].value;
    }
  }

  return { map, duplicates, label };
}

function reportDuplicatesAndExit(groups) {
  console.error(`❌ Se encontraron nombres duplicados — no se puede continuar:\n`);
  for (const group of groups) {
    console.error(`  En ${group.label}:`);
    for (const dup of group.duplicates) {
      console.error(`    "${dup.name}" aparece ${dup.files.length} veces:`);
      dup.files.forEach(f => console.error(`      - ${f}`));
    }
    console.error('');
  }
  console.error('Arreglá los duplicados (renombrá o eliminá uno) y volvé a intentar.');
  process.exit(1);
}

function loadResolvers() {
  const localDepurators = readJsonSafe(LOCAL.depurators)?.depurators;
  const globalDepurators = readJsonSafe(GLOBAL.depurators)?.depurators;

  const localRules = loadEntityMap(LOCAL.rulesDir, 'rules', 'perfil activo / rules');
  const globalRules = loadEntityMap(GLOBAL.rulesDir, 'rules', 'global / rules');
  const localStatements = loadEntityMap(LOCAL.statementsDir, 'statements', 'perfil activo / statements');
  const globalStatements = loadEntityMap(GLOBAL.statementsDir, 'statements', 'global / statements');

  const withDuplicates = [localRules, globalRules, localStatements, globalStatements]
    .filter(g => g.duplicates.length > 0);
  if (withDuplicates.length > 0) {
    reportDuplicatesAndExit(withDuplicates);
  }

  return {
    lookupDepurator: buildLookup(localDepurators, globalDepurators),
    lookupRule: buildLookup(localRules.map, globalRules.map),
    lookupStatement: buildLookup(localStatements.map, globalStatements.map),
    availableDepurators: [
      ...new Set([
        ...Object.keys(localDepurators || {}),
        ...Object.keys(globalDepurators || {}),
      ]),
    ].filter(k => k !== '_comment'),
  };
}

// =============================================
// EVALUACIÓN
// =============================================
function evaluateStatement(statement, group) {
  const target = statement.target || 'name';
  const operation = statement.operation || 'includes';
  const rawValue = statement.value ?? '';
  const groupValue = group[target] ? group[target].toString() : '';
  const groupLower = groupValue.toLowerCase();

  const compare = (value) => {
    const searchValue = String(value).toLowerCase();
    switch (operation) {
      case 'includes':
        return groupLower.includes(searchValue);
      case 'excludes':
        return !groupLower.includes(searchValue);
      case 'whole_word':
        const safeValue = String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${safeValue}\\b`, 'i').test(groupValue);
      case 'regex':
        try {
          return new RegExp(value).test(groupValue);
        } catch {
          return false;
        }
      default:
        return false;
    }
  };

  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  if (values.length === 0) return false;

  // excludes: si al menos uno de los valores está en el texto → false
  if (operation === 'excludes') return values.every(compare);

  return values.some(compare);
}

function evaluateRuleAST(ruleObj, group, lookupStatement) {
  if (!ruleObj || !ruleObj.operator || !Array.isArray(ruleObj.operands)) return false;

  const results = ruleObj.operands.map(operand => {
    if (typeof operand === 'string') {
      const statement = lookupStatement(operand);
      return statement ? evaluateStatement(statement, group) : false;
    } else if (typeof operand === 'object') {
      return evaluateRuleAST(operand, group, lookupStatement);
    }
    return false;
  });

  return ruleObj.operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// =============================================
// EJECUCIÓN DEL DEPURADOR
// =============================================
async function depuratorRun(depuratorName) {
  try {
    const { lookupDepurator, lookupRule, lookupStatement, availableDepurators } = loadResolvers();
    const groups = JSON.parse(readFileSync(COLLECTED_GROUPS_FILE, 'utf-8'));

    const depurator = lookupDepurator(depuratorName);
    if (!depurator || !Array.isArray(depurator.rules)) {
      console.error(`❌ Depurador '${depuratorName}' no encontrado o mal formado.`);
      console.log(`   Disponibles: ${availableDepurators.join(', ') || 'Ninguno'}`);
      process.exit(1);
    }

    console.log(`🔍 Aplicando depurador: '${depuratorName}' (${depurator.rules.length} rules)`);

    let passedCount = 0;
    const processedGroups = groups.map(group => {
      // AND implícito: TODAS las rules del array deben pasar
      const passed = depurator.rules.every(ruleName => {
        const ruleObj = lookupRule(ruleName);
        if (!ruleObj) {
          console.warn(`⚠️ Regla '${ruleName}' no encontrada (ni en el perfil activo ni en global)`);
          return false;
        }
        return evaluateRuleAST(ruleObj, group, lookupStatement);
      });

      if (passed) passedCount++;

      if (!group.depuration) group.depuration = {};
      if (!group.depuration.depurators) group.depuration.depurators = {};

      group.depuration.depurators[depuratorName] = { passed };
      return group;
    });

    writeFileSync(COLLECTED_GROUPS_FILE, JSON.stringify(processedGroups, null, 2), 'utf-8');

    console.log(`✅ Depuración completada:`);
    console.log(`   Procesados: ${groups.length} | Aprobados: ${passedCount}`);

    const examples = processedGroups.filter(g => g.depuration.depurators[depuratorName].passed).slice(0, 3);
    if (examples.length > 0) {
      console.log(`\nEjemplos aprobados:`);
      examples.forEach(g => console.log(`   - ${g.name}`));
    } else {
      console.log('\n⚠️ Ningún grupo pasó. Revisa tus statements y rules.');
    }

  } catch (error) {
    console.error(`❌ Error ejecutando depurador:`, error.message);
    process.exit(1);
  }
}

// =============================================
//  LOGICA DEL RESET
// =============================================

function resetDepurator(depuratorName) {
  try {
    const groupsData = readFileSync(COLLECTED_GROUPS_FILE, 'utf-8');
    const groups = JSON.parse(groupsData);

    let resetCount = 0;

    const updatedGroups = groups.map(group => {
      if (depuratorName === "all") {
        // Elimina toda la sección de depuración del grupo
        if (group.depuration) {
          delete group.depuration;
          resetCount++;
        }
      } else {
        // Elimina solo el depurador específico si existe
        if (group.depuration?.depurators?.[depuratorName]) {
          delete group.depuration.depurators[depuratorName];
          resetCount++;

          // Limpieza opcional: si no quedan más depuradores, elimina el objeto vacío
          if (Object.keys(group.depuration.depurators).length === 0) {
            delete group.depuration.depurators;
          }
          // Si la sección depuration queda vacía, también la eliminamos
          if (Object.keys(group.depuration).length === 0) {
            delete group.depuration;
          }
        }
      }
      return group;
    });

    // Guardar los cambios permanentemente
    writeFileSync(COLLECTED_GROUPS_FILE, JSON.stringify(updatedGroups, null, 2), 'utf-8');

    if (depuratorName === "all") {
      console.log(`✅ Se eliminó toda la información de depuración de ${resetCount} grupos.`);
    } else {
      console.log(`✅ Se eliminó el depurador '${depuratorName}' de ${resetCount} grupos.`);
    }
  } catch (error) {
    console.error(`❌ Error al resetear el depurador:`, error.message);
  }
}


// =============================================
// ENTRY POINT (Punto de entrada CLI)
// =============================================

const RUN_USAGE = 'Uso: node depurator.mjs run <nombre_del_depurador>';
const RESET_USAGE = 'Uso: node depurator.mjs reset <nombre_del_depurador> | all';

function printError(usageMessage) {
  console.error('❌ Falta el nombre del depurador.');
  console.log(usageMessage);
}

const command = process.argv[2];
const depuratorName = process.argv[3];

if (command === 'init') {
  initDepuration();
} else if (command === 'run') {
  if (!depuratorName) {
    printError(RUN_USAGE);
    process.exit(1);
  }
  depuratorRun(depuratorName);
} else if (command === 'reset') {
  if (!depuratorName) {
    printError(RESET_USAGE);
    process.exit(1);
  }

  if (depuratorName === 'all') {
    resetDepurator('all');
  } else {
    resetDepurator(depuratorName);
  }
} else {
  console.log('Uso:');
  console.log('  node depurator.mjs init');
  console.log('  node depurator.mjs run <nombre_del_depurador>');
  console.log('  node depurator.mjs reset <nombre_del_depurador> | all');
  process.exit(1);
}
