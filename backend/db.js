const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "business.db");
// const DATA_ROOT = path.resolve(__dirname, "../data/sap-o2c-data");
const DATA_ROOT = path.resolve(__dirname, "data/sap-o2c-data");

const db = new Database(DB_PATH);

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function loadEntityFolder(entityDirName) {
  const entityDirPath = path.join(DATA_ROOT, entityDirName);
  const entries = fs.readdirSync(entityDirPath, { withFileTypes: true });
  const jsonlFile = entries.find(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")
  );

  if (!jsonlFile) {
    return;
  }

  const filePath = path.join(entityDirPath, jsonlFile.name);
  const fileContent = fs.readFileSync(filePath, "utf8");
  const lines = fileContent.split(/\r?\n/).filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return;
  }

  const firstRow = JSON.parse(lines[0]);
  const columns = Object.keys(firstRow);

  if (columns.length === 0) {
    return;
  }

  const quotedTable = quoteIdentifier(entityDirName);
  const columnDefs = columns
    .map((column) => `${quoteIdentifier(column)} TEXT`)
    .join(", ");

  db.exec(`DROP TABLE IF EXISTS ${quotedTable}`);
  db.exec(`CREATE TABLE ${quotedTable} (${columnDefs})`);

  const insertColumns = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const insertStmt = db.prepare(
    `INSERT INTO ${quotedTable} (${insertColumns}) VALUES (${placeholders})`
  );

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const values = columns.map((column) => {
        const value = row[column];
        return value === undefined || value === null ? null : String(value);
      });
      insertStmt.run(values);
    }
  });

  const rows = lines.map((line) => JSON.parse(line));
  insertMany(rows);
}

function initializeDatabase() {
  if (!fs.existsSync(DATA_ROOT)) {
    return;
  }

  const entities = fs
    .readdirSync(DATA_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const entityDirName of entities) {
    loadEntityFolder(entityDirName);
  }
}

function getSchema() {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .all();

  return tables.map(({ name }) => {
    const columns = db
      .prepare(`PRAGMA table_info(${quoteIdentifier(name)})`)
      .all()
      .map((col) => col.name);

    return { table: name, columns };
  });
}

initializeDatabase();

module.exports = {
  db,
  getSchema,
};
