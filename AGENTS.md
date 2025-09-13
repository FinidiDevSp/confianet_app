# AGENTS.md (React + TypeScript + Python con pruebas .http)

## Propósito
Eres un agente de desarrollo que implementa funcionalidades en React con **TypeScript** y en **Python (FastAPI, scripts, endpoints)** siguiendo estas guías y, al finalizar cada tarea, propones un mensaje de commit y el comando de git correspondiente. No ejecutas git; solo generas el contenido y el comando para que la persona usuaria lo copie y ejecute.

## Alcance
Proyecto **fullstack** con React + TypeScript en el frontend y Python (FastAPI) en el backend.
- Código TS estrictamente tipado.
- Código Python claro, con **type hints**, estilo **PEP8** y separación de capas (routers/servicios/modelos).
- **Pruebas de API** mediante un **archivo `.http`** (para REST Client en VS Code) en lugar de `pytest`.
- **Regla clave**: **toda modificación o creación de endpoint** debe reflejarse **en el archivo `.http`** con sus casos de prueba (happy path y errores previstos).

## Flujo de trabajo del agente
1. **Antes de tocar código**
   - Resume la petición en una frase objetivo.
   - Revisa estructura del proyecto, dependencias y scripts.
   - Planifica cambios en pasos pequeños y enumerados.
2. **Implementación**
   - **Frontend**: componentes, hooks, vistas (React + TS) siguiendo la guía de estilo.
   - **Backend**: routers, modelos Pydantic, servicios, repositorios (FastAPI).
   - **Pruebas .http**: añade/actualiza requests en `tests/api.http` para cubrir los cambios.
   - Usa tipado estricto siempre.
3. **Entrega de resultado**
   - Lista de archivos modificados y resumen de cambios.
   - Mensaje de commit en formato Conventional Commits.
   - Comando git listo para ejecutar.
   - Notas de verificación manual (incluye cómo ejecutar el archivo `.http`).

## Formato de salida al terminar una tarea

**Objetivo**  
Descripción breve en una frase.

**Cambios**  
Listado de archivos y qué se cambió.

**Notas de verificación**  
- Pasos para probar manualmente (incluye cómo ejecutar el request en `tests/api.http`)  
- Posibles efectos colaterales

**Commit propuesto**  
`type(scope): descripción en imperativo`

**Comando git**
```bash
git add <rutas>
git commit -m "<mensaje en una línea>" -m "<cuerpo opcional>"
```

## Convenciones de commits (Conventional Commits)

- **feat**: nueva funcionalidad  
- **fix**: corrección de bug  
- **refactor**: reorganización interna sin cambio de comportamiento  
- **docs**, **style**, **test**, **build**, **ci**, **chore**, **revert** según corresponda

**Reglas**
- Mensaje en imperativo, máx. 72 caracteres.  
- `scope` opcional entre paréntesis (ej. `auth`, `ui`, `api`, `db`).  
- Añadir `BREAKING CHANGE` si aplica.  
- Referenciar issues cuando corresponda.

**Ejemplo**
```bash
git commit -m "feat(api): añade endpoint de creación de denuncia" -m "Closes #123"
```

---

## Estilo de código React + TS

### Componentes
- Componentes funcionales con hooks.
- Props tipadas con `interface` o `type`; exports nominales.
- Evita `any` y tipos demasiado amplios.

### Estado y lógica
- `useState<T>` para estado simple y `useReducer` para lógica compleja.
- Hooks reutilizables en `/hooks`.

### Rendimiento
- `useCallback`/`useMemo` para evitar renders innecesarios.
- `React.memo` cuando tenga sentido.

### Estilos
- Coherencia con la librería usada (Tailwind, CSS Modules, Styled Components).
- Evitar inline styles excesivos.

### Testing de UI (opcional en este repo)
- **React Testing Library** con Jest si el alcance lo requiere.
- Tests de integración para componentes clave.

---

## Estilo de código Python (FastAPI)

### Estructura recomendada
```
app/
  main.py
  core/          # settings, seguridad, middlewares
  routers/       # controladores de endpoints (APIRouter)
  models/        # Pydantic y/o SQLAlchemy
  services/      # lógica de negocio
  repositories/  # acceso a datos
tests/
  api.http       # archivo de pruebas manuales de endpoints
```

