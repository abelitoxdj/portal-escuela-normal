-- Portal Académico Escuela Normal — esquema MySQL 8 / MariaDB 10.5+
CREATE DATABASE IF NOT EXISTS portal_escuela CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE portal_escuela;

CREATE TABLE roles (
  id TINYINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(30) NOT NULL UNIQUE,
  descripcion VARCHAR(150) NULL
) ENGINE=InnoDB;

CREATE TABLE permisos (
  id SMALLINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  codigo VARCHAR(60) NOT NULL UNIQUE,
  descripcion VARCHAR(150) NULL
) ENGINE=InnoDB;

CREATE TABLE rol_permiso (
  rol_id TINYINT UNSIGNED NOT NULL,
  permiso_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (rol_id, permiso_id),
  FOREIGN KEY (rol_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permiso_id) REFERENCES permisos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  rol_id TINYINT UNSIGNED NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  apellido VARCHAR(80) NOT NULL,
  telefono VARCHAR(30) NULL,
  foto VARCHAR(200) NULL,
  tema ENUM('light','dark') NOT NULL DEFAULT 'light',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0,
  intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bloqueado_hasta DATETIME NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES roles(id),
  CHECK (email LIKE '%_@_%')
) ENGINE=InnoDB;

CREATE TABLE tokens_recuperacion (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expira_en DATETIME NOT NULL,
  usado TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_token (token_hash),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE alumnos (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL UNIQUE,
  dni VARCHAR(15) NULL UNIQUE,
  fecha_nacimiento DATE NULL,
  anio_cursada TINYINT UNSIGNED NOT NULL,
  division VARCHAR(5) NULL,
  anio_ingreso SMALLINT UNSIGNED NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tutores (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL UNIQUE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE relaciones_familiares (
  tutor_id INT UNSIGNED NOT NULL,
  alumno_id INT UNSIGNED NOT NULL,
  parentesco VARCHAR(30) NOT NULL DEFAULT 'tutor',
  PRIMARY KEY (tutor_id, alumno_id),
  FOREIGN KEY (tutor_id) REFERENCES tutores(id) ON DELETE CASCADE,
  FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE docentes (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(120) NULL
) ENGINE=InnoDB;

CREATE TABLE materias (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(300) NULL,
  anio_cursada TINYINT UNSIGNED NOT NULL,
  docente_id INT UNSIGNED NULL,
  color VARCHAR(12) NOT NULL DEFAULT 'primary',
  INDEX idx_materia_anio (anio_cursada),
  FOREIGN KEY (docente_id) REFERENCES docentes(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE periodos (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  ciclo SMALLINT UNSIGNED NOT NULL,
  nombre VARCHAR(30) NOT NULL,
  orden TINYINT UNSIGNED NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  UNIQUE KEY uq_periodo (ciclo, orden),
  CHECK (fecha_fin >= fecha_inicio)
) ENGINE=InnoDB;

CREATE TABLE inscripciones (
  alumno_id INT UNSIGNED NOT NULL,
  materia_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (alumno_id, materia_id),
  FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notas (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  alumno_id INT UNSIGNED NOT NULL,
  materia_id INT UNSIGNED NOT NULL,
  periodo_id INT UNSIGNED NOT NULL,
  valor DECIMAL(4,2) NOT NULL,
  UNIQUE KEY uq_nota (alumno_id, materia_id, periodo_id),
  CHECK (valor >= 0 AND valor <= 10),
  FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE,
  FOREIGN KEY (periodo_id) REFERENCES periodos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE asistencias (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  alumno_id INT UNSIGNED NOT NULL,
  materia_id INT UNSIGNED NULL,
  fecha DATE NOT NULL,
  estado ENUM('presente','ausente','tardanza') NOT NULL,
  justificada TINYINT(1) NOT NULL DEFAULT 0,
  motivo VARCHAR(200) NULL,
  INDEX idx_asist (alumno_id, fecha),
  FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE,
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE horarios (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  materia_id INT UNSIGNED NOT NULL,
  anio_cursada TINYINT UNSIGNED NOT NULL,
  dia_semana TINYINT UNSIGNED NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  aula VARCHAR(20) NULL,
  docente_id INT UNSIGNED NULL,
  INDEX idx_horario (anio_cursada, dia_semana),
  CHECK (dia_semana BETWEEN 1 AND 5),
  CHECK (hora_fin > hora_inicio),
  FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE,
  FOREIGN KEY (docente_id) REFERENCES docentes(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE pagos (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  alumno_id INT UNSIGNED NOT NULL,
  concepto VARCHAR(100) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  vencimiento DATE NOT NULL,
  fecha_pago DATE NULL,
  estado ENUM('pendiente','pagado') NOT NULL DEFAULT 'pendiente',
  INDEX idx_pago (alumno_id, vencimiento),
  CHECK (monto >= 0),
  FOREIGN KEY (alumno_id) REFERENCES alumnos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE comunicados (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  titulo VARCHAR(150) NOT NULL,
  cuerpo TEXT NOT NULL,
  importante TINYINT(1) NOT NULL DEFAULT 0,
  publicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  autor_id INT UNSIGNED NULL,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE eventos_calendario (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  titulo VARCHAR(150) NOT NULL,
  fecha DATE NOT NULL,
  tipo ENUM('feriado','examen','institucional','otro') NOT NULL DEFAULT 'otro',
  INDEX idx_evento_fecha (fecha)
) ENGINE=InnoDB;

CREATE TABLE notificaciones (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  mensaje VARCHAR(250) NOT NULL,
  leida TINYINT(1) NOT NULL DEFAULT 0,
  creada_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif (usuario_id, leida),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE preferencias (
  usuario_id INT UNSIGNED PRIMARY KEY,
  notif_notas TINYINT(1) NOT NULL DEFAULT 1,
  notif_horarios TINYINT(1) NOT NULL DEFAULT 1,
  notif_avisos TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Datos base (no son datos personales)
INSERT INTO roles (nombre, descripcion) VALUES
 ('alumno','Consulta su propia información'),
 ('tutor','Consulta la información de los alumnos asociados'),
 ('admin','Gestión de usuarios y carga de información');

INSERT INTO permisos (codigo, descripcion) VALUES
 ('ver_propio','Ver información académica propia'),
 ('ver_asociados','Ver información de alumnos asociados'),
 ('gestionar_usuarios','Crear y desactivar usuarios'),
 ('cargar_notas','Cargar notas y asistencias'),
 ('publicar_comunicados','Publicar comunicados');

INSERT INTO rol_permiso (rol_id, permiso_id) VALUES
 (1,1),(2,2),(3,3),(3,4),(3,5);
