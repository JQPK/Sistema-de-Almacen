const fs = require('fs');
const initSqlJs = require('sql.js');
async function fix() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync('database/marine.db'));
  
  const resB = db.exec("SELECT numero_comprobante FROM ventas WHERE tipo_comprobante='boleta' ORDER BY id DESC LIMIT 1");
  if (resB.length > 0) {
    const corr = parseInt(resB[0].values[0][0].split('-')[1], 10);
    db.run("UPDATE config_empresa SET correlativo_boleta=" + corr);
  }
  
  const resF = db.exec("SELECT numero_comprobante FROM ventas WHERE tipo_comprobante='factura' ORDER BY id DESC LIMIT 1");
  if (resF.length > 0) {
    const corr = parseInt(resF[0].values[0][0].split('-')[1], 10);
    db.run("UPDATE config_empresa SET correlativo_factura=" + corr);
  }
  
  fs.writeFileSync('database/marine.db', Buffer.from(db.export()));
  console.log('DB fixed');
}
fix();