### Configuración
- Variables de entorno gestionadas con `pydantic-settings` o `python-dotenv`.
- No imprimir secretos; en dev se puede loguear configuración no sensible.

**Ejemplo (pydantic-settings):**
```py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    class Config:
        env_file = ".env"

settings = Settings()
```

### Endpoints (router)
```py
# app/routers/reports.py
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter(prefix="/reports", tags=["reports"])

class ReportIn(BaseModel):
    title: str
    description: str

class ReportOut(ReportIn):
    id: int

_FAKE_DB: list[ReportOut] = []

@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportIn) -> ReportOut:
    new_id = len(_FAKE_DB) + 1
    item = ReportOut(id=new_id, **payload.model_dump())
    _FAKE_DB.append(item)
    return item

@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: int) -> ReportOut:
    for item in _FAKE_DB:
        if item.id == report_id:
            return item
    raise HTTPException(status_code=404, detail="Report not found")
```

**Registro en `main.py`:**
```py
from fastapi import FastAPI
from app.routers import reports

app = FastAPI(title="Canal de Denuncias API")
app.include_router(reports.router)
```

---

## Pruebas de API con archivo `.http` (VS Code REST Client)

- Ubicación: `tests/api.http` (único archivo fuente de verdad para pruebas manuales).  
- **Obligatorio**: cuando se cree o modifique un endpoint, **añadir/actualizar** su request en este archivo.  
- Requisitos: extensión **REST Client** de VS Code (humao.rest-client).  
- Variables: usa variables de entorno del REST Client o del sistema para entornos (`dev`, `prod`).

**Convenciones del archivo `tests/api.http`:**
- Un bloque `###` por caso de prueba.
- Secciones agrupadas por recurso (`auth`, `reports`, etc.).
- Incluir casos **happy path** y **errores** (400/401/404/409).

**Ejemplo completo `tests/api.http`:**
```http
@baseUrl = http://localhost:8000

### Salud del servicio
GET {{baseUrl}}/docs

### Crear reporte (happy path)
POST {{baseUrl}}/reports
Content-Type: application/json

{
  "title": "Canal no ético",
  "description": "Se detectó conducta inapropiada"
}

### Obtener reporte existente
# Ajusta el ID devuelto por la creación (ej. 1)
GET {{baseUrl}}/reports/1

### Obtener reporte inexistente (debe 404)
GET {{baseUrl}}/reports/99999
```

**Variables y entornos (opcional):** crea `tests/.vscode/REST Client.env.json` o usa `.env` del sistema:
```json
{
  "dev": {
    "baseUrl": "http://localhost:8000"
  },
  "prod": {
    "baseUrl": "https://api.tu-dominio.com"
  }
}
```
Y en `api.http`:
```http
@baseUrl = {{baseUrl}}
```

**Notas:**
- Si usas autenticación JWT, añade un bloque de `login` que capture el token y reutilízalo:
```http
### Login (captura token)
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "secret"
}

### Crear reporte autenticado
POST {{baseUrl}}/reports
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "title": "Reporte autenticado",
  "description": "Detalle"
}
```
> Usa la funcionalidad de **Variables de REST Client** para guardar `{{token}}` si tu flujo lo permite (o pégalo manualmente tras el login).

---

## Checklist antes del commit
- **Frontend**: compila y linter ok (ESLint/Prettier).
- **Backend**: arranca (`uvicorn app.main:app --reload`) sin errores; linter/formateo ok (Black/ruff).
- **Archivo `.http` actualizado**: cada endpoint nuevo o modificado tiene su(s) request(s) y casos de error.
- **Prueba manual ejecutada**: requests en `tests/api.http` devuelven el status y cuerpo esperado.
- No introduces dependencias innecesarias.
- Mensaje de commit claro y en formato correcto.

---

## Plantillas de commits útiles

- **feat(api)**: crear/actualizar endpoint y su request .http
```bash
git commit -m "feat(api): añade GET /reports/{id} y prueba en tests/api.http"
```

- **fix(api)**: corregir validación y actualizar caso de error en .http
```bash
git commit -m "fix(api): valida título obligatorio; actualiza 400 en tests/api.http"
```

- **docs(test)**: documentar cómo ejecutar `tests/api.http`
```bash
git commit -m "docs(test): guía rápida para ejecutar tests/api.http con REST Client"
```
