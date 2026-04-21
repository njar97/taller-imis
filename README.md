# Taller IMIS — Sistema de Producción

Sistema web para gestión de producción de uniformes escolares.

## Primera vez — Instalación

Si estás pasando del v18 (archivo único) al v19 (modular):

1. Descomprimí el ZIP en una carpeta temporal (ej: `C:\Users\confe\Downloads\taller-imis-v19`)
2. Abrí PowerShell **en tu repo**:
   ```powershell
   cd C:\Users\confe\Documents\taller-imis
   ```
3. Si es la primera vez que corrés scripts de PowerShell, habilitá con:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
   (solo una vez en tu usuario)
4. Corré el instalador desde la carpeta temporal:
   ```powershell
   C:\Users\confe\Downloads\taller-imis-v19\instalar.ps1
   ```
5. El instalador hace todo: backup del v18, copia los archivos nuevos, verifica que el build funciona

## Uso diario

### Deploy automático (recomendado)

Un solo comando hace build + commit + push:

```powershell
.\deploy.ps1 "descripción del cambio"
```

O sin argumento para que te pida el mensaje:
```powershell
.\deploy.ps1
```

### Manual (si necesitás control)

```powershell
# 1. Regenerar produccion.html desde src/
.\build.ps1

# 2. Verificar cambios
git status

# 3. Commit y push
git add -A
git commit -m "mensaje"
git push origin main
```

## Estructura del proyecto

```
taller-imis/
├── produccion.html              ← generado, NO editar a mano
├── produccion_v18_backup.html   ← backup del original
├── build.ps1                    ← genera produccion.html
├── deploy.ps1                   ← build + git push
├── instalar.ps1                 ← solo primera vez
├── README.md                    ← este archivo
└── src/                         ← fuentes (editar aquí)
    ├── head.html
    ├── nav.html
    ├── footer.html
    ├── modals.html
    ├── css/styles.css
    ├── views/                   ← pestañas
    │   ├── nuevo.html
    │   ├── trazo.html
    │   ├── tendido.html
    │   ├── bulto.html
    │   ├── historial.html
    │   ├── produccion.html
    │   └── config.html
    └── js/                      ← lógica
        ├── core.js              ← globales, nav, supabase
        ├── trazo.js
        ├── tendido.js
        ├── bulto.js
        ├── historial.js
        ├── produccion.js        ← Fase 1 + Fase 2
        └── config.js
```

## Cómo hacer cambios

1. Abrir el archivo en `src/` que corresponde al módulo
2. Editar
3. Correr `.\deploy.ps1 "qué cambié"`
4. Esperar 1-2 minutos para que GitHub Pages actualice
5. Verificar en https://njar97.github.io/taller-imis/produccion.html (Ctrl+F5)

## Regla crítica

**NUNCA editar `produccion.html` directamente.** Cualquier cambio se pierde al próximo build. Siempre editar `src/`.

Si lo editás por error, se regenera con `.\build.ps1`.

## Fases de producción

Activables desde Config:
- **Fase 1** (siempre): pendiente/terminado, dividir, unir
- **Fase 2** (opt-in): operaciones, operarias, estado derivado
- **Fase 3** (opt-in, requiere Fase 2): destajo — en desarrollo

## Solución de problemas

### `.\deploy.ps1` dice "no se puede ejecutar scripts"

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### `git push` falla

Probá primero:
```powershell
git pull --rebase origin main
.\deploy.ps1 "mensaje"
```

### `produccion.html` se ve igual después del deploy

Hard-refresh en el navegador: **Ctrl+F5**. GitHub Pages tarda 1-2 minutos en actualizar.

### El build no encuentra un archivo

Verificar que `src/` tiene todos los archivos. En caso extremo, volver a descomprimir el ZIP original.
