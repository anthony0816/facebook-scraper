import { ensureActiveProfilePath } from './profileManager.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const PROFILE_DEPURATION_DIR = ensureActiveProfilePath('depuration');
const DEPURATORS_FILE = join(PROFILE_DEPURATION_DIR, 'depurators.json');
const RULES_FILE = join(PROFILE_DEPURATION_DIR, 'rules', 'rules.json');
const STATEMENTS_FILE = join(PROFILE_DEPURATION_DIR, 'staments', 'staments.json');

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

initDepuration();