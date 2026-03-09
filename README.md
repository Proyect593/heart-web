# Administrador HEART Web

Version web de `control.py` con la misma logica de administracion conectada a Firebase Realtime Database.

## Funcionalidades migradas

- Reiniciar servidor por meses (borra documentos por rango `yyyy-mm`).
- Copia de seguridad de `solucionadas` en Excel.
- Borrar novedades solucionadas.
- Edicion de ordenes en `/documentos/<orden>`.
- Cambio de claves:
  - Usuarios de acceso (actualiza contrasena hash SHA-256 de 4 digitos).
  - Gestion de firmas y correos (actualiza `/Clave/1`).
  - Reinicia usuario (borra contrasena para que vuelva a definirla).
- Creacion de usuario nuevo en `Firmas_BPM`.

## Requisitos

- Python 3.10 o superior.
- `clave_firebase.json` en la carpeta padre de este proyecto.
- Dependencias de `requirements.txt`.

## Acceso al panel

- La app ahora exige login para entrar al panel y para consumir APIs.
- Se usa el nodo `/Admin` de Firebase con este formato:

```json
{
  "usuario": "admin@HEART.com",
  "contrasena": "HEART*123456"
}
```

- Si el nodo no existe, se crea automaticamente con esos valores iniciales.
- Si Firebase no esta disponible, usa credenciales de respaldo:
  - Usuario: `admin`
  - Contrasena: `1234`
- Puedes personalizarlas con variables de entorno antes de ejecutar:

```powershell
$env:ADMIN_USERNAME="tu_usuario"
$env:ADMIN_PASSWORD="tu_clave"
$env:ADMIN_FIREBASE_USERNAME="admin@HEART.com"
$env:ADMIN_FIREBASE_PASSWORD="HEART*123456"
$env:SECRET_KEY="una_clave_larga_y_unica"
```

## Ejecucion

```powershell
cd "c:\Users\brigadaenem\OneDrive - CETCO S.A\Escritorio\Henry Alejandro Rozo Torres\HENALEROZTOR\APLICACIONES Y PLANTILLAS\TRAZABILIDAD BATCH RECORD\V1\web-admin-heart"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Luego abre: `http://127.0.0.1:5000`

## Publicacion en Firebase (Hosting + Cloud Run)

Esta app usa Flask y rutas `/api/*`, por lo que no se puede publicar solo como HTML estatico.
La forma correcta es Firebase Hosting con rewrite a Cloud Run.

1. Instala herramientas (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS -e
npm install -g firebase-tools
winget install Google.CloudSDK -e
```

2. Inicia sesion:

```powershell
firebase login
gcloud auth login
gcloud auth application-default login
```

3. Crea/selecciona proyecto y habilita APIs necesarias:

```powershell
gcloud config set project TU_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firebase.googleapis.com
```

4. Edita `.firebaserc` y reemplaza `REEMPLAZA_CON_TU_PROJECT_ID` por tu id real.

5. Despliega el backend Flask en Cloud Run:

```powershell
gcloud run deploy web-admin-heart `
  --source . `
  --region us-central1 `
  --allow-unauthenticated
```

6. Despliega Firebase Hosting:

```powershell
firebase deploy --only hosting
```

Con esto, la URL de Hosting servira tu app Flask completa (incluyendo login y APIs) por rewrite.
