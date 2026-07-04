# DollarCity Mejorado - Proyecto para clase

Sistema web de gestion para DollarCity Santa Anita.

## Tecnologias

- Frontend: React + Vite
- Backend: Node.js + Express
- Base de datos: PostgreSQL remota en Supabase

## Instalacion rapida

Requisitos:

- Node.js 18 o superior
- Git opcional, solo si vas a clonar el repositorio

### 1. Instalar backend

```bash
cd backend
npm install
```

### 2. Instalar frontend

```bash
cd ../frontend
npm install
```

### 3. Ejecutar backend

En una terminal:

```bash
cd backend
npm start
```

Backend:

```text
http://localhost:4000
```

Prueba de backend:

```text
http://localhost:4000/api/health
```

### 4. Ejecutar frontend

En otra terminal:

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://localhost:5173/
```

## Credenciales de prueba

| Rol | Correo | Clave |
| --- | --- | --- |
| Admin | admin@dollarcity.pe | Admin123! |
| Vendedor | vendedor@dollarcity.pe | Vendedor123! |
| Almacenero | almacen@dollarcity.pe | Almacen123! |

## Archivos importantes

- `GUIA_INSTALACION_FACIL.txt`: guia detallada para instalar y ejecutar.
- `backend/.env`: configuracion del backend ya incluida para clase.
- `frontend/.env`: URL del backend ya configurada.
- `backend/database/schema.sql`: estructura de base de datos por si se quiere revisar.
- `backend/database/seed.sql`: datos iniciales y usuarios de prueba.

## Comandos rapidos para Windows

Tambien se incluyen archivos `.bat`:

1. `INSTALAR_DEPENDENCIAS.bat`
2. `INICIAR_BACKEND.bat`
3. `INICIAR_FRONTEND.bat`

Despues abre:

```text
http://localhost:5173/
```

## Nota

No se sube la carpeta `node_modules` porque se genera automaticamente con `npm install` y pesa demasiado.
