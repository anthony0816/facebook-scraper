
# Sistema de Depuración de Grupos de Facebook

## Propósito

Este sistema permite filtrar y clasificar grupos de Facebook mediante reglas configurables sin eliminar datos. En lugar de borrar filas del dataset, cada grupo es evaluado contra uno o más "depurators" y se etiqueta con el resultado (`passed: true/false`). Esto permite ejecutar pipelines selectivos usando flags en la CLI.

## Arquitectura General

El sistema funciona en **3 niveles jerárquicos**, donde cada nivel superior consume al inferior:


┌─────────────────────────────────────┐
│         DEPURATORS (nivel 3)        │
│  Concatena rules con AND implícito  │
├─────────────────────────────────────┤
│           RULES (nivel 2)           │
│  Combina statements con AND/OR      │
├─────────────────────────────────────┤
│         STATEMENTS (nivel 1)        │
│  Unidades atómicas de evaluación   │
└─────────────────────────────────────┘


## Ubicación de Archivos


publicacion/profiles/<nombre_perfil>/
├── depuration/
│   ├── statements/
│   │   └── statements.json
│   ├── rules/
│   │   └── rules.json
│   └── depurators.json
└── collected_groups.json  (output con etiquetas)


---

## Nivel 1: Statements

### ¿Qué son?

Los statements son las **unidades atómicas e indivisibles** del sistema. Cada statement evalúa una propiedad de un grupo y devuelve `true` o `false`.

### Estructura

```json
{
  "statements": {
    "<nombre_statement>": {
      "target": "<propiedad_a_evaluar>",
      "operation": "<tipo_operacion>",
      "value": "<valor_a_comparar>"
    }
  }
}
```

### Campos

| Campo | Descripción | Ejemplos |
|-------|-------------|----------|
| `target` | Propiedad del grupo a evaluar | `"name"`, `"url"` |
| `operation` | Tipo de comparación | Ver tabla abajo |
| `value` | String o patrón a comparar | `"muebles"`, `"^venta.*"` |

### Operaciones Disponibles

| Operación | Descripción | Ejemplo |
|-----------|-------------|---------|
| `includes` | Contiene substring | `"name" includes "muebles"` → true si el nombre contiene "muebles" |
| `excludes` | No contiene substring | `"name" excludes "reparacion"` → true si NO contiene "reparacion" |
| `whole_word` | Contiene palabra exacta (word boundaries) | `"name" whole_word "cuba"` → true para "venta cuba hoy", false para "escuba" |
| `regex` | Patrón regex personalizado | `"name" regex "^venta.*cuba$"` |

### Ejemplo Completo

```json
{
  "statements": {
    "has_muebles": {
      "target": "name",
      "operation": "includes",
      "value": "muebles"
    },
    "no_habana": {
      "target": "name",
      "operation": "excludes",
      "value": "habana"
    },
    "palabra_exacta_cuba": {
      "target": "name",
      "operation": "whole_word",
      "value": "cuba"
    },
    "regex_venta": {
      "target": "name",
      "operation": "regex",
      "value": "^venta.*"
    }
  }
}
```

---

## Nivel 2: Rules

### ¿Qué son?

Las rules **combinan statements** (y otras rules anidadas) mediante operadores lógicos `AND` o `OR`. Permiten crear lógica compleja con N elementos.

### Estructura

```json
{
  "rules": {
    "<nombre_rule>": {
      "operator": "<AND|OR>",
      "operands": [
        "<statement_o_rule_1>",
        "<statement_o_rule_2>",
        {
          "operator": "<AND|OR>",
          "operands": [...]
        }
      ]
    }
  }
}
```

### Campos

| Campo | Descripción |
|-------|-------------|
| `operator` | Operador lógico que aplica a **todos** los operands: `"AND"` o `"OR"` |
| `operands` | Array de elementos. Cada elemento puede ser:<br>• **String**: nombre de un statement existente en `statements.json`<br>• **Object**: sub-rule anidada con su propio `operator` y `operands` (actúa como paréntesis) |

### Ejemplos

#### Rule Simple (2 statements con AND)

```json
{
  "rule_muebles_sin_habana": {
    "operator": "AND",
    "operands": ["has_muebles", "no_habana"]
  }
}
```

Evaluación: `has_muebles AND no_habana`

#### Rule con N Statements

```json
{
  "rule_multiples_criterios": {
    "operator": "AND",
    "operands": [
      "has_muebles",
      "no_habana",
      "palabra_exacta_cuba",
      "no_reparacion"
    ]
  }
}
```

Evaluación: `has_muebles AND no_habana AND palabra_exacta_cuba AND no_reparacion`

#### Rule con Lógica Mixta (anidación)

```json
{
  "rule_compleja": {
    "operator": "OR",
    "operands": [
      {
        "operator": "AND",
        "operands": ["has_muebles", "no_habana"]
      },
      {
        "operator": "AND",
        "operands": ["palabra_exacta_cuba", "has_sofa"]
      },
      "no_reparacion"
    ]
  }
}
```

