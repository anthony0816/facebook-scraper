import { ensureActiveProfilePath } from './profileManager.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const PROFILE_DEPURATION_DIR = ensureActiveProfilePath('depuration');
const DEPURATORS_FILE = join(PROFILE_DEPURATION_DIR, 'depurators.json');
const RULES_FILE = join(PROFILE_DEPURATION_DIR, 'rules', 'rules.json');
const STATEMENTS_FILE = join(PROFILE_DEPURATION_DIR, 'staments', 'staments.json');
// Agregado solo para que la función run sepa dónde está el archivo de datos
const COLLECTED_GROUPS_FILE = join(PROFILE_DEPURATION_DIR, '../collected_groups.json');

// =============================================
// TU LÓGICA ORIGINAL (INTACTA)
// =============================================
function initDepuration() {
  // Create directories if they don't exist
  mkdirSync(PROFILE_DEPURATION_DIR, { recursive: true });
  mkdirSync(join(PROFILE_DEPURATION_DIR, 'rules'), { recursive: true });
  mkdirSync(join(PROFILE_DEPURATION_DIR, 'staments'), { recursive: true });

  // Check if all structures already exist
  const depuratorsExists = existsSync(DEPURATORS_FILE);
  const rulesExists = existsSync(RULES_FILE);
  const statementsExists = existsSync(STATEMENTS_FILE);

  if (depuratorsExists && rulesExists && statementsExists) {
    console.log('🟡 Estructura ya inicializada para el perfil activo');
    console.log('   - depurators.json');
    console.log('   - rules/rules.json');
    console.log('   - staments/staments.json');
    return;
  }

  // Initialize depurators.json with full structure and comments
  writeFileSync(DEPURATORS_FILE, JSON.stringify({
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
  }, null, 2), 'utf-8');

  // Initialize rules.json with full structure and comments
  writeFileSync(RULES_FILE, JSON.stringify({
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
  }, null, 2), 'utf-8');

  // Initialize staments.json with full structure and comments
  writeFileSync(STATEMENTS_FILE, JSON.stringify({
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
  }, null, 2), 'utf-8');

  console.log('✅ Estructura de depuración inicializada para el perfil activo');
  console.log('   - depurators.json');
  console.log('   - rules/rules.json');
  console.log('   - staments/staments.json');
}

// =============================================
// NUEVA LÓGICA: EVALUACIÓN
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

function evaluateRuleAST(ruleObj, group, statementsData) {
  if (!ruleObj || !ruleObj.operator || !Array.isArray(ruleObj.operands)) return false;

  const results = ruleObj.operands.map(operand => {
    if (typeof operand === 'string') {
      const statement = statementsData.statements[operand];
      return statement ? evaluateStatement(statement, group) : false;
    } else if (typeof operand === 'object') {
      return evaluateRuleAST(operand, group, statementsData);
    }
    return false;
  });

  return ruleObj.operator === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// =============================================
// NUEVA LÓGICA: EJECUCIÓN DEL DEPURADOR
// =============================================
async function depuratorRun(depuratorName) {
  try {
    const depuratorsData = JSON.parse(readFileSync(DEPURATORS_FILE, 'utf-8'));
    const rulesData = JSON.parse(readFileSync(RULES_FILE, 'utf-8'));
    const statementsData = JSON.parse(readFileSync(STATEMENTS_FILE, 'utf-8'));
    const groups = JSON.parse(readFileSync(COLLECTED_GROUPS_FILE, 'utf-8'));

    const depurator = depuratorsData.depurators?.[depuratorName];
    if (!depurator || !Array.isArray(depurator.rules)) {
      console.error(`❌ Depurador '${depuratorName}' no encontrado o mal formado.`);
      const available = Object.keys(depuratorsData.depurators || {}).filter(k => k !== '_comment');
      console.log(`   Disponibles: ${available.join(', ') || 'Ninguno'}`);
      process.exit(1);
    }

    console.log(`🔍 Aplicando depurador: '${depuratorName}' (${depurator.rules.length} rules)`);

    let passedCount = 0;
    const processedGroups = groups.map(group => {
      // AND implícito: TODAS las rules del array deben pasar
      const passed = depurator.rules.every(ruleName => {
        const ruleObj = rulesData.rules[ruleName];
        if (!ruleObj) {
          console.warn(`⚠️ Regla '${ruleName}' no encontrada en rules.json`);
          return false;
        }
        return evaluateRuleAST(ruleObj, group, statementsData);
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
// NUEVO ENTRY POINT (Punto de entrada CLI)
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
  
  // Llamamos a la función. No hace falta 'return', el script terminará al llegar al final.
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