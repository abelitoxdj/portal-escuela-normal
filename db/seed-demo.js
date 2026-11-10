// DATOS FICTICIOS DE DEMOSTRACIÓN. NO ejecutar en producción con datos reales.
// Todos los usuarios usan el dominio @demo.invalid y la clave definida en DEMO_PASSWORD.
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../server/db');

const PASS = process.env.DEMO_PASSWORD;
if (!PASS || PASS.length < 8) { console.error('Definí DEMO_PASSWORD (8+ caracteres) para sembrar datos de demo.'); process.exit(1); }

(async () => {
  const hash = await bcrypt.hash(PASS, 12);
  const rol = async n => (await db.query('SELECT id FROM roles WHERE nombre=?', [n]))[0][0].id;
  const mkUser = async (rolN, email, nombre, apellido) => (await db.query(
    'INSERT INTO usuarios (rol_id,email,password_hash,nombre,apellido) VALUES (?,?,?,?,?)', [await rol(rolN), email, hash, nombre, apellido]))[0].insertId;

  // Docentes y horarios: tomados de la grilla ya cargada en el proyecto original (app.js)
  const docs = {};
  for (const n of ['TUP Costilla, Georgina','Ing. Ayunta, Irene','Ing. Moreno, Javier','Dra. Juarez, Ma. Laura','Ing. Estrada, Cynthia','Ing. Trevisan, Gabriel'])
    docs[n] = (await db.query('INSERT INTO docentes (nombre) VALUES (?)', [n]))[0].insertId;
  const mats = {};
  const materias = [
    ['Programación IV','Desarrollo de aplicaciones','primary','Ing. Moreno, Javier'],
    ['Gestión de desarrollo de Software','Gestión de proyectos de software','success','Ing. Ayunta, Irene'],
    ['Legislación','Marco legal de la actividad profesional','warning','Dra. Juarez, Ma. Laura'],
    ['Metodología de Sistemas II','Análisis y diseño de sistemas','danger','Ing. Estrada, Cynthia'],
    ['Introducción al análisis de Datos','Análisis exploratorio de datos','info','Ing. Trevisan, Gabriel']];
  for (const [n,d,c,doc] of materias)
    mats[n] = (await db.query('INSERT INTO materias (nombre,descripcion,anio_cursada,docente_id,color) VALUES (?,?,2,?,?)', [n,d,docs[doc],c]))[0].insertId;
  const grilla = [
    [1,'14:00','Programación IV','TUP Costilla, Georgina'],[1,'16:00','Gestión de desarrollo de Software','Ing. Ayunta, Irene'],
    [2,'14:00','Programación IV','Ing. Moreno, Javier'],[2,'16:00','Legislación','Dra. Juarez, Ma. Laura'],
    [3,'14:00','Programación IV','Ing. Moreno, Javier'],[3,'16:00','Gestión de desarrollo de Software','Ing. Ayunta, Irene'],
    [4,'14:00','Metodología de Sistemas II','Ing. Estrada, Cynthia'],[4,'16:00','Introducción al análisis de Datos','Ing. Trevisan, Gabriel'],
    [5,'14:00','Programación IV','TUP Costilla, Georgina'],[5,'16:00','Metodología de Sistemas II','Ing. Estrada, Cynthia']];
  for (const [dia,ini,m,d] of grilla)
    await db.query('INSERT INTO horarios (materia_id,anio_cursada,dia_semana,hora_inicio,hora_fin,docente_id) VALUES (?,2,?,?,ADDTIME(?,"02:00:00"),?)', [mats[m],dia,ini,ini,docs[d]]);

  const y = new Date().getFullYear();
  const per = [];
  for (const [o,n,i,f] of [[1,'1° Trimestre',`${y}-03-01`,`${y}-05-31`],[2,'2° Trimestre',`${y}-06-01`,`${y}-08-31`],[3,'3° Trimestre',`${y}-09-01`,`${y}-11-30`]])
    per.push((await db.query('INSERT INTO periodos (ciclo,nombre,orden,fecha_inicio,fecha_fin) VALUES (?,?,?,?,?)', [y,n,o,i,f]))[0].insertId);

  const admin = await mkUser('admin','admin@demo.invalid','Admin','Demo (ficticio)');
  const alumnos = [];
  for (const [em,n,a] of [['alumno1@demo.invalid','Alumno Uno','Ficticio'],['alumno2@demo.invalid','Alumno Dos','Ficticio']]) {
    const u = await mkUser('alumno',em,n,a);
    const al = (await db.query('INSERT INTO alumnos (usuario_id,anio_cursada,division,anio_ingreso,fecha_nacimiento) VALUES (?,2,"A",?, "2003-01-01")', [u,y-1]))[0].insertId;
    for (const m of Object.values(mats)) await db.query('INSERT INTO inscripciones VALUES (?,?)', [al,m]);
    alumnos.push(al);
  }
  const tu = await mkUser('tutor','tutor1@demo.invalid','Tutor Uno','Ficticio');
  const tid = (await db.query('INSERT INTO tutores (usuario_id) VALUES (?)', [tu]))[0].insertId;
  await db.query('INSERT INTO relaciones_familiares (tutor_id,alumno_id) VALUES (?,?)', [tid, alumnos[0]]);

  // Notas y asistencias ficticias
  const ms = Object.values(mats);
  for (const [i,al] of alumnos.entries())
    for (const [j,m] of ms.entries())
      for (const p of per.slice(0,2)) await db.query('INSERT INTO notas VALUES (NULL,?,?,?,?)', [al,m,p,5 + ((i*3 + j*2 + p) % 5)]);
  await db.query('INSERT INTO asistencias (alumno_id,materia_id,fecha,estado,justificada,motivo) VALUES (?,?,?,?,?,?)', [alumnos[0],ms[0],`${y}-04-10`,'ausente',0,null]);
  await db.query('INSERT INTO asistencias (alumno_id,materia_id,fecha,estado,justificada,motivo) VALUES (?,?,?,?,?,?)', [alumnos[0],ms[1],`${y}-04-12`,'tardanza',0,null]);
  await db.query('INSERT INTO asistencias (alumno_id,materia_id,fecha,estado,justificada,motivo) VALUES (?,?,?,?,?,?)', [alumnos[0],ms[2],`${y}-05-03`,'ausente',1,'Certificado (dato ficticio)']);
  for (const al of alumnos) for (const d of ['04-20','05-04','06-02']) await db.query('INSERT INTO asistencias (alumno_id,materia_id,fecha,estado) VALUES (?,?,?,"presente")', [al,ms[0],`${y}-${d}`]);

  await db.query(`INSERT INTO pagos (alumno_id,concepto,monto,vencimiento,fecha_pago,estado) VALUES
    (?, 'Cuota 1 (DEMO)', 1000, ?, ?, 'pagado'), (?, 'Cuota 2 (DEMO)', 1000, ?, NULL, 'pendiente')`,
    [alumnos[0], `${y}-03-10`, `${y}-03-08`, alumnos[0], `${y}-04-10`]);
  await db.query(`INSERT INTO comunicados (titulo,cuerpo,importante,autor_id) VALUES
    ('Comunicado de prueba (ficticio)','Este es un comunicado de demostración.',1,?)`, [admin]);
  await db.query(`INSERT INTO eventos_calendario (titulo,fecha,tipo) VALUES
    ('Feriado de ejemplo (DEMO)',?, 'feriado'),('Examen de ejemplo (DEMO)',?, 'examen')`, [`${y}-05-25`, `${y}-06-15`]);
  await db.query(`INSERT INTO notificaciones (usuario_id,mensaje) SELECT id,'Bienvenido al portal (demo).' FROM usuarios`);
  console.log('Datos de demo creados (todos ficticios).');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
