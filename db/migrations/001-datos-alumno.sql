-- Migración 001: domicilio y localidad del alumno. Ejecutar UNA sola vez en bases ya creadas.
-- (Las instalaciones nuevas con schema.sql ya incluyen estas columnas.)
ALTER TABLE alumnos
  ADD COLUMN domicilio VARCHAR(150) NULL,
  ADD COLUMN localidad VARCHAR(80) NULL;