Evaluación: `(has_muebles AND no_habana) OR (palabra_exacta_cuba AND has_sofa) OR no_reparacion`

### Reglas de Anidación

- Los objetos anidados actúan como **paréntesis** en lógica booleana.
- No hay límite de profundidad de anidación.
- Cada nivel puede tener su propio `operator` independiente.

---

## Nivel 3: Depurators

### ¿Qué son?

Los depurators son el **nivel final de filtrado**. Concatenan rules existentes mediante `AND` implícito. Un grupo pasa el depurator **solo si TODAS sus rules evalúan a true**.

### Estructura

```json
{
  "depurators": {
    "<nombre_depurator>": {
      "rules": [
        "<rule_1>",
        "<rule_2>"
      ]
    }
  }
}
```

### Campos

| Campo | Descripción |
|-------|-------------|
| `rules` | Array de nombres de rules existentes en `rules.json`. **Todas** deben cumplirse (AND implícito). |

### Ejemplo

```json
{
  "depurators": {
    "depurator_cuba_muebles": {
      "rules": [
        "rule_muebles_sin_habana",
        "rule_palabras_prohibidas"
      ]
    },
    "depurator_solo_habana": {
      "rules": [
        "rule_habana_activa"
      ]
    }
  }
}
```

Evaluación de `depurator_cuba_muebles`:  
`rule_muebles_sin_habana AND rule_palabras_prohibidas`

### ¿Por qué solo AND en depurators?

La lógica compleja (OR/mixta) ya se resuelve en las rules. Esto mantiene los depurators simples y predecibles: "un depurator = todas estas rules deben pasar".

---

## Flujo de Trabajo

### 1. Crear Statements

Define las condiciones atómicas en `statements.json`:

```json
{
  "has_muebles": {
    "target": "name",
    "operation": "includes",
    "value": "muebles"
  }
}
```

### 2. Crear Rules

Combina statements en `rules.json`:

```json
{
  "rule_muebles": {
    "operator": "AND",
    "operands": ["has_muebles"]
  }
}
```

### 3. Crear Depurator

Define el filtro final en `depurators.json`:

```json
{
  "depurator_muebles": {
    "rules": ["rule_muebles"]
  }
}
```

### 4. Ejecutar Evaluación

El script evalúa cada grupo contra el depurator y genera el output.

---

## Output Generado

Después de ejecutar la evaluación, el archivo `collected_groups.json` del perfil se actualiza agregando una propiedad `depuration` a cada grupo:

```json
[
  {
    "url": "https://www.facebook.com/groups/1050734765944227",
    "name": "MUEBLES WAOOO!!",
    "depuration": {
      "depurators": {
        "depurator_muebles": {
          "passed": true
        },
        "depurator_habana": {
          "passed": false
        }
      }
    }
  }
]
```

### Características del Output

- **No destructivo**: No se eliminan filas, solo se etiquetan.
- **Múltiples depurators**: Un grupo puede ser evaluado contra varios depurators simultáneamente.
- **Reutilizable**: El output puede usarse para ejecutar pipelines selectivos.

---

## Uso en CLI

Para ejecutar un pipeline solo con grupos aprobados por un depurator específico:

```bash
pnpm public:edgue --depurator depurator_muebles
```

Esto filtra el dataset y procesa solo los grupos donde `depuration.depurators.depurator_muebles.passed === true`.

---

## Casos de Uso Comunes

### Filtro Simple
"Grupos que contengan 'muebles'"

```json
{
  "statements": {
    "has_muebles": {
      "target": "name",
      "operation": "includes",
      "value": "muebles"
    }
  },
  "rules": {
    "rule_muebles": {
      "operator": "AND",
      "operands": ["has_muebles"]
    }
  },
  "depurators": {
    "depurator_muebles": {
      "rules": ["rule_muebles"]
    }
  }
}
```

### Filtro Compuesto
"Grupos con muebles Y sin habana"

```json
{
  "rules": {
    "rule_muebles_sin_habana": {
      "operator": "AND",
      "operands": ["has_muebles", "no_habana"]
    }
  }
}
```

### Filtro Complejo
"Grupos con (muebles O sofás) Y (sin reparación O sin usado)"

```json
{
  "rules": {
    "rule_tipo_producto": {
      "operator": "OR",
      "operands": ["has_muebles", "has_sofa"]
    },
    "rule_condicion": {
      "operator": "OR",
      "operands": ["no_reparacion", "no_usado"]
    }
  },
  "depurators": {
    "depurator_productos_nuevos": {
      "rules": ["rule_tipo_producto", "rule_condicion"]
    }
  }
}
```

---

## Resumen

| Nivel | Propósito | Operadores | Complejidad |
|-------|-----------|------------|-------------|
| **Statements** | Evaluar una propiedad atómica | N/A (siempre booleano) | Baja |
| **Rules** | Combinar statements con lógica | AND, OR, anidación | Media-Alta |
| **Depurators** | Filtrar grupos finales | AND implícito | Baja |

Este sistema permite describir cualquier lógica de filtrado mediante la composición de estos 3 niveles, manteniendo el código limpio y las configuraciones legibles.
```